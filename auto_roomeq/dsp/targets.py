"""
Target Curves & Psychoacoustic House Curve Module.
Implements:
- Harman reference house curve (low-shelf +4 to +6 dB below 80 Hz, -0.8 dB/oct roll-off 200 Hz to 20 kHz).
- B&K 1974 target curve (+3 dB low bass, -3 dB roll-off at 20 kHz).
- Toole / Olive reference flat target.
- OCA Audiophile dynamic target.
- Custom parameterized target curve generator.
- Automatic target level anchoring to 300 Hz - 1000 Hz RMS energy.
"""

from typing import Tuple
import numpy as np


def generate_harman_target(
    freqs: np.ndarray,
    bass_boost_db: float = 6.0,
    bass_cutoff_hz: float = 80.0,
    hf_slope_db_per_oct: float = -0.8,
    hf_start_hz: float = 200.0,
) -> np.ndarray:
    """
    Construct the Harman reference target curve T(f).
    - Low-shelf boost: +bass_boost_db below bass_cutoff_hz.
    - Mid-to-high slope: hf_slope_db_per_oct from hf_start_hz to 20 kHz.
    """
    target = np.zeros_like(freqs, dtype=np.float64)
    hf_start = max(hf_start_hz, bass_cutoff_hz + 5.0)
    
    for i, f in enumerate(freqs):
        if f <= 0:
            target[i] = bass_boost_db
            continue
            
        # Bass shelf region (20 Hz - bass_cutoff_hz)
        if f <= bass_cutoff_hz:
            target[i] = bass_boost_db
        elif f < hf_start:
            # Smooth transition between bass shelf and HF roll-off start
            denom = np.log2(hf_start) - np.log2(bass_cutoff_hz)
            alpha = (np.log2(f) - np.log2(bass_cutoff_hz)) / max(denom, 1e-6)
            target[i] = bass_boost_db * (1.0 - alpha)
        else:
            # Linear in log-frequency (dB / octave roll-off)
            octaves = np.log2(f / hf_start)
            target[i] = hf_slope_db_per_oct * octaves
            
    return target


def generate_bk1974_target(freqs: np.ndarray) -> np.ndarray:
    """
    Construct the classic Brüel & Kjær (B&K 1974) target curve:
    - +3 dB below 100 Hz
    - Flat 100 Hz to 2 kHz
    - -3 dB roll-off at 20 kHz (-0.9 dB/octave)
    """
    target = np.zeros_like(freqs, dtype=np.float64)
    for i, f in enumerate(freqs):
        if f <= 0:
            target[i] = 3.0
        elif f <= 50.0:
            target[i] = 3.0
        elif f <= 100.0:
            target[i] = 3.0 * (1.0 - (f - 50.0) / 50.0)
        elif f <= 2000.0:
            target[i] = 0.0
        else:
            octaves = np.log2(f / 2000.0)
            target[i] = -0.9 * octaves
    return target


def generate_flat_target(freqs: np.ndarray) -> np.ndarray:
    """Flat reference studio monitor target curve."""
    return np.zeros_like(freqs, dtype=np.float64)


def generate_oca_target(freqs: np.ndarray) -> np.ndarray:
    """
    OCA (Obsessive Compulsive Audiophile) dynamic house curve:
    - Dynamic +5.5 dB bass lift (20 Hz - 90 Hz).
    - Natural loudspeaker acoustic decline (-0.65 dB/octave from 500 Hz to 20 kHz).
    """
    target = np.zeros_like(freqs, dtype=np.float64)
    for i, f in enumerate(freqs):
        if f <= 0:
            target[i] = 5.5
        elif f <= 90.0:
            target[i] = 5.5
        elif f <= 500.0:
            alpha = (np.log2(f) - np.log2(90.0)) / (np.log2(500.0) - np.log2(90.0))
            target[i] = 5.5 * (1.0 - alpha)
        else:
            octaves = np.log2(f / 500.0)
            target[i] = -0.65 * octaves
    return target


def generate_custom_target(
    freqs: np.ndarray,
    bass_boost_db: float,
    bass_cutoff_hz: float,
    hf_slope_db_per_oct: float,
    hf_start_hz: float,
) -> np.ndarray:
    """Generate customizable target curve based on user sliders."""
    return generate_harman_target(
        freqs,
        bass_boost_db=bass_boost_db,
        bass_cutoff_hz=bass_cutoff_hz,
        hf_slope_db_per_oct=hf_slope_db_per_oct,
        hf_start_hz=hf_start_hz,
    )


def anchor_target_to_measurement(
    target_spl: np.ndarray,
    measured_spl: np.ndarray,
    freqs: np.ndarray,
    anchor_band: Tuple[float, float] = (300.0, 1000.0),
) -> Tuple[np.ndarray, float]:
    """
    Automatically align the overall target level to match the RMS energy
    of the measured response between anchor_band (default: 300 Hz and 1 kHz).
    
    Returns:
        (anchored_target_spl, level_offset_db)
    """
    mask = (freqs >= anchor_band[0]) & (freqs <= anchor_band[1])
    if not np.any(mask):
        mask = (freqs >= 100.0) & (freqs <= 2000.0)
    if not np.any(mask):
        mask = np.ones_like(freqs, dtype=bool)
        
    measured_rms_spl = float(np.mean(measured_spl[mask]))
    target_rms_spl = float(np.mean(target_spl[mask]))
    
    offset_db = measured_rms_spl - target_rms_spl
    anchored_target = target_spl + offset_db
    
    return anchored_target, offset_db
