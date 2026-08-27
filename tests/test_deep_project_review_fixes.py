"""
Unit & Integration Tests verifying bugfixes from the deep project-wide review.
"""

import pytest
import asyncio
import numpy as np
from scipy import signal
from fastapi.testclient import TestClient
from auto_roomeq.server.app import app
from auto_roomeq.server import routes
from auto_roomeq.dsp.measurement import Measurement, cross_correlate_align
from auto_roomeq.dsp.advanced_dsp import (
    generate_hybrid_iir_fir_split,
    synthesize_time_reversed_excess_phase_filter,
)
from auto_roomeq.integrations.rew_api import RewApiClient

client = TestClient(app)


def test_hybrid_iir_fir_split_phase_accuracy():
    """
    Verify that generate_hybrid_iir_fir_split does NOT double the target phase
    during H_residue = H_target / H_iir deconvolution.
    """
    sr = 48000
    n_taps = 4096
    
    # Create a synthetic target FIR with known linear group delay
    t = np.arange(n_taps)
    center = n_taps // 2
    target_fir = np.exp(-0.5 * ((t - center) / 30.0) ** 2) * np.cos(2.0 * np.pi * 500.0 * t / sr)
    
    # 1 PEQ cut
    modal_peaks = [{"freq_hz": 60.0, "gain_db": -6.0, "q": 3.0}]
    
    biquads, compact_fir = generate_hybrid_iir_fir_split(
        modal_peaks_dips=modal_peaks,
        target_fir=target_fir,
        sample_rate=sr,
        max_biquads=4,
        target_taps=n_taps,
    )
    
    assert len(biquads) == 1
    assert len(compact_fir) == n_taps
    
    # Check that recombining compact FIR with the IIR biquad approximates target_fir
    b0 = biquads[0]["b0"]
    b1 = biquads[0]["b1"]
    b2 = biquads[0]["b2"]
    a1 = biquads[0]["a1"]
    a2 = biquads[0]["a2"]
    
    b = [b0, b1, b2]
    a = [1.0, a1, a2]
    
    recombined = signal.lfilter(b, a, compact_fir)
    
    # Peak of recombined should land near center, not distorted or phase-doubled
    peak_recombined = np.argmax(np.abs(recombined))
    peak_target = np.argmax(np.abs(target_fir))
    assert abs(peak_recombined - peak_target) < 100


def test_cross_correlate_align_single_sample_target():
    """
    Verify cross_correlate_align handles single-sample target_ir without R[-0:] slice error.
    """
    sr = 48000
    ref_ir = np.zeros(256)
    ref_ir[50] = 1.0
    
    target_single = np.array([1.0])
    
    aligned, lag_samp, lag_ms = cross_correlate_align(ref_ir, target_single, sample_rate=sr)
    assert len(aligned) == 1
    assert np.isfinite(lag_samp)
    assert np.isfinite(lag_ms)


def test_time_reversed_excess_phase_filter_boundary_protection():
    """
    Verify synthesize_time_reversed_excess_phase_filter does not crash with extreme window lengths.
    """
    sr = 96000
    ir = np.zeros(4096)
    ir[100] = 1.0
    ir[200] = -0.3
    
    # Very large max_corr_ms that would exceed n_fft // 2 without boundary clamping
    res = synthesize_time_reversed_excess_phase_filter(
        ir,
        sample_rate=sr,
        max_corr_ms=200.0,
        f_max=500.0,
        target_taps=2048,
    )
    assert len(res) == 2048
    assert np.all(np.isfinite(res))


def test_simulate_sub_delay_sample_rate_mismatch():
    """
    Verify /sub-alignment/simulate works cleanly when left and sub measurements
    have different sample rates (e.g. 48kHz and 96kHz).
    """
    meas_l = Measurement(name="L_48k", ir=np.random.normal(0, 0.01, 2048), sample_rate=48000)
    meas_sub = Measurement(name="Sub_96k", ir=np.random.normal(0, 0.01, 4096), sample_rate=96000)
    
    async def setup_state():
        async with routes.state_lock:
            routes.current_measurements["left"] = meas_l
            routes.current_measurements["sub"] = meas_sub
            
    asyncio.run(setup_state())
    
    resp = client.post(
        "/api/sub-alignment/simulate",
        data={"delay_ms": "2.5", "polarity": "1.0", "crossover_freq": "80.0"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "spl_sum_db" in data
    assert len(data["spl_sum_db"]) == len(data["freqs"])


def test_rew_client_fast_failure_detection():
    """
    Verify that execute_auto_repeated_sweeps stops early if REW captures no measurement
    on the first repetition.
    """
    client_rew = RewApiClient(base_url="http://localhost:4735", timeout=0.1)
    
    async def mock_get_measurements():
        return []
        
    async def mock_trigger(*args, **kwargs):
        return None
        
    client_rew.get_measurements = mock_get_measurements
    client_rew.trigger_measurement = mock_trigger
    
    async def run_test():
        with pytest.raises(RuntimeError) as excinfo:
            await client_rew.execute_auto_repeated_sweeps(channel="left", repetitions=4)
        assert "Could not retrieve measurements from REW" in str(excinfo.value)
        
    asyncio.run(run_test())
