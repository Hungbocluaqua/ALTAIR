"""
Module 1: Automated Virtual Bass Array (VBA) Synthesis.
Implements:
- Low-frequency modal peak and dip extraction (20 - 150 Hz) via scipy.signal.find_peaks.
- Harmonic verification using +/- 10% tolerance window on room fundamental multiples:
  f_1 ~= c / (2*L), P_k ~= k * f_1, D_k ~= (k + 0.5) * f_1.
- Synthesis of 8th-order (48 dB/oct) minimum-phase LPF at f_cutoff = 3.5 * f_opt.
- Delayed anti-pulse subtraction: h_VBA[n] = delta[n] - 0.5 * h_LPF[n - d].
- Pre-filtered response convolution: h_1[n] = h_avg[n] * h_VBA[n].
"""

from typing import List, Dict, Tuple, Optional
import numpy as np
from scipy import signal
from .measurement import Measurement


def detect_modal_peaks_dips(
    freqs: np.ndarray,
    spl_db: np.ndarray,
    f_min: float = 20.0,
    f_max: float = 150.0,
    prominence_db: float = 2.5,
    tolerance: float = 0.10,
    room_length_m: Optional[float] = None,
) -> Dict[str, any]:
    """
    Detect fundamental room modes, harmonic peaks P_k, and boundary dips D_k
    using a +/- 10% tolerance window.
    
    Returns:
        Dictionary containing fundamental frequency f_1, detected peaks, dips,
        and the optimal resonance frequency f_opt for VBA cancellation.
    """
    # Restrict to modal band
    mask = (freqs >= f_min) & (freqs <= f_max)
    band_freqs = freqs[mask]
    band_spl = spl_db[mask]
    
    if len(band_freqs) < 10:
        return {
            "f_1": 45.0,
            "f_opt": 45.0,
            "peaks": [{"freq": 45.0, "spl": 85.0, "harmonic": 1}],
            "dips": [],
        }
        
    # Find peaks (room resonances)
    peak_indices, peak_props = signal.find_peaks(band_spl, prominence=prominence_db, distance=3)
    peak_freqs = band_freqs[peak_indices]
    peak_spls = band_spl[peak_indices]
    
    # Find dips (anti-resonances)
    dip_indices, dip_props = signal.find_peaks(-band_spl, prominence=prominence_db, distance=3)
    dip_freqs = band_freqs[dip_indices]
    dip_spls = band_spl[dip_indices]
    
    # Estimate fundamental mode frequency f_1
    c = 343.0  # speed of sound in m/s at 20°C
    if room_length_m and room_length_m > 1.0:
        f_1_theory = c / (2.0 * room_length_m)
    else:
        # If no room length provided, use lowest prominent peak in 25-70 Hz as fundamental
        low_peaks = [(f, s) for f, s in zip(peak_freqs, peak_spls) if 25.0 <= f <= 70.0]
        if low_peaks:
            f_1_theory = min(low_peaks, key=lambda x: x[0])[0]
        elif len(peak_freqs) > 0:
            f_1_theory = peak_freqs[0]
        else:
            f_1_theory = 45.0
            
    # Harmonic matching with +/- tolerance window (default +/-10%)
    classified_peaks = []
    for f_p, s_p in zip(peak_freqs, peak_spls):
        # Check which harmonic k this peak matches within tolerance
        best_k = max(1, int(np.round(f_p / f_1_theory)))
        expected_f = best_k * f_1_theory
        if (1.0 - tolerance) * expected_f <= f_p <= (1.0 + tolerance) * expected_f:
            classified_peaks.append({
                "freq": float(f_p),
                "spl": float(s_p),
                "harmonic": best_k,
                "is_harmonic_match": True,
            })
        else:
            classified_peaks.append({
                "freq": float(f_p),
                "spl": float(s_p),
                "harmonic": best_k,
                "is_harmonic_match": False,
            })
            
    classified_dips = []
    for f_d, s_d in zip(dip_freqs, dip_spls):
        best_k = max(1, int(np.round((f_d / f_1_theory) - 0.5)))
        expected_d = (best_k + 0.5) * f_1_theory
        is_match = (1.0 - tolerance) * expected_d <= f_d <= (1.0 + tolerance) * expected_d
        classified_dips.append({
            "freq": float(f_d),
            "spl": float(s_d),
            "harmonic_dip": best_k,
            "is_harmonic_match": bool(is_match),
        })
        
    # Select optimal modal frequency f_opt for VBA reflection cancellation
    # Pick the most prominent low-frequency peak (highest SPL)
    if classified_peaks:
        strongest_peak = max(classified_peaks, key=lambda p: p["spl"])
        f_opt = strongest_peak["freq"]
    else:
        f_opt = float(f_1_theory)
        
    return {
        "f_1": float(f_1_theory),
        "f_opt": float(f_opt),
        "peaks": classified_peaks,
        "dips": classified_dips,
    }


def synthesize_vba_filter(
    measurement: Measurement,
    f_opt: Optional[float] = None,
    f_min: float = 20.0,
    f_max: float = 150.0,
    room_length_m: Optional[float] = None,
    sample_rate: Optional[int] = None,
) -> Tuple[np.ndarray, Measurement, Dict[str, any]]:
    """
    Synthesize Module 1: Virtual Bass Array (VBA) filter h_VBA[n].
    
    1. Calculate target reflection period: T_target = (1000 / f_opt) ms.
    2. Compute cutoff frequency: f_cutoff = 3.5 * f_opt.
    3. Design an 8th-order (48 dB/oct) low-pass filter H_LPF(s), convert to minimum-phase.
    4. Delay the inverted pulse by T_shift = T_target - t_peak, apply -6 dB (0.5) offset:
       h_VBA[n] = delta[n] - 0.5 * h_LPF[n - d]
    5. Pre-filter the response: h_1[n] = h_avg[n] * h_VBA[n].
    
    Returns:
        (h_vba, measurement_h1, modal_info)
    """
    sr = sample_rate or measurement.sample_rate
    
    # Detect modes if f_opt not explicitly specified
    modal_info = detect_modal_peaks_dips(
        measurement.freqs,
        measurement.spl_db,
        f_min=f_min,
        f_max=f_max,
        room_length_m=room_length_m,
    )
    if f_opt is None:
        f_opt = modal_info["f_opt"]
        
    # 1. Target reflection period in ms
    T_target_ms = 1000.0 / max(f_opt, 10.0)
    
    # 2. Cutoff frequency: 3.5 * f_opt (clamped between 30 Hz and Nyquist * 0.45)
    f_cutoff = max(30.0, min(3.5 * f_opt, sr * 0.45))
    
    # 3. 8th-order (48 dB/oct) Butterworth Low-Pass Filter
    # Digital Butterworth 8th-order filter design:
    sos_lpf = signal.butter(8, f_cutoff, btype='low', fs=sr, output='sos')
    
    # Impulse response of LPF (2048 samples)
    n_lpf = 2048
    imp = np.zeros(n_lpf)
    imp[0] = 1.0
    h_lpf_raw = signal.sosfilt(sos_lpf, imp)
    
    # Convert H_LPF to minimum-phase via Hilbert transform of log-magnitude
    H_lpf = np.fft.rfft(h_lpf_raw, n=n_lpf)
    log_mag_lpf = np.log(np.maximum(np.abs(H_lpf), 1e-12))
    
    full_log_mag = np.concatenate([log_mag_lpf, log_mag_lpf[-2:0:-1]])
    cepstrum = np.fft.ifft(full_log_mag).real
    
    min_phase_win = np.zeros_like(cepstrum)
    min_phase_win[0] = 1.0
    min_phase_win[1:len(cepstrum)//2] = 2.0
    min_phase_win[len(cepstrum)//2] = 1.0
    
    h_lpf_min = np.fft.irfft(np.exp(np.fft.fft(cepstrum * min_phase_win))[:len(H_lpf)], n=n_lpf)
    
    # Normalize peak of LPF to 1.0
    if np.max(np.abs(h_lpf_min)) > 0:
        h_lpf_min = h_lpf_min / np.max(np.abs(h_lpf_min))
        
    # 4. Time-delay pulse: T_shift = T_target - t_peak
    t_peak_ms = measurement.peak_time_ms
    T_shift_ms = max(1.0, T_target_ms - (t_peak_ms % T_target_ms))
    d_samples = max(1, int(np.round((T_shift_ms / 1000.0) * sr)))
    
    # Synthesize VBA FIR kernel
    n_vba = max(4096, d_samples + len(h_lpf_min))
    h_vba = np.zeros(n_vba, dtype=np.float64)
    h_vba[0] = 1.0  # Dirac delta delta[n]
    
    # Subtract 0.5 * h_LPF[n - d] (-6 dB attenuation)
    end_idx = min(n_vba, d_samples + len(h_lpf_min))
    lpf_len = end_idx - d_samples
    if lpf_len > 0:
        h_vba[d_samples:end_idx] -= 0.5 * h_lpf_min[:lpf_len]
        
    # 5. Pre-filter response: h_1[n] = h_avg[n] * h_VBA[n]
    h1_ir = signal.fftconvolve(measurement.ir, h_vba, mode='full')
    
    # Trim to original measurement FFT size
    meas_h1 = Measurement(
        name=f"{measurement.name} (Post-VBA)",
        ir=h1_ir,
        sample_rate=sr,
        n_fft=measurement.n_fft,
    )
    
    modal_info["T_target_ms"] = float(T_target_ms)
    modal_info["f_cutoff"] = float(f_cutoff)
    modal_info["T_shift_ms"] = float(T_shift_ms)
    modal_info["d_samples"] = int(d_samples)
    
    return h_vba, meas_h1, modal_info
