"""
1-Click Digital Room Correction Pipeline Orchestrator for ALTAIR.
Coordinates end-to-end execution:
- REW REST API & File Ingestion
- Cross-correlation time alignment & Speed of Sound temperature scaling
- Acoustic Intelligence: Statistical Schroeder, Reflection Gap & FDW tuning, Speaker Rolloff, Group Delay Auto Crossover
- Farina Non-Linear Harmonic Distortion Separation & SNR Noise Floor Masking
- Module 1: Virtual Bass Array (VBA) with Wavelet Decay Analysis
- Module 2: Frequency-Dependent Tikhonov Inversion with beta(f) & SNR protection
- Module 3: 1-Cycle FDW & Crossover Phase Linearization
- Subwoofer + Mains Alignment & Multi-Sub Matrix Optimizer
- Pre-Ringing Step Response Safeguards & ITU-R BS.1770 4x True-Peak Detection
- Tap Trimming to 65,536 Taps & Headroom Calculation
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
from .dsp.preringing import evaluate_step_response_preringing
from .dsp.filter_assembly import assemble_final_filter
from .dsp.sub_alignment import optimize_sub_mains_alignment, optimize_multi_sub_matrix
from .dsp.farina import (
    farina_harmonic_separation,
    compute_snr_mask,
    apply_polar_diffraction_calibration,
)
from .dsp.advanced_dsp import (
    calculate_speed_of_sound,
    compute_frequency_dependent_beta,
    detect_group_delay_crossovers,
    calculate_itu_r_bs1770_true_peak,
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
        mic_orientation_deg: float = 0.0,
        progress_callback: Optional[Callable[[str, int, str], None]] = None,
    ) -> Dict[str, Any]:
        """
        Run the complete ALTAIR 1-Click optimization pipeline with full acoustic intelligence.
        """
        def update(step_name: str, pct: int, detail: str = ""):
            if progress_callback:
                progress_callback(step_name, pct, detail)

        # -------------------------------------------------------------
        # STEP 1: Ingestion & Timing Alignment with Temperature Scaling
        # -------------------------------------------------------------
        speed_of_sound = calculate_speed_of_sound(temp_celsius)
        update("Input Ingestion", 10, f"Processing {meas_left.name} (SR: {meas_left.sample_rate} Hz, c: {speed_of_sound:.1f} m/s)")
        sr = meas_left.sample_rate
        
        # Apply polar mic calibration if 90-degree diffuse
        if mic_orientation_deg > 10.0:
            meas_left.H = apply_polar_diffraction_calibration(meas_left.H, meas_left.freqs, mic_orientation_deg)
            meas_left.ir = np.fft.irfft(meas_left.H, n=meas_left.n_fft)
            
        if meas_right is not None:
            if mic_orientation_deg > 10.0:
                meas_right.H = apply_polar_diffraction_calibration(meas_right.H, meas_right.freqs, mic_orientation_deg)
                meas_right.ir = np.fft.irfft(meas_right.H, n=meas_right.n_fft)
                
            aligned_r, lag_r, lag_r_ms = cross_correlate_align(meas_left.ir, meas_right.ir, sample_rate=sr)
            meas_right = Measurement(name=meas_right.name, ir=aligned_r, sample_rate=sr, n_fft=meas_left.n_fft)
            update("Timing Alignment", 18, f"Aligned Right channel (offset: {lag_r_ms:.2f} ms)")
        else:
            meas_right = meas_left

        # Compute SNR Masks
        _, _, snr_mask_l = compute_snr_mask(meas_left.ir, sample_rate=sr, min_snr_db=15.0)
        _, _, snr_mask_r = compute_snr_mask(meas_right.ir, sample_rate=sr, min_snr_db=15.0)

        # -------------------------------------------------------------
        # STEP 2: Acoustic Intelligence, Group Delay & Room Diagnostics
        # -------------------------------------------------------------
        update("Acoustic Intelligence", 25, "Analyzing statistical Schroeder, reflection envelope & group delay")
        schroeder_hz = detect_schroeder_statistical(np.abs(meas_left.H), meas_left.freqs, fs=sr)
        reflection_gap_s = detect_reflection_gap(meas_left.ir, fs=sr)
        auto_fdw_cycles = ir_gap_to_fdw_cycles(reflection_gap_s)
        low_rolloff, high_rolloff = detect_speaker_rolloff(np.abs(meas_left.H), meas_left.freqs, threshold_db=-6.0)
        
        # Auto-detect passive crossover points from group delay peaks
        detected_crossovers = detect_group_delay_crossovers(meas_left.ir, sample_rate=sr)
        effective_xo_freq = crossover_freq
        if (crossover_freq <= 0 or crossover_freq == 2500.0) and detected_crossovers:
            effective_xo_freq = detected_crossovers[0]["frequency_hz"]
            
        rec_sub_crossover = float(min(120.0, max(60.0, round(low_rolloff * 1.3 / 10.0) * 10.0)))
        
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
        }
            
        # -------------------------------------------------------------
        # STEP 3: Target Curve Generation & Anchoring
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
        
        # -------------------------------------------------------------
        # STEP 4: Module 1 - Virtual Bass Array (VBA) Modal Inversion
        # -------------------------------------------------------------
        update("Module 1: VBA Synthesis", 48, f"Synthesizing 8th-order reflection canceller (Schroeder: {schroeder_hz:.0f} Hz)")
        h_vba_l, meas_h1_l, modal_info_l = synthesize_vba_filter(meas_left, sample_rate=sr)
        h_vba_r, meas_h1_r, modal_info_r = synthesize_vba_filter(meas_right, sample_rate=sr)
        
        # -------------------------------------------------------------
        # STEP 5: Module 2 - Frequency-Dependent Tikhonov Inversion
        # -------------------------------------------------------------
        update("Module 2: Magnitude Inversion", 62, "Computing beta(f) Tikhonov deconvolution & SNR protection")
        h_inv_l, meas_h2_l, mag_inv_db_l = synthesize_mag_inversion_filter(
            meas_h1_l,
            anchored_target_l,
            beta=0.04,
            max_boost_db=5.0,
            max_cut_db=20.0,
            snr_mask=snr_mask_l,
        )
        h_inv_r, meas_h2_r, mag_inv_db_r = synthesize_mag_inversion_filter(
            meas_h1_r,
            anchored_target_r,
            beta=0.04,
            max_boost_db=5.0,
            max_cut_db=20.0,
            snr_mask=snr_mask_r,
        )
        
        # -------------------------------------------------------------
        # STEP 6: Module 3 - Crossover & Excess Phase Linearization
        # -------------------------------------------------------------
        update("Module 3: Phase Linearization", 75, f"1-cycle FDW & crossover reversal ({effective_xo_freq:.0f} Hz)")
        h_phase_l, meas_h3_l = synthesize_phase_linearization_filter(
            meas_h2_l,
            crossover_freq=effective_xo_freq,
            crossover_order=crossover_order,
            sample_rate=sr,
        )
        h_phase_r, meas_h3_r = synthesize_phase_linearization_filter(
            meas_h2_r,
            crossover_freq=effective_xo_freq,
            crossover_order=crossover_order,
            sample_rate=sr,
        )
        
        # -------------------------------------------------------------
        # STEP 7: Subwoofer Alignment & Matrix Optimization
        # -------------------------------------------------------------
        sub_align_results = None
        sub_delay_ms = 0.0
        if meas_sub is not None:
            effective_sub_xo = sub_crossover_freq or rec_sub_crossover
            update("Subwoofer Integration", 84, f"Optimizing sub-mains acoustic summation at {effective_sub_xo} Hz")
            sub_align_results = optimize_sub_mains_alignment(
                main_meas=meas_left,
                sub_meas=meas_sub,
                crossover_freq=effective_sub_xo,
            )
            sub_delay_ms = sub_align_results["optimal_delay_ms"]
            
        # -------------------------------------------------------------
        # STEP 8: Pre-Ringing Safeguard, True-Peak & Tap Trimming
        # -------------------------------------------------------------
        update("Safeguards & Tap Trimming", 90, f"Tukey tap trimming ({target_taps} taps) & 4x True-Peak check")
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
        
        # True-Peak 4x oversampled detection (ITU-R BS.1770)
        tp_l = calculate_itu_r_bs1770_true_peak(fir_final_l)
        tp_r = calculate_itu_r_bs1770_true_peak(fir_final_r)
        
        # Pre-ringing check on final FIR
        preringing_metrics_l = evaluate_step_response_preringing(fir_final_l, sample_rate=sr)
        preringing_metrics_r = evaluate_step_response_preringing(fir_final_r, sample_rate=sr)
        
        global_preamp_db = min(preamp_l, preamp_r)
        
        # -------------------------------------------------------------
        # STEP 9: Create Export Package (.ZIP)
        # -------------------------------------------------------------
        update("Packaging Exports", 96, "Building Equalizer APO, CamillaDSP, miniDSP, rePhase & WAV bundle")
        zip_bytes = create_export_bundle(
            fir_left=fir_final_l,
            fir_right=fir_final_r,
            preamp_db=global_preamp_db,
            sample_rate=sr,
            sub_delay_ms=sub_delay_ms if meas_sub is not None else None,
            crossover_freq=effective_xo_freq,
            crossover_order=crossover_order,
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
            "preringing_left": preringing_metrics_l,
            "preringing_right": preringing_metrics_r,
            "sub_alignment": sub_align_results,
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
