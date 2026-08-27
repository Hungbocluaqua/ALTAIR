"""
Angelo Farina Synchronized Swept-Sine Deconvolution & Acoustic Ingestion Enhancements.
Implements:
- Farina non-linear harmonic distortion separation (2nd, 3rd, 4th, 5th harmonics).
- Dynamic Noise-Floor & Frequency-Dependent SNR Masking: SNR(f) = 10 * log10(|H(f)|^2 / |N(f)|^2).
- Microphone Polar Angle & Free-Field / 90-degree Diffuse Orientation Compensation.
"""

from typing import Tuple, Dict, Optional, List
import numpy as np


def farina_harmonic_separation(
    recorded_sweep: np.ndarray,
    f_start: float = 10.0,
    f_end: float = 24000.0,
    sample_rate: int = 48000,
    sweep_duration_s: float = 21.845,
    max_harmonic: int = 5,
) -> Dict[str, np.ndarray]:
    """
    Angelo Farina Synchronized Swept-Sine Deconvolution.
    
    Because a logarithmic sine sweep accelerates exponentially, non-linear harmonic
    distortion products (2nd, 3rd, 4th, 5th harmonics) appear as separate impulse peaks
    at negative time offsets prior to the main linear impulse peak t=0:
    
    Delta_t_k = - (sweep_duration / ln(f_end / f_start)) * ln(k)
    
    This function separates the pure linear room impulse response from the driver's
    non-linear harmonic distortion spikes, preventing the inversion engine from
    attempting to correct mechanical driver distortion.
    
    Returns:
        Dict containing:
        - "linear_ir": Pure linear Room Impulse Response with harmonics windowed out.
        - "harmonics": Dict mapping harmonic order (2, 3, 4, 5) to isolated harmonic IRs.
        - "thd_percent": Estimated Total Harmonic Distortion metric.
    """
    # 1. Synthesize Farina Inverse Filter
    # Amplitude envelope of inverse filter decays by -6 dB / octave (+3 dB / oct on sweep)
    t = np.linspace(0, sweep_duration_s, int(sweep_duration_s * sample_rate), endpoint=False)
    k_const = np.log(max(f_end, f_start + 1.0) / max(f_start, 1.0))
    phase = 2.0 * np.pi * f_start * sweep_duration_s / k_const * (np.power(f_end / f_start, t / sweep_duration_s) - 1.0)
    
    # Time-reversed and amplitude-modulated inverse sweep
    inv_sweep = np.sin(phase)[::-1]
    # Modulate amplitude proportional to instantaneous frequency (decay by 1/f)
    freq_curve = f_start * np.power(f_end / f_start, t / sweep_duration_s)
    inv_sweep = inv_sweep / np.maximum(freq_curve, 1.0)
    
    # Circular convolution wraparound prevention:
    # Linear convolution requires at least len(recorded_sweep) + len(inv_sweep) - 1
    min_conv_len = len(recorded_sweep) + len(inv_sweep) - 1
    n_fft = max(65536, 2 ** int(np.ceil(np.log2(min_conv_len))))
    
    # Convolve recorded signal with inverse filter
    raw_ir = np.fft.irfft(
        np.fft.rfft(recorded_sweep, n=n_fft) * np.fft.rfft(inv_sweep, n=n_fft),
        n=n_fft,
    )
    
    # Locate main linear impulse peak
    linear_peak_idx = int(np.argmax(np.abs(raw_ir)))
    
    # Calculate negative time offsets for harmonics (2nd, 3rd, 4th, 5th)
    L = sweep_duration_s / k_const
    harmonic_irs = {}
    total_distortion_energy = 0.0
    
    # Window to extract harmonics
    win_half_len = int(0.020 * sample_rate)  # 20ms window around each harmonic peak
    
    for h in range(2, max_harmonic + 1):
        dt_k_s = -L * np.log(h)
        h_sample_offset = int(dt_k_s * sample_rate)
        h_center_idx = (linear_peak_idx + h_sample_offset) % n_fft
        
        # Extract harmonic slice
        start_idx = max(0, h_center_idx - win_half_len)
        end_idx = min(n_fft, h_center_idx + win_half_len)
        
        h_slice = np.zeros(win_half_len * 2)
        actual_slice = raw_ir[start_idx:end_idx]
        h_slice[: len(actual_slice)] = actual_slice
        
        harmonic_irs[f"harmonic_{h}"] = h_slice
        total_distortion_energy += float(np.sum(h_slice ** 2))
        
    # Linear IR: zero-out the entire pre-arrival region containing all harmonic distortion bursts
    linear_ir = np.copy(raw_ir)
    
    # 3ms pre-arrival margin allows causal room response direct sound reconstruction
    pre_margin = int(0.003 * sample_rate)
    fade_len = int(0.002 * sample_rate)
    cutoff_idx = max(0, linear_peak_idx - pre_margin)
    
    # Zero out all preceding non-linear harmonics and pre-arrival noise
    linear_ir[:cutoff_idx] = 0.0
    
    # Smooth half-Hann fade-in at the cutoff boundary to prevent step discontinuity
    if fade_len > 0 and cutoff_idx + fade_len <= len(linear_ir):
        fade_in = 0.5 * (1.0 - np.cos(np.pi * np.arange(fade_len) / fade_len))
        linear_ir[cutoff_idx : cutoff_idx + fade_len] *= fade_in
        
    linear_energy = float(np.sum(linear_ir ** 2))
    thd_ratio = np.sqrt(total_distortion_energy / max(linear_energy, 1e-12))
    thd_percent = min(100.0, thd_ratio * 100.0)
    
    return {
        "linear_ir": linear_ir,
        "harmonics": harmonic_irs,
        "thd_percent": round(thd_percent, 2),
    }


def compute_snr_mask(
    ir: np.ndarray,
    sample_rate: int = 48000,
    min_snr_db: float = 15.0,
    noise_window_ms: float = 100.0,
) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """
    Compute frequency-dependent Signal-to-Noise Ratio (SNR) and correction mask.
    SNR(f) = 10 * log10(|H(f)|^2 / |N(f)|^2)
    
    Where SNR < min_snr_db (e.g. 15 dB), the correction mask smoothly tapers down to 0,
    preventing the inversion engine from boosting room background noise (HVAC hum / hiss).
    
    Returns:
        (freqs, snr_db, correction_mask [0.0 to 1.0])
    """
    n_fft = max(4096, 2 ** int(np.ceil(np.log2(len(ir)))))
    freqs = np.fft.rfftfreq(n_fft, d=1.0 / sample_rate)
    
    peak_idx = int(np.argmax(np.abs(ir)))
    
    # 1. Signal window around impulse peak (e.g. first 200ms)
    sig_len = min(int(0.200 * sample_rate), len(ir) - peak_idx)
    sig_segment = ir[peak_idx : peak_idx + sig_len]
    H_sig = np.fft.rfft(sig_segment, n=n_fft)
    
    # 2. Noise floor window from tail of recording (or pre-arrival)
    noise_len = int(noise_window_ms / 1000.0 * sample_rate)
    if peak_idx > noise_len:
        noise_segment = ir[:noise_len]
    else:
        noise_segment = ir[-noise_len:] if len(ir) >= noise_len else np.zeros(noise_len) + 1e-6
        
    H_noise = np.fft.rfft(noise_segment, n=n_fft)
    
    sig_pwr = np.abs(H_sig) ** 2
    noise_pwr = np.maximum(np.abs(H_noise) ** 2, 1e-12)
    
    # Compute smoothed SNR curve
    raw_snr = 10.0 * np.log10(np.maximum(sig_pwr / noise_pwr, 1e-4))
    
    # Smooth SNR across frequency
    snr_db = np.convolve(raw_snr, np.ones(15) / 15.0, mode="same")
    
    # Create smooth sigmoid correction mask: 1.0 when SNR >= min_snr_db, 0.0 when SNR << min_snr_db
    # mask = 0.5 * (1 + tanh((snr - min_snr) / 5))
    mask = 0.5 * (1.0 + np.tanh((snr_db - min_snr_db) / 4.0))
    
    return freqs, snr_db, mask


def apply_polar_diffraction_calibration(
    H_complex: np.ndarray,
    freqs: np.ndarray,
    orientation_deg: float = 90.0,  # 0.0 = on-axis (pointed at speaker), 90.0 = diffuse/ceiling
) -> np.ndarray:
    """
    Apply polar angle acoustic capsule diffraction compensation.
    
    When measuring with the microphone pointed at the ceiling (90 degrees), high frequencies
    (> 6 kHz) experience acoustic shadowing and capsule diffraction loss of up to -3 to -5 dB at 20 kHz.
    This function compensates the measured response to true free-field 0-degree accuracy.
    """
    if np.isclose(orientation_deg, 0.0, atol=5.0):
        return H_complex  # 0 degrees is on-axis reference
        
    # Standard 1/2" and 1/4" condenser capsule 90-degree free-field vs diffuse diffraction curve
    # 0 dB below 2 kHz, gradually -0.8 dB at 5 kHz, -2.2 dB at 10 kHz, -4.5 dB at 20 kHz
    diffraction_loss_db = np.zeros_like(freqs)
    for i, f in enumerate(freqs):
        if f > 2000.0:
            octaves_above_2k = np.log2(f / 2000.0)
            diffraction_loss_db[i] = -1.35 * (octaves_above_2k ** 1.3)
            
    # Scale by orientation factor (sin of angle relative to 0 deg)
    angle_factor = np.sin(np.radians(np.clip(orientation_deg, 0.0, 90.0)))
    comp_gain_db = -1.0 * diffraction_loss_db * angle_factor
    comp_gain_linear = 10.0 ** (comp_gain_db / 20.0)
    
    return H_complex * comp_gain_linear
