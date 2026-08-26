"""
Subwoofer + Mains Acoustic Time-Alignment and Phase Integration Optimizer.
Implements:
- Crossover bandpass filtering (e.g. Linkwitz-Riley 4th order at 80 Hz).
- Cross-correlation delay estimation and fine optimization across [-50ms, +50ms].
- Polarity optimization (positive vs inverted).
- Acoustic summation simulation across crossover overlap region (40 Hz - 160 Hz).
"""

from typing import Tuple, Dict, Optional
import numpy as np
from scipy import signal
from .measurement import Measurement


def optimize_sub_mains_alignment(
    main_meas: Measurement,
    sub_meas: Measurement,
    crossover_freq: float = 80.0,
    search_range_ms: float = 50.0,
    crossover_order: int = 4,
) -> Dict[str, any]:
    """
    Optimize subwoofer delay (ms) and polarity to maximize constructive acoustic summation
    with mains across the crossover region.
    
    Returns:
        Dictionary containing optimal delay (ms), polarity (+1 or -1), SPL summation curves,
        and acoustic alignment metrics.
    """
    sr = main_meas.sample_rate
    n_fft = max(main_meas.n_fft, sub_meas.n_fft)
    freqs = np.fft.rfftfreq(n_fft, d=1.0 / sr)
    
    # 1. Apply crossover filtering (LPF on Sub, HPF on Main)
    butter_order = max(1, crossover_order // 2)
    sos_lpf = signal.butter(butter_order, crossover_freq, btype='low', fs=sr, output='sos')
    sos_hpf = signal.butter(butter_order, crossover_freq, btype='high', fs=sr, output='sos')
    
    sub_filtered_ir = signal.sosfilt(sos_lpf, sub_meas.ir)
    main_filtered_ir = signal.sosfilt(sos_hpf, main_meas.ir)
    
    H_main_xo = np.fft.rfft(main_filtered_ir, n=n_fft)
    H_sub_xo = np.fft.rfft(sub_filtered_ir, n=n_fft)
    
    # 2. Focus on crossover overlap band (0.5 * fc to 2.0 * fc)
    f_low = max(20.0, crossover_freq * 0.5)
    f_high = min(sr * 0.45, crossover_freq * 2.0)
    band_mask = (freqs >= f_low) & (freqs <= f_high)
    
    # 3. Initial delay estimate via cross-correlation in crossover band
    n_search = int((search_range_ms / 1000.0) * sr)
    delay_candidates_samples = np.linspace(-n_search, n_search, 201, dtype=int)
    
    best_score = -1e9
    best_delay_samples = 0
    best_polarity = 1.0
    
    # Evaluate score: integrated SPL in crossover band minus penalty for deep dips
    for pol in [1.0, -1.0]:
        for d_samp in delay_candidates_samples:
            # Phase shift: exp(-j * 2*pi * f * dt)
            dt_s = d_samp / sr
            phase_shift = np.exp(-1j * 2.0 * np.pi * freqs[band_mask] * dt_s)
            H_sub_shifted = pol * H_sub_xo[band_mask] * phase_shift
            
            H_sum = H_main_xo[band_mask] + H_sub_shifted
            sum_spl_db = 20.0 * np.log10(np.maximum(np.abs(H_sum), 1e-12))
            
            # Objective: Maximize total SPL energy while penalizing severe cancellation dips
            mean_spl = np.mean(sum_spl_db)
            min_spl = np.min(sum_spl_db)
            score = mean_spl + 0.5 * min_spl
            
            if score > best_score:
                best_score = score
                best_delay_samples = int(d_samp)
                best_polarity = pol
                
    # Fine optimization within +/- 2 samples
    fine_delays = np.arange(best_delay_samples - 10, best_delay_samples + 11)
    for d_samp in fine_delays:
        dt_s = d_samp / sr
        phase_shift = np.exp(-1j * 2.0 * np.pi * freqs[band_mask] * dt_s)
        H_sub_shifted = best_polarity * H_sub_xo[band_mask] * phase_shift
        
        H_sum = H_main_xo[band_mask] + H_sub_shifted
        sum_spl_db = 20.0 * np.log10(np.maximum(np.abs(H_sum), 1e-12))
        score = np.mean(sum_spl_db) + 0.5 * np.min(sum_spl_db)
        
        if score > best_score:
            best_score = score
            best_delay_samples = int(d_samp)
            
    optimal_delay_ms = float((best_delay_samples / sr) * 1000.0)
    
    # 4. Generate before/after combined SPL curves across entire 20 Hz - 500 Hz band
    disp_mask = (freqs >= 20.0) & (freqs <= 500.0)
    disp_freqs = freqs[disp_mask]
    
    # Unaligned summation (0 ms delay, normal polarity)
    H_sum_unaligned = H_main_xo[disp_mask] + H_sub_xo[disp_mask]
    spl_unaligned = 20.0 * np.log10(np.maximum(np.abs(H_sum_unaligned), 1e-12))
    
    # Aligned summation
    dt_opt_s = best_delay_samples / sr
    shift_opt = np.exp(-1j * 2.0 * np.pi * disp_freqs * dt_opt_s)
    H_sum_aligned = H_main_xo[disp_mask] + (best_polarity * H_sub_xo[disp_mask] * shift_opt)
    spl_aligned = 20.0 * np.log10(np.maximum(np.abs(H_sum_aligned), 1e-12))
    
    spl_main_only = 20.0 * np.log10(np.maximum(np.abs(H_main_xo[disp_mask]), 1e-12))
    spl_sub_only = 20.0 * np.log10(np.maximum(np.abs(H_sub_xo[disp_mask]), 1e-12))
    
    gain_improvement_db = float(np.mean(spl_aligned) - np.mean(spl_unaligned))
    
    return {
        "optimal_delay_ms": round(optimal_delay_ms, 2),
        "optimal_delay_samples": int(best_delay_samples),
        "optimal_polarity": "Positive (+)" if best_polarity > 0 else "Inverted (-)",
        "polarity_multiplier": float(best_polarity),
        "crossover_freq_hz": float(crossover_freq),
        "gain_improvement_db": round(gain_improvement_db, 2),
        "freqs": disp_freqs.tolist(),
        "spl_unaligned_db": spl_unaligned.tolist(),
        "spl_aligned_db": spl_aligned.tolist(),
        "spl_main_only_db": spl_main_only.tolist(),
        "spl_sub_only_db": spl_sub_only.tolist(),
    }
