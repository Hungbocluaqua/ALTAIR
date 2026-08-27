"""
1-Click Digital Room Correction Pipeline Orchestrator for ALTAIR.
Coordinates end-to-end execution:
- REW REST API & File Ingestion
- Cross-correlation time alignment & Speed of Sound temperature scaling
- Mic .cal calibration application & polar diffraction compensation
- Acoustic Intelligence: Statistical Schroeder, Reflection Gap & FDW tuning, Speaker Rolloff, Group Delay Auto Crossover
- Wavelet modal decay gating (true ringing modes vs fast-decay cancellations)
- SBIR boundary cancellation hard clamping (forced 0 dB correction)
- ISO 9613-1 air absorption target adaptation
- Multi-seat spatial variance weighting into Module 2 regularization
- Module 1: Virtual Bass Array (VBA)
- Module 2: Frequency-Dependent Tikhonov Inversion with beta(f) & SNR protection
- Module 3: 1-Cycle FDW, Crossover Phase Linearization & homomorphic excess-phase inversion
- Subwoofer + Mains Alignment & Multi-Sub Matrix Optimizer (MSO)
- Closed-loop pre-ringing safeguard (Q x0.8 / beta x1.3 retries) with Zwicker masking gate
- ITU-R BS.1770 4x True-Peak Detection & Tap Trimming
- Warped FIR (WFIR) synthesis for embedded DSP export targets
- Multi-Platform Bundle Generation (Equalizer APO, CamillaDSP, miniDSP, rePhase, WAV)
"""

from typing import Dict, List, Optional, Tuple, Callable, Any
import numpy as np
import io

from .dsp.measurement import (
    Measurement,
    cross_correlate_align,
    vector_average,
    hybrid_spatial_average,
    parse_rew_text,
)
from .dsp.acoustic_analysis import (
    detect_schroeder_statistical,
    detect_reflection_gap,
    ir_gap_to_fdw_cycles,
    detect_speaker_rolloff,
    log_smoothed_fast,
    erb_smoothed_fast,
    analyze_wavelet_modal_decay,
    calculate_iso9613_air_absorption,
    classify_sbir_boundary_cancellations,
    calculate_microphone_geometry_offset,
    calculate_snapped_crossover_pair,
    calculate_split_gain_staging,
    adapt_target_for_air_absorption,
)
from .dsp.targets import (
    generate_harman_target,
    generate_bk1974_target,
    generate_flat_target,
    generate_oca_target,
    generate_custom_target,
    anchor_target_to_measurement,
)
from .dsp.vba_synth import synthesize_vba_filter, detect_modal_peaks_dips
from .dsp.mag_inversion import synthesize_mag_inversion_filter
from .dsp.phase_linearization import synthesize_phase_linearization_filter
from .dsp.preringing import evaluate_step_response_preringing, evaluate_zwicker_temporal_masking
from .dsp.filter_assembly import assemble_final_filter
from .dsp.sub_alignment import optimize_sub_mains_alignment, optimize_multi_sub_matrix
from .dsp.farina import (
    farina_harmonic_separation,
    compute_snr_mask,
    apply_polar_diffraction_calibration,
)
from .dsp.acquisition import apply_cal_file
from .dsp.advanced_dsp import (
    calculate_speed_of_sound,
    compute_frequency_dependent_beta,
    detect_group_delay_crossovers,
    calculate_itu_r_bs1770_true_peak,
    generate_hybrid_iir_fir_split,
    synthesize_warped_fir,
)
from .exporters.bundle_exporter import create_export_bundle
from .integrations.rew_api import RewApiClient


def generate_demo_room_measurements(sample_rate: int = 48000, n_fft: int = 65536) -> Tuple[Measurement, Measurement, Measurement]:
    """
    Generate realistic audiophile demo measurements (Left, Right, Subwoofer)
    incorporating room modal resonances, floor reflections, and loudspeaker crossover phase shifts.
    """
    freqs = np.fft.rfftfreq(n_fft, d=1.0 / sample_rate)
    
    # 1. Left Channel Base SPL (with 43 Hz room mode, 84 Hz harmonic, 62 Hz dip, 2.5 kHz crossover)
    spl_l = 85.0 - 0.7 * np.log2(np.maximum(freqs, 100.0) / 100.0)
    spl_l += 9.0 * np.exp(-0.5 * ((freqs - 43.0) / 4.0) ** 2)  # P1 modal peak
    spl_l += 6.5 * np.exp(-0.5 * ((freqs - 84.0) / 6.0) ** 2)  # P2 modal peak
    spl_l -= 12.0 * np.exp(-0.5 * ((freqs - 62.0) / 5.0) ** 2) # D1 boundary dip
    spl_l -= 4.0 * np.exp(-0.5 * ((freqs - 180.0) / 25.0) ** 2) # Floor bounce
    
    low_roll = 1.0 / (1.0 + (38.0 / np.maximum(freqs, 1.0)) ** 4)
    mag_l = (10.0 ** (spl_l / 20.0)) * low_roll
    
    phase_l = - 2.0 * np.arctan(freqs / 2500.0) * 4.0  # LR4 phase rotation
    H_l = mag_l * np.exp(1j * phase_l)
    ir_l = np.fft.irfft(H_l, n=n_fft)
    meas_left = Measurement(name="Demo Speaker Left", ir=ir_l, sample_rate=sample_rate, n_fft=n_fft)
    
    # 2. Right Channel Base SPL
    spl_r = 85.0 - 0.7 * np.log2(np.maximum(freqs, 100.0) / 100.0)
    spl_r += 8.0 * np.exp(-0.5 * ((freqs - 44.5) / 4.0) ** 2)
    spl_r += 7.0 * np.exp(-0.5 * ((freqs - 86.0) / 6.0) ** 2)
    spl_r -= 10.0 * np.exp(-0.5 * ((freqs - 60.0) / 5.0) ** 2)
    spl_r -= 3.5 * np.exp(-0.5 * ((freqs - 195.0) / 25.0) ** 2)
    
    mag_r = (10.0 ** (spl_r / 20.0)) * low_roll
    phase_r = - 2.0 * np.arctan(freqs / 2500.0) * 4.0
    H_r = mag_r * np.exp(1j * phase_r)
    ir_r = np.fft.irfft(H_r, n=n_fft)
    meas_right = Measurement(name="Demo Speaker Right", ir=ir_r, sample_rate=sample_rate, n_fft=n_fft)
    
    # 3. Subwoofer Channel (18 Hz - 140 Hz with room gain + 3.2 ms acoustic delay)
    spl_sub = 88.0 + 4.0 * np.exp(-0.5 * ((freqs - 35.0) / 15.0) ** 2)
    spl_sub += 8.0 * np.exp(-0.5 * ((freqs - 43.0) / 5.0) ** 2)
    sub_lpf = 1.0 / (1.0 + (freqs / 120.0) ** 4)
    sub_hpf = 1.0 / (1.0 + (18.0 / np.maximum(freqs, 1.0)) ** 4)
    mag_sub = (10.0 ** (spl_sub / 20.0)) * sub_lpf * sub_hpf
    
    delay_s = 0.0032
    phase_sub = - 2.0 * np.pi * freqs * delay_s
    H_sub = mag_sub * np.exp(1j * phase_sub)
    ir_sub = np.fft.irfft(H_sub, n=n_fft)
    meas_sub = Measurement(name="Demo Subwoofer", ir=ir_sub, sample_rate=sample_rate, n_fft=n_fft)
    
    return meas_left, meas_right, meas_sub


def apply_mic_calibration_to_measurement(
    measurement: Measurement,
    cal_freqs: np.ndarray,
    cal_spl: np.ndarray,
    cal_phase: Optional[np.ndarray] = None,
) -> Measurement:
    """Apply a microphone .cal curve to a Measurement (magnitude + optional phase)."""
    H_cal = apply_cal_file(measurement.H, measurement.freqs, cal_freqs, cal_spl, cal_phase)
    ir_cal = np.fft.irfft(H_cal, n=measurement.n_fft)
    return Measurement(
        name=f"{measurement.name} (Mic-Cal)",
        ir=ir_cal,
        sample_rate=measurement.sample_rate,
        n_fft=measurement.n_fft,
    )


def build_spatial_variance_weights(
    seat_measurements: Optional[List[Measurement]],
    freqs: np.ndarray,
    threshold_db: float = 3.0,
) -> Optional[np.ndarray]:
    """
    Build frequency-dependent spatial confidence weights W(f) in [0, 1] from
    multi-seat measurements on the pipeline's frequency grid.

    W(f) = 1 / (1 + (std_across_seats(f) / threshold_db)^2)
    """
    if not seat_measurements or len(seat_measurements) < 2:
        return None
        
    mags_db = []
    for m in seat_measurements:
        interp_spl = np.interp(freqs, m.freqs, m.spl_db, left=float(m.spl_db[0]), right=float(m.spl_db[-1]))
        mags_db.append(log_smoothed_fast(interp_spl, freqs, fraction=3.0))
        
    std_db = np.std(mags_db, axis=0)
    return 1.0 / (1.0 + (std_db / threshold_db) ** 2)


def _decay_entry_for_freq(
    decay_analysis: Optional[List[Dict[str, Any]]],
    freq_hz: float,
    tolerance: float = 0.10,
) -> Optional[Dict[str, Any]]:
    """Frequency-keyed lookup into the wavelet decay analysis results.

    The decay analyzer may skip bands (e.g. when a bandpass filter fails or a
    decay window is too short), so positional pairing is unsafe. Returns the
    entry whose rounded freq_hz is within `tolerance` of `freq_hz` (nearest wins).
    """
    if not decay_analysis:
        return None
    candidates = [
        e for e in decay_analysis
        if abs(float(e.get("freq_hz", 0.0)) - float(freq_hz)) / max(float(freq_hz), 1.0) <= tolerance
    ]
    if not candidates:
        return None
    return min(candidates, key=lambda e: abs(float(e.get("freq_hz", 0.0)) - float(freq_hz)))


def build_forced_neutral_mask(
    freqs: np.ndarray,
    sbir_diagnostics: Optional[List[Dict[str, Any]]] = None,
    modal_info: Optional[Dict[str, Any]] = None,
    modal_decay_analysis: Optional[List[Dict[str, Any]]] = None,
    band_octaves: float = 1.0 / 6.0,
) -> Tuple[np.ndarray, List[Dict[str, Any]]]:
    """
    Build a boolean frequency mask that forces 0 dB correction (beta -> infinity)
    at frequencies that must never be equalized:

    1. Confirmed non-minimum-phase SBIR boundary nulls (classify_sbir_boundary_cancellations).
    2. Fast-decay dips from the wavelet modal decay analysis (is_true_mode == False) —
       these are boundary cancellations, not ringing modes, and boosting them wastes
       headroom and driver excursion.

    Returns:
        (mask, report) where report lists every clamped frequency and its reason.
    """
    mask = np.zeros_like(freqs, dtype=bool)
    report: List[Dict[str, Any]] = []
    
    def clamp_band(f0: float, reason: str):
        lo = f0 * (2.0 ** (-band_octaves))
        hi = f0 * (2.0 ** (band_octaves))
        mask[:] = mask | ((freqs >= lo) & (freqs <= hi))
        report.append({"frequency_hz": round(float(f0), 1), "reason": reason})
    
    # 1. SBIR non-minimum-phase nulls
    for diag in (sbir_diagnostics or []):
        if diag.get("is_sbir_null"):
            clamp_band(float(diag["frequency_hz"]), "SBIR boundary null (non-minimum-phase)")
            
    # 2. Wavelet decay gating: fast-decay dips are not true modes.
    # Pair by probe frequency with the same 10% tolerance used elsewhere —
    # bands the analyzer skipped must fall through as "unknown" instead of
    # silently pairing with an unrelated entry.
    if modal_info and modal_decay_analysis is not None:
        dips = modal_info.get("dips", []) or []
        remaining = list(modal_decay_analysis or [])
        for dip in dips:
            dec = _decay_entry_for_freq(remaining, float(dip["freq"]))
            if dec is None:
                continue
            remaining = [e for e in remaining if e is not dec]
            if not dec.get("is_true_mode", True):
                clamp_band(float(dip["freq"]), f"Fast-decay dip (RT60 {dec.get('decay_rt60_ms', 0.0):.0f} ms < 300 ms)")
                
    return mask, report


class OptimizationOrchestrator:
    """
    Executes the ALTAIR 1-Click Optimization workflow.
    """

    def __init__(self, rew_client: Optional[RewApiClient] = None):
        self.rew_client = rew_client or RewApiClient()

    async def run_pipeline(
        self,
        meas_left: Measurement,
        meas_right: Optional[Measurement] = None,
        meas_sub: Optional[Measurement] = None,
        meas_subs: Optional[List[Measurement]] = None,
        target_curve_name: str = "harman",
        bass_boost_db: float = 6.0,
        bass_cutoff_hz: float = 80.0,
        hf_slope_db_per_oct: float = -0.8,
        hf_start_hz: float = 200.0,
        crossover_freq: float = 2500.0,
        crossover_order: int = 4,
        sub_crossover_freq: float = 80.0,
        target_taps: int = 65536,
        temp_celsius: float = 20.0,
        relative_humidity_pct: float = 50.0,
        pressure_kpa: float = 101.325,
        listening_distance_m: float = 3.0,
        mic_orientation_deg: float = 0.0,
        mic_cal: Optional[Dict[str, Any]] = None,
        seat_measurements: Optional[Dict[str, List[Measurement]]] = None,
        wfir_taps: Optional[int] = None,
        apply_excess_phase_inversion: bool = True,
        apply_air_absorption_adaptation: bool = True,
        apply_sbir_wavelet_gating: bool = True,
        safeguard_max_attempts: int = 5,
        progress_callback: Optional[Callable[[str, int, str], None]] = None,
    ) -> Dict[str, Any]:
        """
        Run the complete ALTAIR 1-Click optimization pipeline with full acoustic intelligence.
        """
        def update(step_name: str, pct: int, detail: str = ""):
            if progress_callback:
                progress_callback(step_name, pct, detail)

        # -------------------------------------------------------------
        # STEP 1: Ingestion & Timing Alignment with Temperature & Atmosphere
        # -------------------------------------------------------------
        speed_of_sound = calculate_speed_of_sound(temp_celsius)
        update("Input Ingestion", 10, f"Processing {meas_left.name} (SR: {meas_left.sample_rate} Hz, c: {speed_of_sound:.1f} m/s, RH: {relative_humidity_pct}%)")
        sr = meas_left.sample_rate
        
        # Apply microphone .cal calibration (magnitude + phase) if provided
        mic_cal_info: Optional[Dict[str, Any]] = None
        if mic_cal and mic_cal.get("freqs") is not None and len(mic_cal.get("freqs", [])) > 0:
            cal_f = np.asarray(mic_cal["freqs"], dtype=np.float64)
            cal_s = np.asarray(mic_cal["spl"], dtype=np.float64)
            cal_p = np.asarray(mic_cal["phase"], dtype=np.float64) if mic_cal.get("phase") is not None else None
            meas_left = apply_mic_calibration_to_measurement(meas_left, cal_f, cal_s, cal_p)
            if meas_right is not None:
                meas_right = apply_mic_calibration_to_measurement(meas_right, cal_f, cal_s, cal_p)
            if meas_sub is not None:
                meas_sub = apply_mic_calibration_to_measurement(meas_sub, cal_f, cal_s, cal_p)
            if meas_subs:
                meas_subs = [apply_mic_calibration_to_measurement(m, cal_f, cal_s, cal_p) for m in meas_subs]
            mic_cal_info = {"points": int(len(cal_f)), "applied": True, "has_phase": cal_p is not None}
            update("Input Ingestion", 12, f"Applied microphone .cal calibration ({len(cal_f)} points)")
        
        # Apply polar mic calibration if 90-degree diffuse
        if mic_orientation_deg > 10.0:
            cal_H = apply_polar_diffraction_calibration(meas_left.H, meas_left.freqs, mic_orientation_deg)
            cal_ir = np.fft.irfft(cal_H, n=meas_left.n_fft)
            meas_left = Measurement(name=meas_left.name, ir=cal_ir, sample_rate=sr, n_fft=meas_left.n_fft)
            
        lag_r_ms = 0.0
        impulse_correlation_lr = 1.0
        if meas_right is not None:
            if mic_orientation_deg > 10.0:
                cal_H_r = apply_polar_diffraction_calibration(meas_right.H, meas_right.freqs, mic_orientation_deg)
                cal_ir_r = np.fft.irfft(cal_H_r, n=meas_right.n_fft)
                meas_right = Measurement(name=meas_right.name, ir=cal_ir_r, sample_rate=sr, n_fft=meas_right.n_fft)
                
            aligned_r, lag_r, lag_r_ms = cross_correlate_align(meas_left.ir, meas_right.ir, sample_rate=sr)
            meas_right = Measurement(name=meas_right.name, ir=aligned_r, sample_rate=sr, n_fft=meas_left.n_fft)
            denom_lr = np.sqrt(np.sum(meas_left.ir ** 2) * np.sum(aligned_r ** 2)) + 1e-12
            impulse_correlation_lr = float(np.sum(meas_left.ir * aligned_r) / denom_lr)
            update("Timing Alignment", 18, f"Aligned Right channel (offset: {lag_r_ms:.2f} ms, correlation: {impulse_correlation_lr:.3f})")
        else:
            meas_right = meas_left

        # Compute SNR Masks
        _, _, snr_mask_l = compute_snr_mask(meas_left.ir, sample_rate=sr, min_snr_db=15.0)
        _, _, snr_mask_r = compute_snr_mask(meas_right.ir, sample_rate=sr, min_snr_db=15.0)

        # -------------------------------------------------------------
        # STEP 2: Acoustic Intelligence, Group Delay & Room Diagnostics
        # -------------------------------------------------------------
        update("Acoustic Intelligence", 25, "Analyzing statistical Schroeder, reflection envelope, SBIR & group delay")
        schroeder_hz = detect_schroeder_statistical(np.abs(meas_left.H), meas_left.freqs, fs=sr)
        reflection_gap_s = detect_reflection_gap(meas_left.ir, fs=sr)
        auto_fdw_cycles = ir_gap_to_fdw_cycles(reflection_gap_s)
        low_rolloff, high_rolloff = detect_speaker_rolloff(np.abs(meas_left.H), meas_left.freqs, threshold_db=-6.0)
        low_rolloff_r, _ = detect_speaker_rolloff(np.abs(meas_right.H), meas_right.freqs, threshold_db=-6.0)
        
        # Snapped hardware crossover co-optimization for active monitor / AVR switches
        snapped_xo_info = calculate_snapped_crossover_pair(
            low_rolloff, low_rolloff_r, meas_left.spl_db, meas_right.spl_db, meas_left.freqs
        )
        
        # SBIR boundary interference decomposition
        sbir_info_l = classify_sbir_boundary_cancellations(meas_left.freqs, meas_left.spl_db, meas_left.ir, sample_rate=sr, speed_of_sound_mps=speed_of_sound)
        
        # ISO 9613-1 air absorption calculation (full curve + 10 kHz diagnostic)
        air_loss = calculate_iso9613_air_absorption(meas_left.freqs, temp_celsius, relative_humidity_pct, pressure_kpa, distance_m=listening_distance_m)
        idx_10k = np.argmin(np.abs(meas_left.freqs - 10000.0))
        air_loss_10k_db = float(air_loss[idx_10k])
        
        # Auto-detect passive crossover points from group delay peaks (only if <= 0)
        detected_crossovers = detect_group_delay_crossovers(meas_left.ir, sample_rate=sr)
        effective_xo_freq = crossover_freq
        if crossover_freq is not None and crossover_freq <= 0 and detected_crossovers:
            effective_xo_freq = detected_crossovers[0]["frequency_hz"]
            
        rec_sub_crossover = float(min(120.0, max(60.0, round(low_rolloff * 1.3 / 10.0) * 10.0)))
        
        # Multi-seat spatial variance weights (W(f) -> regularization beta(f))
        spatial_weights_l: Optional[np.ndarray] = None
        spatial_weights_r: Optional[np.ndarray] = None
        if seat_measurements:
            spatial_weights_l = build_spatial_variance_weights(seat_measurements.get("left"), meas_left.freqs)
            spatial_weights_r = build_spatial_variance_weights(seat_measurements.get("right"), meas_right.freqs)
            
        acoustic_intel = {
            "detected_schroeder_hz": round(schroeder_hz, 1),
            "detected_reflection_gap_ms": round(reflection_gap_s * 1000.0, 2),
            "recommended_fdw_cycles": round(auto_fdw_cycles, 1),
            "speaker_low_rolloff_hz": round(low_rolloff, 1),
            "speaker_high_rolloff_hz": round(high_rolloff, 1),
            "recommended_sub_crossover_hz": round(rec_sub_crossover, 0),
            "detected_crossovers": detected_crossovers,
            "speed_of_sound_mps": round(speed_of_sound, 1),
            "temperature_celsius": float(temp_celsius),
            "relative_humidity_pct": float(relative_humidity_pct),
            "pressure_kpa": float(pressure_kpa),
            "air_absorption_loss_10k_db": round(air_loss_10k_db, 2),
            "sbir_diagnostics": sbir_info_l,
            "mic_calibration": mic_cal_info,
            "spatial_variance_weighting": {
                "left_active": spatial_weights_l is not None,
                "right_active": spatial_weights_r is not None,
                "seats": len(seat_measurements.get("left", [])) if seat_measurements else 0,
            },
        }
            
        # -------------------------------------------------------------
        # STEP 3: Target Curve Generation, Anchoring & Air Absorption Adaptation
        # -------------------------------------------------------------
        update("Target Synthesis", 35, f"Generating {target_curve_name.upper()} house curve")
        freqs = meas_left.freqs
        
        if target_curve_name.lower() == "bk1974":
            base_target = generate_bk1974_target(freqs)
        elif target_curve_name.lower() == "flat":
            base_target = generate_flat_target(freqs)
        elif target_curve_name.lower() == "oca":
            base_target = generate_oca_target(freqs)
        elif target_curve_name.lower() == "custom":
            base_target = generate_custom_target(freqs, bass_boost_db, bass_cutoff_hz, hf_slope_db_per_oct, hf_start_hz)
        else:  # Harman default
            base_target = generate_harman_target(freqs, bass_boost_db, bass_cutoff_hz, hf_slope_db_per_oct, hf_start_hz)
            
        anchored_target_l, offset_l = anchor_target_to_measurement(base_target, meas_left.spl_db, freqs)
        anchored_target_r, offset_r = anchor_target_to_measurement(base_target, meas_right.spl_db, freqs)
        
        # Distance-dependent ISO 9613-1 air absorption target adaptation:
        # bend the HF target down by the physical air-loss curve so the inverter
        # does not try to re-boost energy the air itself removed.
        if apply_air_absorption_adaptation:
            anchored_target_l = adapt_target_for_air_absorption(anchored_target_l, freqs, air_loss)
            anchored_target_r = adapt_target_for_air_absorption(anchored_target_r, freqs, air_loss)
            acoustic_intel["target_air_adaptation_db_10k"] = round(-air_loss_10k_db, 2)
        
        # -------------------------------------------------------------
        # STEP 4: Module 1 - Virtual Bass Array (VBA) Modal Inversion
        # -------------------------------------------------------------
        update("Module 1: VBA Synthesis", 48, f"Synthesizing 4th-order reflection canceller (Schroeder: {schroeder_hz:.0f} Hz)")
        h_vba_l, meas_h1_l, modal_info_l = synthesize_vba_filter(meas_left, sample_rate=sr)
        h_vba_r, meas_h1_r, modal_info_r = synthesize_vba_filter(meas_right, sample_rate=sr)
        
        # Wavelet modal decay gating: separate true ringing modes from
        # fast-decay boundary cancellations. Analysis is only run for the
        # frequencies actually detected (never the analyzer's default probe
        # list), and results are paired by frequency so skipped bands cannot
        # silently mis-match.
        modal_decay_l: List[Dict[str, Any]] = []
        modal_decay_r: List[Dict[str, Any]] = []
        neutral_mask_l: Optional[np.ndarray] = None
        neutral_mask_r: Optional[np.ndarray] = None
        if apply_sbir_wavelet_gating:
            for meas, modal_info, decay_sink in (
                (meas_left, modal_info_l, modal_decay_l),
                (meas_right, modal_info_r, modal_decay_r),
            ):
                probe_freqs = [p["freq"] for p in modal_info.get("peaks", [])] + [d["freq"] for d in modal_info.get("dips", [])]
                if probe_freqs:
                    decay_sink.extend(
                        analyze_wavelet_modal_decay(meas.ir, sample_rate=sr, modal_freqs=probe_freqs, rt60_threshold_ms=300.0)
                    )
            neutral_mask_l, neutral_report_l = build_forced_neutral_mask(
                freqs, sbir_info_l, modal_info_l, modal_decay_l
            )
            neutral_mask_r, _ = build_forced_neutral_mask(
                freqs, None, modal_info_r, modal_decay_r
            )
            acoustic_intel["sbir_neutral_mask_frequencies"] = [r["frequency_hz"] for r in neutral_report_l]
            acoustic_intel["wavelet_decay_gating"] = {
                "left_true_modes": [e["freq_hz"] for e in modal_decay_l if e["is_true_mode"]],
                "left_fast_decay_dips": [
                    d["freq"] for d in modal_info_l.get("dips", [])
                    if (entry := _decay_entry_for_freq(modal_decay_l, d["freq"])) is not None
                    and not entry["is_true_mode"]
                ],
            }
        
        # -------------------------------------------------------------
        # STEP 5: Subwoofer Alignment & Multi-Sub Matrix Optimization (MSO)
        # (independent of the Module 2/3 closed loop — runs once)
        # -------------------------------------------------------------
        sub_align_results = None
        multi_sub_alignment = None
        sub_delay_ms = 0.0
        sub_polarity = 1.0
        
        if meas_subs and len(meas_subs) > 0:
            meas_sub = meas_subs[0]
        
        if meas_sub is not None:
            effective_sub_xo = sub_crossover_freq or rec_sub_crossover
            if meas_subs is not None and len(meas_subs) > 1:
                update("Subwoofer Integration", 56, f"Multi-Sub Matrix Optimization (MSO) across {len(meas_subs)} subwoofers")
                mso_result = optimize_multi_sub_matrix(meas_subs, crossover_freq=effective_sub_xo, search_range_ms=20.0)
                multi_sub_alignment = {
                    "sub_count": int(mso_result["sub_count"]),
                    "crossover_freq_hz": float(effective_sub_xo),
                    "alignments": mso_result["alignments"],
                }
            else:
                update("Subwoofer Integration", 56, f"Optimizing sub-mains acoustic summation at {effective_sub_xo} Hz")
                sub_align_results = optimize_sub_mains_alignment(
                    main_meas=meas_left,
                    sub_meas=meas_sub,
                    crossover_freq=effective_sub_xo,
                )
                sub_delay_ms = sub_align_results["optimal_delay_ms"]
                sub_polarity = sub_align_results.get("polarity_multiplier", 1.0)
        
        # -------------------------------------------------------------
        # STEP 6-8: Closed-Loop Modules 2+3 & Safeguards
        # The Zwicker backward-masking curve is the active audibility gate:
        # pre-ringing that exceeds the 10%/-20dB thresholds but still sits below
        # the auditory masking curve is allowed (inaudible); only audible
        # pre-echo triggers the Q x0.8 / beta x1.3 attenuation loop.
        # -------------------------------------------------------------
        q_scale = 1.0
        beta_scale = 1.0
        safeguard_attempts = 0
        auto_attenuated = False
        
        for attempt in range(1, safeguard_max_attempts + 1):
            safeguard_attempts = attempt
            update(
                "Module 2: Magnitude Inversion", 62,
                f"Tikhonov beta(f) deconvolution (attempt {attempt}/{safeguard_max_attempts}, beta x{beta_scale:.2f})"
            )
            h_inv_l, meas_h2_l, mag_inv_db_l = synthesize_mag_inversion_filter(
                meas_h1_l,
                anchored_target_l,
                beta=0.04 * beta_scale,
                max_boost_db=5.0,
                max_cut_db=20.0,
                snr_mask=snr_mask_l,
                spatial_variance_weights=spatial_weights_l,
                forced_neutral_mask=neutral_mask_l,
            )
            h_inv_r, meas_h2_r, mag_inv_db_r = synthesize_mag_inversion_filter(
                meas_h1_r,
                anchored_target_r,
                beta=0.04 * beta_scale,
                max_boost_db=5.0,
                max_cut_db=20.0,
                snr_mask=snr_mask_r,
                spatial_variance_weights=spatial_weights_r,
                forced_neutral_mask=neutral_mask_r,
            )
            
            update(
                "Module 3: Phase Linearization", 72,
                f"1-cycle FDW + crossover reversal + excess-phase inversion (max phase wrap {45.0 * q_scale:.1f} deg)"
            )
            h_phase_l, meas_h3_l = synthesize_phase_linearization_filter(
                meas_h2_l,
                crossover_freq=effective_xo_freq,
                crossover_order=crossover_order,
                sample_rate=sr,
                max_delta_deg=45.0 * q_scale,
                apply_excess_phase_inversion=apply_excess_phase_inversion,
            )
            h_phase_r, meas_h3_r = synthesize_phase_linearization_filter(
                meas_h2_r,
                crossover_freq=effective_xo_freq,
                crossover_order=crossover_order,
                sample_rate=sr,
                max_delta_deg=45.0 * q_scale,
                apply_excess_phase_inversion=apply_excess_phase_inversion,
            )
            
            update("Safeguards & Tap Trimming", 84, f"Tukey tap trimming ({target_taps} taps) & 4x True-Peak check")
            fir_final_l, max_gain_l, preamp_l = assemble_final_filter(
                h_vba=h_vba_l,
                h_inv=h_inv_l,
                h_phase=h_phase_l,
                target_taps=target_taps,
                sample_rate=sr,
                window_type="tukey",
                tukey_alpha=0.05,
            )
            fir_final_r, max_gain_r, preamp_r = assemble_final_filter(
                h_vba=h_vba_r,
                h_inv=h_inv_r,
                h_phase=h_phase_r,
                target_taps=target_taps,
                sample_rate=sr,
                window_type="tukey",
                tukey_alpha=0.05,
            )
            
            preringing_metrics_l = evaluate_step_response_preringing(fir_final_l, sample_rate=sr)
            preringing_metrics_r = evaluate_step_response_preringing(fir_final_r, sample_rate=sr)
            zwicker_l = evaluate_zwicker_temporal_masking(fir_final_l, sample_rate=sr)
            zwicker_r = evaluate_zwicker_temporal_masking(fir_final_r, sample_rate=sr)
            
            # Zwicker active gate: only AURALLY AUDIBLE pre-echo counts as a failure
            audible_l = (not preringing_metrics_l["passed"]) and (not zwicker_l["is_masked"])
            audible_r = (not preringing_metrics_r["passed"]) and (not zwicker_r["is_masked"])
            
            if not (audible_l or audible_r):
                break
                
            if attempt < safeguard_max_attempts:
                auto_attenuated = True
                q_scale *= 0.80
                beta_scale *= 1.30
                update(
                    "Safeguards", 85,
                    f"Audible pre-echo detected (L:{zwicker_l['worst_margin_db']:+0.1f} dB, R:{zwicker_r['worst_margin_db']:+0.1f} dB above masking) — attenuating Q x{q_scale:.2f}, beta x{beta_scale:.2f}"
                )
        
        # True-Peak 4x oversampled detection (ITU-R BS.1770)
        tp_l = calculate_itu_r_bs1770_true_peak(fir_final_l)
        tp_r = calculate_itu_r_bs1770_true_peak(fir_final_r)
        
        global_preamp_db = min(preamp_l, preamp_r)
        
        safeguard_loop = {
            "attempts": safeguard_attempts,
            "q_scale": round(q_scale, 4),
            "beta_scale": round(beta_scale, 4),
            "auto_attenuated": bool(auto_attenuated),
        }
        safeguard_decision_l = {
            "pre_ringing_passed": bool(preringing_metrics_l["passed"]),
            "zwicker_masked": bool(zwicker_l["is_masked"]),
            "audible_pre_echo": bool(audible_l),
            "verdict": "passed" if not audible_l else "attenuated_max_iterations",
        }
        safeguard_decision_r = {
            "pre_ringing_passed": bool(preringing_metrics_r["passed"]),
            "zwicker_masked": bool(zwicker_r["is_masked"]),
            "audible_pre_echo": bool(audible_r),
            "verdict": "passed" if not audible_r else "attenuated_max_iterations",
        }
        
        # Microphone geometry, off-center position & physical acoustic distances (A1 Evo AcoustiCX style)
        geom_diagnostics = calculate_microphone_geometry_offset(
            lag_ms=lag_r_ms,
            speed_of_sound_mps=speed_of_sound,
            ref_distance_m=listening_distance_m,
            sub_delay_ms=sub_delay_ms if meas_sub is not None else None,
        )
        geom_diagnostics["impulse_response_correlation"] = round(float(impulse_correlation_lr), 4)

        # Split Gain Staging (Hardware volume vs DSP trim)
        gain_staging = calculate_split_gain_staging(target_attenuation_db=global_preamp_db)
        
        acoustic_intel["microphone_geometry"] = geom_diagnostics
        acoustic_intel["crossover_hardware_snapping"] = snapped_xo_info
        acoustic_intel["split_gain_staging"] = gain_staging
        
        # -------------------------------------------------------------
        # STEP 9: Create Export Package (.ZIP)
        # -------------------------------------------------------------
        update("Packaging Exports", 96, "Building Equalizer APO, CamillaDSP, miniDSP, rePhase & WAV bundle")
        
        # Synthesize miniDSP parametric PEQ biquads from TRUE modal peaks only
        # (wavelet-decay gated) and compact FIR
        def _biquad_spec(modal_info: Dict[str, Any], decay_analysis: List[Dict[str, Any]]) -> List[Dict[str, float]]:
            peaks = modal_info.get("peaks", []) or []
            specs = []
            for p in peaks:
                if not p.get("is_harmonic_match"):
                    continue
                dec = _decay_entry_for_freq(decay_analysis, float(p["freq"]))
                if dec is not None and not dec.get("is_true_mode", True):
                    continue
                specs.append({
                    "freq_hz": float(p["freq"]),
                    "gain_db": float(-min(12.0, max(2.0, p.get("spl", 80.0) - 75.0))),
                    "q": 3.5,
                })
            return specs
        
        biquads_l, h_compact_l = generate_hybrid_iir_fir_split(
            modal_peaks_dips=_biquad_spec(modal_info_l, modal_decay_l),
            target_fir=fir_final_l,
            sample_rate=sr,
            max_biquads=8,
            target_taps=4096,
        )
        biquads_r, h_compact_r = generate_hybrid_iir_fir_split(
            modal_peaks_dips=_biquad_spec(modal_info_r, modal_decay_r),
            target_fir=fir_final_r,
            sample_rate=sr,
            max_biquads=8,
            target_taps=4096,
        )
        
        # Optional Warped FIR (WFIR) synthesis for embedded / low-power DSP targets
        wfir_l: Optional[np.ndarray] = None
        wfir_r: Optional[np.ndarray] = None
        if wfir_taps and wfir_taps >= 512:
            update("Packaging Exports", 97, f"Synthesizing {wfir_taps}-tap Warped FIR (WFIR) exports")
            wfir_l = synthesize_warped_fir(fir_final_l, target_taps=wfir_taps, sample_rate=sr)
            wfir_r = synthesize_warped_fir(fir_final_r, target_taps=wfir_taps, sample_rate=sr)
        
        zip_bytes = create_export_bundle(
            fir_left=fir_final_l,
            fir_right=fir_final_r,
            preamp_db=global_preamp_db,
            sample_rate=sr,
            sub_delay_ms=sub_delay_ms if meas_sub is not None else None,
            sub_polarity=sub_polarity if meas_sub is not None else None,
            crossover_freq=effective_xo_freq,
            crossover_order=crossover_order,
            biquads_left=biquads_l,
            biquads_right=biquads_r,
            compact_fir_left=h_compact_l,
            compact_fir_right=h_compact_r,
            multi_sub_alignments=(multi_sub_alignment or {}).get("alignments") if multi_sub_alignment else None,
            sub_crossover_freq=(multi_sub_alignment or {}).get("crossover_freq_hz") if multi_sub_alignment else None,
            wfir_left=wfir_l,
            wfir_right=wfir_r,
            wfir_taps=wfir_taps,
        )
        
        update("Completed", 100, "ALTAIR Digital Room Correction optimization complete!")
        
        # Downsample frequency points for UI rendering (500 log-spaced points)
        ui_freqs = np.geomspace(20.0, 20000.0, 500)
        
        # Calculate simulated corrected response (Left)
        spl_before_l = meas_left.get_spl_interpolated(ui_freqs)
        spl_target_l = np.interp(ui_freqs, freqs, anchored_target_l)
        
        H_filter_l = np.fft.rfft(fir_final_l, n=meas_left.n_fft)
        filter_spl_l = 20.0 * np.log10(np.maximum(np.abs(H_filter_l), 1e-12))
        spl_filter_l_interp = np.interp(ui_freqs, freqs, filter_spl_l)
        spl_after_l = spl_before_l + spl_filter_l_interp
        
        # Step response time array for UI plot (-20 ms to +30 ms)
        peak_idx_l = int(np.argmax(np.abs(fir_final_l)))
        t_step_ms = (np.arange(len(fir_final_l)) - peak_idx_l) / (sr / 1000.0)
        step_mask = (t_step_ms >= -25.0) & (t_step_ms <= 35.0)
        
        step_resp_norm = np.cumsum(fir_final_l)
        if np.max(np.abs(step_resp_norm)) > 1e-12:
            step_resp_norm /= np.max(np.abs(step_resp_norm))
            
        return {
            "status": "success",
            "sample_rate": sr,
            "target_taps": target_taps,
            "global_preamp_db": round(global_preamp_db, 2),
            "acoustic_intelligence": acoustic_intel,
            "modal_info_left": modal_info_l,
            "modal_info_right": modal_info_r,
            "modal_decay_left": modal_decay_l,
            "modal_decay_right": modal_decay_r,
            "preringing_left": preringing_metrics_l,
            "preringing_right": preringing_metrics_r,
            "zwicker_masking_left": zwicker_l,
            "zwicker_masking_right": zwicker_r,
            "safeguard_loop": safeguard_loop,
            "safeguard_decision_left": safeguard_decision_l,
            "safeguard_decision_right": safeguard_decision_r,
            "sub_alignment": sub_align_results,
            "multi_sub_alignment": multi_sub_alignment,
            "wfir_taps": wfir_taps,
            "zip_bundle_bytes": zip_bytes,
            "true_peak_left_dbfs": round(tp_l, 2),
            "true_peak_right_dbfs": round(tp_r, 2),
            "plots": {
                "freqs": ui_freqs.tolist(),
                "spl_before_left": spl_before_l.tolist(),
                "spl_target_left": spl_target_l.tolist(),
                "spl_filter_left": spl_filter_l_interp.tolist(),
                "spl_after_left": spl_after_l.tolist(),
                "phase_before_deg": meas_left.get_phase_interpolated(ui_freqs, unwrapped=False).tolist(),
                "phase_after_deg": meas_h3_l.get_phase_interpolated(ui_freqs, unwrapped=False).tolist(),
                "step_time_ms": t_step_ms[step_mask].tolist(),
                "step_response": step_resp_norm[step_mask].tolist(),
            },
        }
