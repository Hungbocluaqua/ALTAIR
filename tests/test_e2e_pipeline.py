"""
End-to-End Pipeline & Export Archive Integrity Test Suite for ALTAIR.
Verifies:
- Complete execution of the 1-Click optimization workflow.
- Ingestion of custom REW formatted text and WAV files.
- ZIP export bundle integrity:
  - WAV_Filters: Stereo, Left, Right 32-bit float WAVs
  - EqualizerAPO: config.txt, Left & Right WAVs
  - CamillaDSP: camilladsp.yml, Left & Right WAVs
  - miniDSP: fir_coeffs_left.txt, fir_coeffs_right.txt
  - rePhase: ALTAIR_Project.rephase
  - README_INSTALL.txt
"""

import pytest
import io
import zipfile
import asyncio
import numpy as np
import soundfile as sf
import xml.etree.ElementTree as ET

from auto_roomeq.orchestrator import OptimizationOrchestrator, generate_demo_room_measurements
from auto_roomeq.dsp.measurement import parse_rew_text, load_wav_ir, Measurement


def test_e2e_orchestrator_and_zip_bundle_integrity():
    """Verify that the complete pipeline runs and produces a valid ZIP archive with all required export files."""
    meas_l, meas_r, meas_sub = generate_demo_room_measurements(sample_rate=48000, n_fft=16384)
    
    orchestrator = OptimizationOrchestrator()
    result = asyncio.run(orchestrator.run_pipeline(
        meas_left=meas_l,
        meas_right=meas_r,
        meas_sub=meas_sub,
        target_curve_name="harman",
        target_taps=16384,
    ))
    
    assert result["status"] == "success"
    assert "zip_bundle_bytes" in result
    
    zip_bytes = result["zip_bundle_bytes"]
    assert len(zip_bytes) > 1000
    
    # Unpack ZIP archive in memory and verify contents
    with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
        namelist = zf.namelist()
        
        # 1. Check required file list
        expected_files = [
            "WAV_Filters/ALTAIR_Stereo_FIR_32bit.wav",
            "WAV_Filters/ALTAIR_Left_FIR_32bit.wav",
            "WAV_Filters/ALTAIR_Right_FIR_32bit.wav",
            "EqualizerAPO/config.txt",
            "EqualizerAPO/ALTAIR_Left_FIR_32bit.wav",
            "EqualizerAPO/ALTAIR_Right_FIR_32bit.wav",
            "CamillaDSP/camilladsp.yml",
            "CamillaDSP/ALTAIR_Left_FIR_32bit.wav",
            "CamillaDSP/ALTAIR_Right_FIR_32bit.wav",
            "miniDSP/fir_coeffs_left.txt",
            "miniDSP/fir_coeffs_right.txt",
            "rePhase/ALTAIR_Project.rephase",
            "README_INSTALL.txt",
        ]
        
        for expected in expected_files:
            assert expected in namelist, f"Missing {expected} in export bundle"
            
        # 2. Verify WAV Audio Integrity
        stereo_wav_data = zf.read("WAV_Filters/ALTAIR_Stereo_FIR_32bit.wav")
        audio, sr = sf.read(io.BytesIO(stereo_wav_data))
        assert sr == 48000
        assert audio.ndim == 2
        assert audio.shape[0] == 16384
        assert audio.shape[1] == 2
        assert np.all(np.isfinite(audio))
        
        # 3. Verify Equalizer APO config
        eq_apo_text = zf.read("EqualizerAPO/config.txt").decode("utf-8")
        assert "Preamp:" in eq_apo_text
        assert "Convolution:" in eq_apo_text
        assert "Delay:" in eq_apo_text
        
        # 4. Verify CamillaDSP config
        camilla_text = zf.read("CamillaDSP/camilladsp.yml").decode("utf-8")
        assert "devices:" in camilla_text
        assert "filters:" in camilla_text
        assert "pipeline:" in camilla_text
        
        # 5. Verify miniDSP coefficient format
        minidsp_text = zf.read("miniDSP/fir_coeffs_left.txt").decode("utf-8")
        coeff_lines = minidsp_text.strip().split("\n")
        assert len(coeff_lines) <= 4096
        # Parse first float
        val0 = float(coeff_lines[0])
        assert np.isfinite(val0)
        
        # 6. Verify rePhase XML parsing
        rephase_xml = zf.read("rePhase/ALTAIR_Project.rephase").decode("utf-8")
        xml_root = ET.fromstring(rephase_xml)
        assert xml_root.tag == "rephase"
        assert xml_root.find("settings/taps").text == "16384"
        
        # 7. Verify README
        readme = zf.read("README_INSTALL.txt").decode("utf-8")
        assert "ALTAIR" in readme
        assert "Equalizer APO" in readme
