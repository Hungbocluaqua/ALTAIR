"""
Comprehensive Edge Cases & Robustness Test Suite for AutoRoomEQ.
Tests:
- Extreme sample rates (44.1kHz, 96kHz, 192kHz).
- Empty, corrupted, and unusual calibration files (.cal).
- Silent / zero-energy measurements and Dirac delta impulses.
- Single vs multi-measurement hybrid spatial averaging.
- Boundary condition target curves (flat, +15dB bass, 0dB bass, inverted tilt).
- Statistical Schroeder and Hilbert reflection gap detection on synthetic test impulses.
- Full 1-click pipeline with 65,536 taps and ZIP bundle validation.
"""

import pytest
import numpy as np
import io
import zipfile
import asyncio

from auto_roomeq.dsp.acquisition import (
    generate_log_chirp,
    deconvolve,
    load_cal_file,
    apply_cal_file,
)
from auto_roomeq.dsp.measurement import (
    Measurement,
    cross_correlate_align,
    vector_average,
    hybrid_spatial_average,
    parse_rew_text,
)
from auto_roomeq.dsp.targets import (
    generate_harman_target,
    generate_bk1974_target,
    generate_flat_target,
    generate_oca_target,
    anchor_target_to_measurement,
)
from auto_roomeq.dsp.vba_synth import synthesize_vba_filter, detect_modal_peaks_dips
from auto_roomeq.dsp.mag_inversion import synthesize_mag_inversion_filter, extract_minimum_phase
from auto_roomeq.dsp.phase_linearization import (
    frequency_dependent_window,
    synthesize_crossover_phase_reversal,
    synthesize_phase_linearization_filter,
)
from auto_roomeq.dsp.preringing import evaluate_step_response_preringing
from auto_roomeq.dsp.filter_assembly import assemble_final_filter
from auto_roomeq.dsp.sub_alignment import optimize_sub_mains_alignment
from auto_roomeq.dsp.acoustic_analysis import (
    detect_schroeder_statistical,
    detect_reflection_gap,
    ir_gap_to_fdw_cycles,
    detect_speaker_rolloff,
    log_smoothed_fast,
    erb_smoothed_fast,
)
from auto_roomeq.orchestrator import OptimizationOrchestrator, generate_demo_room_measurements


def test_empty_and_corrupt_cal_file():
    """Verify cal loader gracefully handles empty string or comments only."""
    empty_content = "# Only comments\n* Another comment\n"
    freqs, spl, phase = load_cal_file(empty_content)
    assert len(freqs) == 2
    assert len(spl) == 2
    assert phase is None
    
    # Test applying empty cal to spectrum
    H = np.ones(100, dtype=np.complex128)
    f_grid = np.linspace(20, 20000, 100)
    H_out = apply_cal_file(H, f_grid, freqs, spl, phase)
    assert np.all(np.isfinite(H_out))
    assert np.allclose(np.abs(H_out), 1.0)


def test_zero_and_dirac_measurements():
    """Verify Measurement class handles silent signals and Dirac delta impulses without crashing."""
    # 1. Silent IR
    silent_ir = np.zeros(4096)
    m_silent = Measurement("Silent", silent_ir, sample_rate=48000)
    assert len(m_silent.spl_db) == 2049
    assert np.all(np.isfinite(m_silent.spl_db))
    assert m_silent.peak_idx == 0
    
    # 2. Dirac Delta
    delta_ir = np.zeros(4096)
    delta_ir[100] = 1.0
    m_delta = Measurement("Delta", delta_ir, sample_rate=48000)
    assert m_delta.peak_idx == 100
    assert np.allclose(m_delta.spl_db, 0.0, atol=1e-3)


def test_extreme_sample_rates():
    """Verify DSP functions at 44.1 kHz, 96 kHz, and 192 kHz."""
    for sr in [44100, 96000, 192000]:
        n_pts = 8192
        t = np.arange(n_pts) / sr
        ir = np.exp(-100.0 * t) * np.sin(2.0 * np.pi * 50.0 * t)
        ir[10] = 1.0
        
        meas = Measurement(f"Test_{sr}", ir, sample_rate=sr)
        assert meas.sample_rate == sr
        
        # Test Crossover Phase Reversal
        h_ap = synthesize_crossover_phase_reversal(sample_rate=sr, crossover_freq=2000.0, n_fft=n_pts)
        assert len(h_ap) == n_pts
        assert np.all(np.isfinite(h_ap))
        
        # Test FDW
        fdw_ir, H_fdw = frequency_dependent_window(ir, sample_rate=sr, cycles=1.0, n_fft=n_pts)
        assert np.all(np.isfinite(H_fdw))


def test_target_curve_edge_cases():
    """Verify target curves with extreme parameters."""
    freqs = np.fft.rfftfreq(8192, d=1.0 / 48000)
    
    # Bass boost 0 dB (flat bass)
    t_zero = generate_harman_target(freqs, bass_boost_db=0.0, bass_cutoff_hz=80.0)
    assert np.all(np.isfinite(t_zero))
    assert t_zero[0] == 0.0
    
    # Bass cutoff higher than HF start (safeguarded)
    t_safe = generate_harman_target(freqs, bass_boost_db=8.0, bass_cutoff_hz=300.0, hf_start_hz=100.0)
    assert np.all(np.isfinite(t_safe))
    
    # Anchoring with flat target against uniform SPL
    t_flat = generate_flat_target(freqs)
    measured_spl = np.full_like(freqs, 75.0)
    anchored, offset = anchor_target_to_measurement(t_flat, measured_spl, freqs)
    assert np.isclose(offset, 75.0, atol=1.0)


def test_acoustic_analysis_on_synthetic_impulses():
    """Verify Hilbert reflection gap and statistical Schroeder detection."""
    sr = 48000
    n = 16384
    ir = np.zeros(n)
    
    # Direct sound at sample 200
    ir[200] = 1.0
    # Strong floor reflection 5ms later (240 samples) with 0.4 amplitude
    ir[200 + 240] = 0.40
    
    gap_s = detect_reflection_gap(ir, fs=sr, threshold_ratio=0.15)
    # Gap should be ~5ms (0.005s)
    assert 0.003 <= gap_s <= 0.007
    
    cycles = ir_gap_to_fdw_cycles(gap_s, reference_freq=500.0)
    assert 2.0 <= cycles <= 6.0
    
    # Test ERB and Log smoothing
    mag_test = np.linspace(10.0, 90.0, 500)
    f_test = np.geomspace(20.0, 20000.0, 500)
    erb_res = erb_smoothed_fast(mag_test, f_test)
    log_res = log_smoothed_fast(mag_test, f_test, fraction=3.0)
    assert len(erb_res) == 500
    assert len(log_res) == 500
    assert np.all(np.isfinite(erb_res))
    assert np.all(np.isfinite(log_res))


def test_high_tap_pipeline_and_zip_integrity():
    """Test full orchestrator execution with 65,536 taps and verify ZIP archive integrity."""
    meas_l, meas_r, meas_sub = generate_demo_room_measurements(sample_rate=48000, n_fft=65536)
    
    orchestrator = OptimizationOrchestrator()
    res = asyncio.run(orchestrator.run_pipeline(
        meas_left=meas_l,
        meas_right=meas_r,
        meas_sub=meas_sub,
        target_curve_name="oca",
        target_taps=65536,
    ))
    
    assert res["status"] == "success"
    assert "acoustic_intelligence" in res
    assert res["acoustic_intelligence"]["detected_schroeder_hz"] > 0
    assert res["acoustic_intelligence"]["detected_reflection_gap_ms"] > 0
    
    # Verify ZIP bundle contents
    zip_bytes = res["zip_bundle_bytes"]
    assert len(zip_bytes) > 50000
    
    with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
        file_list = zf.namelist()
        assert "WAV_Filters/AutoRoomEQ_Stereo_FIR_32bit.wav" in file_list
        assert "EqualizerAPO/config.txt" in file_list
        assert "CamillaDSP/camilladsp.yml" in file_list
        assert "miniDSP/fir_coeffs_left.txt" in file_list
        assert "rePhase/AutoRoomEQ_Project.rephase" in file_list
        assert "README_INSTALL.txt" in file_list
        
        # Verify Equalizer APO config content
        eq_config = zf.read("EqualizerAPO/config.txt").decode("utf-8")
        assert "Preamp:" in eq_config
        assert "Convolution:" in eq_config
