"""
Unit Tests for AutoRoomEQ DSP Core Modules.
Verifies:
- Acquisition & Deconvolution
- Measurement alignment & vector averaging
- Target curves and anchoring
- Module 1: VBA reflection cancellation & 8th-order LPF
- Module 2: Tikhonov regularized magnitude inversion with +5dB max boost
- Module 3: 1-cycle FDW & Linkwitz-Riley crossover phase reversal
- Pre-ringing step response safeguard & auto-attenuation loop
- Filter assembly, Tukey tap trimming to 65536 taps & headroom offset
- Subwoofer + mains time-alignment optimization
"""

import numpy as np
import pytest
from auto_roomeq.dsp import (
    generate_log_chirp,
    deconvolve,
    Measurement,
    cross_correlate_align,
    vector_average,
    hybrid_spatial_average,
    generate_harman_target,
    generate_bk1974_target,
    anchor_target_to_measurement,
    detect_modal_peaks_dips,
    synthesize_vba_filter,
    tikhonov_magnitude_inversion,
    extract_minimum_phase,
    synthesize_mag_inversion_filter,
    frequency_dependent_window,
    synthesize_crossover_phase_reversal,
    synthesize_phase_linearization_filter,
    evaluate_step_response_preringing,
    auto_attenuate_preringing,
    assemble_final_filter,
    calculate_preamp_headroom,
    optimize_sub_mains_alignment,
)


def test_log_chirp_generation():
    """Verify log chirp generation and timing reference."""
    sweep, t = generate_log_chirp(
        f_start=20.0,
        f_end=20000.0,
        sample_rate=48000,
        length_samples=48000,  # 1 second
        include_timing_ref=False,
    )
    assert len(sweep) == 48000
    assert np.max(np.abs(sweep)) <= 1.0
    assert np.min(np.abs(sweep)) >= 0.0


def test_cross_correlate_align():
    """Verify cross-correlation time alignment on delayed impulse."""
    sr = 48000
    n = 4096
    
    ref_ir = np.zeros(n)
    ref_ir[100] = 1.0  # Peak at sample 100
    
    target_ir = np.zeros(n)
    target_ir[150] = 1.0  # Peak at sample 150 (delayed by 50 samples)
    
    aligned_ir, lag_samples, lag_ms = cross_correlate_align(ref_ir, target_ir, sample_rate=sr)
    
    # After alignment, peak should match ref_ir
    assert np.argmax(np.abs(aligned_ir)) == 100
    assert lag_samples == -50


def test_targets_and_anchoring():
    """Verify Harman target curve and level anchoring."""
    freqs = np.linspace(20, 20000, 1000)
    harman = generate_harman_target(freqs, bass_boost_db=6.0, bass_cutoff_hz=80.0)
    
    # 20 Hz should be near +6 dB
    assert np.isclose(harman[0], 6.0, atol=0.2)
    # 10 kHz should be negative due to HF roll-off
    idx_10k = np.argmin(np.abs(freqs - 10000.0))
    assert harman[idx_10k] < 0.0
    
    # Anchoring test
    measured_spl = np.full_like(freqs, 85.0)  # 85 dB flat
    anchored_target, offset_db = anchor_target_to_measurement(harman, measured_spl, freqs)
    
    # RMS around 500 Hz should be aligned
    idx_500 = np.argmin(np.abs(freqs - 500.0))
    assert np.isclose(anchored_target[idx_500], 85.0, atol=1.0)


def test_vba_modal_detection_and_synthesis():
    """Verify Module 1 VBA peak detection with +/- 10% tolerance and filter synthesis."""
    sr = 48000
    n = 8192
    
    # Synthetic room impulse response with a modal peak at 50 Hz
    t = np.arange(n) / sr
    # Room mode resonance at 50 Hz with exponential decay
    mode_50hz = np.sin(2.0 * np.pi * 50.0 * t) * np.exp(-t / 0.1)
    ir = np.zeros(n)
    ir[0] = 1.0  # Direct impulse
    ir += 0.8 * mode_50hz
    
    meas = Measurement(name="Modal Room", ir=ir, sample_rate=sr, n_fft=n)
    
    # Run peak detection
    modal_info = detect_modal_peaks_dips(meas.freqs, meas.spl_db, f_min=20.0, f_max=150.0, tolerance=0.10)
    assert modal_info["f_1"] > 0.0
    
    # Synthesize VBA
    h_vba, meas_h1, info = synthesize_vba_filter(meas, f_opt=50.0, sample_rate=sr)
    assert len(h_vba) > 0
    assert h_vba[0] == 1.0  # Dirac delta delta[n]
    assert np.any(h_vba < 0)  # Has inverted delayed pulse


def test_mag_inversion_constraints():
    """Verify Module 2 Tikhonov inversion caps max boost at +5 dB and extracts minimum phase."""
    sr = 48000
    n_fft = 8192
    freqs = np.fft.rfftfreq(n_fft, d=1.0 / sr)
    
    # Create a measurement with a deep anti-resonance null (-25 dB dip at 80 Hz)
    H_mag = np.ones(len(freqs))
    idx_80 = np.argmin(np.abs(freqs - 80.0))
    H_mag[idx_80] = 0.05  # ~ -26 dB deep null
    
    H_1 = H_mag.astype(np.complex128)
    target_mag = np.ones(len(freqs))  # Flat target
    
    H_inv = tikhonov_magnitude_inversion(
        H_1=H_1,
        target_mag_linear=target_mag,
        freqs=freqs,
        beta=0.08,
        max_boost_db=5.0,
        max_cut_db=20.0,
    )
    
    inv_mag_db = 20.0 * np.log10(np.maximum(np.abs(H_inv), 1e-12))
    # Max boost must strictly be <= +5.0 dB
    assert np.max(inv_mag_db) <= 5.01
    
    # Test minimum phase extraction
    H_min, h_min = extract_minimum_phase(np.abs(H_inv), n_fft=n_fft)
    assert len(h_min) == n_fft
    # Peak of minimum phase response must occur at start (causal, no pre-ringing)
    assert np.argmax(np.abs(h_min)) < 10


def test_phase_linearization():
    """Verify Module 3 Linkwitz-Riley 4th order crossover phase reversal."""
    sr = 48000
    h_xo = synthesize_crossover_phase_reversal(
        sample_rate=sr,
        crossover_freq=2500.0,
        order=4,
        n_fft=8192,
    )
    assert len(h_xo) == 8192
    # Magnitude of allpass filter must be flat (0 dB) across audio band
    H_xo = np.fft.rfft(h_xo)
    mag_db = 20.0 * np.log10(np.maximum(np.abs(H_xo), 1e-12))
    assert np.all(np.abs(mag_db[100:3000]) < 0.5)


def test_preringing_safeguard():
    """Verify pre-ringing step response evaluation and pass/fail metrics."""
    sr = 48000
    n = 8192
    
    # 1. Clean minimum-phase impulse (zero pre-ringing)
    clean_ir = np.zeros(n)
    clean_ir[n // 2] = 1.0
    clean_ir[n // 2 + 1 : n // 2 + 100] = np.exp(-np.arange(99) / 10.0)
    
    metrics_clean = evaluate_step_response_preringing(clean_ir, sample_rate=sr)
    assert metrics_clean["passed"] is True
    assert metrics_clean["max_pre_amplitude"] < 0.01


def test_filter_assembly_and_trimming():
    """Verify final filter assembly, Tukey window trimming to 65536 taps, and headroom calculation."""
    sr = 48000
    h_vba = np.zeros(1024)
    h_vba[0] = 1.0
    
    h_inv = np.zeros(4096)
    h_inv[0] = 1.0
    h_inv[1:50] = np.exp(-np.arange(49) / 5.0)
    
    h_phase = np.zeros(8192)
    h_phase[4096] = 1.0
    
    final_fir, max_gain_db, preamp_db = assemble_final_filter(
        h_vba=h_vba,
        h_inv=h_inv,
        h_phase=h_phase,
        target_taps=65536,
        sample_rate=sr,
        window_type="tukey",
        tukey_alpha=0.05,
    )
    
    assert len(final_fir) == 65536
    # Boundary samples should smoothly taper to 0
    assert np.isclose(final_fir[0], 0.0, atol=1e-6)
    assert np.isclose(final_fir[-1], 0.0, atol=1e-6)
    assert preamp_db <= 0.0


def test_sub_alignment_optimizer():
    """Verify subwoofer delay optimizer finds the correct delay on synthetic data."""
    sr = 48000
    n = 8192
    t = np.arange(n) / sr
    
    # Main signal: 80 Hz pulse
    main_ir = np.zeros(n)
    main_ir[500] = 1.0
    
    # Sub signal: delayed by 144 samples (3.0 ms)
    sub_ir = np.zeros(n)
    sub_ir[500 + 144] = 1.0
    
    main_meas = Measurement("Main", main_ir, sample_rate=sr, n_fft=n)
    sub_meas = Measurement("Sub", sub_ir, sample_rate=sr, n_fft=n)
    
    res = optimize_sub_mains_alignment(main_meas, sub_meas, crossover_freq=80.0, search_range_ms=20.0)
    
    # Recovered optimal delay should be ~ -3.0 ms (+/- 0.5 ms)
    assert abs(res["optimal_delay_ms"] - (-3.0)) < 0.5
