"""
Pre-Ringing Safeguard & Time-Domain Step Response Validator.
Implements:
- Step response & impulse inspection before t = 0 ms:
  Scans pre-ringing zone between -20 ms and -5 ms (and t < -5 ms).
- Pre-ringing amplitude ratio threshold: max |h(t)| / max(|h|) <= 10% for t in [-20ms, -5ms].
- Pre-impulse energy ratio calculation: R_pre = 10 * log10( E_pre / E_total ).
- Auto-attenuation loop to reduce phase Q-factors & increase regularization if threshold is exceeded.
"""

from typing import Tuple, Dict, Callable, Union, Optional
import numpy as np


def evaluate_step_response_preringing(
    impulse: np.ndarray,
    sample_rate: int = 48000,
    t_start_ms: float = -20.0,
    t_end_ms: float = -5.0,
    max_amp_threshold: float = 0.10,  # 10% amplitude threshold
    max_energy_db_threshold: float = -20.0,  # -20 dB pre-energy threshold
) -> Dict[str, any]:
    """
    Evaluate the time-domain impulse response and step response for pre-ringing.
    
    Args:
        impulse: Time-domain filter impulse response.
        sample_rate: Audio sample rate in Hz.
        t_start_ms: Start of pre-ringing evaluation window (e.g. -20 ms).
        t_end_ms: End of pre-ringing evaluation window (e.g. -5 ms).
        max_amp_threshold: Maximum allowable pre-ringing amplitude (default 0.10 = 10%).
        max_energy_db_threshold: Maximum allowable pre-impulse energy in dB (default -20 dB).
        
    Returns:
        Dictionary with pre-ringing metrics, pass/fail status, and diagnostic data.
    """
    peak_idx = int(np.argmax(np.abs(impulse)))
    max_impulse_peak = float(np.max(np.abs(impulse)))
    if max_impulse_peak < 1e-12:
        max_impulse_peak = 1.0
        
    # Relative time array in milliseconds centered at peak (t = 0 ms)
    t_rel_ms = (np.arange(len(impulse)) - peak_idx) / (sample_rate / 1000.0)
    
    # Pre-ringing evaluation window: [t_start_ms, t_end_ms]
    mask_eval = (t_rel_ms >= t_start_ms) & (t_rel_ms <= t_end_ms)
    
    if np.any(mask_eval):
        max_pre_impulse_amp = float(np.max(np.abs(impulse[mask_eval])))
        pre_amp_ratio = max_pre_impulse_amp / max_impulse_peak
    else:
        pre_amp_ratio = 0.0
        
    # Step response: s[n] = sum_{m=0}^n h[m]
    step_resp = np.cumsum(impulse)
    # Measure step oscillation relative to pre-transient baseline
    mask_baseline = (t_rel_ms >= -30.0) & (t_rel_ms <= -20.0)
    baseline_val = float(np.mean(step_resp[mask_baseline])) if np.any(mask_baseline) else 0.0
    
    step_oscillation = step_resp - baseline_val
    max_step_span = float(np.max(np.abs(step_oscillation))) if np.max(np.abs(step_oscillation)) > 1e-12 else 1.0
    
    if np.any(mask_eval):
        max_step_pre_amp = float(np.max(np.abs(step_oscillation[mask_eval])) / max_step_span)
    else:
        max_step_pre_amp = 0.0
        
    # Pre-impulse energy ratio (energy before -2 ms relative to post-impulse energy)
    mask_pre_energy = t_rel_ms < -2.0
    mask_post_energy = t_rel_ms >= -2.0
    
    energy_pre = np.sum(impulse[mask_pre_energy] ** 2) if np.any(mask_pre_energy) else 0.0
    energy_post = np.sum(impulse[mask_post_energy] ** 2) if np.any(mask_post_energy) else 1e-12
    
    energy_ratio_linear = energy_pre / max(energy_post, 1e-12)
    energy_ratio_db = float(10.0 * np.log10(max(energy_ratio_linear, 1e-12)))
    
    # Effective pre-ringing amplitude metric
    effective_pre_amp = pre_amp_ratio
    
    # Pass / Fail checks: impulse pre-amplitude <= 10% and pre-energy <= -20 dB
    amp_passed = pre_amp_ratio <= max_amp_threshold
    energy_passed = energy_ratio_db <= max_energy_db_threshold
    overall_passed = bool(amp_passed and energy_passed)
    
    return {
        "passed": overall_passed,
        "max_pre_amplitude": float(effective_pre_amp),
        "max_pre_amplitude_pct": float(effective_pre_amp * 100.0),
        "impulse_pre_amplitude_pct": float(pre_amp_ratio * 100.0),
        "threshold_pct": float(max_amp_threshold * 100.0),
        "pre_energy_db": float(energy_ratio_db),
        "energy_threshold_db": float(max_energy_db_threshold),
        "t_start_ms": float(t_start_ms),
        "t_end_ms": float(t_end_ms),
        "peak_idx": int(peak_idx),
    }


def auto_attenuate_preringing(
    filter_gen_fn: Callable[[float, float], np.ndarray],
    initial_q: float = 1.0,
    initial_beta: float = 0.08,
    sample_rate: int = 48000,
    max_iterations: int = 5,
    max_amp_threshold: float = 0.10,
) -> Tuple[np.ndarray, Dict[str, any], float, float]:
    """
    Iterative loop that generates filters and automatically attenuates Q-factor
    and increases regularization damping if pre-ringing exceeds threshold.
    
    Returns:
        (optimal_impulse, final_metrics, final_q, final_beta)
    """
    current_q = initial_q
    current_beta = initial_beta
    best_impulse = None
    best_metrics = None
    
    for iteration in range(max_iterations):
        impulse = filter_gen_fn(current_q, current_beta)
        metrics = evaluate_step_response_preringing(
            impulse,
            sample_rate=sample_rate,
            max_amp_threshold=max_amp_threshold,
        )
        
        best_impulse = impulse
        best_metrics = metrics
        
        if metrics["passed"]:
            metrics["iterations_needed"] = iteration + 1
            metrics["auto_attenuated"] = iteration > 0
            return impulse, metrics, current_q, current_beta
            
        # Attenuate Q-factor by 20% and increase regularization beta by 30%
        current_q *= 0.80
        current_beta *= 1.30
        
    best_metrics["iterations_needed"] = max_iterations
    best_metrics["auto_attenuated"] = True
    return best_impulse, best_metrics, current_q, current_beta


def evaluate_zwicker_temporal_masking(
    impulse: np.ndarray,
    sample_rate: int = 48000,
) -> Dict[str, Union[bool, float]]:
    """
    Zwicker Psychoacoustic Temporal Auditory Masking Evaluator.
    
    Evaluates whether pre-impulse ringing exceeds the human auditory backward masking threshold
    (5ms - 20ms prior to main transient) or forward masking threshold.
    
    Returns:
        Dict with is_masked boolean and maximum masking margin in dB.
    """
    peak_idx = int(np.argmax(np.abs(impulse)))
    peak_val = max(float(np.abs(impulse[peak_idx])), 1e-12)
    norm_ir = np.abs(impulse) / peak_val
    
    t_ms = (np.arange(len(impulse)) - peak_idx) / (sample_rate / 1000.0)
    
    # Backward masking evaluation (-20ms to -2ms)
    mask_backward = (t_ms >= -20.0) & (t_ms <= -2.0)
    if not np.any(mask_backward):
        return {"is_masked": True, "worst_margin_db": -30.0}
        
    t_back = t_ms[mask_backward]
    actual_pre_amp = norm_ir[mask_backward]
    
    # Zwicker backward masking threshold relative to peak (0 dB):
    # -6 dB at -2ms, tapering down to -36 dB at -20ms (approx 1.5 dB/ms)
    zwicker_thresh_db = -6.0 - 1.6 * np.abs(t_back)
    zwicker_thresh_linear = 10.0 ** (zwicker_thresh_db / 20.0)
    
    # Check if pre-echo exceeds masking curve
    exceedance_ratios = actual_pre_amp / np.maximum(zwicker_thresh_linear, 1e-6)
    max_exceedance = float(np.max(exceedance_ratios))
    worst_margin_db = float(20.0 * np.log10(max(max_exceedance, 1e-6)))
    
    is_masked = worst_margin_db <= 0.0
    
    return {
        "is_masked": bool(is_masked),
        "worst_margin_db": round(worst_margin_db, 1),
        "max_pre_amp_pct": round(float(np.max(actual_pre_amp) * 100.0), 2),
    }

