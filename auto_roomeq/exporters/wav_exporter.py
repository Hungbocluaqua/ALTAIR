"""
WAV Impulse Response Exporter.
Exports 32-bit or 64-bit IEEE float WAV FIR filters for CamillaDSP, Equalizer APO, Roon, HQPlayer, and miniDSP Flex.
"""

from typing import Union, Optional
import numpy as np
import io
import soundfile as sf


def export_wav_fir(
    fir_left: np.ndarray,
    fir_right: Optional[np.ndarray] = None,
    sample_rate: int = 48000,
    subtype: str = "FLOAT",  # 32-bit float
    file_path: Optional[str] = None,
) -> Union[bytes, str]:
    """
    Export FIR impulse response(s) to a WAV file.
    
    Args:
        fir_left: Left channel FIR impulse array.
        fir_right: Optional Right channel FIR impulse array (if stereo).
        sample_rate: Sample rate in Hz.
        subtype: 'FLOAT' (32-bit float) or 'DOUBLE' (64-bit float) or 'PCM_24'.
        file_path: Path to write to, or None to return WAV bytes.
        
    Returns:
        File path if written to disk, or bytes of the WAV file.
    """
    if fir_right is not None:
        # Pad to equal length if necessary
        max_len = max(len(fir_left), len(fir_right))
        l_padded = np.pad(fir_left, (0, max_len - len(fir_left))) if len(fir_left) < max_len else fir_left
        r_padded = np.pad(fir_right, (0, max_len - len(fir_right))) if len(fir_right) < max_len else fir_right
        audio_data = np.column_stack([l_padded, r_padded])
    else:
        audio_data = np.asarray(fir_left, dtype=np.float64)
        
    if file_path is not None:
        sf.write(file_path, audio_data, sample_rate, subtype=subtype)
        return file_path
    else:
        buffer = io.BytesIO()
        sf.write(buffer, audio_data, sample_rate, format="WAV", subtype=subtype)
        return buffer.getvalue()
