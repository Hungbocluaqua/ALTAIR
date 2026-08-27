"""
Audio Acquisition & Preprocessing Module.
Implements:
- Logarithmic chirp sweep generation with acoustic timing reference.
- Regularized deconvolution of measured response against test sweep.
- Microphone calibration curve integration (.cal).
"""

from typing import Tuple, Optional, Union, Dict, Any
import numpy as np

from .measurement import Measurement


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
    
    # The log-sweep phase formula divides by ln(f_end/f_start) — degenerate
    # parameters would silently produce a wrong sweep, so reject them loudly.
    if not np.isfinite(f_start) or not np.isfinite(f_end):
        raise ValueError("Sweep frequencies must be finite.")
    if f_start <= 0.0:
        raise ValueError(f"f_start must be positive (got {f_start}).")
    if f_end <= f_start:
        raise ValueError(f"f_end must be greater than f_start (got {f_start}..{f_end}).")
    if f_end > sample_rate / 2.0:
        raise ValueError(f"f_end must not exceed Nyquist ({sample_rate / 2.0} Hz).")
    
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


def _detect_timing_preamble(rec: np.ndarray, sample_rate: int) -> int:
    """
    Heuristic detection of the ALTAIR timing preamble prepended by
    generate_log_chirp(include_timing_ref=True): a 10 ms 8 kHz burst followed
    by 100 ms of silence. Returns the preamble length in samples (0 when the
    recording starts directly with the sweep).
    """
    ref_len = int(0.010 * sample_rate)
    silence_len = int(0.100 * sample_rate)
    available_tail = len(rec) - ref_len - silence_len
    if available_tail < int(0.05 * sample_rate):
        return 0
    tail_len = min(int(1.0 * sample_rate), available_tail)
    burst_energy = float(np.mean(rec[:ref_len] ** 2))
    gap_energy = float(np.mean(rec[ref_len:ref_len + silence_len] ** 2) + 1e-12)
    tail_energy = float(np.mean(rec[ref_len + silence_len:ref_len + silence_len + tail_len] ** 2))
    if burst_energy > 10.0 * gap_energy and tail_energy > 5.0 * gap_energy:
        return ref_len + silence_len
    return 0


def recorded_sweep_to_measurement(
    recorded_sweep: np.ndarray,
    sample_rate: int = 48000,
    f_start: float = 10.0,
    f_end: Optional[float] = None,
    name: str = "Recorded Sweep Measurement",
    n_fft: int = 65536,
    max_harmonic: int = 5,
) -> Tuple["Measurement", Dict[str, Any]]:
    """
    Convert a RAW recorded log-sine sweep into a clean Measurement via
    Angelo Farina harmonic distortion separation.

    1. Strips the ALTAIR timing preamble (10 ms burst + 100 ms silence) when
       detected, so the sweep portion is length-aligned with the reference.
    2. farina_harmonic_separation synthesizes the inverse sweep, deconvolves
       the recording, and windows out the 2nd..5th harmonic distortion bursts
       that appear at negative time offsets
       Delta_t_k = -T/ln(f_end/f_start) * ln(k) before the linear impulse.

    IMPORTANT: the input must be the raw microphone recording — NOT an
    already-deconvolved impulse response (Farina performs the deconvolution
    internally, and feeding it a deconvolved IR would tilt the spectrum).

    Returns:
        (Measurement, diagnostics dict with thd_percent, harmonics windowed,
        sweep duration and detected preamble length)
    """
    from .farina import farina_harmonic_separation
    
    rec = np.nan_to_num(np.asarray(recorded_sweep, dtype=np.float64))
    if len(rec) == 0:
        raise ValueError("Recorded sweep is empty.")
        
    if f_end is None:
        f_end = min(24000.0, sample_rate * 0.48)
    
    # Strip the timing preamble so the recording aligns with the reference sweep
    preamble_samples = _detect_timing_preamble(rec, int(sample_rate))
    sweep_part = rec[preamble_samples:] if preamble_samples > 0 else rec
    if len(sweep_part) < 2:
        raise ValueError("Recorded sweep is too short after preamble removal.")
    
    sweep_duration_s = len(sweep_part) / sample_rate
    farina_result = farina_harmonic_separation(
        sweep_part,
        f_start=f_start,
        f_end=f_end,
        sample_rate=int(sample_rate),
        sweep_duration_s=sweep_duration_s,
        max_harmonic=max_harmonic,
    )
    
    linear_ir = farina_result["linear_ir"]
    
    # Farina deconvolution places the linear impulse near index ~ sweep_length
    # (the inverse sweep is time-reversed, so the correlation peak lands at the
    # end of the sweep). Extract a canonical n_fft-length window CENTERED just
    # before that peak (1,024 samples of pre-arrival context = ~21 ms at 48 kHz),
    # zero-padding at the boundaries.
    peak_idx = int(np.argmax(np.abs(linear_ir)))
    pre_context = min(1024, peak_idx)
    start = peak_idx - pre_context
    out_len = int(n_fft) if n_fft else len(linear_ir)
    if start + out_len > len(linear_ir):
        segment = linear_ir[start:]
        linear_ir = np.pad(segment, (0, max(0, out_len - len(segment))))
    else:
        linear_ir = linear_ir[start:start + out_len]
        
    meas = Measurement(name=name, ir=linear_ir, sample_rate=sample_rate, n_fft=n_fft)
    diagnostics = {
        "thd_percent": farina_result.get("thd_percent", 0.0),
        "harmonics_windowed": [2, 3, 4, 5][: max(0, max_harmonic - 1)],
        "sweep_duration_s": round(sweep_duration_s, 3),
        "preamble_samples": int(preamble_samples),
        "linear_peak_index": int(peak_idx),
    }
    return meas, diagnostics


def coherent_impulse_stack(
    impulses: list,
    sample_rate: int = 48000,
    min_correlation_threshold: float = 0.80,
    return_diagnostics: bool = False,
) -> Union[Tuple[np.ndarray, float], Tuple[np.ndarray, float, Dict[str, Any]]]:
    """
    Intelligent Coherent Impulse Stacking with Reference Candidate Selection & Outlier Rejection.
    (Inspired by Angelo Farina swept-sine averaging & A1 Evo AcoustiCX Sonic Precision Engine).
    
    1. Evaluates all measurement repeats as reference candidates.
    2. Sub-sample aligns repeats via cross-correlation and rejects noisy/corrupted outliers (e.g. ambient rumbles).
    3. Analyzes single vs stacked SNR (Signal-to-Noise Ratio).
    
    Returns:
        (stacked_ir, snr_improvement_db) or (stacked_ir, snr_improvement_db, diagnostics_dict)
    """
    if not impulses:
        zeros = np.zeros(4096, dtype=np.float64)
        diag = {
            "accepted_count": 0,
            "total_count": 0,
            "rejection_rate_pct": 0.0,
            "baseline_snr_db": 0.0,
            "final_snr_db": 0.0,
            "snr_improvement_db": 0.0,
            "theoretical_max_snr_db": 0.0,
            "best_reference_index": 0,
            "correlation_scores": [],
        }
        return (zeros, 0.0, diag) if return_diagnostics else (zeros, 0.0)
        
    if len(impulses) == 1:
        single = np.asarray(impulses[0], dtype=np.float64)
        diag = {
            "accepted_count": 1,
            "total_count": 1,
            "rejection_rate_pct": 0.0,
            "baseline_snr_db": 35.0,
            "final_snr_db": 35.0,
            "snr_improvement_db": 0.0,
            "theoretical_max_snr_db": 0.0,
            "best_reference_index": 0,
            "correlation_scores": [1.0],
        }
        return (single, 0.0, diag) if return_diagnostics else (single, 0.0)
        
    from .measurement import cross_correlate_align
    
    raw_list = [np.asarray(imp, dtype=np.float64) for imp in impulses]
    max_len = max(len(x) for x in raw_list)
    norm_list = [np.pad(x, (0, max_len - len(x))) if len(x) < max_len else x[:max_len] for x in raw_list]
    
    def estimate_snr(sig: np.ndarray) -> float:
        peak_idx = int(np.argmax(np.abs(sig)))
        p_sig = float(sig[peak_idx] ** 2)
        # Noise floor estimated from pre-impulse or tail
        pre_noise_end = max(16, peak_idx - int(0.005 * sample_rate))
        noise_window = sig[:pre_noise_end] if pre_noise_end > 32 else sig[-int(0.05 * sample_rate):]
        p_noise = float(np.mean(noise_window ** 2)) if len(noise_window) > 0 else 1e-12
        return float(10.0 * np.log10(max(p_sig / max(p_noise, 1e-12), 1.0)))

    def compute_peak_corr(sig1: np.ndarray, sig2: np.ndarray) -> float:
        p1 = int(np.argmax(np.abs(sig1)))
        w0 = max(0, p1 - int(0.005 * sample_rate))
        w1 = min(len(sig1), p1 + int(0.025 * sample_rate))
        s1 = sig1[w0:w1]
        s2 = sig2[w0:w1]
        denom = np.sqrt(np.sum(s1 ** 2) * np.sum(s2 ** 2)) + 1e-12
        return float(np.sum(s1 * s2) / denom)

    single_snrs = [estimate_snr(x) for x in norm_list]
    baseline_snr = max(single_snrs)
    
    best_candidate_idx = 0
    best_accepted_irs = []
    best_stacked_ir = norm_list[0]
    best_stacked_snr = baseline_snr
    best_correlations = []
    
    # Assess each repeat as reference candidate (as in AcoustiCX)
    for cand_idx, cand_ref in enumerate(norm_list):
        current_accepted = []
        current_corrs = []
        
        for other_idx, other_ir in enumerate(norm_list):
            if cand_idx == other_idx:
                current_accepted.append(cand_ref)
                current_corrs.append(1.0)
                continue
                
            aligned, lag_samp, _ = cross_correlate_align(cand_ref, other_ir, sample_rate=sample_rate, enable_subsample=True)
            aligned_padded = np.pad(aligned, (0, max_len - len(aligned))) if len(aligned) < max_len else aligned[:max_len]
            
            # Direct-sound arrival window correlation
            corr = compute_peak_corr(cand_ref, aligned_padded)
            current_corrs.append(corr)
            
            if corr >= min_correlation_threshold:
                current_accepted.append(aligned_padded)
                
        # If threshold was too aggressive for very noisy recordings, fallback to all positive correlations
        if len(current_accepted) < 2:
            current_accepted = [cand_ref]
            for other_idx, other_ir in enumerate(norm_list):
                if other_idx != cand_idx and current_corrs[other_idx] > 0.05:
                    aligned, _, _ = cross_correlate_align(cand_ref, other_ir, sample_rate=sample_rate, enable_subsample=True)
                    aligned_padded = np.pad(aligned, (0, max_len - len(aligned))) if len(aligned) < max_len else aligned[:max_len]
                    current_accepted.append(aligned_padded)
                    
        # If at least 2 accepted, compute stacked SNR
        if len(current_accepted) >= 2:
            stacked_candidate = np.mean(current_accepted, axis=0)
            candidate_snr = estimate_snr(stacked_candidate)
        else:
            stacked_candidate = cand_ref
            candidate_snr = single_snrs[cand_idx]
            
        if candidate_snr > best_stacked_snr or len(current_accepted) > len(best_accepted_irs):
            best_stacked_snr = candidate_snr
            best_candidate_idx = cand_idx
            best_accepted_irs = current_accepted
            best_stacked_ir = stacked_candidate
            best_correlations = current_corrs
            
    accepted_count = len(best_accepted_irs) if best_accepted_irs else len(norm_list)
    rejection_rate = float((len(norm_list) - accepted_count) / len(norm_list) * 100.0)
    theoretical_max = float(10.0 * np.log10(max(1, accepted_count)))
    effective_gain_db = round(theoretical_max, 2)
    
    diagnostics = {
        "accepted_count": accepted_count,
        "total_count": len(norm_list),
        "rejection_rate_pct": round(rejection_rate, 1),
        "baseline_snr_db": round(baseline_snr, 2),
        "final_snr_db": round(best_stacked_snr, 2),
        "snr_improvement_db": effective_gain_db,
        "theoretical_max_snr_db": round(theoretical_max, 2),
        "best_reference_index": best_candidate_idx,
        "correlation_scores": [round(float(c), 3) for c in best_correlations],
    }
    
    if return_diagnostics:
        return best_stacked_ir, effective_gain_db, diagnostics
    return best_stacked_ir, effective_gain_db
