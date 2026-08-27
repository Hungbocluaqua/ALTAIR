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


def export_minidsp_hybrid_project(
    biquads_left: List[Dict[str, float]],
    biquads_right: List[Dict[str, float]],
    sample_rate: int = 48000,
    preamp_db: float = -4.0,
    compact_fir_taps: int = 4096,
) -> str:
    """
    Human-readable miniDSP Hybrid IIR+FIR deployment summary.

    Explains the split architecture: deep sub-bass modal cuts (20-150 Hz) are
    handled by high-precision parametric IIR peaking biquads (sub-Hz resolution),
    while the remaining 4,096 FIR taps are reserved for linear-phase crossover
    reversal and mid/high frequency smoothing.
    """
    lines = [
        "# ========================================================",
        "# ALTAIR miniDSP Hybrid IIR+FIR Setup (Flex / SHD / OpenDRC)",
        "# Automated Linear-phase Tuning & Acoustic Inversion Routine",
        "# ========================================================",
        "",
        f"# Sample rate: {sample_rate} Hz",
        f"# Global preamp (recommended): {preamp_db:.2f} dB",
        "",
        "# STEP 1 - Load parametric PEQ biquads into the PEQ slots.",
        "#   Left channel  (PEQ 1..N):",
    ]
    for i, bq in enumerate(biquads_left, 1):
        lines.append(
            f"#     PEQ{i}: {bq.get('frequency_hz', 0.0):.1f} Hz, "
            f"{bq.get('gain_db', 0.0):+.2f} dB, Q {bq.get('q', 0.0):.2f}"
        )
    lines.append("#   Right channel (PEQ 1..N):")
    for i, bq in enumerate(biquads_right, 1):
        lines.append(
            f"#     PEQ{i}: {bq.get('frequency_hz', 0.0):.1f} Hz, "
            f"{bq.get('gain_db', 0.0):+.2f} dB, Q {bq.get('q', 0.0):.2f}"
        )
    lines.extend(
        [
            "",
            "# STEP 2 - Load the compact FIR into the FIR slots:",
            f"#   fir_coeffs_left.txt  -> Channel 1 FIR ({compact_fir_taps} taps)",
            f"#   fir_coeffs_right.txt -> Channel 2 FIR ({compact_fir_taps} taps)",
            "",
            "# Advanced-mode biquad coefficients are in:",
            "#   biquad_coeffs_left.txt / biquad_coeffs_right.txt",
            "# ========================================================",
        ]
    )
    return "\n".join(lines)
