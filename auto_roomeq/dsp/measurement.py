"""
Measurement Data Model & Spatial Averaging Module for ALTAIR.
Implements:
- Measurement data class with complete frequency, phase, group delay, and step response properties.
- Cross-correlation acoustic timing alignment: tau = argmax (h1 * h2)(t).
- Vector averaging: H_avg(f) = (1/N) * sum(H_i(f)).
- RMS magnitude averaging.
- Hybrid spatial averaging (vector below Schroeder/transition freq, RMS above).
- Parsers for REW text exports (.txt, .frd, .csv) and WAV impulse responses.
"""

from typing import List, Tuple, Optional, Union
import numpy as np
import io


class Measurement:
    """
    Represents an acoustic room impulse response or frequency measurement.
    """

    def __init__(
        self,
        name: str,
        ir: np.ndarray,
        sample_rate: int = 48000,
        n_fft: Optional[int] = None,
    ):
        self.name = name
        self.sample_rate = int(sample_rate)
        
        ir_arr = np.asarray(ir, dtype=np.float64)
        if len(ir_arr) == 0:
            ir_arr = np.zeros(4096, dtype=np.float64)
            
        if not np.all(np.isfinite(ir_arr)):
            ir_arr = np.nan_to_num(ir_arr)
            
        self.ir = ir_arr
        
        # Determine FFT size (power of 2, at least length of IR)
        if n_fft is None:
            self.n_fft = max(4096, 2 ** int(np.ceil(np.log2(max(len(self.ir), 4096)))))
        else:
            self.n_fft = int(n_fft)
            
        self._compute_spectral_properties()

    def _compute_spectral_properties(self):
        """Compute FFT, complex frequency response, SPL, phase, group delay, and step response."""
        # Frequency vector
        self.freqs = np.fft.rfftfreq(self.n_fft, d=1.0 / self.sample_rate)
        
        # Complex frequency response
        self.H = np.fft.rfft(self.ir, n=self.n_fft)
        
        # Magnitude in dB SPL (normalized relative to max or RMS)
        mag = np.abs(self.H)
        mag_clamped = np.maximum(mag, 1e-12)
        self.spl_db = 20.0 * np.log10(mag_clamped)
        
        # Phase properties
        self.phase_rad = np.angle(self.H)
        self.phase_deg = np.degrees(self.phase_rad)
        self.unwrapped_phase_rad = np.unwrap(self.phase_rad)
        self.unwrapped_phase_deg = np.degrees(self.unwrapped_phase_rad)
        
        # Group delay: tau_g = - d(unwrapped_phase) / d(omega)
        d_omega = 2.0 * np.pi * (self.freqs[1] - self.freqs[0]) if len(self.freqs) > 1 else 1.0
        d_phase = np.gradient(self.unwrapped_phase_rad)
        self.group_delay_ms = - (d_phase / max(d_omega, 1e-12)) * 1000.0
        
        # Step response: s[n] = sum_{m=0}^n h[m]
        self.step_response = np.cumsum(self.ir)
        if np.max(np.abs(self.step_response)) > 1e-12:
            self.step_response_normalized = self.step_response / np.max(np.abs(self.step_response))
        else:
            self.step_response_normalized = self.step_response.copy()
            
        # Peak location
        self.peak_idx = int(np.argmax(np.abs(self.ir))) if len(self.ir) > 0 else 0
        self.peak_time_ms = (self.peak_idx / self.sample_rate) * 1000.0

    def get_spl_interpolated(self, target_freqs: np.ndarray) -> np.ndarray:
        """Interpolate SPL dB onto a specified frequency grid (e.g. log-spaced)."""
        return np.interp(target_freqs, self.freqs, self.spl_db, left=self.spl_db[0], right=self.spl_db[-1])

    def get_phase_interpolated(self, target_freqs: np.ndarray, unwrapped: bool = True) -> np.ndarray:
        """Interpolate phase onto a specified frequency grid."""
        source_phase = self.unwrapped_phase_deg if unwrapped else self.phase_deg
        return np.interp(target_freqs, self.freqs, source_phase, left=source_phase[0], right=source_phase[-1])


def cross_correlate_align(
    ref_ir: np.ndarray,
    target_ir: np.ndarray,
    sample_rate: int = 48000,
    max_lag_ms: float = 50.0,
    enable_subsample: bool = True,
) -> Tuple[np.ndarray, float, float]:
    """
    Align target_ir to ref_ir using cross-correlation with sub-sample fractional precision:
    tau = argmax (h1 * h2)(t) + delta_subsample.
    
    Uses 3-point parabolic peak interpolation and Fourier fractional phase shifting:
    H_aligned(f) = H_target(f) * exp(-j * 2*pi * f * tau_frac / Fs)
    
    Returns:
        (aligned_target_ir, lag_samples_float, lag_ms)
    """
    max_lag_samples = int((max_lag_ms / 1000.0) * sample_rate)
    
    # Compute cross-correlation via FFT
    n = len(ref_ir) + len(target_ir) - 1
    n_fft = max(4096, 2 ** int(np.ceil(np.log2(max(n, 1)))))
    
    R = np.fft.ifft(np.fft.fft(ref_ir, n_fft) * np.conj(np.fft.fft(target_ir, n_fft)))
    R = np.real(R)
    
    # Shift zero lag to center
    lags = np.arange(-len(target_ir) + 1, len(ref_ir))
    corr = np.concatenate([R[-(len(target_ir) - 1):], R[:len(ref_ir)]])
    
    # Restrict to search window
    valid_mask = np.abs(lags) <= max_lag_samples
    if np.any(valid_mask):
        sub_lags = lags[valid_mask]
        sub_corr = corr[valid_mask]
        best_lag_idx = int(np.argmax(sub_corr))
        raw_lag_samples = float(sub_lags[best_lag_idx])
        
        # Sub-sample parabolic interpolation around correlation peak
        delta_subsample = 0.0
        if enable_subsample and 0 < best_lag_idx < len(sub_corr) - 1:
            y_prev = float(sub_corr[best_lag_idx - 1])
            y_peak = float(sub_corr[best_lag_idx])
            y_next = float(sub_corr[best_lag_idx + 1])
            denom = 2.0 * (y_prev - 2.0 * y_peak + y_next)
            if abs(denom) > 1e-12:
                delta = (y_prev - y_next) / denom
                delta_subsample = float(np.clip(delta, -0.5, 0.5))
                
        lag_samples = raw_lag_samples + delta_subsample
    else:
        lag_samples = float(lags[np.argmax(corr)])
        
    lag_ms = float((lag_samples / sample_rate) * 1000.0)
    
    # High-precision fractional delay shift in frequency domain
    if abs(lag_samples) > 1e-5:
        target_len = len(target_ir)
        n_shift_fft = max(target_len * 2, 8192)
        H_target = np.fft.rfft(target_ir, n=n_shift_fft)
        shift_freqs = np.fft.rfftfreq(n_shift_fft, d=1.0 / sample_rate)
        
        # Phase shift: exp(-1j * 2*pi * f * dt) shifts signal by lag_samples
        dt_s = lag_samples / sample_rate
        phase_shift = np.exp(-1j * 2.0 * np.pi * shift_freqs * dt_s)
        aligned_full = np.fft.irfft(H_target * phase_shift, n=n_shift_fft)
        aligned_ir = aligned_full[:target_len]
    else:
        aligned_ir = target_ir.copy()
        
    return aligned_ir, lag_samples, lag_ms


def vector_average(measurements: List[Measurement], name: str = "Vector Average") -> Measurement:
    """
    Compute complex vector average across multiple measurements:
    H_avg(f) = (1/N) * sum(H_i(f))
    """
    if not measurements:
        raise ValueError("Cannot average empty measurement list.")
    if len(measurements) == 1:
        return measurements[0]
        
    sample_rate = measurements[0].sample_rate
    n_fft = max(m.n_fft for m in measurements)
    ref_ir = measurements[0].ir
    
    # Align each measurement to reference
    aligned_Hs = []
    for m in measurements:
        aligned_ir, _, _ = cross_correlate_align(ref_ir, m.ir, sample_rate=sample_rate)
        H = np.fft.rfft(aligned_ir, n=n_fft)
        aligned_Hs.append(H)
        
    # Vector mean in frequency domain
    H_avg = np.mean(aligned_Hs, axis=0)
    
    # Transform back to time-domain impulse response
    ir_avg = np.fft.irfft(H_avg, n=n_fft)
    
    # Trim to reasonable length
    max_len = max(len(m.ir) for m in measurements)
    ir_avg = ir_avg[:max(1, max_len)]
    
    return Measurement(name=name, ir=ir_avg, sample_rate=sample_rate, n_fft=n_fft)


def rms_magnitude_average(measurements: List[Measurement]) -> Tuple[np.ndarray, np.ndarray]:
    """
    Compute RMS magnitude average (dB average) across measurements:
    SPL_avg(f) = 10 * log10((1/N) * sum(10^(SPL_i(f)/10)))
    
    Returns:
        (freqs, spl_avg_db)
    """
    if not measurements:
        raise ValueError("Cannot average empty measurement list.")
        
    freqs = measurements[0].freqs
    linear_powers = [10.0 ** (m.spl_db / 10.0) for m in measurements]
    avg_power = np.mean(linear_powers, axis=0)
    spl_avg_db = 10.0 * np.log10(np.maximum(avg_power, 1e-12))
    return freqs, spl_avg_db


def hybrid_spatial_average(
    measurements: List[Measurement],
    f_trans: float = 300.0,
    name: str = "Hybrid Spatial Average",
) -> Measurement:
    """
    Compute hybrid spatial average:
    - Vector averaging below f_trans (coherent modal region).
    - RMS magnitude averaging above f_trans (diffuse field, prevents comb-filtering cancellation).
    """
    if len(measurements) <= 1:
        return vector_average(measurements, name=name)
        
    vec_avg = vector_average(measurements, name="TempVec")
    freqs, rms_spl = rms_magnitude_average(measurements)
    
    # Combine magnitudes with smooth transition
    mag_vec = np.abs(vec_avg.H)
    mag_rms = 10.0 ** (rms_spl / 20.0)
    
    # Sigmoid transition weight centered at f_trans
    transition_width = max(50.0, f_trans * 0.2)
    weight_rms = 1.0 / (1.0 + np.exp(-(freqs - f_trans) / (transition_width / 4.0)))
    weight_vec = 1.0 - weight_rms
    
    combined_mag = weight_vec * mag_vec + weight_rms * mag_rms
    
    # Reconstruct minimum phase using Hilbert transform of ln|H|
    log_mag = np.log(np.maximum(combined_mag, 1e-12))
    n_fft = vec_avg.n_fft
    
    # Full two-sided log magnitude spectrum for Hilbert
    full_log_mag = np.concatenate([log_mag, log_mag[-2:0:-1]])
    cepstrum = np.fft.ifft(full_log_mag).real
    
    # Minimum phase cepstral window
    min_phase_window = np.zeros_like(cepstrum)
    min_phase_window[0] = 1.0
    min_phase_window[1:len(cepstrum)//2] = 2.0
    min_phase_window[len(cepstrum)//2] = 1.0
    
    min_phase_cep = cepstrum * min_phase_window
    min_phase_spectrum = np.exp(np.fft.fft(min_phase_cep))
    
    H_hybrid = min_phase_spectrum[:len(freqs)]
    ir_hybrid = np.fft.irfft(H_hybrid, n=n_fft)
    
    return Measurement(name=name, ir=ir_hybrid, sample_rate=vec_avg.sample_rate, n_fft=n_fft)


def parse_rew_text(
    content_or_path: str,
    sample_rate: int = 48000,
    name: str = "REW Measurement",
    n_fft: int = 65536,
) -> Measurement:
    """
    Parse a REW exported text measurement (Frequency, SPL, Phase).
    Reconstructs complex frequency response and time-domain impulse response.
    """
    lines = []
    if "\n" in content_or_path:
        lines = content_or_path.strip().splitlines()
    else:
        try:
            with open(content_or_path, "r", encoding="utf-8", errors="ignore") as f:
                lines = f.readlines()
        except Exception as e:
            raise ValueError(f"Could not read measurement file '{content_or_path}': {str(e)}")
            
    raw_freqs = []
    raw_spl = []
    raw_phase = []
    
    for line in lines:
        line = line.strip()
        if not line or line.startswith("*") or line.startswith("#") or line.startswith(";"):
            continue
        parts = line.replace(",", " ").replace("\t", " ").split()
        if len(parts) >= 2:
            try:
                f_val = float(parts[0])
                spl_val = float(parts[1])
                phase_val = float(parts[2]) if len(parts) >= 3 else 0.0
                raw_freqs.append(f_val)
                raw_spl.append(spl_val)
                raw_phase.append(phase_val)
            except ValueError:
                continue
                
    if len(raw_freqs) < 5:
        raise ValueError(f"Insufficient measurement data points found: {len(raw_freqs)}")
        
    src_freqs = np.array(raw_freqs, dtype=np.float64)
    src_spl = np.array(raw_spl, dtype=np.float64)
    src_phase = np.array(raw_phase, dtype=np.float64)
    
    # Sort
    idx = np.argsort(src_freqs)
    src_freqs, src_spl, src_phase = src_freqs[idx], src_spl[idx], src_phase[idx]
    
    # Interpolate onto linear FFT frequency grid
    fft_freqs = np.fft.rfftfreq(n_fft, d=1.0 / sample_rate)
    interp_spl = np.interp(fft_freqs, src_freqs, src_spl, left=src_spl[0], right=src_spl[-1])
    interp_phase_rad = np.radians(np.interp(fft_freqs, src_freqs, src_phase, left=src_phase[0], right=src_phase[-1]))
    
    mag_linear = 10.0 ** (interp_spl / 20.0)
    H_complex = mag_linear * np.exp(1j * interp_phase_rad)
    
    # Generate time-domain impulse response
    ir = np.fft.irfft(H_complex, n=n_fft)
    
    return Measurement(name=name, ir=ir, sample_rate=sample_rate, n_fft=n_fft)


def load_wav_ir(
    file_path_or_bytes: Union[str, bytes, io.BytesIO],
    name: str = "WAV IR",
) -> Measurement:
    """
    Load an impulse response from a WAV file.
    """
    import soundfile as sf
    
    try:
        if isinstance(file_path_or_bytes, (bytes, bytearray)):
            data, sr = sf.read(io.BytesIO(file_path_or_bytes))
        else:
            data, sr = sf.read(file_path_or_bytes)
    except Exception as e:
        raise ValueError(f"Failed to read WAV audio file: {str(e)}")
        
    # If stereo or multichannel, take first channel or average
    if data.ndim > 1:
        data = data[:, 0]
        
    return Measurement(name=name, ir=data, sample_rate=sr)
