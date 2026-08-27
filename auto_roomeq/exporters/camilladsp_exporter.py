"""
CamillaDSP Configuration Exporter.
Generates valid camilladsp.yml configuration for Linux, macOS, and Raspberry Pi streaming DACs.
"""

from typing import Optional


def export_camilladsp_config(
    preamp_db: float,
    left_wav_filename: str = "filter_left.wav",
    right_wav_filename: str = "filter_right.wav",
    sample_rate: int = 48000,
    channels: int = 2,
    sub_delay_ms: Optional[float] = None,
    sub_polarity: Optional[float] = None,
) -> str:
    """
    Generate CamillaDSP YAML configuration string.
    Correctly wires delay and polarity into the pipeline block.
    """
    has_sub = sub_delay_ms is not None and abs(sub_delay_ms) > 0.01
    has_inversion = sub_polarity is not None and sub_polarity < 0
    actual_channels = max(channels, 3 if (has_sub or has_inversion) else 2)

    extra_filters = []
    ch0_filters = ["preamp_gain", "fir_left"]
    ch1_filters = ["preamp_gain", "fir_right"]
    ch2_filters = ["preamp_gain"]

    if has_sub:
        if sub_delay_ms < 0:
            # Subwoofer is lagging: delay the mains channels
            extra_filters.append(f"""  mains_delay:
    type: Delay
    parameters:
      delay: {abs(sub_delay_ms):.2f}
      unit: ms""")
            ch0_filters.append("mains_delay")
            ch1_filters.append("mains_delay")
        else:
            # Subwoofer is leading: delay the subwoofer channel
            extra_filters.append(f"""  sub_delay:
    type: Delay
    parameters:
      delay: {sub_delay_ms:.2f}
      unit: ms""")
            ch2_filters.append("sub_delay")

    if has_inversion:
        extra_filters.append("""  sub_invert:
    type: Gain
    parameters:
      gain: 0.0
      inverted: true""")
        ch2_filters.append("sub_invert")

    extra_filters_text = "\n\n" + "\n\n".join(extra_filters) if extra_filters else ""

    pipeline_entries = [
        f"""  - type: Filter
    channel: 0
    names:
""" + "\n".join(f"      - {f}" for f in ch0_filters),
        f"""  - type: Filter
    channel: 1
    names:
""" + "\n".join(f"      - {f}" for f in ch1_filters),
    ]

    if (has_sub and sub_delay_ms > 0) or has_inversion:
        pipeline_entries.append(
            f"""  - type: Filter
    channel: 2
    names:
""" + "\n".join(f"      - {f}" for f in ch2_filters)
        )

    pipeline_text = "\n".join(pipeline_entries)

    yml = f"""# ========================================================
# ALTAIR Generated Configuration for CamillaDSP
# Automated Linear-phase Tuning & Acoustic Inversion Routine
# ========================================================

devices:
  samplerate: {sample_rate}
  chunksize: 1024
  queuelimit: 4
  capture:
    type: ALSA # Or Wasapi / CoreAudio
    channels: {actual_channels}
    format: S32LE
  playback:
    type: ALSA
    channels: {actual_channels}
    format: S32LE

filters:
  preamp_gain:
    type: Gain
    parameters:
      gain: {preamp_db:.2f}
      inverted: false

  fir_left:
    type: Conv
    parameters:
      type: File
      filename: "{left_wav_filename}"
      format: FLOAT32LE

  fir_right:
    type: Conv
    parameters:
      type: File
      filename: "{right_wav_filename}"
      format: FLOAT32LE{extra_filters_text}

pipeline:
{pipeline_text}
"""
    return yml
