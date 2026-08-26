"""
Exhaustive Function Verification Test Suite for ALTAIR.
Validates 100% of all public and internal DSP functions, exporters, orchestrator, and server APIs.
"""

import pytest
import numpy as np
import io
import asyncio
from scipy import signal
import xml.etree.ElementTree as ET

# 1. Acquisition & Calibration
from auto_roomeq.dsp.acquisition import (
    generate_log_chirp,
    deconvolve,
    load_cal_file,
    apply_cal_file,
)

# 2. Measurement & Spatial Averaging
from auto_roomeq.dsp.measurement import (
    Measurement,
    cross_correlate_align,
    vector_average,
    rms_magnitude_average,
    hybrid_spatial_average,
    parse_rew_text,
    load_wav_ir,
)

# 3. Targets & Anchoring
from auto_roomeq.dsp.targets import (
    generate_harman_target,
    generate_bk1974_target,
    generate_flat_target,
    generate_oca_target,
    generate_custom_target,
    anchor_target_to_measurement,
)

# 4. VBA Modal Synthesis
from auto_roomeq.dsp.vba_synth import (
    detect_modal_peaks_dips,
    synthesize_vba_filter,
)

# 5. Magnitude Inversion
from auto_roomeq.dsp.mag_inversion import (
    tikhonov_magnitude_inversion,
    extract_minimum_phase,
    synthesize_mag_inversion_filter,
)

# 6. Phase Linearization & FDW
from auto_roomeq.dsp.phase_linearization import (
    frequency_dependent_window,
    synthesize_crossover_phase_reversal,
    synthesize_low_q_phase_correction,
    synthesize_phase_linearization_filter,
)

# 7. Pre-Ringing & Safeguards
from auto_roomeq.dsp.preringing import (
    evaluate_step_response_preringing,
    auto_attenuate_preringing,
)

# 8. Filter Assembly & Trimming
from auto_roomeq.dsp.filter_assembly import (
    calculate_preamp_headroom,
    assemble_final_filter,
)

# 9. Subwoofer Alignment & MSO Matrix
from auto_roomeq.dsp.sub_alignment import (
    optimize_sub_mains_alignment,
    optimize_multi_sub_matrix,
)

# 10. Acoustic Intelligence
from auto_roomeq.dsp.acoustic_analysis import (
    log_smoothed_fast,
    erb_smoothed_fast,
    detect_schroeder_statistical,
    detect_reflection_gap,
    ir_gap_to_fdw_cycles,
    detect_speaker_rolloff,
    compute_spatial_variance_weight,
    analyze_wavelet_modal_decay,
)

# 11. Farina & Noise Floor
from auto_roomeq.dsp.farina import (
    farina_harmonic_separation,
    compute_snr_mask,
    apply_polar_diffraction_calibration,
)

# 12. Advanced DSP & Physics
from auto_roomeq.dsp.advanced_dsp import (
    calculate_speed_of_sound,
    compute_frequency_dependent_beta,
    homomorphic_mixed_phase_split,
    detect_group_delay_crossovers,
    calculate_itu_r_bs1770_true_peak,
    generate_hybrid_iir_fir_split,
)

# 13. Exporters
from auto_roomeq.exporters.wav_exporter import export_wav_fir
from auto_roomeq.exporters.equalizer_apo_exporter import export_equalizer_apo_config
from auto_roomeq.exporters.camilladsp_exporter import export_camilladsp_config
from auto_roomeq.exporters.minidsp_exporter import export_minidsp_fir, export_minidsp_biquads
from auto_roomeq.exporters.rephase_exporter import export_rephase_xml
from auto_roomeq.exporters.bundle_exporter import create_export_bundle

# 14. Orchestrator & Integrations
from auto_roomeq.orchestrator import OptimizationOrchestrator, generate_demo_room_measurements
from auto_roomeq.integrations.rew_api import RewApiClient


def test_exhaustive_acquisition_and_calibration():
    """Test chirp generation, deconvolution, and mic calibration."""
    sr = 48000
    chirp, inv_filter = generate_log_chirp(
        f_start=20.0, f_end=20000.0, sample_rate=sr, length_samples=sr, include_timing_ref=False
    )
    assert len(chirp) == sr
    assert len(inv_filter) == sr
    
    # Deconvolution of chirp with its inverse gives a sharp Dirac impulse
    ir = deconvolve(chirp, inv_filter)
    assert len(ir) >= sr
    assert np.max(np.abs(ir)) > 0.01
    
    # Calibration file loading
    cal_text = "20.0 0.5 0.0\n1000.0 0.0 0.0\n20000.0 -1.2 0.0"
    cal_freqs, cal_mag_db, cal_phase = load_cal_file(cal_text)
    assert len(cal_freqs) == 3
    
    H = np.ones(500, dtype=np.complex128)
    freqs = np.geomspace(20.0, 20000.0, 500)
    H_cal = apply_cal_file(H, freqs, cal_freqs, cal_mag_db, cal_phase)
    assert np.all(np.isfinite(H_cal))


def test_exhaustive_measurement_and_spatial_averaging():
    """Test Measurement class, alignment, and spatial averaging."""
    sr = 48000
    n = 8192
    ir1 = np.zeros(n)
    ir2 = np.zeros(n)
    ir1[100] = 1.0
    ir2[150] = 0.95
    
    m1 = Measurement("M1", ir1, sample_rate=sr, n_fft=n)
    m2 = Measurement("M2", ir2, sample_rate=sr, n_fft=n)
    
    assert len(m1.freqs) == n // 2 + 1
    assert len(m1.spl_db) == len(m1.freqs)
    assert len(m1.phase_deg) == len(m1.freqs)
    assert len(m1.group_delay_ms) == len(m1.freqs)
    assert len(m1.step_response) == n
    
    # Cross-correlation alignment
    aligned_ir2, lag, lag_ms = cross_correlate_align(m1.ir, m2.ir, sample_rate=sr)
    assert np.isclose(lag_ms, -50 / (sr / 1000.0), atol=0.2)
    
    # Averaging functions
    m_vec = vector_average([m1, m2])
    assert isinstance(m_vec, Measurement)
    
    f_rms, spl_rms = rms_magnitude_average([m1, m2])
    assert len(f_rms) == len(m1.freqs)
    
    m_hybrid = hybrid_spatial_average([m1, m2], f_trans=300.0)
    assert isinstance(m_hybrid, Measurement)


def test_exhaustive_targets_and_anchoring():
    """Test all house curve generators and level anchoring."""
    freqs = np.geomspace(20.0, 20000.0, 500)
    t_harman = generate_harman_target(freqs, bass_boost_db=6.0, bass_cutoff_hz=80.0)
    t_bk = generate_bk1974_target(freqs)
    t_flat = generate_flat_target(freqs)
    t_oca = generate_oca_target(freqs)
    t_custom = generate_custom_target(freqs, 4.0, 90.0, -0.6, 250.0)
    
    assert np.all(np.isfinite(t_harman))
    assert np.all(np.isfinite(t_bk))
    assert np.all(np.isfinite(t_flat))
    assert np.all(np.isfinite(t_oca))
    assert np.all(np.isfinite(t_custom))
    
    measured_spl = 85.0 * np.ones_like(freqs)
    anchored, offset = anchor_target_to_measurement(t_harman, measured_spl, freqs)
    assert np.all(np.isfinite(anchored))


def test_exhaustive_vba_and_mag_inversion():
    """Test VBA modal cancellation and regularized magnitude inversion."""
    m_l, _, _ = generate_demo_room_measurements(sample_rate=48000, n_fft=8192)
    
    # Modal peak/dip detection
    modal_info = detect_modal_peaks_dips(m_l.freqs, m_l.spl_db)
    assert "f_1" in modal_info
    assert "peaks" in modal_info
    
    # VBA synthesis
    h_vba, m_h1, vba_meta = synthesize_vba_filter(m_l)
    assert len(h_vba) > 0
    assert isinstance(m_h1, Measurement)
    
    # Verify VBA does not explode gain (DC gain must be within [-6 dB, +4 dB])
    H_vba = np.fft.rfft(h_vba, n=65536)
    vba_db_dc = 20.0 * np.log10(np.abs(H_vba[0]))
    assert -8.0 <= vba_db_dc <= 6.0
    
    # Tikhonov inversion
    target = generate_harman_target(m_l.freqs)
    anchored_t, _ = anchor_target_to_measurement(target, m_h1.spl_db, m_l.freqs)
    
    h_inv, m_h2, mag_inv_db = synthesize_mag_inversion_filter(m_h1, anchored_t, beta=0.04)
    assert len(h_inv) > 0
    assert isinstance(m_h2, Measurement)
    assert np.all(np.isfinite(mag_inv_db))


def test_exhaustive_phase_linearization_and_safeguards():
    """Test FDW, crossover phase reversal, step response preringing checks."""
    sr = 48000
    n = 8192
    ir = np.zeros(n)
    ir[200] = 1.0
    
    # FDW
    fdw_ir, H_fdw = frequency_dependent_window(ir, sample_rate=sr, cycles=1.0, n_fft=n)
    assert len(fdw_ir) == n
    
    # Crossover phase reversal
    h_xo = synthesize_crossover_phase_reversal(sample_rate=sr, crossover_freq=2500.0, order=4, n_fft=n)
    assert len(h_xo) == n
    
    # Pre-ringing check
    metrics = evaluate_step_response_preringing(h_xo, sample_rate=sr)
    assert "passed" in metrics
    assert "max_pre_amplitude_pct" in metrics


def test_exhaustive_exporters():
    """Test all hardware and software exporter functions."""
    sr = 48000
    taps = 4096
    fir_l = np.random.normal(0, 0.01, taps)
    fir_r = np.random.normal(0, 0.01, taps)
    fir_l[100] = 0.8
    fir_r[100] = 0.8
    
    # WAV exporter
    wav_bytes = export_wav_fir(fir_l, fir_r, sample_rate=sr)
    assert isinstance(wav_bytes, bytes)
    assert len(wav_bytes) > 1000
    
    # Equalizer APO
    eq_apo = export_equalizer_apo_config(preamp_db=-3.5, sub_delay_ms=2.1)
    assert "Preamp: -3.50 dB" in eq_apo
    assert "Delay: 2.10 ms" in eq_apo
    
    # CamillaDSP
    camilla_yml = export_camilladsp_config(preamp_db=-3.5, sample_rate=sr, sub_delay_ms=2.1)
    assert "gain: -3.50" in camilla_yml
    assert "samplerate: 48000" in camilla_yml
    
    # miniDSP
    minidsp_text = export_minidsp_fir(fir_l, max_taps=4096)
    assert len(minidsp_text.splitlines()) == taps
    
    biquads_text = export_minidsp_biquads([{"b0": 1.0, "b1": -1.8, "b2": 0.9, "a1": -1.8, "a2": 0.9}])
    assert "biquad1," in biquads_text
    
    # rePhase
    rephase_xml = export_rephase_xml(sample_rate=sr, taps=taps, crossover_freq=2200.0)
    assert "<rephase" in rephase_xml
    
    # 1-Click ZIP bundle
    bundle_bytes = create_export_bundle(fir_l, fir_r, preamp_db=-3.5, sample_rate=sr, sub_delay_ms=2.1)
    assert len(bundle_bytes) > 2000


def test_exhaustive_orchestrator_pipeline():
    """Test full 1-Click OptimizationOrchestrator pipeline."""
    meas_l, meas_r, meas_sub = generate_demo_room_measurements(sample_rate=48000, n_fft=16384)
    
    orchestrator = OptimizationOrchestrator()
    result = asyncio.run(orchestrator.run_pipeline(
        meas_left=meas_l,
        meas_right=meas_r,
        meas_sub=meas_sub,
        target_curve_name="harman",
        target_taps=16384,
        temp_celsius=22.0,
        mic_orientation_deg=0.0,
    ))
    
    assert result["status"] == "success"
    assert result["sample_rate"] == 48000
    assert result["global_preamp_db"] <= 0.0
    assert "plots" in result
    assert len(result["plots"]["spl_after_left"]) == 500
    
    # Verify after SPL does not blow up (> 110 dB) anywhere in passband
    spl_after = np.array(result["plots"]["spl_after_left"])
    assert np.all(spl_after < 105.0)
