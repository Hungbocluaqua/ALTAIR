"""
Equalizer APO Configuration Exporter.
Generates ready-to-use config.txt with preamp headroom and convolution filter directives.
"""

from typing import Optional


def export_equalizer_apo_config(
    preamp_db: float,
    wav_filename: str = "ALTAIR_Stereo_FIR.wav",
    left_wav_filename: Optional[str] = None,
    right_wav_filename: Optional[str] = None,
    sub_delay_ms: Optional[float] = None,
    sub_polarity: Optional[float] = None,
) -> str:
    """
    Generate Equalizer APO configuration script for ALTAIR.
    """
    lines = [
        "# ========================================================",
        "# ALTAIR Generated Configuration for Equalizer APO",
        "# Automated Linear-phase Tuning & Acoustic Inversion Routine",
        "# ========================================================",
        "",
        "# Global Headroom Preamp (Inter-Sample Clipping Prevention)",
        f"Preamp: {preamp_db:.2f} dB",
        "",
    ]
    
    if left_wav_filename and right_wav_filename:
        lines.extend([
            "# Channel-specific Convolution Filters",
            "Channel: L",
            f"Convolution: {left_wav_filename}",
            "",
            "Channel: R",
            f"Convolution: {right_wav_filename}",
            "",
        ])
    else:
        lines.extend([
            "# Stereo Convolution Filter (Left = Ch 1, Right = Ch 2)",
            f"Convolution: {wav_filename}",
            "",
        ])
        
    if sub_delay_ms is not None and abs(sub_delay_ms) > 0.01:
        if sub_delay_ms > 0:
            # Subwoofer is acoustically leading; delay the subwoofer channel (LFE)
            lines.extend([
                "# Subwoofer Timing Delay Offset",
                "Channel: LFE",
                f"Delay: {sub_delay_ms:.2f} ms",
                "",
            ])
        else:
            # sub_delay_ms < 0: Subwoofer is lagging; EqAPO cannot accept negative delays.
            # Compensate by delaying the stereo mains (L and R).
            lines.extend([
                "# Mains Delay Offset (Subwoofer Alignment Compensation)",
                "Channel: L R",
                f"Delay: {abs(sub_delay_ms):.2f} ms",
                "",
            ])

    if sub_polarity is not None and sub_polarity < 0:
        lines.extend([
            "# Subwoofer Phase Polarity Inversion",
            "Channel: LFE",
            "Copy: LFE=-1*LFE",
            "",
        ])
        
    return "\n".join(lines)
