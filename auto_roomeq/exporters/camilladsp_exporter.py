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
) -> str:
    """
    Generate CamillaDSP YAML configuration string.
    """
    sub_delay_section = ""
    if sub_delay_ms is not None and abs(sub_delay_ms) > 0.01:
        sub_delay_section = f"""  sub_delay:
    type: Delay
    parameters:
      delay: {abs(sub_delay_ms):.2f}
      unit: ms
"""

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
    channels: {channels}
    format: S32LE
  playback:
    type: ALSA
    channels: {channels}
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
      format: FLOAT32LE
{sub_delay_section}
pipeline:
  - type: Filter
    channel: 0
    names:
      - preamp_gain
      - fir_left
  - type: Filter
    channel: 1
    names:
      - preamp_gain
      - fir_right
"""
    return yml
