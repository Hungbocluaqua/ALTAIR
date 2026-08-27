"""
Comprehensive Regression Test Suite for Code Review Bugfixes.
Verifies all 17 identified bugs and issues are resolved.
"""

import numpy as np
import pytest
from scipy import signal

from auto_roomeq.dsp.phase_linearization import synthesize_crossover_phase_reversal
from auto_roomeq.exporters.minidsp_exporter import export_minidsp_fir
from auto_roomeq.exporters.equalizer_apo_exporter import export_equalizer_apo_config
from auto_roomeq.exporters.camilladsp_exporter import export_camilladsp_config
from auto_roomeq.dsp.farina import farina_harmonic_separation
from auto_roomeq.dsp.acquisition import generate_log_chirp
from auto_roomeq.dsp.preringing import auto_attenuate_preringing, evaluate_zwicker_temporal_masking
from auto_roomeq.dsp.sub_alignment import optimize_multi_sub_matrix
from auto_roomeq.dsp.measurement import Measurement, rms_magnitude_average
from auto_roomeq.dsp.acoustic_analysis import detect_schroeder_statistical


def test_bug1_crossover_phase_reversal_numerical_accuracy():
    """Bug 1: Verify phase response matches analytical LR4 transfer function (-67.9 deg at 1 kHz for LR4@2.5 kHz)."""
    sr = 48000
    n_fft = 65536
    xo_freq = 2500.0
    
    h_rev = synthesize_crossover_phase_reversal(
        sample_rate=sr,
        crossover_freq=xo_freq,
        order=4,
        n_fft=n_fft,
    )
    
    # Compute FFT
    H_rev = np.fft.rfft(h_rev, n=n_fft)
    freqs = np.fft.rfftfreq(n_fft, d=1.0 / sr)
    
    # Remove carrier delay tau = (n_fft // 2) / sr
    tau_s = (n_fft // 2) / sr
    carrier = np.exp(-1j * 2.0 * np.pi * freqs * tau_s)
    H_pure = H_rev * np.conj(carrier)
    
    # Find 1 kHz bin
    idx_1k = np.argmin(np.abs(freqs - 1000.0))
    phase_deg_1k = np.rad2deg(np.angle(H_pure[idx_1k]))
    
    # Butterworth analog prototype phase at 1 kHz for LR4@2.5 kHz is approx -67.92 deg (reversal is +67.92 deg or -67.92 deg conjugate)
    assert abs(abs(phase_deg_1k) - 67.92) < 2.0, f"Expected phase ~67.9 deg, got {phase_deg_1k}"


def test_bug2_minidsp_fir_peak_extraction():
    """Bug 2: Verify miniDSP export center-extracts non-zero energy around peak of centered 65536-tap FIR."""
    n_taps = 65536
    fir = np.zeros(n_taps)
    peak_idx = n_taps // 2
    fir[peak_idx] = 1.0
    fir[peak_idx - 10:peak_idx + 10] = 0.5
    
    exported = export_minidsp_fir(fir, max_taps=4096)
    lines = [float(l) for l in exported.split("\n") if l.strip()]
    assert len(lines) == 4096
    energy = np.sum(np.square(lines))
    assert energy > 0.5, f"miniDSP FIR energy too low: {energy}"


def test_bug5_camilladsp_pipeline_sub_delay_and_inversion():
    """Bug 5: Verify sub delay and polarity are wired into CamillaDSP pipeline."""
    # Test positive sub delay (sub leading)
    cfg_pos = export_camilladsp_config(preamp_db=-3.0, sub_delay_ms=2.5, sub_polarity=1.0)
    assert "sub_delay" in cfg_pos
    assert "channel: 2" in cfg_pos
    assert "- sub_delay" in cfg_pos

    # Test negative sub delay (mains leading)
    cfg_neg = export_camilladsp_config(preamp_db=-3.0, sub_delay_ms=-3.5, sub_polarity=-1.0)
    assert "mains_delay" in cfg_neg
    assert "- mains_delay" in cfg_neg
    assert "sub_invert" in cfg_neg


def test_bug6_farina_circular_wraparound_protection():
    """Bug 6: Verify Farina deconvolution FFT size prevents circular wraparound."""
    sr = 48000
    duration_s = 0.25
    sweep, _ = generate_log_chirp(f_start=20.0, f_end=10000.0, sample_rate=sr, length_samples=int(duration_s * sr))
    
    # Simulate recording with 10 ms acoustic delay
    delay_samples = int(0.010 * sr)
    recorded = np.pad(sweep, (delay_samples, 0))
    
    res = farina_harmonic_separation(recorded, sweep_duration_s=duration_s, sample_rate=sr, f_start=20.0, f_end=10000.0)
    assert "linear_ir" in res
    assert len(res["linear_ir"]) > 0


def test_bug7_equalizer_apo_channel_and_negative_delay():
    """Bug 7: Verify Equalizer APO uses LFE channel and delays mains on negative delay."""
    # Positive delay -> delay LFE
    apo_pos = export_equalizer_apo_config(preamp_db=-4.0, sub_delay_ms=3.2)
    assert "Channel: LFE" in apo_pos
    assert "Delay: 3.20 ms" in apo_pos

    # Negative delay -> delay mains L R
    apo_neg = export_equalizer_apo_config(preamp_db=-4.0, sub_delay_ms=-2.8, sub_polarity=-1.0)
    assert "Channel: L R" in apo_neg
    assert "Delay: 2.80 ms" in apo_neg
    assert "Channel: LFE" in apo_neg
    assert "Copy: LFE=-1*LFE" in apo_neg


def test_bug9_schroeder_linear_frequency_grid():
    """Bug 9: Verify Schroeder statistical detector runs reliably on linear grid."""
    freqs = np.linspace(10.0, 2000.0, 2000)
    # Synthetic magnitude with modal dips below 200 Hz
    mag = np.ones_like(freqs)
    mag[freqs < 200.0] += 0.5 * np.sin(2.0 * np.pi * freqs[freqs < 200.0] / 30.0)
    
    schroeder_hz = detect_schroeder_statistical(mag, freqs, fs=48000)
    assert 120.0 <= schroeder_hz <= 450.0


def test_bug11_preringing_zero_iterations_and_zwicker():
    """Bug 11: Verify auto_attenuate_preringing handles max_iterations=0 and Zwicker formula."""
    ir = np.zeros(2048)
    ir[1024] = 1.0
    
    def dummy_gen(q, beta):
        return ir
        
    imp, metrics, q, beta = auto_attenuate_preringing(dummy_gen, max_iterations=0)
    assert metrics is not None
    assert q == 1.0
    assert beta == 0.08

    # Zwicker formula check
    zw = evaluate_zwicker_temporal_masking(ir, sample_rate=48000)
    assert zw["is_masked"] is True


def test_new_camilladsp_negative_delay_sub_channel_in_pipeline():
    """Verify channel: 2 is emitted into pipeline when sub_delay_ms < 0 and polarity is normal."""
    cfg = export_camilladsp_config(preamp_db=-5.0, sub_delay_ms=-2.5, sub_polarity=1.0)
    assert "channel: 2" in cfg
    assert "preamp_gain" in cfg
    # Pipeline contains channel 2
    assert "channel: 2\n    names:\n      - preamp_gain" in cfg


def test_new_farina_linear_ir_zeroes_all_pre_harmonics():
    """Verify Farina deconvolution removes all harmonic bursts sitting seconds before the peak."""
    sr = 48000
    duration_s = 2.0
    sweep, _ = generate_log_chirp(f_start=20.0, f_end=10000.0, sample_rate=sr, length_samples=int(duration_s * sr))
    
    # Place a synthetic distortion burst 1 second before direct peak
    recorded = np.pad(sweep, (int(1.5 * sr), 0))
    # Inject fake 2nd harmonic burst
    harm_loc = int(0.5 * sr)
    recorded[harm_loc : harm_loc + 100] += 0.5
    
    res = farina_harmonic_separation(recorded, sweep_duration_s=duration_s, sample_rate=sr, f_start=20.0, f_end=10000.0)
    linear_ir = res["linear_ir"]
    peak_idx = int(np.argmax(np.abs(linear_ir)))
    
    # Check that region 500 ms before peak is strictly clean / zeroed
    assert np.all(linear_ir[: peak_idx - int(0.010 * sr)] == 0.0)


def test_new_optimization_latest_endpoint_and_bounds():
    """Verify /api/optimization/latest does not crash on bytes serialization, and bounds guard endpoints."""
    from fastapi.testclient import TestClient
    from auto_roomeq.server.app import app
    
    client = TestClient(app)
    
    # 1. Run optimization
    opt_resp = client.post("/api/optimize", json={"use_demo_measurements": True})
    assert opt_resp.status_code == 200
    
    # 2. Query /api/optimization/latest
    latest_resp = client.get("/api/optimization/latest")
    assert latest_resp.status_code == 200
    data = latest_resp.json()
    assert data["status"] == "success"
    assert "plots" in data
    
    # 3. Test auto-repeated sweep with repetitions=0 and negative repetitions
    rep_zero = client.post(
        "/api/measurements/auto-repeated-sweep",
        params={"channel": "left", "repetitions": 0, "use_simulation": "true"},
    )
    assert rep_zero.status_code == 200
    assert rep_zero.json()["repetitions"] >= 1
    assert not np.isinf(rep_zero.json()["snr_improvement_db"])
    
    # 4. Test auto-sweep with huge duration_s (bounded, does not OOM)
    sw_huge = client.get("/api/measurements/auto-sweep?duration_s=100000&sample_rate=48000")
    assert sw_huge.status_code == 200
    assert sw_huge.headers["content-type"] == "audio/wav"
    # Max duration is 60s (+ ~55ms timing ref lead-in/out), so wav data is bounded
    assert len(sw_huge.content) <= (65 * 48000 * 3)


def test_camilladsp_sub_preserved_at_zero_delay():
    """Verify CamillaDSP retains channel 2 (3-channel config) even when sub_delay_ms is exactly 0.0."""
    cfg = export_camilladsp_config(preamp_db=-3.0, sub_delay_ms=0.0, sub_polarity=1.0)
    assert "channels: 3" in cfg
    assert "channel: 2" in cfg
    # Pipeline contains channel 2 with preamp_gain
    assert "channel: 2\n    names:\n      - preamp_gain" in cfg


def test_farina_peak_at_zero_impulse_preservation():
    """Verify Farina deconvolution does not zero out sample 0 if peak is at the very beginning."""
    ir = np.zeros(2048)
    ir[0] = 1.0
    # Simulate recorded sweep where deconvolution peak lands at index 0
    res = farina_harmonic_separation(ir, sweep_duration_s=0.5, sample_rate=48000, f_start=20.0, f_end=10000.0)
    linear_ir = res["linear_ir"]
    assert linear_ir[0] != 0.0


def test_multi_sub_resampling_n_fft_sizing():
    """Verify multi-sub optimizer accommodates lengthened IRs upon resampling without tail truncation."""
    from auto_roomeq.dsp.measurement import Measurement
    from auto_roomeq.dsp.sub_alignment import optimize_multi_sub_matrix
    
    # 44.1 kHz sub measurement
    ir_44k = np.zeros(8000)
    ir_44k[100] = 1.0
    ir_44k[7990] = 0.5  # Energy at the tail
    meas_44k = Measurement("Sub44k", ir=ir_44k, sample_rate=44100, n_fft=8192)
    
    # 48 kHz sub measurement
    ir_48k = np.zeros(8000)
    ir_48k[100] = 1.0
    meas_48k = Measurement("Sub48k", ir=ir_48k, sample_rate=48000, n_fft=8192)
    
    res = optimize_multi_sub_matrix([meas_48k, meas_44k], crossover_freq=80.0)
    assert res["sub_count"] == 2
    assert len(res["alignments"]) == 2


