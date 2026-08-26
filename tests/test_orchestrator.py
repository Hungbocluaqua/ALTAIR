"""
End-to-End Orchestrator Pipeline Tests for ALTAIR.
Verifies:
- Demo dataset generation (Stereo Left, Right, Subwoofer).
- 1-Click execution across all 8 stages.
- Output plot data structure and ZIP bundle validity.
"""

import zipfile
import io
import pytest
import asyncio
from auto_roomeq.orchestrator import OptimizationOrchestrator, generate_demo_room_measurements


def test_full_orchestrator_pipeline():
    """Verify end-to-end 1-click optimization on demo measurements."""
    async def _test():
        meas_l, meas_r, meas_sub = generate_demo_room_measurements()
        assert meas_l.sample_rate == 48000
        assert meas_r.sample_rate == 48000
        assert meas_sub.sample_rate == 48000
        
        orchestrator = OptimizationOrchestrator()
        
        progress_log = []
        def on_progress(step, pct, detail):
            progress_log.append((step, pct))
            
        result = await orchestrator.run_pipeline(
            meas_left=meas_l,
            meas_right=meas_r,
            meas_sub=meas_sub,
            target_curve_name="harman",
            bass_boost_db=6.0,
            crossover_freq=2500.0,
            sub_crossover_freq=80.0,
            target_taps=65536,
            progress_callback=on_progress,
        )
        return result
        
    result = asyncio.run(_test())
    
    assert result["status"] == "success"
    assert result["sample_rate"] == 48000
    assert result["target_taps"] == 65536
    assert result["global_preamp_db"] <= 0.0
    
    # Check pre-ringing
    assert result["preringing_left"]["passed"] is True
    
    # Check sub alignment
    assert result["sub_alignment"] is not None
    assert "optimal_delay_ms" in result["sub_alignment"]
    
    # Check plots data
    plots = result["plots"]
    assert len(plots["freqs"]) == 500
    assert len(plots["spl_before_left"]) == 500
    assert len(plots["spl_after_left"]) == 500
    
    # Verify ZIP bundle contents
    zip_bytes = result["zip_bundle_bytes"]
    assert len(zip_bytes) > 1000
    
    with zipfile.ZipFile(io.BytesIO(zip_bytes), "r") as zf:
        file_list = zf.namelist()
        assert "WAV_Filters/ALTAIR_Stereo_FIR_32bit.wav" in file_list
        assert "EqualizerAPO/config.txt" in file_list
        assert "CamillaDSP/camilladsp.yml" in file_list
        assert "miniDSP/fir_coeffs_left.txt" in file_list
        assert "rePhase/ALTAIR_Project.rephase" in file_list
        assert "README_INSTALL.txt" in file_list
