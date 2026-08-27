"""
Comprehensive Test Suite for ALTAIR Advanced DSP & Psychoacoustic Modules.
Tests:
- Speed of sound temperature scaling c(T).
- Frequency-dependent Tikhonov regularization beta(f) curve.
- Farina non-linear swept-sine harmonic distortion separation.
- Dynamic SNR noise-floor masking & polar angle mic calibration.
- Homomorphic mixed-phase deconvolution.
- Group delay automated passive crossover detection.
- ITU-R BS.1770 4x oversampled true-peak detection.
- Multi-Subwoofer Optimization (MSO Matrix).
- Wavelet modal decay vs quarter-wave null classification.
"""

import pytest
import numpy as np
from scipy import signal

from auto_roomeq.dsp.advanced_dsp import (
    calculate_speed_of_sound,
    compute_frequency_dependent_beta,
    homomorphic_mixed_phase_split,
    detect_group_delay_crossovers,
    calculate_itu_r_bs1770_true_peak,
    generate_hybrid_iir_fir_split,
)
from auto_roomeq.dsp.farina import (
    farina_harmonic_separation,
    compute_snr_mask,
    apply_polar_diffraction_calibration,
)
from auto_roomeq.dsp.acoustic_analysis import (
    analyze_wavelet_modal_decay,
    compute_spatial_variance_weight,
    erb_smoothed_fast,
)
from auto_roomeq.dsp.sub_alignment import optimize_multi_sub_matrix
from auto_roomeq.dsp.measurement import Measurement


def test_temperature_speed_of_sound():
    """Verify physical speed of sound calculations across temperatures."""
    c_20 = calculate_speed_of_sound(20.0)
    c_0 = calculate_speed_of_sound(0.0)
    c_30 = calculate_speed_of_sound(30.0)
    
    assert np.isclose(c_20, 343.2, atol=0.5)
    assert np.isclose(c_0, 331.3, atol=0.5)
    assert c_30 > c_20 > c_0


def test_frequency_dependent_beta_curve():
    """Verify beta(f) profile maintains low beta in modal zone and high beta at boundaries."""
    freqs = np.geomspace(10.0, 24000.0, 500)
    beta_curve = compute_frequency_dependent_beta(freqs, beta_0=0.04, f_low=25.0, f_high=18000.0)
    
    assert len(beta_curve) == 500
    assert np.all(np.isfinite(beta_curve))
    
    # Modal band (60 Hz) should have lower regularization than midband
    idx_60 = int(np.argmin(np.abs(freqs - 60.0)))
    idx_1k = int(np.argmin(np.abs(freqs - 1000.0)))
    idx_15 = int(np.argmin(np.abs(freqs - 15.0)))
    idx_22k = int(np.argmin(np.abs(freqs - 22000.0)))
    
    assert beta_curve[idx_60] <= beta_curve[idx_1k]
    assert beta_curve[idx_15] > beta_curve[idx_1k]
    assert beta_curve[idx_22k] > beta_curve[idx_1k]


def test_farina_harmonic_separation():
    """Verify Farina separation windows out pre-arrival harmonic distortion peaks."""
    sr = 48000
    duration_s = 2.0
    t = np.arange(int(duration_s * sr)) / sr
    
    # Generate test sweep
    f1, f2 = 20.0, 20000.0
    phase = 2.0 * np.pi * f1 * duration_s / np.log(f2 / f1) * ((f2 / f1) ** (t / duration_s) - 1.0)
    test_sweep = np.sin(phase)
    
    # Add 2nd harmonic distortion (5%)
    distorted = test_sweep + 0.05 * np.sin(2.0 * phase)
    
    res = farina_harmonic_separation(distorted, f_start=f1, f_end=f2, sample_rate=sr, sweep_duration_s=duration_s)
    
    assert "linear_ir" in res
    assert "harmonics" in res
    assert "harmonic_2" in res["harmonics"]
    assert res["thd_percent"] >= 0.0


def test_snr_mask_and_polar_diffraction():
    """Verify dynamic SNR masking and 90-degree mic polar compensation."""
    sr = 48000
    n = 8192
    ir = np.zeros(n)
    ir[50] = 1.0
    ir += np.random.normal(0, 0.001, n)  # Noise floor
    
    freqs, snr_db, mask = compute_snr_mask(ir, sample_rate=sr, min_snr_db=15.0)
    assert len(mask) == len(freqs)
    assert np.all(mask >= 0.0) and np.all(mask <= 1.0)
    
    # Polar diffraction compensation
    H = np.ones(len(freqs), dtype=np.complex128)
    H_90 = apply_polar_diffraction_calibration(H, freqs, orientation_deg=90.0)
    assert np.abs(H_90[-1]) > np.abs(H[-1])  # 20kHz should be boosted to compensate 90-deg drop


def test_homomorphic_mixed_phase_split():
    """Verify complex cepstral minimum-phase / all-pass decomposition."""
    sr = 48000
    n = 4096
    ir = np.zeros(n)
    ir[20] = 1.0
    ir[50] = 0.3
    
    h_min, h_ap = homomorphic_mixed_phase_split(ir, n_fft=n)
    assert len(h_min) == n
    assert len(h_ap) == n
    assert np.all(np.isfinite(h_min))
    assert np.all(np.isfinite(h_ap))


def test_group_delay_crossover_detection():
    """Verify automated group delay crossover peak extraction on a 2-way loudspeaker system."""
    sr = 48000
    n = 16384
    
    # Model 2-way loudspeaker with LR4 crossover at 2200 Hz
    f_xo = 2200.0
    sos_lp = signal.butter(2, f_xo, btype='low', fs=sr, output='sos')
    sos_hp = signal.butter(2, f_xo, btype='high', fs=sr, output='sos')
    
    dirac = np.zeros(n)
    dirac[200] = 1.0
    ir_lp = signal.sosfilt(sos_lp, signal.sosfilt(sos_lp, dirac))
    # Add 0.15ms physical acoustic center delay on woofer relative to tweeter
    ir_hp = signal.sosfilt(sos_hp, signal.sosfilt(sos_hp, dirac))
    
    ir_speaker = ir_lp + np.roll(ir_hp, 8)  # Summed 2-way system
    
    crossovers = detect_group_delay_crossovers(ir_speaker, sample_rate=sr, search_band=(1000.0, 3500.0))
    assert len(crossovers) >= 1
    # Detected crossover should be near 2200 Hz (+/- 500 Hz)
    assert 1700.0 <= crossovers[0]["frequency_hz"] <= 2700.0


def test_itu_r_bs1770_true_peak():
    """Verify 4x oversampled true-peak detection."""
    ir = np.zeros(64)
    ir[30] = 0.95
    ir[31] = 0.95
    
    tp_dbfs = calculate_itu_r_bs1770_true_peak(ir, oversample_factor=4)
    assert np.isfinite(tp_dbfs)
    assert tp_dbfs > 20.0 * np.log10(0.95)


def test_multi_sub_matrix_optimizer():
    """Verify multi-sub matrix optimizer handles 3 subwoofers."""
    sr = 48000
    n = 8192
    
    sub1 = Measurement("Sub 1 (Front)", ir=np.random.normal(0, 0.05, n), sample_rate=sr, n_fft=n)
    sub2 = Measurement("Sub 2 (Rear)", ir=np.random.normal(0, 0.05, n), sample_rate=sr, n_fft=n)
    sub3 = Measurement("Sub 3 (Side)", ir=np.random.normal(0, 0.05, n), sample_rate=sr, n_fft=n)
    sub1.ir[10] = 1.0
    sub2.ir[25] = 0.9
    sub3.ir[35] = 0.8
    sub1.H = np.fft.rfft(sub1.ir, n=n)
    sub2.H = np.fft.rfft(sub2.ir, n=n)
    sub3.H = np.fft.rfft(sub3.ir, n=n)
    
    res = optimize_multi_sub_matrix([sub1, sub2, sub3], crossover_freq=80.0)
    assert res["sub_count"] == 3
    assert len(res["alignments"]) == 3
    assert res["alignments"][0]["delay_ms"] == 0.0


def test_wavelet_modal_decay_analysis():
    """Verify wavelet decay analyzer detects resonant modes."""
    sr = 48000
    n = 32768
    t = np.arange(n) / sr
    
    # 50 Hz mode ringing for 600ms
    ir_mode = np.exp(-3.0 * t) * np.sin(2.0 * np.pi * 50.0 * t)
    
    res = analyze_wavelet_modal_decay(ir_mode, sample_rate=sr, modal_freqs=[50.0, 120.0])
    assert len(res) == 2
    assert res[0]["freq_hz"] == 50.0
    assert res[0]["is_true_mode"] is True


def test_intelligent_impulse_stacking_and_outlier_rejection():
    """Verify intelligent stacking identifies reference candidate and rejects noisy outliers."""
    from auto_roomeq.dsp.acquisition import coherent_impulse_stack
    
    sr = 48000
    n = 4096
    clean_ir = np.zeros(n)
    clean_ir[200] = 1.0
    clean_ir[250] = -0.4
    
    # 4 clean repeats with slight noise
    repeats = [clean_ir + np.random.normal(0, 0.005, n) for _ in range(4)]
    # 1 outlier repeat corrupted by a burst (low correlation)
    corrupted_ir = np.random.normal(0, 0.5, n)
    repeats.append(corrupted_ir)
    
    stacked, snr_gain, diag = coherent_impulse_stack(repeats, sample_rate=sr, min_correlation_threshold=0.80, return_diagnostics=True)
    
    assert diag["total_count"] == 5
    assert diag["accepted_count"] == 4
    assert diag["rejection_rate_pct"] == 20.0
    assert diag["snr_improvement_db"] >= 5.0  # +6 dB theoretical from 4x stack
    assert len(diag["correlation_scores"]) == 5
    # Corrupted one has low correlation
    assert any(c < 0.80 for c in diag["correlation_scores"])


def test_acoustix_microphone_geometry_and_distances():
    """Verify physical mic offset and acoustic distance calculations (A1 Evo AcoustiCX style)."""
    from auto_roomeq.dsp.acoustic_analysis import calculate_microphone_geometry_offset
    
    # 0.638 ms delay difference (FR arrives 0.638 ms later than FL)
    geom = calculate_microphone_geometry_offset(
        lag_ms=0.638,
        speed_of_sound_mps=343.2,
        ref_distance_m=2.75,
        sub_delay_ms=16.5,
    )
    
    # Path difference ~ 218.9 mm -> offset ~ 109.5 mm left off center
    assert 105.0 <= geom["mic_off_center_mm"] <= 115.0
    assert geom["off_center_direction"] == "left"
    assert "left off-center" in geom["geometry_summary"].lower()
    
    dist = geom["distances"]
    assert dist["front_left"]["meters"] == 2.75
    assert abs(dist["front_left"]["feet"] - 9.02) < 0.1
    assert dist["front_right"]["meters"] > 2.75
    assert "subwoofer" in dist
    assert dist["subwoofer"]["meters"] > 5.0


def test_acoustix_crossover_snapping_and_split_gain():
    """Verify hardware crossover snapping and split gain staging."""
    from auto_roomeq.dsp.acoustic_analysis import calculate_snapped_crossover_pair, calculate_split_gain_staging
    
    # FL=57 Hz, FR=62 Hz -> avg 59.5 Hz -> snaps to 60 Hz
    xo = calculate_snapped_crossover_pair(left_rolloff_hz=57.0, right_rolloff_hz=62.0)
    assert xo["snapped_hardware_crossover_hz"] == 60
    assert "60Hz" in xo["summary"]
    
    # -5.32 dB global headroom -> -5.5 dB hardware, +0.18 dB DSP trim
    gain = calculate_split_gain_staging(target_attenuation_db=-5.32, step_size_db=0.5)
    assert gain["recommended_hardware_db"] == -5.5
    assert abs(gain["dsp_fine_trim_db"] - 0.18) < 0.01

