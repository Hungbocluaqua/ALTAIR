"""
Module 2: Regularized Magnitude Inversion & Minimum-Phase Synthesis.
Implements:
- Tikhonov regularized deconvolution:
  H_inv(f) = (T(f) * H_1*(f)) / (|H_1(f)|^2 + beta(f) * |T(f)|^2)
- Asymmetric boost/cut constraints:
  - Strict boost ceiling: <= +5.0 dB maximum on anti-resonance dips.
  - Full downward attenuation: down to -20.0 dB on modal peaks.
- Real cepstrum / discrete Hilbert transform minimum-phase extraction:
  phi_min(f) = -H{ ln |H_inv(f)| }
- Convolution and pre-filtered response: h_2[n] = h_1[n] * h_inv,min[n].
"""

from typing import Tuple, Optional
import numpy as np
from scipy import signal
from .measurement import Measurement


def tikhonov_magnitude_inversion(
    H_1: np.ndarray,
    target_mag_linear: np.ndarray,
    freqs: np.ndarray,
    beta: float = 0.08,
    max_boost_db: float = 5.0,
    max_cut_db: float = 20.0,
    f_low_limit: float = 15.0,
    f_high_limit: float = 20000.0,
) -> np.ndarray:
    """
    Perform Tikhonov regularized magnitude inversion with asymmetric boost/cut constraints.
    
    Args:
        H_1: Complex frequency response of pre-filtered measurement.
        target_mag_linear: Linear magnitude target |T(f)|.
        freqs: Frequency array in Hz.
        beta: Regularization factor (default 0.08 = 8% regularization).
        max_boost_db: Maximum allowable boost on dips (default +5 dB).
        max_cut_db: Maximum downward cut on modal peaks (default -20 dB).
        f_low_limit: Lower frequency boundary for correction.
        f_high_limit: Upper frequency boundary for correction.
        
    Returns:
        Complex frequency response of the regularized inversion filter H_inv(f).
    """
    H_mag = np.abs(H_1)
    
    # Frequency-dependent regularization parameter beta(f)
    # Increase regularization below f_low_limit and above f_high_limit to smoothly roll off
    beta_f = np.full_like(freqs, beta, dtype=np.float64)
    
    # Low frequency smooth roll-off
    low_mask = freqs < f_low_limit
    if np.any(low_mask):
        beta_f[low_mask] = 1.0 - 0.92 * np.clip(freqs[low_mask] / f_low_limit, 0.0, 1.0)
        
    # High frequency smooth roll-off
    high_mask = freqs > f_high_limit
    if np.any(high_mask):
        beta_f[high_mask] = 1.0
        
    # Tikhonov regularized deconvolution formula
    # H_inv(f) = (T(f) * H_1*(f)) / (|H_1(f)|^2 + beta(f) * |T(f)|^2)
    denom = (H_mag ** 2) + beta_f * (target_mag_linear ** 2) + 1e-12
    H_inv = (target_mag_linear * np.conj(H_1)) / denom
    
    # Extract magnitude and clamp to asymmetric constraints
    inv_mag = np.abs(H_inv)
    inv_mag_db = 20.0 * np.log10(np.maximum(inv_mag, 1e-12))
    
    # Reference 0 dB gain baseline
    # Max boost constraint: <= +5.0 dB
    # Max cut constraint: >= -20.0 dB
    inv_mag_db_clamped = np.clip(inv_mag_db, -max_cut_db, max_boost_db)
    
    # Smooth roll-off at infrasonic and ultrasonic boundaries to 0 dB
    if np.any(low_mask):
        alpha_low = np.clip(freqs[low_mask] / f_low_limit, 0.0, 1.0)
        inv_mag_db_clamped[low_mask] = inv_mag_db_clamped[low_mask] * alpha_low
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
    # log_mag corresponds to rfftfreq [0 ... N/2]
    full_log_mag = np.concatenate([log_mag, log_mag[-2:0:-1]])
    
    # Real cepstrum
    cepstrum = np.fft.ifft(full_log_mag).real
    
    # Causal minimum-phase window in cepstral domain
    # c_min[0] = c[0], c_min[n] = 2*c[n] for 1 <= n < N/2, c_min[N/2] = c[N/2], c_min[n] = 0 for n > N/2
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
    beta: float = 0.08,
    max_boost_db: float = 5.0,
    max_cut_db: float = 20.0,
    f_low_limit: float = 20.0,
    f_high_limit: float = 20000.0,
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
    )
    
    # Extract minimum phase
    inv_mag_linear = np.abs(H_inv_raw)
    H_inv_min, h_inv_min = extract_minimum_phase(inv_mag_linear, n_fft=measurement_h1.n_fft)
    
    # Normalize peak gain to 0 dBFS max
    max_peak = np.max(np.abs(h_inv_min))
    if max_peak > 1.0:
        h_inv_min = h_inv_min / max_peak
        H_inv_min = np.fft.rfft(h_inv_min, n=measurement_h1.n_fft)
        
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
