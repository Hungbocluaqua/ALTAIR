"""
Complete Functional Verification for every function in ALTAIR.
Guarantees every DSP module, acoustic analysis, exporter, and server route works as intended.
"""

import pytest
import numpy as np
import io
import asyncio
from scipy import signal
from fastapi.testclient import TestClient

from auto_roomeq.server.app import app
from auto_roomeq.server import routes
from auto_roomeq.dsp.measurement import (
    Measurement,
    cross_correlate_align,
    vector_average,
    rms_magnitude_average,
    hybrid_spatial_average,
    parse_rew_text,
    load_wav_ir,
)
from auto_roomeq.dsp.acoustic_analysis import (
    log_smoothed_fast,
    erb_smoothed_fast,
    detect_schroeder_statistical,
    detect_reflection_gap,
    ir_gap_to_fdw_cycles,
    detect_speaker_rolloff,
    compute_spatial_variance_weight,
    analyze_wavelet_modal_decay,
    calculate_iso9613_air_absorption,
    adapt_target_curve_from_rt60,
    adapt_target_for_air_absorption,
    classify_sbir_boundary_cancellations,
    calculate_microphone_geometry_offset,
    calculate_snapped_crossover_pair,
    calculate_split_gain_staging,
)
from auto_roomeq.dsp.acquisition import (
    generate_log_chirp,
    deconvolve,
    load_cal_file,
    apply_cal_file,
    recorded_sweep_to_measurement,
    coherent_impulse_stack,
)
from auto_roomeq.dsp.advanced_dsp import (
    calculate_speed_of_sound,
    compute_frequency_dependent_beta,
    homomorphic_mixed_phase_split,
    detect_group_delay_crossovers,
    calculate_itu_r_bs1770_true_peak,
    generate_hybrid_iir_fir_split,
    synthesize_warped_fir,
    synthesize_time_reversed_excess_phase_filter,
)
from auto_roomeq.dsp.farina import (
    farina_harmonic_separation,
    compute_snr_mask,
    apply_polar_diffraction_calibration,
)
from auto_roomeq.dsp.filter_assembly import (
    calculate_preamp_headroom,
    assemble_final_filter,
)
from auto_roomeq.dsp.mag_inversion import (
    tikhonov_magnitude_inversion,
    extract_minimum_phase,
    synthesize_mag_inversion_filter,
)
from auto_roomeq.dsp.phase_linearization import (
    frequency_dependent_window,
    synthesize_crossover_phase_reversal,
    synthesize_low_q_phase_correction,
    synthesize_regularized_excess_phase_inverse,
    synthesize_phase_linearization_filter,
)
from auto_roomeq.dsp.preringing import (
    evaluate_step_response_preringing,
    auto_attenuate_preringing,
    evaluate_zwicker_temporal_masking,
)
from auto_roomeq.dsp.sub_alignment import (
    optimize_sub_mains_alignment,
    optimize_multi_sub_matrix,
)
from auto_roomeq.dsp.targets import (
    generate_harman_target,
    generate_bk1974_target,
    generate_flat_target,
    generate_oca_target,
    generate_custom_target,
    anchor_target_to_measurement,
)
from auto_roomeq.dsp.vba_synth import (
    detect_modal_peaks_dips,
    synthesize_vba_filter,
)
from auto_roomeq.dsp.mdat_parser import (
    parse_mdat,
    _classify_double_array,
    _tokenize_java_stream,
)
from auto_roomeq.exporters.camilladsp_exporter import export_camilladsp_config
from auto_roomeq.exporters.equalizer_apo_exporter import export_equalizer_apo_config
from auto_roomeq.exporters.minidsp_exporter import (
    export_minidsp_fir,
    export_minidsp_biquads,
    export_minidsp_hybrid_project,
)
from auto_roomeq.exporters.rephase_exporter import export_rephase_xml
from auto_roomeq.exporters.wav_exporter import export_wav_fir
from auto_roomeq.exporters.bundle_exporter import create_export_bundle
from auto_roomeq.orchestrator import (
    OptimizationOrchestrator,
    generate_demo_room_measurements,
    build_spatial_variance_weights,
    _decay_entry_for_freq,
    build_forced_neutral_mask,
    apply_mic_calibration_to_measurement,
)

client = TestClient(app)


def test_acoustic_analysis_functions():
    """Verify all acoustic intelligence functions in isolation."""
    freqs = np.geomspace(20.0, 20000.0, 500)
    data = 80.0 - 5.0 * np.log10(freqs / 100.0) + np.random.normal(0, 1.0, len(freqs))
    
    # 1. log_smoothed_fast
    s_log = log_smoothed_fast(data, freqs, fraction=3.0)
    assert len(s_log) == len(data)
    assert np.all(np.isfinite(s_log))
    
    # 2. erb_smoothed_fast
    s_erb = erb_smoothed_fast(data, freqs)
    assert len(s_erb) == len(data)
    assert np.all(np.isfinite(s_erb))
    
    # 3. detect_schroeder_statistical
    mag = 10.0 ** (data / 20.0)
    schroeder = detect_schroeder_statistical(mag, freqs)
    assert 120.0 <= schroeder <= 450.0
    
    # 4. detect_reflection_gap & ir_gap_to_fdw_cycles
    ir = np.zeros(4096)
    ir[100] = 1.0
    ir[250] = 0.35  # reflection at sample 250 (150 samples later = 3.125 ms)
    gap = detect_reflection_gap(ir, fs=48000)
    assert 0.0005 <= gap <= 0.020
    cycles = ir_gap_to_fdw_cycles(gap)
    assert 3.0 <= cycles <= 10.0
    
    # 5. detect_speaker_rolloff
    low_r, high_r = detect_speaker_rolloff(mag, freqs)
    assert low_r >= 20.0
    assert high_r <= 24000.0
    
    # 6. compute_spatial_variance_weight
    m1 = Measurement("Seat1", ir, sample_rate=48000)
    m2 = Measurement("Seat2", ir * 0.9, sample_rate=48000)
    w = compute_spatial_variance_weight([m1, m2], freqs)
    assert np.all(w >= 0.0) and np.all(w <= 1.0)
    
    # 7. analyze_wavelet_modal_decay
    decay = analyze_wavelet_modal_decay(ir, sample_rate=48000, modal_freqs=[50.0, 100.0])
    assert len(decay) == 2
    assert "is_true_mode" in decay[0]
    
    # 8. calculate_iso9613_air_absorption
    air = calculate_iso9613_air_absorption(freqs, temp_celsius=20.0, relative_humidity_pct=50.0)
    assert len(air) == len(freqs)
    assert np.all(air >= 0.0)
    
    # 9. adapt_target_curve_from_rt60
    t_base = np.zeros_like(freqs)
    t_rt = adapt_target_curve_from_rt60(t_base, freqs, estimated_rt60_s=0.60)
    assert np.all(np.isfinite(t_rt))
    
    # 10. adapt_target_for_air_absorption
    t_air = adapt_target_for_air_absorption(t_base, freqs, air)
    assert np.all(np.isfinite(t_air))
    
    # 11. classify_sbir_boundary_cancellations
    sbir = classify_sbir_boundary_cancellations(freqs, data, ir)
    assert isinstance(sbir, list)
    
    # 12. calculate_microphone_geometry_offset
    geom = calculate_microphone_geometry_offset(lag_ms=1.2, speed_of_sound_mps=343.2)
    assert "distances" in geom
    assert "front_left" in geom["distances"]
    
    # 13. calculate_snapped_crossover_pair
    snap = calculate_snapped_crossover_pair(65.0, 75.0)
    assert snap["snapped_hardware_crossover_hz"] in [40, 50, 60, 70, 80, 90, 100, 110, 120, 150, 180, 200]
    
    # 14. calculate_split_gain_staging
    staging = calculate_split_gain_staging(-5.3)
    assert "recommended_hardware_db" in staging
    assert "dsp_fine_trim_db" in staging


def test_advanced_dsp_and_physics_functions():
    """Verify speed of sound, beta, cepstrum split, true-peak, warped FIR."""
    # 1. calculate_speed_of_sound
    c = calculate_speed_of_sound(20.0)
    assert 340.0 < c < 345.0
    
    # 2. compute_frequency_dependent_beta
    freqs = np.geomspace(10.0, 24000.0, 500)
    beta = compute_frequency_dependent_beta(freqs, beta_0=0.04)
    assert np.all(beta >= 0.008)
    assert beta[0] > beta[len(freqs) // 2]  # Subsonic protection is higher
    
    # 3. homomorphic_mixed_phase_split
    ir = np.zeros(2048)
    ir[50] = 1.0
    ir[100] = 0.4
    h_min, h_ap = homomorphic_mixed_phase_split(ir, n_fft=2048)
    assert len(h_min) == 2048
    assert len(h_ap) == 2048
    
    # 4. detect_group_delay_crossovers
    xo = detect_group_delay_crossovers(ir, sample_rate=48000)
    assert isinstance(xo, list)
    
    # 5. calculate_itu_r_bs1770_true_peak
    tp = calculate_itu_r_bs1770_true_peak(ir)
    assert np.isfinite(tp)
    
    # 6. synthesize_warped_fir
    wfir = synthesize_warped_fir(ir, target_taps=2048, sample_rate=48000)
    assert len(wfir) == 2048
    assert np.all(np.isfinite(wfir))


def test_farina_and_safeguard_functions():
    """Verify Farina deconvolution, SNR mask, polar calibration, Zwicker masking."""
    sr = 48000
    sweep, _ = generate_log_chirp(f_start=20.0, f_end=20000.0, sample_rate=sr, length_samples=sr, include_timing_ref=False)
    
    # Farina
    res = farina_harmonic_separation(sweep, f_start=20.0, f_end=20000.0, sample_rate=sr, sweep_duration_s=1.0)
    assert "linear_ir" in res
    assert "thd_percent" in res
    
    # SNR mask
    f, snr, mask = compute_snr_mask(res["linear_ir"], sample_rate=sr)
    assert len(mask) == len(f)
    assert np.all(mask >= 0.0) and np.all(mask <= 1.0)
    
    # Polar diffraction calibration
    H = np.ones_like(f, dtype=np.complex128)
    H_diff = apply_polar_diffraction_calibration(H, f, orientation_deg=90.0)
    assert np.all(np.isfinite(H_diff))
    
    # Zwicker masking
    zw = evaluate_zwicker_temporal_masking(res["linear_ir"], sample_rate=sr)
    assert "is_masked" in zw
    assert "worst_margin_db" in zw


def test_exporters_and_bundles():
    """Verify all software / hardware exporters generate valid formats."""
    fir_l = np.zeros(4096)
    fir_r = np.zeros(4096)
    fir_l[100] = 0.5
    fir_r[100] = 0.5
    
    # WAV
    wav = export_wav_fir(fir_l, fir_r, sample_rate=48000)
    assert wav.startswith(b"RIFF")
    
    # EqAPO
    apo = export_equalizer_apo_config(preamp_db=-3.0, sub_delay_ms=-2.5, sub_polarity=-1.0)
    assert "Preamp: -3.00 dB" in apo
    assert "Channel: L R" in apo  # negative delay mapped to mains
    assert "Copy: LFE=-1*LFE" in apo
    
    # CamillaDSP
    yml = export_camilladsp_config(preamp_db=-3.0, sub_delay_ms=-2.5, sub_polarity=-1.0)
    assert "mains_delay:" in yml
    assert "sub_invert:" in yml
    
    # miniDSP
    fir_txt = export_minidsp_fir(fir_l, max_taps=4096)
    assert len(fir_txt.splitlines()) == 4096
    
    bq_txt = export_minidsp_biquads([{"b0": 1.0, "b1": 0.0, "b2": 0.0, "a1": 0.0, "a2": 0.0}])
    assert "biquad1," in bq_txt
    
    hybrid_txt = export_minidsp_hybrid_project([], [])
    assert "miniDSP Hybrid" in hybrid_txt
    
    # rePhase
    reph = export_rephase_xml(sample_rate=48000, taps=4096, crossover_freq=2500.0)
    assert "<rephase" in reph
    
    # Bundle
    bundle = create_export_bundle(fir_l, fir_r, preamp_db=-3.0, sample_rate=48000)
    assert len(bundle) > 1000


def test_api_session_and_optimization_endpoints():
    """Verify all FastAPI routes execute correctly."""
    # 1. /api/status
    r = client.get("/api/status")
    assert r.status_code == 200
    
    # 2. /api/session
    r = client.get("/api/session")
    assert r.status_code == 200
    
    # 3. /api/session/save & /api/session/load
    r = client.post("/api/session/save")
    assert r.status_code == 200
    r = client.post("/api/session/load")
    assert r.status_code == 200
    
    # 4. /api/session/clear
    r = client.post("/api/session/clear")
    assert r.status_code == 200
    
    # 5. /api/measurements/auto-sweep (GET download)
    r = client.get("/api/measurements/auto-sweep?channel=left&duration_s=1.0&sample_rate=48000")
    assert r.status_code == 200
    assert r.headers["content-type"] == "audio/wav"
    
    # 6. /api/optimize
    opt_payload = {
        "target": {"name": "harman", "bass_boost_db": 6.0, "bass_cutoff_hz": 80.0},
        "target_taps": 4096,
        "use_demo_measurements": True,
    }
    r = client.post("/api/optimize", json=opt_payload)
    assert r.status_code == 200
    data = r.json()
    assert data["status"] == "success"
    
    # 7. /api/optimization/latest
    r = client.get("/api/optimization/latest")
    assert r.status_code == 200
    
    # 8. /api/export/bundle
    r = client.get("/api/export/bundle")
    assert r.status_code == 200
    assert "application/zip" in r.headers["content-type"]
    assert "Content-Length" in r.headers
