"""
Filter Assembly, Tap Trimming & Headroom Normalization Module.
Implements:
- Combined impulse convolution: h_final = h_VBA * h_inv * h_phase.
- Preamp headroom calculation to prevent digital inter-sample clipping (-3 dB to -6 dB).
- Automated tap windowing & trimming using Tukey (alpha=0.05) or Blackman-Harris 4-term windows
  to standard DSP/hardware sizes (e.g. 2048, 4096, 65536, 131072 taps).
"""

from typing import Tuple, Optional
import numpy as np
from scipy import signal


def calculate_preamp_headroom(
    filter_ir: np.ndarray,
    sample_rate: int = 48000,
    safety_margin_db: float = 1.0,
) -> Tuple[float, float]:
    """
    Calculate maximum spectral boost and recommended global preamp attenuation offset.
    
    Returns:
        (max_peak_gain_db, recommended_preamp_db)
    """
    n_fft = max(65536, 2 ** int(np.ceil(np.log2(len(filter_ir)))))
    H = np.fft.rfft(filter_ir, n=n_fft)
    mag_db = 20.0 * np.log10(np.maximum(np.abs(H), 1e-12))
    
    # Maximum gain across 20 Hz - 20 kHz
    freqs = np.fft.rfftfreq(n_fft, d=1.0 / sample_rate)
    audio_mask = (freqs >= 20.0) & (freqs <= 20000.0)
    
    if np.any(audio_mask):
        max_gain_db = float(np.max(mag_db[audio_mask]))
    else:
        max_gain_db = float(np.max(mag_db))
        
    # If filter has positive gain anywhere, preamp must attenuate by at least that amount + safety margin
    if max_gain_db > 0.0:
        recommended_preamp_db = - (max_gain_db + safety_margin_db)
    else:
        recommended_preamp_db = - safety_margin_db
        
    return max_gain_db, recommended_preamp_db


def assemble_final_filter(
    h_vba: np.ndarray,
    h_inv: np.ndarray,
    h_phase: np.ndarray,
    target_taps: int = 65536,
    sample_rate: int = 48000,
    window_type: str = "tukey",
    tukey_alpha: float = 0.05,
    centering: float = 0.50,
) -> Tuple[np.ndarray, float, float]:
    """
    Convolve all 3 filter stages (VBA * MagInv * Phase), trim/window to target taps,
    and calculate preamp headroom.
    
    Args:
        h_vba: Virtual Bass Array impulse response.
        h_inv: Magnitude inversion minimum-phase impulse response.
        h_phase: Crossover / excess phase correction impulse response.
        target_taps: Standard power-of-two tap count (e.g. 4096, 65536, 131072).
        sample_rate: Sampling frequency in Hz.
        window_type: 'tukey' (alpha=0.05) or 'blackman_harris'.
        tukey_alpha: Cosine taper fraction for Tukey window.
        centering: Peak position ratio (0.50 = centered linear phase, 0.20 = low latency).
        
    Returns:
        (final_fir, max_gain_db, recommended_preamp_db)
    """
    # 1. Convolve h_vba * h_inv
    h_vba_inv = signal.fftconvolve(h_vba, h_inv, mode='full')
    
    # 2. Convolve with h_phase
    h_combined = signal.fftconvolve(h_vba_inv, h_phase, mode='full')
    
    # 3. Peak centering and trimming to exact target_taps
    peak_idx = int(np.argmax(np.abs(h_combined)))
    desired_center_idx = int(target_taps * centering)
    
    # Create output array
    final_fir = np.zeros(target_taps, dtype=np.float64)
    
    # Calculate slice ranges
    left_samples = desired_center_idx
    right_samples = target_taps - desired_center_idx
    
    src_start = max(0, peak_idx - left_samples)
    src_end = min(len(h_combined), peak_idx + right_samples)
    
    dst_start = desired_center_idx - (peak_idx - src_start)
    dst_end = dst_start + (src_end - src_start)
    
    dst_start = max(0, min(target_taps, dst_start))
    dst_end = max(0, min(target_taps, dst_end))
    
    copy_len = min(dst_end - dst_start, src_end - src_start)
    if copy_len > 0:
        final_fir[dst_start : dst_start + copy_len] = h_combined[src_start : src_start + copy_len]
        
    # 4. Apply smooth tapering window to edges to prevent truncation clicks
    if window_type.lower() == "blackman_harris":
        win = signal.windows.blackmanharris(target_taps)
        final_fir *= win
    else:  # Tukey window with alpha=0.05
        win = signal.windows.tukey(target_taps, alpha=tukey_alpha)
        final_fir *= win
        
    # 5. Headroom calculation
    max_gain_db, recommended_preamp_db = calculate_preamp_headroom(final_fir, sample_rate=sample_rate)
    
    return final_fir, max_gain_db, recommended_preamp_db
