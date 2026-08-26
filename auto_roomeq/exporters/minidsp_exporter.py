"""
miniDSP Exporter.
Generates FIR coefficient text files for miniDSP Flex / SHD / OpenDRC and PEQ biquads.
"""

from typing import List, Dict
import numpy as np


def export_minidsp_fir(
    fir_coeffs: np.ndarray,
    max_taps: int = 4096,
) -> str:
    """
    Export FIR coefficients as line-separated float strings for miniDSP Flex / 2x4 HD.
    """
    coeffs = np.asarray(fir_coeffs, dtype=np.float64)
    if len(coeffs) > max_taps:
        coeffs = coeffs[:max_taps]
        
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
        "# AutoRoomEQ Generated miniDSP Biquad Coefficients",
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
