"""
Advanced DSP & Psychoacoustic Engineering Module for ALTAIR.
Implements:
- Temperature-dependent speed of sound calculation: c(T) = 331.3 * sqrt(1 + T / 273.15).
- Frequency-dependent Tikhonov Regularization beta(f) curve.
- Homomorphic mixed-phase deconvolution (Minimum-phase vs All-pass decomposition).
- Automated Group Delay crossover frequency extraction: tau_g(f) = - dPhi / dOmega.
- ITU-R BS.1770 True-Peak 4x oversampled inter-sample clipping detection.
- Hybrid IIR parametric biquad + FIR filter splitting for constrained hardware.
"""

from typing import Tuple, List, Optional, Dict
import numpy as np
from scipy import signal


def calculate_speed_of_sound(temp_celsius: float = 20.0) -> float:
    """
    Calculate the physical speed of sound in air at a given temperature.
    c(T) = 331.3 * sqrt(1 + T / 273.15) [m/s]
    """
    return float(331.3 * np.sqrt(max(0.1, 1.0 + temp_celsius / 273.15)))


def compute_frequency_dependent_beta(
    freqs: np.ndarray,
    beta_0: float = 0.04,
    f_low: float = 25.0,
    f_high: float = 18000.0,
    modal_beta_min: float = 0.008,
) -> np.ndarray:
    """
    Generate a continuous frequency-dependent Tikhonov regularization profile beta(f).
    
    Provides:
    - Low regularization (beta ~ 0.008 - 0.02) in the modal band (40 - 200 Hz) for surgical resonance cuts.
    - Nominal regularization (beta ~ 0.04) in midband.
    - Steep protective regularization (beta -> 1.0+) at subsonic (<25 Hz) and ultrasonic (>18 kHz) extremes
      to protect speaker voice coils and amplifier headroom.
      
    Formula:
    beta(f) = beta_0 * (1 + (f_low / f)^4 + (f / f_high)^4)
    """
    safe_f = np.maximum(freqs, 1.0)
    
    # Subsonic protection barrier
    subsonic_term = (f_low / safe_f) ** 4
    # Ultrasonic protection barrier
    ultrasonic_term = (safe_f / f_high) ** 4
    
    beta_curve = beta_0 * (1.0 + subsonic_term + ultrasonic_term)
    
    # In the core modal zone (45Hz - 180Hz), allow ultra-precise inversion
    modal_mask = (freqs >= 45.0) & (freqs <= 180.0)
    beta_curve[modal_mask] = np.maximum(modal_beta_min, beta_curve[modal_mask] * 0.5)
    
    # Cap between modal_beta_min and maximum damping
    return np.clip(beta_curve, modal_beta_min, 10.0)


def homomorphic_mixed_phase_split(
    ir: np.ndarray,
    n_fft: Optional[int] = None,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Decompose a Room Impulse Response into minimum-phase and all-pass (excess phase) components
    via real and complex cepstral analysis:
    h(t) = h_min(t) * h_ap(t)
    
    Returns:
        (h_min, h_ap)
    """
    if n_fft is None:
        n_fft = max(4096, 2 ** int(np.ceil(np.log2(len(ir)))))
        
    H = np.fft.rfft(ir, n=n_fft)
    mag = np.maximum(np.abs(H), 1e-12)
    
    # Real cepstrum for minimum-phase reconstruction
    full_log_mag = np.concatenate([np.log(mag), np.log(mag[-2:0:-1])])
    cepstrum = np.fft.ifft(full_log_mag).real
    
    # Causal lifter
    lifter = np.zeros_like(cepstrum)
    lifter[0] = 1.0
    lifter[1 : len(cepstrum) // 2] = 2.0
    lifter[len(cepstrum) // 2] = 1.0
    
    min_phase_spectrum = np.exp(np.fft.fft(cepstrum * lifter))[: len(H)]
    
    # Time-domain minimum-phase IR
    h_min = np.fft.irfft(min_phase_spectrum, n=n_fft)
    
    # All-pass excess phase spectrum: H_ap(f) = H(f) / H_min(f)
    H_ap = H / np.maximum(min_phase_spectrum, 1e-12)
    h_ap = np.fft.irfft(H_ap, n=n_fft)
    
    return h_min, h_ap


def detect_group_delay_crossovers(
    ir: np.ndarray,
    sample_rate: int = 48000,
    search_band: Tuple[float, float] = (500.0, 5000.0),
    min_prominence_ms: float = 0.02,
) -> List[Dict[str, float]]:
    """
    Automatically detect loudspeaker analog/passive crossover points by identifying
    peaks in frequency-dependent excess group delay: tau_g(f) = - dPhi / dOmega.
    
    Returns:
        List of detected crossover points with center frequency and estimated group delay excess.
    """
    n_fft = max(16384, 2 ** int(np.ceil(np.log2(len(ir)))))
    freqs = np.fft.rfftfreq(n_fft, d=1.0 / sample_rate)
    H = np.fft.rfft(ir, n=n_fft)
    
    # Unwrap phase
    phase = np.unwrap(np.angle(H))
    
    # Group delay: tau_g = - d(phase) / d(omega) [seconds]
    d_omega = 2.0 * np.pi * (freqs[1] - freqs[0])
    group_delay_s = -np.gradient(phase, d_omega)
    group_delay_ms = group_delay_s * 1000.0
    
    # Detrend linear carrier delay to isolate excess group delay
    mask = (freqs >= search_band[0]) & (freqs <= search_band[1])
    band_freqs = freqs[mask]
    band_gd = group_delay_ms[mask]
    
    if len(band_gd) < 10:
        return []
        
    # Subtract baseline linear trend
    poly = np.polyfit(band_freqs, band_gd, 1)
    excess_gd = band_gd - np.polyval(poly, band_freqs)
    
    # Smooth excess group delay
    win_pts = max(5, int(len(band_freqs) / 40))
    if win_pts % 2 == 0:
        win_pts += 1
    smoothed_excess = signal.medfilt(excess_gd, kernel_size=win_pts)
    
    # Find peaks in excess group delay
    peaks, props = signal.find_peaks(
        smoothed_excess,
        prominence=min_prominence_ms,
        distance=max(5, int(len(band_freqs) / 20)),
    )
    
    crossovers = []
    for idx in peaks:
        f_xo = float(band_freqs[idx])
        crossovers.append({
            "frequency_hz": round(f_xo, 1),
            "group_delay_peak_ms": round(float(smoothed_excess[idx]), 2),
            "estimated_order": 4,
        })
        
    if not crossovers:
        # Fallback: check rate of change
        df = band_freqs[1] - band_freqs[0]
        grad = np.abs(np.gradient(band_gd, df))
        pk_g, _ = signal.find_peaks(grad, prominence=0.0001)
        for idx in pk_g:
            crossovers.append({
                "frequency_hz": round(float(band_freqs[idx]), 1),
                "group_delay_peak_ms": round(float(grad[idx]), 4),
                "estimated_order": 2,
            })
            
    crossovers.sort(key=lambda x: x["frequency_hz"])
    return crossovers


def calculate_itu_r_bs1770_true_peak(
    ir: np.ndarray,
    oversample_factor: int = 4,
) -> float:
    """
    Compute true-peak inter-sample maximum amplitude using 4x polyphase sinc oversampling
    according to ITU-R BS.1770-4 standard.
    
    Returns:
        True-peak maximum in dBFS.
    """
    if len(ir) == 0:
        return -120.0
        
    # Polyphase 4x sinc upsampler
    resampled_ir = signal.resample_poly(ir, up=oversample_factor, down=1)
    peak_linear = float(np.max(np.abs(resampled_ir)))
    
    if peak_linear <= 1e-9:
        return -120.0
        
    true_peak_dbfs = float(20.0 * np.log10(peak_linear))
    return true_peak_dbfs


def generate_hybrid_iir_fir_split(
    modal_peaks_dips: List[Dict[str, float]],
    target_fir: np.ndarray,
    sample_rate: int = 48000,
    max_biquads: int = 8,
    target_taps: int = 4096,
) -> Tuple[List[Dict[str, float]], np.ndarray]:
    """
    Split a high-resolution room correction profile into:
    1. Parametric IIR Biquad Filters for sharp low-frequency room modes (< 200 Hz).
    2. A Compact FIR Filter for mid/high frequency magnitude and phase linearization.
    
    Allows hardware with limited FIR tap memory (e.g. miniDSP 4,096 taps) to achieve
    sub-Hz low bass resolution.
    
    Returns:
        (iir_biquads_list, remaining_compact_fir)
    """
    biquads = []
    n_fft = max(65536, len(target_fir))
    freqs = np.fft.rfftfreq(n_fft, d=1.0 / sample_rate)
    
    # Accumulate IIR frequency response
    H_iir_total = np.ones(len(freqs), dtype=np.complex128)
    
    for item in modal_peaks_dips[:max_biquads]:
        f0 = float(item["freq_hz"])
        gain_db = float(item["gain_db"])
        q_val = float(item.get("q", 3.5))
        
        # Calculate standard RBJ Audio-EQ-Cookbook Peaking EQ biquad coefficients
        w0 = 2.0 * np.pi * f0 / sample_rate
        alpha = np.sin(w0) / (2.0 * q_val)
        A = 10.0 ** (gain_db / 40.0)
        
        b0 = 1.0 + alpha * A
        b1 = -2.0 * np.cos(w0)
        b2 = 1.0 - alpha * A
        a0 = 1.0 + alpha / A
        a1 = -2.0 * np.cos(w0)
        a2 = 1.0 - alpha / A
        
        # Normalized coefficients
        b_norm = np.array([b0, b1, b2]) / a0
        a_norm = np.array([a0, a1, a2]) / a0
        
        # Evaluate biquad transfer function
        _, h_bq = signal.freqz(b_norm, a_norm, worN=freqs, fs=sample_rate)
        H_iir_total *= h_bq
        
        biquad_dict = {
            "frequency_hz": f0,
            "gain_db": gain_db,
            "q": q_val,
            "b0": float(b_norm[0]),
            "b1": float(b_norm[1]),
            "b2": float(b_norm[2]),
            "a1": float(a_norm[1]),
            "a2": float(a_norm[2]),
        }
        biquads.append(biquad_dict)
        
    # Deconvolve the IIR biquad response from target FIR: H_residue = H_target / H_iir
    H_target = np.fft.rfft(target_fir, n=n_fft)
    H_residue = H_target / np.maximum(np.abs(H_iir_total), 1e-6) * np.exp(1j * (np.angle(H_target) - np.angle(H_iir_total)))
    
    # Convert residue back to time domain
    h_residue = np.fft.irfft(H_residue, n=n_fft)
    
    # Center and trim to compact target taps
    peak_idx = int(np.argmax(np.abs(h_residue)))
    half_taps = target_taps // 2
    
    start_idx = max(0, peak_idx - half_taps)
    end_idx = min(len(h_residue), start_idx + target_taps)
    
    compact_fir = np.zeros(target_taps, dtype=np.float64)
    slice_data = h_residue[start_idx:end_idx]
    compact_fir[: len(slice_data)] = slice_data
    compact_fir *= signal.windows.tukey(target_taps, alpha=0.05)
    
    return biquads, compact_fir


def synthesize_warped_fir(
    target_mag_linear: np.ndarray,
    freqs: np.ndarray,
    sample_rate: int = 48000,
    lambda_warp: float = 0.65,
    target_taps: int = 4096,
) -> np.ndarray:
    """
    Warped FIR (WFIR) / Laguerre Filter Synthesis.
    
    Warps the z-plane using bilinear all-pass conformal mapping:
    z~^-1 = (z^-1 - lambda) / (1 - lambda * z^-1)
    
    Provides logarithmic frequency resolution focusing taps in the sub-bass (< 120 Hz)
    while using a small physical tap length (e.g. 2048 - 4096 taps).
    """
    n_fft = target_taps * 2
    rfft_freqs = np.fft.rfftfreq(n_fft, d=1.0 / sample_rate)
    
    # Inverse warping frequency map
    omega = 2.0 * np.pi * rfft_freqs / sample_rate
    num = lambda_warp * np.sin(omega)
    den = 1.0 - lambda_warp * np.cos(omega)
    warped_omega = omega + 2.0 * np.arctan2(num, den)
    warped_freqs = warped_omega * (sample_rate / (2.0 * np.pi))
    
    # Interpolate target magnitude onto warped frequency grid
    clamped_warped_f = np.clip(warped_freqs, freqs[0], freqs[-1])
    warped_mag = np.interp(clamped_warped_f, freqs, target_mag_linear)
    
    # Minimum-phase extraction in warped domain
    log_mag = np.log(np.maximum(warped_mag, 1e-12))
    full_log = np.concatenate([log_mag, log_mag[-2:0:-1]])
    cep = np.fft.ifft(full_log).real
    
    win = np.zeros_like(cep)
    win[0] = 1.0
    win[1:len(cep)//2] = 2.0
    win[len(cep)//2] = 1.0
    
    H_min_warped = np.exp(np.fft.fft(cep * win))[:len(warped_mag)]
    wfir_raw = np.fft.irfft(H_min_warped, n=n_fft)
    
    # Minimum-phase impulse has main energy at t=0; apply half-cosine fade only to the tail
    tail_len = max(16, int(target_taps * 0.05))
    tail_win = 0.5 * (1.0 + np.cos(np.linspace(0, np.pi, tail_len)))
    wfir_trimmed = wfir_raw[:target_taps].copy()
    wfir_trimmed[-tail_len:] *= tail_win
    
    return wfir_trimmed


def synthesize_time_reversed_excess_phase_filter(
    ir: np.ndarray,
    sample_rate: int = 48000,
    max_corr_ms: float = 20.0,
    f_max: float = 500.0,
    target_taps: Optional[int] = None,
) -> np.ndarray:
    """
    Time-Reversed Excess-Phase Homomorphic Inversion.
    
    Decomposes the impulse response into minimum-phase and all-pass excess-phase components:
    h(t) = h_min(t) * h_ap(t)
    
    Synthesizes a time-windowed causal inverse h_ap^-1(t) = h_ap(-t) centered with a delay carrier
    to linearize residual acoustic excess phase and room group delay without pre-echo.
    """
    out_taps = target_taps or len(ir)
    n_fft = max(16384, 2 ** int(np.ceil(np.log2(max(len(ir), out_taps)))))
    h_min, h_ap = homomorphic_mixed_phase_split(ir, n_fft=n_fft)
    
    # Time-reverse all-pass component for inverse phase: H_ap_inv(f) = conj(H_ap(f))
    H_ap = np.fft.rfft(h_ap, n=n_fft)
    freqs = np.fft.rfftfreq(n_fft, d=1.0 / sample_rate)
    
    # Linear-phase carrier delay to center inverse impulse
    tau_s = (n_fft // 2) / sample_rate
    carrier = np.exp(-1j * 2.0 * np.pi * freqs * tau_s)
    
    # Limit excess phase correction to modal/Schroeder band (< f_max)
    mask_hf = freqs > f_max
    H_ap_inv = np.conj(H_ap)
    if np.any(mask_hf):
        alpha_fade = np.clip((freqs[mask_hf] - f_max) / 200.0, 0.0, 1.0)
        # Blend phase angle smoothly to 0 at high frequencies
        phase_inv = np.angle(H_ap_inv[mask_hf]) * (1.0 - alpha_fade)
        H_ap_inv[mask_hf] = np.exp(1j * phase_inv)
        
    H_ap_centered = H_ap_inv * carrier
    h_excess_corr = np.fft.irfft(H_ap_centered, n=n_fft)
    
    # Window to max_corr_ms around center
    center_idx = n_fft // 2
    half_win = int((max_corr_ms / 1000.0) * sample_rate)
    
    win = np.zeros(n_fft)
    tukey_seg = signal.windows.tukey(half_win * 2, alpha=0.1)
    win[center_idx - half_win : center_idx + half_win] = tukey_seg
    
    h_windowed = h_excess_corr * win
    
    # Trim to out_taps centered
    half_out = out_taps // 2
    start_idx = max(0, center_idx - half_out)
    end_idx = min(len(h_windowed), start_idx + out_taps)
    
    result = np.zeros(out_taps, dtype=np.float64)
    slice_d = h_windowed[start_idx:end_idx]
    result[: len(slice_d)] = slice_d
    return result


