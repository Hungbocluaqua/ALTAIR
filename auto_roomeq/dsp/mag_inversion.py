"""
Module 2: Regularized Magnitude Inversion & Minimum-Phase Synthesis for ALTAIR.
Implements:
- Frequency-dependent Tikhonov regularized deconvolution:
  H_inv(f) = (T(f) * H_1*(f)) / (|H_1(f)|^2 + beta(f) * |T(f)|^2)
- Dynamic SNR noise-floor masking.
- Asymmetric boost/cut constraints:
  - Strict boost ceiling: <= +5.0 dB maximum on anti-resonance dips.
  - Full downward attenuation: down to -20.0 dB on modal peaks.
- Real cepstrum / discrete Hilbert transform minimum-phase extraction:
  phi_min(f) = -H{ ln |H_inv(f)| }
- Convolution and pre-filtered response: h_2[n] = h_1[n] * h_inv,min[n].
"""

from typing import Tuple, Optional, Union
import numpy as np
from scipy import signal
from .measurement import Measurement
from .advanced_dsp import compute_frequency_dependent_beta


def tikhonov_magnitude_inversion(
    H_1: np.ndarray,
    target_mag_linear: np.ndarray,
    freqs: np.ndarray,
    beta: Union[float, np.ndarray] = 0.04,
    max_boost_db: float = 5.0,
    max_cut_db: float = 20.0,
    f_low_limit: float = 15.0,
    f_high_limit: float = 20000.0,
    snr_mask: Optional[np.ndarray] = None,
    spatial_variance_weights: Optional[np.ndarray] = None,
    forced_neutral_mask: Optional[np.ndarray] = None,
) -> np.ndarray:
    """
    Perform Tikhonov regularized magnitude inversion with continuous frequency-dependent beta(f),
    asymmetric boost/cut constraints, SNR noise-floor masking, and spatial variance weighting.
    
    Args:
        H_1: Complex frequency response of pre-filtered measurement.
        target_mag_linear: Linear magnitude target |T(f)|.
        freqs: Frequency array in Hz.
        beta: Regularization factor (float or precomputed beta(f) array).
        max_boost_db: Maximum allowable boost on dips (default +5 dB).
        max_cut_db: Maximum downward cut on modal peaks (default -20 dB).
        f_low_limit: Lower frequency boundary for correction.
        f_high_limit: Upper frequency boundary for correction.
        snr_mask: Optional [0.0 to 1.0] SNR confidence mask.
        spatial_variance_weights: Optional [0.0 to 1.0] multi-seat spatial variance weights.
        forced_neutral_mask: Optional boolean/0-1 array. Where True, the correction is forced to
            0 dB — the mathematical equivalent of beta(f) -> infinity. Used to hard-block correction
            at non-minimum-phase SBIR boundary nulls and fast-decay (non-modal) cancellation dips
            that must never be boosted.
        
    Returns:
        Complex frequency response of the regularized inversion filter H_inv(f).
    """
    H_mag = np.abs(H_1)
    
    # Generate continuous frequency-dependent beta(f) if float provided
    if isinstance(beta, (int, float)):
        beta_f = compute_frequency_dependent_beta(
            freqs=freqs,
            beta_0=float(beta),
            f_low=f_low_limit,
            f_high=f_high_limit,
        )
    else:
        beta_f = np.asarray(beta, dtype=np.float64).copy()
        
    # Scale regularization by spatial variance: high variance (localized nulls) increases beta -> prevents sweet-spot overfitting
    if spatial_variance_weights is not None and len(spatial_variance_weights) == len(freqs):
        beta_f = beta_f / np.clip(spatial_variance_weights, 0.1, 1.0)
        
    # Tikhonov regularized deconvolution formula
    # H_inv(f) = (T(f) * H_1*(f)) / (|H_1(f)|^2 + beta(f) * |T(f)|^2)
    denom = (H_mag ** 2) + beta_f * (target_mag_linear ** 2) + 1e-12
    H_inv = (target_mag_linear * np.conj(H_1)) / denom
    
    # Extract magnitude and clamp to asymmetric constraints
    inv_mag = np.abs(H_inv)
    inv_mag_db = 20.0 * np.log10(np.maximum(inv_mag, 1e-12))
    
    # Apply asymmetric constraints (+5 dB max boost, -20 dB max cuts)
    inv_mag_db_clamped = np.clip(inv_mag_db, -max_cut_db, max_boost_db)
    
    # Apply SNR noise-floor mask if provided
    if snr_mask is not None and len(snr_mask) == len(freqs):
        # Blend toward 0 dB (no EQ) where SNR is low
        inv_mag_db_clamped = inv_mag_db_clamped * np.clip(snr_mask, 0.0, 1.0)

    # Hard neutral mask: force 0 dB correction (beta -> infinity) at flagged frequencies
    # (non-minimum-phase SBIR nulls, fast-decay non-modal dips). Applied after the other
    # masks so that no amount of regularization scaling can re-open the boost.
    if forced_neutral_mask is not None and len(forced_neutral_mask) == len(freqs):
        inv_mag_db_clamped = np.where(
            np.asarray(forced_neutral_mask, dtype=np.float64) > 0.5, 0.0, inv_mag_db_clamped
        )
        
    # Smooth roll-off at infrasonic and ultrasonic boundaries to 0 dB
    low_mask = freqs < f_low_limit
    if np.any(low_mask):
        alpha_low = np.clip(freqs[low_mask] / max(f_low_limit, 1.0), 0.0, 1.0)
        inv_mag_db_clamped[low_mask] = inv_mag_db_clamped[low_mask] * alpha_low
        
    high_mask = freqs > f_high_limit
    if np.any(high_mask):
        inv_mag_db_clamped[high_mask] = 0.0
        
    inv_mag_linear = 10.0 ** (inv_mag_db_clamped / 20.0)
    
    # Keep phase of H_inv (or prepare for minimum-phase conversion)
    inv_phase = np.angle(H_inv)
    return inv_mag_linear * np.exp(1j * inv_phase)


def extract_minimum_phase(mag_linear: np.ndarray, n_fft: int) -> Tuple[np.ndarray, np.ndarray]:
    """
    Extract minimum-phase response using real cepstrum / Hilbert transform of ln|H|.
    phi_min(f) = -H{ ln |H(f)| }
    
    Returns:
        (H_min_complex, h_min_impulse)
    """
    # Safeguard against zero or negative values
    clamped_mag = np.maximum(mag_linear, 1e-12)
    log_mag = np.log(clamped_mag)
    
    # Reconstruct full two-sided spectrum for real IFFT
    full_log_mag = np.concatenate([log_mag, log_mag[-2:0:-1]])
    
    # Real cepstrum
    cepstrum = np.fft.ifft(full_log_mag).real
    
    # Causal minimum-phase window in cepstral domain
    min_win = np.zeros(len(cepstrum), dtype=np.float64)
    n_half = len(cepstrum) // 2
    min_win[0] = 1.0
    min_win[1:n_half] = 2.0
    min_win[n_half] = 1.0
    
    min_cepstrum = cepstrum * min_win
    
    # Complex frequency response with minimum phase
    min_phase_spec = np.exp(np.fft.fft(min_cepstrum))
    H_min = min_phase_spec[:len(mag_linear)]
    
    # Time-domain minimum-phase impulse response
    h_min = np.fft.irfft(H_min, n=n_fft)
    
    return H_min, h_min


def synthesize_mag_inversion_filter(
    measurement_h1: Measurement,
    target_spl_db: np.ndarray,
    beta: Union[float, np.ndarray] = 0.04,
    max_boost_db: float = 5.0,
    max_cut_db: float = 20.0,
    f_low_limit: float = 20.0,
    f_high_limit: float = 20000.0,
    snr_mask: Optional[np.ndarray] = None,
    spatial_variance_weights: Optional[np.ndarray] = None,
    forced_neutral_mask: Optional[np.ndarray] = None,
) -> Tuple[np.ndarray, Measurement, np.ndarray]:
    """
    Synthesize Module 2 magnitude inversion filter.
    
    1. Tikhonov regularized deconvolution with +5 dB max boost ceiling and -20 dB cuts.
    2. Convert to minimum phase via real cepstrum / Hilbert transform.
    3. Convolve with measurement: h_2[n] = h_1[n] * h_inv,min[n].
    
    Returns:
        (h_inv_min, measurement_h2, H_inv_mag_db)
    """
    target_mag_linear = 10.0 ** (target_spl_db / 20.0)
    
    # Tikhonov inversion
    H_inv_raw = tikhonov_magnitude_inversion(
        H_1=measurement_h1.H,
        target_mag_linear=target_mag_linear,
        freqs=measurement_h1.freqs,
        beta=beta,
        max_boost_db=max_boost_db,
        max_cut_db=max_cut_db,
        f_low_limit=f_low_limit,
        f_high_limit=f_high_limit,
        snr_mask=snr_mask,
        spatial_variance_weights=spatial_variance_weights,
        forced_neutral_mask=forced_neutral_mask,
    )
    
    # Extract minimum phase
    inv_mag_linear = np.abs(H_inv_raw)
    H_inv_min, h_inv_min = extract_minimum_phase(inv_mag_linear, n_fft=measurement_h1.n_fft)
    
    # Pre-filter response: h_2[n] = h_1[n] * h_inv,min[n]
    h2_ir = signal.fftconvolve(measurement_h1.ir, h_inv_min, mode='full')
    
    meas_h2 = Measurement(
        name=f"{measurement_h1.name} (Post-MagInv)",
        ir=h2_ir,
        sample_rate=measurement_h1.sample_rate,
        n_fft=measurement_h1.n_fft,
    )
    
    H_inv_mag_db = 20.0 * np.log10(np.maximum(np.abs(H_inv_min), 1e-12))
    
    return h_inv_min, meas_h2, H_inv_mag_db
