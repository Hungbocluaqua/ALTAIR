"""
1-Click Export Bundle Packager.
Packages all generated FIR filters, Equalizer APO configs, CamillaDSP configs, miniDSP files,
and rePhase projects into a single organized ZIP archive.
"""

from typing import Dict, Optional, Union
import numpy as np
import io
import zipfile

from .wav_exporter import export_wav_fir
from .equalizer_apo_exporter import export_equalizer_apo_config
from .camilladsp_exporter import export_camilladsp_config
from .minidsp_exporter import export_minidsp_fir, export_minidsp_biquads, export_minidsp_hybrid_project
from .rephase_exporter import export_rephase_xml
import json


def create_export_bundle(
    fir_left: np.ndarray,
    fir_right: np.ndarray,
    preamp_db: float,
    sample_rate: int = 48000,
    sub_delay_ms: Optional[float] = None,
    sub_polarity: Optional[float] = None,
    crossover_freq: float = 2500.0,
    crossover_order: int = 4,
    biquads_left: Optional[list] = None,
    biquads_right: Optional[list] = None,
    compact_fir_left: Optional[np.ndarray] = None,
    compact_fir_right: Optional[np.ndarray] = None,
    multi_sub_alignments: Optional[list] = None,
    sub_crossover_freq: Optional[float] = None,
    wfir_left: Optional[np.ndarray] = None,
    wfir_right: Optional[np.ndarray] = None,
    wfir_taps: Optional[int] = None,
    metadata: Optional[Dict[str, any]] = None,
) -> bytes:
    """
    Create a complete 1-click ZIP bundle containing all export formats for ALTAIR.
    
    Args:
        multi_sub_alignments: Optional MSO result list of per-sub dicts
            {sub_index, name, delay_ms, delay_samples, gain_db, polarity}
            -> written as miniDSP/multi_sub_alignment.json + README notes.
        wfir_left/right: Optional Warped-FIR (WFIR) impulse responses for
            embedded/low-power DSP targets.
        wfir_taps: Tap count of the WFIR filters (metadata only).
    
    Returns:
        ZIP file bytes.
    """
    zip_buffer = io.BytesIO()
    
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        # 1. WAV Impulse Responses
        wav_stereo_bytes = export_wav_fir(fir_left, fir_right, sample_rate=sample_rate)
        wav_left_bytes = export_wav_fir(fir_left, None, sample_rate=sample_rate)
        wav_right_bytes = export_wav_fir(fir_right, None, sample_rate=sample_rate)
        
        zf.writestr("WAV_Filters/ALTAIR_Stereo_FIR_32bit.wav", wav_stereo_bytes)
        zf.writestr("WAV_Filters/ALTAIR_Left_FIR_32bit.wav", wav_left_bytes)
        zf.writestr("WAV_Filters/ALTAIR_Right_FIR_32bit.wav", wav_right_bytes)
        
        # 2. Equalizer APO
        eq_apo_config = export_equalizer_apo_config(
            preamp_db=preamp_db,
            left_wav_filename="ALTAIR_Left_FIR_32bit.wav",
            right_wav_filename="ALTAIR_Right_FIR_32bit.wav",
            sub_delay_ms=sub_delay_ms,
            sub_polarity=sub_polarity,
        )
        zf.writestr("EqualizerAPO/config.txt", eq_apo_config)
        zf.writestr("EqualizerAPO/ALTAIR_Left_FIR_32bit.wav", wav_left_bytes)
        zf.writestr("EqualizerAPO/ALTAIR_Right_FIR_32bit.wav", wav_right_bytes)
        
        # 3. CamillaDSP
        camilla_config = export_camilladsp_config(
            preamp_db=preamp_db,
            left_wav_filename="ALTAIR_Left_FIR_32bit.wav",
            right_wav_filename="ALTAIR_Right_FIR_32bit.wav",
            sample_rate=sample_rate,
            sub_delay_ms=sub_delay_ms,
            sub_polarity=sub_polarity,
        )
        zf.writestr("CamillaDSP/camilladsp.yml", camilla_config)
        zf.writestr("CamillaDSP/ALTAIR_Left_FIR_32bit.wav", wav_left_bytes)
        zf.writestr("CamillaDSP/ALTAIR_Right_FIR_32bit.wav", wav_right_bytes)
        
        # 4. miniDSP
        target_fir_l = compact_fir_left if compact_fir_left is not None else fir_left
        target_fir_r = compact_fir_right if compact_fir_right is not None else fir_right
        minidsp_l = export_minidsp_fir(target_fir_l, max_taps=4096)
        minidsp_r = export_minidsp_fir(target_fir_r, max_taps=4096)
        zf.writestr("miniDSP/fir_coeffs_left.txt", minidsp_l)
        zf.writestr("miniDSP/fir_coeffs_right.txt", minidsp_r)
        
        if biquads_left:
            zf.writestr("miniDSP/biquad_coeffs_left.txt", export_minidsp_biquads(biquads_left))
        if biquads_right:
            zf.writestr("miniDSP/biquad_coeffs_right.txt", export_minidsp_biquads(biquads_right))
        if biquads_left or biquads_right:
            zf.writestr(
                "miniDSP/ALTAIR_miniDSP_Setup.txt",
                export_minidsp_hybrid_project(
                    biquads_left=biquads_left or [],
                    biquads_right=biquads_right or [],
                    sample_rate=sample_rate,
                    preamp_db=preamp_db,
                    compact_fir_taps=len(target_fir_l),
                ),
            )
            
        # 4b. Multi-Sub Matrix Optimization (MSO) metadata
        if multi_sub_alignments:
            zf.writestr(
                "miniDSP/multi_sub_alignment.json",
                json.dumps(
                    {
                        "description": "ALTAIR Multi-Sub Matrix Optimization per-subwoofer alignment",
                        "crossover_freq_hz": (sub_crossover_freq if sub_crossover_freq is not None else crossover_freq),
                        "subwoofers": multi_sub_alignments,
                    },
                    indent=2,
                ),
            )
            
        # 5. rePhase
        rephase_xml = export_rephase_xml(
            sample_rate=sample_rate,
            taps=len(fir_left),
            crossover_freq=crossover_freq,
            crossover_order=crossover_order,
            preamp_db=preamp_db,
        )
        zf.writestr("rePhase/ALTAIR_Project.rephase", rephase_xml)
        
        # 5b. Warped FIR (WFIR) exports for embedded / low-power DSP targets
        wfir_note = ""
        if wfir_left is not None and wfir_right is not None and wfir_taps:
            zf.writestr(
                f"WAV_Filters/ALTAIR_WFIR_{wfir_taps}_Stereo.wav",
                export_wav_fir(wfir_left, wfir_right, sample_rate=sample_rate),
            )
            zf.writestr(
                f"WAV_Filters/ALTAIR_WFIR_{wfir_taps}_Left.wav",
                export_wav_fir(wfir_left, None, sample_rate=sample_rate),
            )
            zf.writestr(
                f"WAV_Filters/ALTAIR_WFIR_{wfir_taps}_Right.wav",
                export_wav_fir(wfir_right, None, sample_rate=sample_rate),
            )
            wfir_note = (
                f"- Warped FIR (WFIR): ALTAIR_WFIR_{wfir_taps}_Stereo.wav - "
                f"frequency-warped {wfir_taps}-tap FIR concentrating resolution in the sub-bass (< 120 Hz) "
                f"for embedded / low-power DSP convolvers.\n"
            )
            
        # 6. Readme Quick Start Guide
        sub_info = f"- Subwoofer Delay Offset: {sub_delay_ms:.2f} ms\n" if sub_delay_ms is not None else ""
        mso_info = ""
        if multi_sub_alignments:
            mso_lines = [
                "- Multi-Sub Matrix Optimization (MSO) - per-subwoofer settings (miniDSP/multi_sub_alignment.json):"
            ]
            for a in multi_sub_alignments:
                mso_lines.append(
                    f"    * {a.get('name', 'Sub')}: {a.get('delay_ms', 0.0)} ms, "
                    f"{a.get('gain_db', 0.0)} dB, polarity {'inverted' if a.get('polarity', 1.0) < 0 else 'normal'}"
                )
            mso_info = "\n".join(mso_lines) + "\n"
        readme_text = f"""========================================================================
ALTAIR - Automated Linear-phase Tuning & Acoustic Inversion Routine
Export Package
========================================================================

Filter Specifications:
- Sample Rate: {sample_rate} Hz
- FIR Tap Length: {len(fir_left)} taps
- Headroom Preamp: {preamp_db:.2f} dB (prevents digital clipping)
{sub_info}{wfir_note}{mso_info}
How to deploy:
1. Equalizer APO (Windows):
   - Copy the files in 'EqualizerAPO/' into 'C:\\Program Files\\EqualizerAPO\\config\\'
   - Restart the audio service or check the Configuration Editor.

2. CamillaDSP (Linux / Pi / macOS):
   - Copy 'CamillaDSP/camilladsp.yml' and the WAV files into your CamillaDSP config path.

3. Roon / JRiver / HQPlayer:
   - Select 'WAV_Filters/ALTAIR_Stereo_FIR_32bit.wav' as your convolution filter file.

4. miniDSP Flex / SHD / OpenDRC:
   - Load 'miniDSP/fir_coeffs_left.txt' into Channel 1 FIR slot and 'fir_coeffs_right.txt' into Channel 2.

5. rePhase:
   - Open 'rePhase/ALTAIR_Project.rephase' to visually inspect and further customize curves.
========================================================================
"""
        zf.writestr("README_INSTALL.txt", readme_text)
        
    return zip_buffer.getvalue()
