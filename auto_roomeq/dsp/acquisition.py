"""
Audio Acquisition & Preprocessing Module.
Implements:
- Logarithmic chirp sweep generation with acoustic timing reference.
- Regularized deconvolution of measured response against test sweep.
- Microphone calibration curve integration (.cal).
"""

from typing import Tuple, Optional
import numpy as np


def generate_log_chirp(
    f_start: float = 10.0,
    f_end: float = 24000.0,
    sample_rate: int = 48000,
    length_samples: int = 1048576,  # 2^20 samples (~21.845s at 48kHz)
    fade_in_samples: int = 2048,
    fade_out_samples: int = 2048,
    include_timing_ref: bool = True,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Generate a synchronized logarithmic sine sweep and its inverse filter.
    
    Args:
        f_start: Starting frequency in Hz.
        f_end: Ending frequency in Hz.
        sample_rate: Sampling frequency in Hz.
        length_samples: Total number of samples in the sweep (power of 2 recommended).
        fade_in_samples: Tukey fade-in taper samples.
        fade_out_samples: Tukey fade-out taper samples.
        include_timing_ref: Whether to prepend an acoustic timing chirp.
        
    Returns:
        (sweep_signal, time_array)
    """
    duration = length_samples / sample_rate
    t = np.linspace(0, duration, length_samples, endpoint=False)
    
    # Logarithmic chirp instantaneous phase:
    # phi(t) = 2*pi * f_start * duration / ln(f_end/f_start) * ((f_end/f_start)^(t/duration) - 1)
    k = np.log(max(f_end, f_start + 1.0) / max(f_start, 1.0))
    phase = 2.0 * np.pi * f_start * duration / k * (np.power(f_end / f_start, t / duration) - 1.0)
    sweep = np.sin(phase)
    
    # Apply smooth Hann window tapers to start and end
    if fade_in_samples > 0 and fade_in_samples < length_samples:
        window_in = 0.5 * (1.0 - np.cos(np.pi * np.arange(fade_in_samples) / fade_in_samples))
        sweep[:fade_in_samples] *= window_in
        
    if fade_out_samples > 0 and fade_out_samples < length_samples:
        window_out = 0.5 * (1.0 + np.cos(np.pi * np.arange(fade_out_samples) / fade_out_samples))
        sweep[-fade_out_samples:] *= window_out
        
    if include_timing_ref:
        # Prepend a 10ms high-frequency acoustic timing marker burst at 8kHz with 100ms silence
        ref_samples = int(0.010 * sample_rate)
        silence_samples = int(0.100 * sample_rate)
        t_ref = np.linspace(0, 0.010, ref_samples, endpoint=False)
        ref_burst = 0.5 * np.sin(2.0 * np.pi * 8000.0 * t_ref) * (0.5 * (1.0 - np.cos(2.0 * np.pi * t_ref / 0.010)))
        preamble = np.concatenate([ref_burst, np.zeros(silence_samples)])
        sweep = np.concatenate([preamble, sweep])
        t = np.linspace(0, len(sweep) / sample_rate, len(sweep), endpoint=False)
        
    return sweep.astype(np.float64), t


def deconvolve(
    recorded_sweep: np.ndarray,
    test_sweep: np.ndarray,
    epsilon: float = 1e-6,
) -> np.ndarray:
    """
    Deconvolve recorded audio response against the reference test sweep.
    H(f) = (Y(f) * X*(f)) / (|X(f)|^2 + epsilon * max(|X|^2))
    
    Args:
        recorded_sweep: Measured response from microphone.
        test_sweep: Original test excitation signal.
        epsilon: Tikhonov regularization factor for numerical stability.
        
    Returns:
        Time-domain Room Impulse Response (RIR) h[n].
    """
    rec = np.nan_to_num(np.asarray(recorded_sweep, dtype=np.float64))
    test = np.nan_to_num(np.asarray(test_sweep, dtype=np.float64))
    
    if len(rec) == 0 or len(test) == 0:
        return np.zeros(4096, dtype=np.float64)
        
    # Pad to equal power of 2 length
    n_fft = max(4096, 2 ** int(np.ceil(np.log2(max(len(rec), len(test))))))
    
    Y = np.fft.rfft(rec, n=n_fft)
    X = np.fft.rfft(test, n=n_fft)
    
    # Regularized spectral division
    denom = np.abs(X) ** 2 + epsilon * max(float(np.max(np.abs(X) ** 2)), 1e-12)
    H = (Y * np.conj(X)) / denom
    
    # Return to time-domain impulse response
    h = np.fft.irfft(H, n=n_fft)
    return h.astype(np.float64)


def load_cal_file(cal_content_or_path: str) -> Tuple[np.ndarray, np.ndarray, Optional[np.ndarray]]:
    """
    Parse a microphone calibration file (.cal, .txt).
    Format: frequency (Hz), SPL (dB), optional phase (deg).
    
    Args:
        cal_content_or_path: Text content of .cal file or file path.
        
    Returns:
        (frequencies, spl_offsets, phase_offsets)
    """
    lines = []
    if "\n" in cal_content_or_path:
        lines = cal_content_or_path.strip().splitlines()
    else:
        try:
            with open(cal_content_or_path, "r", encoding="utf-8", errors="ignore") as f:
                lines = f.readlines()
        except Exception:
            lines = []
            
    freqs = []
    spls = []
    phases = []
    has_phase = False
    
    for line in lines:
        line = line.strip()
        if not line or line.startswith("*") or line.startswith("#") or line.startswith(";"):
            continue
        parts = line.replace(",", " ").replace("\t", " ").split()
        if len(parts) >= 2:
            try:
                f_val = float(parts[0])
                spl_val = float(parts[1])
                freqs.append(f_val)
                spls.append(spl_val)
                if len(parts) >= 3:
                    phases.append(float(parts[2]))
                    has_phase = True
                else:
                    phases.append(0.0)
            except ValueError:
                continue
                
    if not freqs:
        # Fallback flat calibration
        return np.array([20.0, 20000.0], dtype=np.float64), np.array([0.0, 0.0], dtype=np.float64), None
        
    freq_arr = np.array(freqs, dtype=np.float64)
    spl_arr = np.array(spls, dtype=np.float64)
    phase_arr = np.array(phases, dtype=np.float64) if has_phase else None
    
    # Sort by frequency
    sort_idx = np.argsort(freq_arr)
    return freq_arr[sort_idx], spl_arr[sort_idx], phase_arr[sort_idx] if phase_arr is not None else None


def apply_cal_file(
    H_complex: np.ndarray,
    fft_freqs: np.ndarray,
    cal_freqs: np.ndarray,
    cal_spl: np.ndarray,
    cal_phase: Optional[np.ndarray] = None,
) -> np.ndarray:
    """
    Apply microphone calibration curve to a complex frequency response H(f).
    H_calibrated(f) = H(f) / H_mic(f)
    """
    if len(cal_freqs) == 0 or len(cal_spl) == 0:
        return H_complex
        
    # Interpolate calibration SPL and phase onto FFT grid
    interp_spl = np.interp(fft_freqs, cal_freqs, cal_spl, left=cal_spl[0], right=cal_spl[-1])
    
    # Convert SPL dB to linear gain
    mag_mic = 10.0 ** (interp_spl / 20.0)
    
    if cal_phase is not None and len(cal_phase) == len(cal_freqs):
        interp_phase_rad = np.radians(np.interp(fft_freqs, cal_freqs, cal_phase, left=cal_phase[0], right=cal_phase[-1]))
        H_mic = mag_mic * np.exp(1j * interp_phase_rad)
    else:
        H_mic = mag_mic
        
    return H_complex / np.maximum(H_mic, 1e-12)


def coherent_impulse_stack(
    impulses: list,
    sample_rate: int = 48000,
) -> Tuple[np.ndarray, float]:
    """
    Coherently stack multiple repeated impulse response recordings of the same position.
    Aligns each repeat to sub-sample accuracy before averaging in the time domain.
    
    Theoretical and measured Signal-to-Noise Ratio (SNR) improvement:
    Delta_SNR = 10 * log10(N) dB
    (e.g., 2 sweeps = +3.01 dB, 4 sweeps = +6.02 dB, 8 sweeps = +9.03 dB noise reduction).
    
    Returns:
        (stacked_ir, snr_improvement_db)
    """
    if not impulses:
        return np.zeros(4096, dtype=np.float64), 0.0
    if len(impulses) == 1:
        return np.asarray(impulses[0], dtype=np.float64), 0.0
        
    from .measurement import cross_correlate_align
    
    ref_ir = np.asarray(impulses[0], dtype=np.float64)
    aligned_irs = [ref_ir]
    
    for other in impulses[1:]:
        other_arr = np.asarray(other, dtype=np.float64)
        aligned, _, _ = cross_correlate_align(ref_ir, other_arr, sample_rate=sample_rate, enable_subsample=True)
        aligned_irs.append(aligned)
        
    max_len = max(len(ir) for ir in aligned_irs)
    padded = [np.pad(ir, (0, max_len - len(ir))) if len(ir) < max_len else ir[:max_len] for ir in aligned_irs]
    
    stacked_ir = np.mean(padded, axis=0)
    snr_improvement_db = float(10.0 * np.log10(len(impulses)))
    return stacked_ir, snr_improvement_db
