"""
miniDSP Exporter.
Generates FIR coefficient text files for miniDSP Flex / SHD / OpenDRC and PEQ biquads.
"""

from typing import List, Dict
import numpy as np


from scipy import signal


def export_minidsp_fir(
    fir_coeffs: np.ndarray,
    max_taps: int = 4096,
) -> str:
    """
    Export FIR coefficients as line-separated float strings for miniDSP Flex / 2x4 HD.
    Correctly extracts centered around the impulse peak if coeffs is longer than max_taps.
    """
    coeffs = np.asarray(fir_coeffs, dtype=np.float64)
    if len(coeffs) > max_taps:
        peak_idx = int(np.argmax(np.abs(coeffs)))
        half = max_taps // 2
        start = max(0, peak_idx - half)
        end = start + max_taps
        if end > len(coeffs):
            end = len(coeffs)
            start = max(0, end - max_taps)
        cropped = coeffs[start:end].copy()
        if len(cropped) < max_taps:
            cropped = np.pad(cropped, (0, max_taps - len(cropped)))
        win = signal.windows.tukey(max_taps, alpha=0.05)
        coeffs = cropped * win
        
    lines = [f"{c:.10e}" for c in coeffs]
    return "\n".join(lines)


def export_minidsp_biquads(
    biquads: List[Dict[str, float]],
) -> str:
    """
    Export biquad coefficients in standard miniDSP text format:
    b0=..., b1=..., b2=..., a1=..., a2=...
    """
    lines = [
        "# ALTAIR Generated miniDSP Biquad Coefficients",
        "# Automated Linear-phase Tuning & Acoustic Inversion Routine",
        "# Format: b0, b1, b2, a1, a2",
    ]
    for i, bq in enumerate(biquads, 1):
        lines.append(f"biquad{i},")
        lines.append(f"b0={bq.get('b0', 1.0):.10f},")
        lines.append(f"b1={bq.get('b1', 0.0):.10f},")
        lines.append(f"b2={bq.get('b2', 0.0):.10f},")
        lines.append(f"a1={bq.get('a1', 0.0):.10f},")
        lines.append(f"a2={bq.get('a2', 0.0):.10f},")
    return "\n".join(lines)
