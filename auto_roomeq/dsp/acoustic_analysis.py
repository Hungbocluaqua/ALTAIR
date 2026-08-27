"""
Advanced Acoustic Analysis & Psychoacoustic Intelligence Module.
Inspired by XPDRC & modern room acoustics research.
Implements:
- Statistical Schroeder transition frequency detection (variance of modal vs stochastic region).
- Direct-sound reflection gap detection using Hilbert analytic signal envelope.
- Optimal FDW cycle calculation from measured reflection arrival time.
- Loudspeaker natural acoustic roll-off detection (-3dB / -6dB cutoff).
- Psychoacoustically-shaped room gain house curve detection.
- Fast Moore & Glasberg (1983) Equivalent Rectangular Bandwidth (ERB) smoothing (O(N) cumsum).
- Variable-fraction logarithmic smoothing (1/3rd to 1/48th octave).
- Multi-seat cross-position spatial variance weighting.
"""

from typing import List, Tuple, Optional, Dict, Union, Any
import numpy as np
from scipy import signal


def log_smoothed_fast(data: np.ndarray, freqs: np.ndarray, fraction: float = 3.0, variable: bool = False) -> np.ndarray:
    """
    Fast logarithmic smoothing using O(N) cumulative sum integral.
    
    Args:
        data: Spectral array (magnitude or dB).
        freqs: Frequency array in Hz.
        fraction: Smoothing fraction (e.g. 3 for 1/3-octave, 6 for 1/6-octave, 24 for 1/24-octave).
        variable: If True, uses variable smoothing (1/48 in bass -> 1/3 in treble).
        
    Returns:
        Smoothed array.
    """
    if len(freqs) < 2:
        return data.copy()
        
    smoothed = np.empty_like(data, dtype=np.float64)
    smoothed[0] = data[0]
    df = freqs[1] - freqs[0]
    if df <= 0:
        return data.copy()
        
    cumsum = np.concatenate(([0.0], np.cumsum(data, dtype=np.float64)))
    n_pts = len(freqs)
    
    for i in range(1, n_pts):
        f = freqs[i]
        if f <= 0:
            smoothed[i] = data[i]
            continue
            
        if variable:
            if f <= 100.0:
                current_fraction = 48.0
            elif f >= 10000.0:
                current_fraction = 3.0
            else:
                t = (np.log10(f) - 2.0) / 2.0
                current_fraction = 48.0 - t * 45.0
        else:
            current_fraction = fraction
            
        # Octave window bandwidth in Hz
        w = f * (2.0 ** (1.0 / (2.0 * current_fraction)) - 2.0 ** (-1.0 / (2.0 * current_fraction)))
        bin_w = int(max(1, round(w / df)))
        
        if bin_w <= 1:
            smoothed[i] = data[i]
            continue
            
        start = max(0, i - bin_w // 2)
        end = min(n_pts, i + (bin_w // 2) + 1)
        smoothed[i] = (cumsum[end] - cumsum[start]) / (end - start)
        
    return smoothed


def erb_smoothed_fast(data: np.ndarray, freqs: np.ndarray) -> np.ndarray:
    """
    Applies Equivalent Rectangular Bandwidth (ERB) smoothing based on
    Moore and Glasberg (1983) auditory filter formula:
    ERB(f) = 24.7 * (4.37 * f / 1000.0 + 1.0)
    """
    if len(freqs) < 2:
        return data.copy()
        
    smoothed = np.empty_like(data, dtype=np.float64)
    smoothed[0] = data[0]
    df = freqs[1] - freqs[0]
    if df <= 0:
        return data.copy()
        
    cumsum = np.concatenate(([0.0], np.cumsum(data, dtype=np.float64)))
    n_pts = len(freqs)
    
    for i in range(1, n_pts):
        f = freqs[i]
        if f <= 0:
            smoothed[i] = data[i]
            continue
            
        erb_bw = 24.7 * ((4.37 * f / 1000.0) + 1.0)
        bin_w = int(max(1, round(erb_bw / df)))
        
        if bin_w <= 1:
            smoothed[i] = data[i]
            continue
            
        start = max(0, i - bin_w // 2)
        end = min(n_pts, i + (bin_w // 2) + 1)
        smoothed[i] = (cumsum[end] - cumsum[start]) / (end - start)
        
    return smoothed


def detect_schroeder_statistical(
    mag_raw: np.ndarray,
    freqs: np.ndarray,
    fs: int = 48000,
    min_f: float = 80.0,
    max_f: float = 600.0,
    window_oct: float = 0.25,
) -> float:
    """
    Detects the room Schroeder transition frequency by analyzing the statistical variance
    of the magnitude spectrum. In the modal zone, variance is high; above Schroeder,
    it settles into a stochastic baseline.
    """
    # If this is subwoofer-only (midrange > 25dB below bass), return 200Hz
    idx_bass = (freqs >= 40.0) & (freqs <= 80.0)
    idx_mid = (freqs >= 300.0) & (freqs <= 600.0)
    if np.any(idx_bass) and np.any(idx_mid):
        med_bass = np.median(20.0 * np.log10(np.maximum(mag_raw[idx_bass], 1e-12)))
        med_mid = np.median(20.0 * np.log10(np.maximum(mag_raw[idx_mid], 1e-12)))
        if med_bass - med_mid > 25.0:
            return 200.0

    mag_db = 20.0 * np.log10(np.maximum(mag_raw, 1e-12))
    
    variances = []
    test_freqs = []
    
    # Use uniform linear grid so log_smoothed_fast's df = freqs[1] - freqs[0] assumption holds strictly
    linear_grid = np.arange(min_f, max_f, 2.0)
    for curr_f in linear_grid:
        f_low = curr_f / (2.0 ** (window_oct / 2.0))
        f_high = curr_f * (2.0 ** (window_oct / 2.0))
        
        idx = (freqs >= f_low) & (freqs <= f_high)
        if np.any(idx) and np.sum(idx) > 3:
            variances.append(float(np.std(mag_db[idx])))
            test_freqs.append(float(curr_f))
            
    if not variances:
        return 220.0
        
    v_arr = np.array(variances)
    f_arr = np.array(test_freqs)
    v_smooth = log_smoothed_fast(v_arr, f_arr, fraction=4.0)
    
    # Baseline stochastic variance from > 500 Hz
    high_freq_mask = f_arr > 450.0
    if np.any(high_freq_mask):
        baseline_v = float(np.percentile(v_smooth[high_freq_mask], 25))
        v_spread = float(np.std(v_smooth[high_freq_mask]))
    else:
        baseline_v = float(np.min(v_smooth))
        v_spread = 1.0
        
    threshold = baseline_v + max(0.35, v_spread * 1.25)
    
    fc_detected = 220.0
    trend_count = 0
    required_trend = 3
    
    # Scan from high frequency downward
    for i in range(len(v_smooth) - 1, 0, -1):
        if v_smooth[i] > threshold:
            trend_count += 1
        else:
            trend_count = 0
            
        if trend_count >= required_trend:
            detected_idx = min(i + required_trend, len(v_smooth) - 1)
            fc_detected = float(f_arr[detected_idx])
            break
            
    return float(np.clip(fc_detected, 120.0, 450.0))


def detect_reflection_gap(ir: np.ndarray, fs: int = 48000, threshold_ratio: float = 0.15) -> float:
    """
    Detects the time gap between direct sound peak and the first strong reflection
    using the Hilbert analytic signal envelope.
    
    Returns:
        gap_seconds (clamped to 0.5ms to 20ms).
    """
    analytic = signal.hilbert(ir)
    envelope = np.abs(analytic)
    
    # Smooth with 0.5ms kernel
    smooth_samples = max(1, int(0.0005 * fs))
    kernel = np.ones(smooth_samples) / smooth_samples
    envelope_smooth = np.convolve(envelope, kernel, mode='same')
    
    peak_idx = int(np.argmax(envelope_smooth))
    peak_val = envelope_smooth[peak_idx]
    
    if peak_val < 1e-12:
        return 0.005  # 5ms default fallback
        
    threshold = peak_val * threshold_ratio
    
    # Search forward for first dip below threshold
    found_dip = False
    dip_idx = peak_idx
    max_search_samples = min(len(envelope_smooth), peak_idx + int(0.030 * fs))
    
    for i in range(peak_idx + 1, max_search_samples):
        if envelope_smooth[i] < threshold:
            found_dip = True
            dip_idx = i
            break
            
    if not found_dip:
        return 0.005
        
    # Find next rise above threshold (= first strong reflection)
    reflection_idx = dip_idx
    for i in range(dip_idx, max_search_samples):
        if envelope_smooth[i] > threshold:
            reflection_idx = i
            break
            
    gap_s = (reflection_idx - peak_idx) / fs
    return float(np.clip(gap_s, 0.0005, 0.020))


def ir_gap_to_fdw_cycles(gap_s: float, reference_freq: float = 500.0) -> float:
    """
    Converts direct-to-reflection time gap into optimal FDW cycle count.
    cycles = gap_s * reference_freq (clamped to [3.0, 10.0]).
    """
    cycles = gap_s * reference_freq
    return float(np.clip(cycles, 3.0, 10.0))


def detect_speaker_rolloff(
    mag_raw: np.ndarray,
    freqs: np.ndarray,
    threshold_db: float = -6.0,
    ref_low: float = 200.0,
    ref_high: float = 2000.0,
) -> Tuple[float, float]:
    """
    Detects natural low-end (-6dB or -3dB) and high-end roll-off frequencies
    of a loudspeaker relative to its midband average.
    
    Returns:
        (low_rolloff_hz, high_rolloff_hz)
    """
    mag_smoothed = log_smoothed_fast(mag_raw, freqs, fraction=3.0)
    mag_db = 20.0 * np.log10(np.maximum(mag_smoothed, 1e-12))
    
    idx_mid_low = int(np.argmin(np.abs(freqs - ref_low)))
    idx_mid_high = int(np.argmin(np.abs(freqs - ref_high)))
    if idx_mid_high <= idx_mid_low:
        idx_mid_high = idx_mid_low + 1
        
    midband_level_db = float(np.mean(mag_db[idx_mid_low:idx_mid_high]))
    cutoff_threshold = midband_level_db + threshold_db
    
    # Scan downward from midband for low rolloff
    low_rolloff_hz = float(freqs[1]) if len(freqs) > 1 else 20.0
    for i in range(idx_mid_low, 0, -1):
        if mag_db[i] < cutoff_threshold:
            low_rolloff_hz = float(freqs[i])
            break
            
    # Scan upward from midband for high rolloff
    high_rolloff_hz = 20000.0
    for i in range(idx_mid_high, len(freqs)):
        if mag_db[i] < cutoff_threshold:
            high_rolloff_hz = float(freqs[i])
            break
            
    return float(np.clip(low_rolloff_hz, 20.0, 250.0)), float(np.clip(high_rolloff_hz, 10000.0, 24000.0))


def compute_spatial_variance_weight(
    measurements: List[any],
    freqs: np.ndarray,
    threshold_db: float = 3.0,
) -> np.ndarray:
    """
    Compute frequency-dependent spatial confidence weight W(f) in [0, 1]
    across multiple seat positions. W(f) -> 1 where seats agree (room modes),
    W(f) -> 0 where cross-seat variance is high (preventing spatial comb correction).
    """
    if len(measurements) < 2:
        return np.ones_like(freqs, dtype=np.float64)
        
    mags_db = []
    for m in measurements:
        smoothed_spl = log_smoothed_fast(m.spl_db, freqs, fraction=3.0)
        mags_db.append(smoothed_spl)
        
    std_db = np.std(mags_db, axis=0)
    W = 1.0 / (1.0 + (std_db / threshold_db) ** 2)
    return W


def analyze_wavelet_modal_decay(
    ir: np.ndarray,
    sample_rate: int = 48000,
    modal_freqs: Optional[List[float]] = None,
    rt60_threshold_ms: float = 300.0,
) -> List[Dict[str, Union[float, bool]]]:
    """
    Continuous Wavelet / STFT Time-Frequency Decay Analyzer.
    
    Distinguishes true room resonant modes (which have long energy decay tails RT60 > 300ms)
    from acoustic boundary cancellations / quarter-wave nulls (which decay almost instantly).
    
    Only true ringing modes should receive full modal notch cancellation.
    
    Returns:
        List of dicts per modal frequency with estimated decay time and is_true_mode flag.
    """
    if modal_freqs is None or len(modal_freqs) == 0:
        modal_freqs = [40.0, 60.0, 80.0, 100.0, 120.0, 150.0]
        
    results = []
    peak_idx = int(np.argmax(np.abs(ir)))
    
    for f in modal_freqs:
        # Bandpass filter around modal frequency using 4th-order Butterworth
        f_low = max(10.0, f * 0.85)
        f_high = min(sample_rate * 0.45, f * 1.15)
        
        try:
            sos = signal.butter(4, [f_low, f_high], btype="bandpass", fs=sample_rate, output="sos")
            filtered_ir = signal.sosfilt(sos, ir)
            
            # Extract Hilbert decay envelope
            env = np.abs(signal.hilbert(filtered_ir))
            env_slice = env[peak_idx:]
            
            if len(env_slice) < int(0.100 * sample_rate):
                results.append({"freq_hz": f, "decay_rt60_ms": 100.0, "is_true_mode": False})
                continue
                
            # Logarithmic decay curve
            env_db = 20.0 * np.log10(np.maximum(env_slice / np.max(env_slice), 1e-6))
            
            # Linear regression on first -20 dB of decay
            t_axis = np.arange(len(env_db)) / sample_rate
            decay_mask = (env_db <= -5.0) & (env_db >= -25.0)
            
            if np.sum(decay_mask) > 10:
                poly = np.polyfit(t_axis[decay_mask], env_db[decay_mask], 1)
                slope = poly[0]  # dB per second
                if slope < -0.1:
                    rt60_s = -60.0 / slope
                    rt60_ms = float(np.clip(rt60_s * 1000.0, 20.0, 2000.0))
                else:
                    rt60_ms = 500.0
            else:
                rt60_ms = 150.0
                
            is_true_mode = rt60_ms >= rt60_threshold_ms
            results.append({
                "freq_hz": round(float(f), 1),
                "decay_rt60_ms": round(rt60_ms, 1),
                "is_true_mode": bool(is_true_mode),
            })
        except Exception:
            results.append({"freq_hz": float(f), "decay_rt60_ms": 200.0, "is_true_mode": False})
            
    return results


def calculate_iso9613_air_absorption(
    freqs: np.ndarray,
    temp_celsius: float = 20.0,
    relative_humidity_pct: float = 50.0,
    pressure_kpa: float = 101.325,
    distance_m: float = 3.0,
) -> np.ndarray:
    """
    Calculate atmospheric air attenuation per ISO 9613-1 / ANSI S1.26.
    
    Computes pure-tone atmospheric attenuation alpha(f) [dB/m] and returns total
    distance-dependent absorption loss in dB across frequency array.
    """
    T_k = temp_celsius + 273.15
    T_0 = 293.15  # Reference temperature 20 C
    T_01 = 273.16 # Triple point
    p_r = pressure_kpa / 101.325
    
    # Saturation vapor pressure
    p_sat_ratio = 10.0 ** (-6.8346 * ((T_01 / T_k) ** 1.261) + 4.6151)
    h = relative_humidity_pct * p_sat_ratio / max(p_r, 1e-4)
    
    # Oxygen and Nitrogen relaxation frequencies
    f_r_O = p_r * (24.0 + 4.04e4 * h * ((0.02 + h) / (0.391 + h)))
    f_r_N = p_r * ((T_k / T_0) ** -0.5) * (9.0 + 280.0 * h * np.exp(-4.170 * (((T_k / T_0) ** (-1.0 / 3.0)) - 1.0)))
    
    safe_f = np.maximum(freqs, 1.0)
    
    # Classical and rotational absorption term
    t1 = 1.84e-11 * ((T_k / T_0) ** 0.5) / max(p_r, 1e-4)
    # Oxygen molecular resonance
    t2 = 0.01275 * np.exp(-2239.1 / T_k) * (f_r_O / (f_r_O ** 2 + safe_f ** 2))
    # Nitrogen molecular resonance
    t3 = 0.1068 * np.exp(-3352.0 / T_k) * (f_r_N / (f_r_N ** 2 + safe_f ** 2))
    
    alpha_db_per_m = 8.686 * (safe_f ** 2) * (t1 + ((T_k / T_0) ** -2.5) * (t2 + t3))
    
    # Total absorption loss in dB across listening distance
    total_loss_db = alpha_db_per_m * distance_m
    return total_loss_db


def adapt_target_curve_from_rt60(
    base_target: np.ndarray,
    freqs: np.ndarray,
    estimated_rt60_s: float = 0.40,
    hf_start_hz: float = 1000.0,
) -> np.ndarray:
    """
    Psychoacoustic Automated Target Curve Adaptation based on room reverberation time (RT60).
    
    - Live / reflective rooms (RT60 > 0.45s): Steepen HF downward slope to eliminate perceived glare/brightness.
    - Heavily damped / treated rooms (RT60 < 0.25s): Flatten HF slope to preserve air and sparkle.
    """
    adapted = base_target.copy()
    rt60_diff = estimated_rt60_s - 0.40
    
    # Delta slope: -0.8 dB/octave per +1.0s RT60 excess
    delta_slope_per_oct = float(np.clip(-0.8 * rt60_diff, -0.6, 0.4))
    
    hf_mask = freqs > hf_start_hz
    if np.any(hf_mask) and abs(delta_slope_per_oct) > 0.01:
        octaves = np.log2(freqs[hf_mask] / hf_start_hz)
        adapted[hf_mask] += delta_slope_per_oct * octaves
        
    return adapted


def classify_sbir_boundary_cancellations(
    freqs: np.ndarray,
    spl_db: np.ndarray,
    ir: np.ndarray,
    sample_rate: int = 48000,
    speed_of_sound_mps: float = 343.0,
) -> List[Dict[str, Union[float, bool, str]]]:
    """
    Speaker-Boundary Interference Response (SBIR) Decomposition.
    
    Identifies non-minimum-phase quarter-wavelength boundary cancellations from front/side walls
    (f_sbir = c / 4d), distinguishing them from driver/box minimum-phase dips.
    Non-minimum-phase SBIR nulls cannot be filled by boost without wasting amplifier power.
    """
    results = []
    band_mask = (freqs >= 35.0) & (freqs <= 300.0)
    band_freqs = freqs[band_mask]
    band_spl = spl_db[band_mask]
    
    # Identify local dips
    dips, props = signal.find_peaks(-band_spl, prominence=3.0, distance=5)
    
    for idx in dips:
        f_dip = float(band_freqs[idx])
        dip_depth = float(props["prominences"][np.where(dips == idx)[0][0]])
        
        # Quarter-wavelength equivalent boundary distance: d = c / (4 * f)
        boundary_dist_m = speed_of_sound_mps / (4.0 * max(f_dip, 10.0))
        
        # Non-minimum-phase null if dip is steep (>4 dB) and in SBIR boundary zone
        is_sbir = dip_depth >= 4.0 and (0.3 <= boundary_dist_m <= 2.5)
        
        results.append({
            "frequency_hz": round(f_dip, 1),
            "dip_depth_db": round(dip_depth, 1),
            "estimated_boundary_distance_m": round(boundary_dist_m, 2),
            "is_sbir_null": bool(is_sbir),
            "recommendation": "Do not boost (non-minimum phase boundary cancellation)" if is_sbir else "Correctable mode dip",
        })
        
    return results


def calculate_microphone_geometry_offset(
    lag_ms: float,
    speed_of_sound_mps: float = 343.2,
    ref_distance_m: float = 3.0,
    sub_delay_ms: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Physical Acoustic Geometry & Microphone Alignment Diagnostics.
    (Inspired by A1 Evo AcoustiCX Sonic Precision Engine).
    
    Computes direct-sound path difference and physical microphone off-center offset (in mm).
    Calculates acoustic distances in both meters and feet.
    """
    path_diff_m = speed_of_sound_mps * (lag_ms / 1000.0)
    # Physical offset from center between L and R
    offset_mm = (path_diff_m / 2.0) * 1000.0
    
    dist_l_m = float(ref_distance_m)
    dist_r_m = float(ref_distance_m + path_diff_m)
    dist_sub_m = float(ref_distance_m + speed_of_sound_mps * (sub_delay_ms / 1000.0)) if sub_delay_ms is not None else None
    
    m_to_ft = 3.28084
    
    if abs(offset_mm) <= 3.0:
        geom_summary = "Microphone is centered at primary listening position (within +/- 3mm)."
        off_center_direction = "center"
    elif offset_mm > 0:
        geom_summary = f"Microphone was {abs(offset_mm):.1f}mm left off-center during measurement (Right speaker was further away)."
        off_center_direction = "left"
    else:
        geom_summary = f"Microphone was {abs(offset_mm):.1f}mm right off-center during measurement (Left speaker was further away)."
        off_center_direction = "right"
        
    distances = {
        "front_left": {
            "meters": round(dist_l_m, 2),
            "feet": round(dist_l_m * m_to_ft, 2),
        },
        "front_right": {
            "meters": round(dist_r_m, 2),
            "feet": round(dist_r_m * m_to_ft, 2),
        },
    }
    if dist_sub_m is not None:
        distances["subwoofer"] = {
            "meters": round(dist_sub_m, 2),
            "feet": round(dist_sub_m * m_to_ft, 2),
        }
        
    return {
        "delay_offset_ms": round(lag_ms, 3),
        "path_difference_mm": round(path_diff_m * 1000.0, 1),
        "mic_off_center_mm": round(abs(offset_mm), 1),
        "off_center_direction": off_center_direction,
        "geometry_summary": geom_summary,
        "distances": distances,
    }


def calculate_snapped_crossover_pair(
    left_rolloff_hz: float,
    right_rolloff_hz: float,
    spl_left: Optional[np.ndarray] = None,
    spl_right: Optional[np.ndarray] = None,
    freqs: Optional[np.ndarray] = None,
) -> Dict[str, Any]:
    """
    Co-optimizes crossover for L/R pair and snaps to standard hardware frequencies
    (40, 50, 60, 70, 80, 90, 100, 110, 120, 150, 180, 200 Hz) matching AVR / active monitor switches.
    """
    STANDARD_CROSSOVERS = [40, 50, 60, 70, 80, 90, 100, 110, 120, 150, 180, 200]
    
    math_avg = (left_rolloff_hz + right_rolloff_hz) / 2.0
    snapped = min(STANDARD_CROSSOVERS, key=lambda x: abs(x - math_avg))
    
    rms_error = 0.0
    if spl_left is not None and spl_right is not None and freqs is not None:
        mask = (freqs >= snapped * 0.5) & (freqs <= snapped * 2.0)
        if np.any(mask):
            diff = spl_left[mask] - spl_right[mask]
            rms_error = float(np.sqrt(np.mean(diff ** 2)))
            
    summary = (
        f"Individual optimal: L={left_rolloff_hz:.1f}Hz, R={right_rolloff_hz:.1f}Hz. "
        f"Mathematical average ({math_avg:.1f}Hz) snapped to nearest valid crossover: {snapped}Hz"
    )
    
    return {
        "left_optimal_hz": round(left_rolloff_hz, 1),
        "right_optimal_hz": round(right_rolloff_hz, 1),
        "mathematical_average_hz": round(math_avg, 1),
        "snapped_hardware_crossover_hz": int(snapped),
        "crossover_slope": "Linkwitz-Riley 24 dB/oct (LR4)",
        "rms_transition_error_db": round(rms_error, 2),
        "summary": summary,
    }


def calculate_split_gain_staging(
    target_attenuation_db: float,
    step_size_db: float = 0.5,
) -> Dict[str, Any]:
    """
    Splits gain adjustment into coarse hardware volume (0.5 dB steps) and fine DSP trim.
    Preserves maximum digital DAC dynamic range.
    """
    # Negative attenuation (e.g. -5.32 dB)
    hw_steps = round(target_attenuation_db / step_size_db)
    hw_db = hw_steps * step_size_db
    dsp_trim_db = target_attenuation_db - hw_db
    
    return {
        "net_volume_adjustment_db": round(target_attenuation_db, 2),
        "recommended_hardware_db": round(hw_db, 1),
        "dsp_fine_trim_db": round(dsp_trim_db, 3),
        "summary": f"Net adjustment: {target_attenuation_db:.2f} dB (Hardware: {hw_db:.1f} dB, DSP trim: {dsp_trim_db:+.3f} dB)",
    }



