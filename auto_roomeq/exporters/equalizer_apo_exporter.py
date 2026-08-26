"""
Equalizer APO Configuration Exporter.
Generates ready-to-use config.txt with preamp headroom and convolution filter directives.
"""

from typing import Optional


def export_equalizer_apo_config(
    preamp_db: float,
    wav_filename: str = "AutoRoomEQ_Stereo_FIR.wav",
    left_wav_filename: Optional[str] = None,
    right_wav_filename: Optional[str] = None,
    sub_delay_ms: Optional[float] = None,
) -> str:
    """
    Generate Equalizer APO configuration script.
    """
    lines = [
        "# ========================================================",
        "# AutoRoomEQ Generated Configuration for Equalizer APO",
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
        lines.extend([
            "# Subwoofer / LFE Acoustic Timing Delay Offset",
            "Channel: C SUB",
            f"Delay: {sub_delay_ms:.2f} ms",
            "",
        ])
        
    return "\n".join(lines)
