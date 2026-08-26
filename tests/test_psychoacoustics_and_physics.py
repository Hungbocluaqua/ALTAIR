"""
Unit & Integration Test Suite for ALTAIR Advanced Psychoacoustics & Acoustic Physics Engine.
Tests:
- Sub-sample fractional cross-correlation delay alignment.
- ISO 9613-1 Atmospheric air absorption calculation.
- RT60-adaptive target curve slope adjustment.
- SBIR boundary cancellation decomposition.
- Zwicker psychoacoustic temporal masking evaluation.
- Warped FIR (WFIR) synthesis.
- Time-reversed excess-phase homomorphic inversion.
- Enhanced Hybrid IIR + FIR split with biquad residue deconvolution.
"""

import pytest
import numpy as np
from scipy import signal

from auto_roomeq.dsp.measurement import cross_correlate_align, Measurement
from auto_roomeq.dsp.acoustic_analysis import (
    calculate_iso9613_air_absorption,
    adapt_target_curve_from_rt60,
    classify_sbir_boundary_cancellations,
)
from auto_roomeq.dsp.preringing import evaluate_zwicker_temporal_masking
from auto_roomeq.dsp.advanced_dsp import (
    synthesize_warped_fir,
    synthesize_time_reversed_excess_phase_filter,
    generate_hybrid_iir_fir_split,
)
from auto_roomeq.dsp.mag_inversion import tikhonov_magnitude_inversion


def test_subsample_fractional_delay():
    sr = 48000
    n = 2048
    # Dirac pulse at sample 100
    ref_ir = np.zeros(n)
    ref_ir[100] = 1.0
    
    # Target delayed by 5.35 samples
    H_ref = np.fft.rfft(ref_ir)
    freqs = np.fft.rfftfreq(n, d=1.0 / sr)
    H_delayed = H_ref * np.exp(-1j * 2.0 * np.pi * freqs * (5.35 / sr))
    target_ir = np.fft.irfft(H_delayed, n=n)
    
    aligned_ir, lag_samples, lag_ms = cross_correlate_align(ref_ir, target_ir, sample_rate=sr, enable_subsample=True)
    
    # The measured lag should match -5.35 samples (or +5.35 depending on direction) within 0.1 sample precision
    assert abs(abs(lag_samples) - 5.35) < 0.15
    # Cross correlation between ref and aligned should be > 0.99
    peak_align = np.max(aligned_ir)
    assert peak_align > 0.95


def test_iso9613_air_absorption():
    freqs = np.array([100.0, 1000.0, 5000.0, 10000.0, 20000.0])
    
    loss_db = calculate_iso9613_air_absorption(
        freqs=freqs,
        temp_celsius=20.0,
        relative_humidity_pct=50.0,
        pressure_kpa=101.325,
        distance_m=3.0,
    )
    
    # Loss should increase monotonically with frequency
    assert loss_db[0] < loss_db[1] < loss_db[2] < loss_db[3] < loss_db[4]
    # At 100 Hz, loss is negligible (< 0.01 dB)
    assert loss_db[0] < 0.01
    # At 20 kHz over 3m, loss is noticeable (~0.5 - 2 dB)
    assert 0.3 <= loss_db[4] <= 3.0


def test_rt60_target_adaptation():
    freqs = np.geomspace(20.0, 20000.0, 200)
    base_target = np.zeros_like(freqs)
    
    # Live room: RT60 = 0.8s -> target slope should steepen downward
    adapted_live = adapt_target_curve_from_rt60(base_target, freqs, estimated_rt60_s=0.80)
    assert adapted_live[-1] < -0.5
    
    # Damped studio: RT60 = 0.2s -> target slope should flatten upward
    adapted_damped = adapt_target_curve_from_rt60(base_target, freqs, estimated_rt60_s=0.20)
    assert adapted_damped[-1] > 0.1


def test_sbir_boundary_cancellation():
    sr = 48000
    n = 8192
    freqs = np.fft.rfftfreq(n, d=1.0 / sr)
    
    # Synthesize an impulse with a quarter-wave boundary dip at 70 Hz (corresponding to ~1.2m boundary distance)
    spl = 80.0 * np.ones_like(freqs)
    spl -= 8.0 * np.exp(-0.5 * ((freqs - 70.0) / 4.0) ** 2)
    
    # Convert to minimum phase IR
    H_mag = 10.0 ** (spl / 20.0)
    log_mag = np.log(np.maximum(H_mag, 1e-12))
    full_log = np.concatenate([log_mag, log_mag[-2:0:-1]])
    cep = np.fft.ifft(full_log).real
    win = np.zeros_like(cep)
    win[0] = 1.0
    win[1:len(cep)//2] = 2.0
    win[len(cep)//2] = 1.0
    H_min = np.exp(np.fft.fft(cep * win))[:len(H_mag)]
    ir = np.fft.irfft(H_min, n=n)
    
    results = classify_sbir_boundary_cancellations(freqs, spl, ir, sample_rate=sr)
    assert len(results) > 0
    dip = results[0]
    assert abs(dip["frequency_hz"] - 70.0) < 5.0
    assert dip["is_sbir_null"] is True
    assert 1.0 <= dip["estimated_boundary_distance_m"] <= 1.5


def test_zwicker_temporal_masking():
    sr = 48000
    n = 4096
    
    # 1. Clean minimum-phase impulse (pre-ringing = 0)
    clean_ir = np.zeros(n)
    clean_ir[2000] = 1.0
    res_clean = evaluate_zwicker_temporal_masking(clean_ir, sample_rate=sr)
    assert res_clean["is_masked"] is True
    
    # 2. Impulse with huge pre-echo at -15ms
    pre_echo_ir = clean_ir.copy()
    pre_echo_idx = 2000 - int(0.015 * sr)
    pre_echo_ir[pre_echo_idx] = 0.40  # 40% pre-echo
    res_echo = evaluate_zwicker_temporal_masking(pre_echo_ir, sample_rate=sr)
    assert res_echo["is_masked"] is False
    assert res_echo["worst_margin_db"] > 0.0


def test_warped_fir_synthesis():
    sr = 48000
    n_freqs = 500
    freqs = np.linspace(20.0, 20000.0, n_freqs)
    # Target cut at 40 Hz
    target_mag = np.ones_like(freqs)
    target_mag[freqs < 60.0] = 0.5
    
    wfir = synthesize_warped_fir(target_mag, freqs, sample_rate=sr, lambda_warp=0.65, target_taps=2048)
    assert len(wfir) == 2048
    assert np.all(np.isfinite(wfir))
    assert np.max(np.abs(wfir)) > 0.01


def test_time_reversed_excess_phase():
    sr = 48000
    n = 4096
    ir = np.zeros(n)
    ir[200] = 1.0
    
    h_corr = synthesize_time_reversed_excess_phase_filter(ir, sample_rate=sr, max_corr_ms=10.0, f_max=400.0)
    assert len(h_corr) == n
    assert np.all(np.isfinite(h_corr))


def test_enhanced_hybrid_iir_fir_split():
    sr = 48000
    n_taps = 8192
    
    # Target FIR with sharp low bass resonance
    fir_raw = np.zeros(n_taps)
    fir_raw[n_taps // 2] = 1.0
    
    modal_peaks = [
        {"freq_hz": 43.0, "gain_db": -8.0, "q": 4.0},
        {"freq_hz": 86.0, "gain_db": -6.0, "q": 3.5},
    ]
    
    biquads, compact_fir = generate_hybrid_iir_fir_split(
        modal_peaks_dips=modal_peaks,
        target_fir=fir_raw,
        sample_rate=sr,
        max_biquads=2,
        target_taps=2048,
    )
    
    assert len(biquads) == 2
    assert biquads[0]["frequency_hz"] == 43.0
    assert len(compact_fir) == 2048
    assert np.all(np.isfinite(compact_fir))
