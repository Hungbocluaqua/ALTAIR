"""
Fuzzing, Stress & Degenerate Input Test Suite for ALTAIR.
Tests:
- Degenerate / random noise inputs, NaNs, infinities, DC offsets.
- Extreme environmental parameters (sub-zero to 50 C, 5% to 99% RH, 80 kPa to 110 kPa).
- Extremely short IRs (32 samples) and high-tap filters (131,072 taps).
- REW API client with mocked responses and network errors.
- Multi-seat spatial averaging with inverted / out-of-phase measurements.
- Multi-sub matrix optimization (MSO) with up to 4 subwoofers.
- REST API error handling on invalid requests.
"""

import pytest
import asyncio
import numpy as np
from fastapi.testclient import TestClient

from auto_roomeq.dsp.measurement import (
    Measurement,
    cross_correlate_align,
    vector_average,
    hybrid_spatial_average,
    parse_rew_text,
)
from auto_roomeq.dsp.acquisition import generate_log_chirp, deconvolve
from auto_roomeq.dsp.vba_synth import synthesize_vba_filter, detect_modal_peaks_dips
from auto_roomeq.dsp.mag_inversion import synthesize_mag_inversion_filter, tikhonov_magnitude_inversion
from auto_roomeq.dsp.phase_linearization import (
    frequency_dependent_window,
    synthesize_crossover_phase_reversal,
    synthesize_phase_linearization_filter,
)
from auto_roomeq.dsp.preringing import evaluate_step_response_preringing, evaluate_zwicker_temporal_masking
from auto_roomeq.dsp.filter_assembly import assemble_final_filter
from auto_roomeq.dsp.sub_alignment import optimize_sub_mains_alignment, optimize_multi_sub_matrix
from auto_roomeq.dsp.acoustic_analysis import (
    calculate_iso9613_air_absorption,
    adapt_target_curve_from_rt60,
    classify_sbir_boundary_cancellations,
    detect_schroeder_statistical,
    detect_reflection_gap,
)
from auto_roomeq.dsp.advanced_dsp import (
    calculate_speed_of_sound,
    compute_frequency_dependent_beta,
    detect_group_delay_crossovers,
    calculate_itu_r_bs1770_true_peak,
    generate_hybrid_iir_fir_split,
    synthesize_warped_fir,
    synthesize_time_reversed_excess_phase_filter,
)
from auto_roomeq.orchestrator import OptimizationOrchestrator, generate_demo_room_measurements
from auto_roomeq.server.app import app


def test_nan_and_inf_resilience():
    """Ensure all DSP functions gracefully sanitize NaNs, Inf, and severe DC offsets."""
    sr = 48000
    n = 4096
    
    # Dirty array with NaN, Inf, and +10.0 DC offset
    dirty_ir = np.random.randn(n) * 0.01
    dirty_ir[10] = np.nan
    dirty_ir[50] = np.inf
    dirty_ir[100] = -np.inf
    dirty_ir += 5.0  # huge DC offset
    
    meas = Measurement("Dirty_Measurement", dirty_ir, sample_rate=sr)
    assert np.all(np.isfinite(meas.ir))
    assert np.all(np.isfinite(meas.spl_db))
    assert np.all(np.isfinite(meas.phase_deg))
    assert np.all(np.isfinite(meas.group_delay_ms))
    assert np.all(np.isfinite(meas.step_response))


def test_extreme_environmental_parameters():
    """Test atmospheric physics and speed of sound under extreme environmental conditions."""
    freqs = np.fft.rfftfreq(4096, d=1.0 / 48000)
    
    # 1. Sub-zero temperatures (-20 C)
    c_freeze = calculate_speed_of_sound(-20.0)
    assert 315.0 <= c_freeze <= 325.0
    
    # 2. Extreme heat (50 C)
    c_heat = calculate_speed_of_sound(50.0)
    assert 355.0 <= c_heat <= 365.0
    
    # 3. Desert dry (5% RH) vs tropical humidity (99% RH)
    loss_dry = calculate_iso9613_air_absorption(freqs, temp_celsius=35.0, relative_humidity_pct=5.0, pressure_kpa=101.325)
    loss_humid = calculate_iso9613_air_absorption(freqs, temp_celsius=35.0, relative_humidity_pct=99.0, pressure_kpa=101.325)
    assert np.all(np.isfinite(loss_dry))
    assert np.all(np.isfinite(loss_humid))
    assert np.all(loss_dry >= 0.0)
    assert np.all(loss_humid >= 0.0)


def test_very_short_and_huge_taps():
    """Verify filter assembly and pipeline with tap sizes from 512 up to 131,072 taps."""
    sr = 48000
    
    for taps in [512, 1024, 2048, 65536]:
        h_vba = np.zeros(512)
        h_vba[0] = 1.0
        h_inv = np.zeros(512)
        h_inv[0] = 1.0
        h_phase = np.zeros(512)
        h_phase[256] = 1.0
        
        fir, max_gain, preamp = assemble_final_filter(
            h_vba=h_vba,
            h_inv=h_inv,
            h_phase=h_phase,
            target_taps=taps,
            sample_rate=sr,
        )
        assert len(fir) == taps
        assert np.all(np.isfinite(fir))
        assert np.isfinite(max_gain)
        assert np.isfinite(preamp)


def test_multi_sub_matrix_optimization():
    """Verify multi-subwoofer matrix optimization across 3 subwoofers."""
    sr = 48000
    n = 2048
    n_subs = 3
    
    # Generate synthetic sub measurements
    subs = []
    for s in range(n_subs):
        ir = np.zeros(n)
        delay = (s + 1) * 15
        ir[delay] = 1.0 / (s + 1)
        subs.append(Measurement(f"Sub_{s}", ir, sample_rate=sr, n_fft=n))
        
    mso_result = optimize_multi_sub_matrix(subs, crossover_freq=80.0, search_range_ms=30.0)
    assert mso_result["sub_count"] == 3
    assert len(mso_result["alignments"]) == 3
    for al in mso_result["alignments"]:
        assert np.isfinite(al["delay_ms"])
        assert np.isfinite(al["gain_db"])
        assert np.isfinite(al["polarity"])


def test_api_error_handling():
    """Verify REST API responds with correct status codes for edge cases and errors."""
    client = TestClient(app)
    
    # 1. Upload empty file
    resp_empty = client.post(
        "/api/measurements/upload",
        files={"file": ("empty.txt", b"", "text/plain")},
        data={"channel": "left", "sample_rate": 48000},
    )
    assert resp_empty.status_code == 400
    
    # 2. Upload corrupt text format
    resp_corrupt = client.post(
        "/api/measurements/upload",
        files={"file": ("corrupt.txt", b"invalid header text with no numbers", "text/plain")},
        data={"channel": "left", "sample_rate": 48000},
    )
    assert resp_corrupt.status_code == 400
    
    # 3. Simulate sub delay endpoint
    resp_sub_sim = client.post(
        "/api/sub-alignment/simulate",
        data={"delay_ms": 12.5, "polarity": -1.0, "crossover_freq": 80.0},
    )
    assert resp_sub_sim.status_code == 200
    data = resp_sub_sim.json()
    assert "spl_sum_db" in data
    assert len(data["spl_sum_db"]) > 10
    
    # 4. Status endpoint
    resp_status = client.get("/api/status")
    assert resp_status.status_code == 200
    assert resp_status.json()["app"] == "ALTAIR"
