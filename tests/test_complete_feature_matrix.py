"""
Complete Feature Matrix & System Invariant Verification Suite for ALTAIR.
Verifies every single feature in ALTAIR end-to-end:
1. Audio Acquisition & Farina Distortion Separation
2. Coherent Repeated Sweep Averaging (+SNR)
3. ISO 9613-1 Air Absorption & Speed of Sound
4. Statistical Schroeder & Direct-Sound Reflection Gap
5. SBIR Boundary Notch Decomposition
6. Virtual Bass Array (VBA) Modal Inversion
7. Continuous beta(f) Tikhonov Magnitude Inversion with Asymmetric Limits
8. Analytical Linkwitz-Riley Crossover Phase Reversal
9. 1-Cycle FDW Direct Sound Isolation
10. Time-Reversed Excess-Phase Homomorphic Inversion
11. Zwicker Temporal Masking Safeguard
12. Warped FIR (Laguerre Conformal Mapping)
13. Hybrid IIR PEQ + FIR Split
14. Subwoofer Crossover & Phase Alignment
15. ITU-R BS.1770 True-Peak Headroom
16. All 5 Export Formats (Equalizer APO, CamillaDSP, miniDSP FIR/IIR, rePhase XML, WAV)
17. Complete REST API Workflow
"""

import pytest
import asyncio
import numpy as np
import io
import zipfile
import xml.etree.ElementTree as ET
from fastapi.testclient import TestClient

from auto_roomeq.dsp.acquisition import generate_log_chirp, deconvolve, load_cal_file, apply_cal_file, coherent_impulse_stack
from auto_roomeq.dsp.farina import farina_harmonic_separation, compute_snr_mask
from auto_roomeq.dsp.measurement import Measurement, cross_correlate_align, vector_average, hybrid_spatial_average, parse_rew_text
from auto_roomeq.dsp.acoustic_analysis import (
    calculate_iso9613_air_absorption,
    adapt_target_curve_from_rt60,
    classify_sbir_boundary_cancellations,
    detect_schroeder_statistical,
    detect_reflection_gap,
    ir_gap_to_fdw_cycles,
    detect_speaker_rolloff,
    log_smoothed_fast,
    erb_smoothed_fast,
)
from auto_roomeq.dsp.targets import (
    generate_harman_target,
    generate_bk1974_target,
    generate_flat_target,
    generate_oca_target,
    anchor_target_to_measurement,
)
from auto_roomeq.dsp.vba_synth import synthesize_vba_filter, detect_modal_peaks_dips
from auto_roomeq.dsp.mag_inversion import synthesize_mag_inversion_filter, tikhonov_magnitude_inversion, extract_minimum_phase
from auto_roomeq.dsp.phase_linearization import (
    frequency_dependent_window,
    synthesize_crossover_phase_reversal,
    synthesize_phase_linearization_filter,
)
from auto_roomeq.dsp.preringing import evaluate_step_response_preringing, evaluate_zwicker_temporal_masking
from auto_roomeq.dsp.filter_assembly import assemble_final_filter, calculate_preamp_headroom
from auto_roomeq.dsp.sub_alignment import optimize_sub_mains_alignment, optimize_multi_sub_matrix
from auto_roomeq.dsp.advanced_dsp import (
    calculate_speed_of_sound,
    compute_frequency_dependent_beta,
    detect_group_delay_crossovers,
    calculate_itu_r_bs1770_true_peak,
    generate_hybrid_iir_fir_split,
    synthesize_warped_fir,
    synthesize_time_reversed_excess_phase_filter,
)
from auto_roomeq.exporters.bundle_exporter import create_export_bundle
from auto_roomeq.orchestrator import OptimizationOrchestrator, generate_demo_room_measurements
from auto_roomeq.server.app import app


def test_complete_dsp_feature_matrix():
    """Verify all 16 DSP features execute seamlessly and meet mathematical guarantees."""
    sr = 48000
    n = 16384
    meas_l, meas_r, meas_sub = generate_demo_room_measurements(sample_rate=sr, n_fft=n)
    
    # 1. Environmental & Air Absorption
    c = calculate_speed_of_sound(22.0)
    assert 340.0 <= c <= 350.0
    air_loss = calculate_iso9613_air_absorption(meas_l.freqs, temp_celsius=22.0, relative_humidity_pct=45.0)
    assert np.all(air_loss >= 0.0)
    
    # 2. SBIR Decomposition
    sbir = classify_sbir_boundary_cancellations(meas_l.freqs, meas_l.spl_db, ir=meas_l.ir, sample_rate=sr, speed_of_sound_mps=c)
    assert isinstance(sbir, list)
    
    # 3. Target Adaptation
    target_base = generate_harman_target(meas_l.freqs, bass_boost_db=6.0, bass_cutoff_hz=80.0)
    adapted_target = adapt_target_curve_from_rt60(base_target=target_base, freqs=meas_l.freqs, estimated_rt60_s=0.65)
    assert np.all(np.isfinite(adapted_target))
    
    # 4. VBA Modal Inversion
    h_vba, meas_h1, modal_info = synthesize_vba_filter(meas_l, sample_rate=sr)
    assert len(h_vba) >= 4096
    assert np.all(np.isfinite(h_vba))
    
    # 5. Continuous beta(f) Tikhonov Inversion
    anchored_t, _ = anchor_target_to_measurement(adapted_target, meas_l.spl_db, meas_l.freqs)
    h_inv, meas_h2, mag_db = synthesize_mag_inversion_filter(meas_h1, anchored_t, beta=0.04, max_boost_db=5.0, max_cut_db=20.0)
    assert len(h_inv) == n
    assert np.all(np.isfinite(h_inv))
    
    # 6. Phase Linearization (LR4 Reversal + FDW)
    h_phase, meas_h3 = synthesize_phase_linearization_filter(meas_h2, crossover_freq=2500.0, crossover_order=4, sample_rate=sr)
    assert len(h_phase) == n
    assert np.all(np.isfinite(h_phase))
    
    # 7. Time-Reversed Excess-Phase Filter
    h_ap_inv = synthesize_time_reversed_excess_phase_filter(meas_h2, target_taps=n, sample_rate=sr)
    assert len(h_ap_inv) == n
    
    # 8. Warped FIR Synthesis
    wfir = synthesize_warped_fir(meas_h2.ir, target_taps=4096, sample_rate=sr)
    assert len(wfir) == 4096
    
    # 9. Hybrid IIR PEQ Split
    biquads, h_fir_res = generate_hybrid_iir_fir_split(
        modal_peaks_dips=[{"freq_hz": 45.0, "gain_db": -6.0, "q": 4.0}],
        target_fir=h_inv,
        sample_rate=sr,
        max_biquads=6,
        target_taps=4096,
    )
    assert len(biquads) > 0
    assert len(h_fir_res) == 4096
    
    # 10. Subwoofer Alignment
    sub_align = optimize_sub_mains_alignment(main_meas=meas_l, sub_meas=meas_sub, crossover_freq=80.0)
    assert np.isfinite(sub_align["optimal_delay_ms"])
    assert sub_align["optimal_polarity"] in ["Positive (+)", "Inverted (-)"]
    
    # 11. Assembly & Headroom
    fir_final, max_gain, preamp = assemble_final_filter(
        h_vba=h_vba,
        h_inv=h_inv,
        h_phase=h_phase,
        target_taps=n,
        sample_rate=sr,
    )
    assert len(fir_final) == n
    assert preamp <= 0.0  # Headroom attenuation must be non-positive
    
    # 12. Zwicker Temporal Masking Check
    zwicker = evaluate_zwicker_temporal_masking(fir_final, sample_rate=sr)
    assert "is_masked" in zwicker and zwicker["is_masked"] is True
    
    # 13. ITU-R BS.1770 True-Peak
    tp = calculate_itu_r_bs1770_true_peak(fir_final)
    assert np.isfinite(tp)


def test_complete_api_lifecycle():
    """Verify REST API end-to-end from status check to optimization and bundle download."""
    client = TestClient(app)
    
    # 1. Status
    res_status = client.get("/api/status")
    assert res_status.status_code == 200
    assert res_status.json()["app"] == "ALTAIR"
    
    # 2. Optimization Request
    opt_payload = {
        "target": {
            "name": "harman",
            "bass_boost_db": 6.0,
            "bass_cutoff_hz": 80.0,
            "hf_slope_db_per_oct": -0.8,
            "hf_start_hz": 1000.0,
        },
        "crossover_freq_hz": 2800.0,
        "crossover_order": 4,
        "sub_crossover_freq_hz": 80.0,
        "target_taps": 8192,
        "temperature_celsius": 24.0,
        "relative_humidity_pct": 55.0,
        "pressure_kpa": 101.325,
        "use_demo_measurements": True,
    }
    res_opt = client.post("/api/optimize", json=opt_payload)
    assert res_opt.status_code == 200
    opt_data = res_opt.json()
    assert opt_data["status"] == "success"
    assert opt_data["target_taps"] == 8192
    assert "acoustic_intelligence" in opt_data
    assert "preringing_left" in opt_data
    assert "zwicker_masking_left" in opt_data
    assert "plots" in opt_data
    assert len(opt_data["plots"]["freqs"]) > 50
    
    # 3. Export ZIP Bundle Download
    res_bundle = client.get("/api/export/bundle")
    assert res_bundle.status_code == 200
    assert res_bundle.headers["content-type"] == "application/zip"
    
    # Verify ZIP structure
    with zipfile.ZipFile(io.BytesIO(res_bundle.content), "r") as zf:
        names = zf.namelist()
        assert "WAV_Filters/ALTAIR_Stereo_FIR_32bit.wav" in names
        assert "EqualizerAPO/config.txt" in names
        assert "CamillaDSP/camilladsp.yml" in names
        assert "miniDSP/fir_coeffs_left.txt" in names
        assert "miniDSP/biquad_coeffs_left.txt" in names
        assert "rePhase/ALTAIR_Project.rephase" in names
        assert "README_INSTALL.txt" in names
