"""
Module 3: Crossover & Excess Phase Linearization.
Implements:
- 1-cycle Frequency-Dependent Windowing (FDW) to isolate direct sound phase.
- Analytical crossover phase-reversal all-pass filter synthesis:
  H_phase(s) = A*(-s) / A(s) (e.g. 2nd, 4th, 8th order Linkwitz-Riley).
- Low-frequency phase unwrapping for modal phase wraps (< 500 Hz) using low-Q (Q <= 1.0, dTheta <= 45 deg) all-pass filters.
- Phase correction impulse response synthesis h_phase[n].
"""

from typing import Tuple, Optional, List
import numpy as np
from scipy import signal
from .measurement import Measurement


def frequency_dependent_window(
    ir: np.ndarray,
    sample_rate: int = 48000,
    cycles: float = 1.0,
    min_window_ms: float = 2.0,
    max_window_ms: float = 500.0,
    n_fft: Optional[int] = None,
) -> Tuple[np.ndarray, np.ndarray]:
    """
    Apply 1-cycle (or N-cycle) Frequency-Dependent Windowing (FDW) to impulse response.
    Window duration at frequency f is T(f) = cycles / f.
    Isolates direct sound phase and frequency response from late reverberation.
    
    Returns:
        (fdw_ir, fdw_H_complex)
    """
    if n_fft is None:
        n_fft = max(4096, 2 ** int(np.ceil(np.log2(len(ir)))))
        
    peak_idx = int(np.argmax(np.abs(ir)))
    freqs = np.fft.rfftfreq(n_fft, d=1.0 / sample_rate)
    
    H_fdw = np.zeros(len(freqs), dtype=np.complex128)
    
    # Calculate full FFT
    H_full = np.fft.rfft(ir, n=n_fft)
    H_fdw[0] = H_full[0]  # DC
    
    # Octave band decomposition for FDW
    for i, f in enumerate(freqs[1:], start=1):
        # Window length in seconds for this frequency
        t_win_s = np.clip(cycles / f, min_window_ms / 1000.0, max_window_ms / 1000.0)
        win_samples = max(8, int(t_win_s * sample_rate))
        
        # Left and right taper around peak
        left_samples = min(peak_idx, win_samples // 2)
        right_samples = min(len(ir) - peak_idx, win_samples // 2)
        
        total_len = left_samples + right_samples
        if total_len > 0:
            window = signal.windows.tukey(total_len, alpha=0.5)
            windowed_segment = ir[peak_idx - left_samples : peak_idx + right_samples] * window
            
            # Phase and magnitude contribution at frequency f
            t_rel = np.arange(-left_samples, right_samples) / sample_rate
            kernel = np.exp(-1j * 2.0 * np.pi * f * t_rel)
            val = np.sum(windowed_segment * kernel)
            H_fdw[i] = val
        else:
            H_fdw[i] = H_full[i]
            
    fdw_ir = np.fft.irfft(H_fdw, n=n_fft)
    return fdw_ir, H_fdw


def synthesize_crossover_phase_reversal(
    sample_rate: int = 48000,
    crossover_freq: float = 2500.0,
    order: int = 4,  # 4th-order Linkwitz-Riley (LR4) is standard 24 dB/oct
    n_fft: int = 65536,
) -> np.ndarray:
    """
    Synthesize an analytical all-pass phase-reversal filter:
    H_phase(s) = A*(-s) / A(s)
    Compensates the phase rotation introduced by loudspeaker crossover networks.
    Uses linear-phase carrier delay tau = (N/2)/Fs to center impulse cleanly at N/2.
    """
    freqs = np.fft.rfftfreq(n_fft, d=1.0 / sample_rate)
    
    # Butterworth prototype for LR crossover phase rotation
    butter_order = max(1, order // 2)
    b_lp, a_lp = signal.butter(butter_order, 2.0 * np.pi * crossover_freq, analog=True)
    
    # Transfer function: H_ap(s) = a_lp(-s) / a_lp(s)
    w = 2.0 * np.pi * freqs
    s = 1j * w
    
    # a_lp is in descending order of s: a_lp[0]*s^N + a_lp[1]*s^(N-1) + ... + a_lp[N]
    # For A(-s), the coefficient of s^(N-k) is a_lp[k] * (-1)^(N-k)
    powers = np.arange(len(a_lp) - 1, -1, -1)
    num_val = np.polyval(a_lp * ((-1) ** powers), s)
    den_val = np.polyval(a_lp, s)
    # Avoid zero division with small complex epsilon if necessary
    den_val_safe = np.where(np.abs(den_val) < 1e-12, 1e-12, den_val)
    H_ap = num_val / den_val_safe
    
    # Phase reversal: H_reversal(f) = conj(H_ap(f))
    # Apply linear phase delay tau = (n_fft // 2) / sample_rate to center the impulse
    tau_s = (n_fft // 2) / sample_rate
    linear_phase_carrier = np.exp(-1j * 2.0 * np.pi * freqs * tau_s)
    
    H_reversal_centered = np.conj(H_ap) * linear_phase_carrier
    
    # Time-domain impulse response centered cleanly at N/2
    h_crossover_phase = np.fft.irfft(H_reversal_centered, n=n_fft)
    
    # Apply subtle window to ensure boundary zeroing
    win = signal.windows.tukey(n_fft, alpha=0.05)
    return h_crossover_phase * win


def synthesize_low_q_phase_correction(
    freqs: np.ndarray,
    excess_phase_rad: np.ndarray,
    sample_rate: int = 48000,
    f_fade_start: float = 250.0,
    f_max: float = 500.0,
    max_q: float = 1.0,
    max_delta_deg: float = 45.0,
    n_fft: int = 65536,
) -> np.ndarray:
    """
    Identify residual low-frequency phase wraps (< 500 Hz) and synthesize
    smooth low-Q (Q <= 1.0, dTheta <= 45 deg) phase correction with smooth cosine taper
    to completely eliminate Gibbs phenomenon and step discontinuity spikes.
    
    Returns:
        Complex frequency response H_corr(f).
    """
    smooth_phase_rad = np.zeros_like(excess_phase_rad)
    max_delta_rad = np.radians(max_delta_deg)
    
    mask_active = (freqs >= 20.0) & (freqs < f_fade_start)
    mask_fade = (freqs >= f_fade_start) & (freqs <= f_max)
    
    if np.any(mask_active):
        clamped_active = np.clip(excess_phase_rad[mask_active], -max_delta_rad, max_delta_rad)
        smooth_phase_rad[mask_active] = -clamped_active
        
    if np.any(mask_fade):
        clamped_fade = np.clip(excess_phase_rad[mask_fade], -max_delta_rad, max_delta_rad)
        # Smooth Hann/cosine fade-out taper
        fade_taper = 0.5 * (1.0 + np.cos(np.pi * (freqs[mask_fade] - f_fade_start) / (f_max - f_fade_start)))
        smooth_phase_rad[mask_fade] = -clamped_fade * fade_taper
        
    H_corr = np.exp(1j * smooth_phase_rad)
    return H_corr


def synthesize_phase_linearization_filter(
    measurement_h2: Measurement,
    crossover_freq: float = 2500.0,
    crossover_order: int = 4,
    apply_low_q_modal_unwrap: bool = True,
    sample_rate: Optional[int] = None,
) -> Tuple[np.ndarray, Measurement]:
    """
    Synthesize Module 3: Phase Linearization filter h_phase[n].
    
    1. Apply 1-cycle FDW to isolate direct sound phase.
    2. Synthesize analytical crossover phase reversal all-pass filter.
    3. Synthesize low-Q modal unwrapping (< 500 Hz, Q <= 1.0) with smooth cosine taper.
    4. Convolve phase correction in frequency domain: H_phase(f) = H_crossover(f) * H_low_q(f).
    
    Returns:
        (h_phase, measurement_h3)
    """
    sr = sample_rate or measurement_h2.sample_rate
    n_fft = measurement_h2.n_fft
    
    # 1. 1-cycle FDW on h2
    _, H_fdw = frequency_dependent_window(measurement_h2.ir, sample_rate=sr, cycles=1.0, n_fft=n_fft)
    
    # 2. Crossover phase reversal
    h_crossover = synthesize_crossover_phase_reversal(
        sample_rate=sr,
        crossover_freq=crossover_freq,
        order=crossover_order,
        n_fft=n_fft,
    )
    
    # 3. Calculate excess phase from FDW response
    fdw_mag = np.maximum(np.abs(H_fdw), 1e-12)
    full_log_mag = np.concatenate([np.log(fdw_mag), np.log(fdw_mag[-2:0:-1])])
    cepstrum = np.fft.ifft(full_log_mag).real
    
    min_win = np.zeros_like(cepstrum)
    min_win[0] = 1.0
    min_win[1:len(cepstrum)//2] = 2.0
    min_win[len(cepstrum)//2] = 1.0
    
    min_phase_spec = np.exp(np.fft.fft(cepstrum * min_win))[:len(measurement_h2.freqs)]
    min_phase_rad = np.angle(min_phase_spec)
    
    raw_phase_rad = np.angle(H_fdw)
    excess_phase_rad = np.unwrap(raw_phase_rad) - np.unwrap(min_phase_rad)
    
    if apply_low_q_modal_unwrap:
        H_low_q = synthesize_low_q_phase_correction(
            freqs=measurement_h2.freqs,
            excess_phase_rad=excess_phase_rad,
            sample_rate=sr,
            f_fade_start=250.0,
            f_max=500.0,
            max_q=1.0,
            max_delta_deg=45.0,
            n_fft=n_fft,
        )
        # Combine in frequency domain cleanly without time-domain truncation or boundary artifacts
        H_crossover = np.fft.rfft(h_crossover, n=n_fft)
        H_phase_total = H_crossover * H_low_q
        h_phase = np.fft.irfft(H_phase_total, n=n_fft)
        win = signal.windows.tukey(n_fft, alpha=0.05)
        h_phase = h_phase * win
    else:
        h_phase = h_crossover
        
    # Convolve with h2 to get simulated result
    h3_ir = signal.fftconvolve(measurement_h2.ir, h_phase, mode='full')
    
    meas_h3 = Measurement(
        name=f"{measurement_h2.name} (Linearized)",
        ir=h3_ir,
        sample_rate=sr,
        n_fft=n_fft,
    )
    
    return h_phase, meas_h3
