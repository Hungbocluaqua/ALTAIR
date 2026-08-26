"""
API & Server Integration Tests.
Verifies FastAPI REST endpoints, static file serving, and bundle download.
"""

import io
import zipfile
from fastapi.testclient import TestClient
from auto_roomeq.server.app import app

client = TestClient(app)


def test_status_endpoint():
    """Verify /api/status endpoint returns valid status."""
    resp = client.get("/api/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["app"] == "AutoRoomEQ"
    assert "rew_connected" in data
    assert "rew_base_url" in data


def test_optimize_and_export_flow():
    """Verify /api/optimize runs 1-click pipeline and /api/export/bundle delivers zip."""
    # 1. Run optimization with demo data
    payload = {
        "target": {
            "name": "harman",
            "bass_boost_db": 6.0,
            "bass_cutoff_hz": 80.0,
            "hf_slope_db_per_oct": -0.8,
            "hf_start_hz": 200.0,
        },
        "crossover_freq_hz": 2500.0,
        "crossover_order": 4,
        "sub_crossover_freq_hz": 80.0,
        "target_taps": 65536,
        "use_demo_measurements": True,
    }
    
    resp = client.post("/api/optimize", json=payload)
    assert resp.status_code == 200
    res = resp.json()
    assert res["status"] == "success"
    assert res["target_taps"] == 65536
    assert "plots" in res
    assert len(res["plots"]["freqs"]) == 500
    assert "modal_info_left" in res
    assert "preringing_left" in res
    assert "sub_alignment" in res
    
    # 2. Download zip bundle
    resp_zip = client.get("/api/export/bundle")
    assert resp_zip.status_code == 200
    assert resp_zip.headers["content-type"] == "application/zip"
    
    # Check zip contents
    with zipfile.ZipFile(io.BytesIO(resp_zip.content), "r") as zf:
        names = zf.namelist()
        assert "WAV_Filters/AutoRoomEQ_Stereo_FIR_32bit.wav" in names
        assert "EqualizerAPO/config.txt" in names
        assert "CamillaDSP/camilladsp.yml" in names
        assert "rePhase/AutoRoomEQ_Project.rephase" in names


def test_sub_simulation_endpoint():
    """Verify /api/sub-alignment/simulate computes delay summation."""
    data = {
        "delay_ms": "-3.2",
        "polarity": "1.0",
        "crossover_freq": "80.0",
    }
    resp = client.post("/api/sub-alignment/simulate", data=data)
    assert resp.status_code == 200
    res = resp.json()
    assert "spl_sum_db" in res
    assert len(res["spl_sum_db"]) > 0


def test_static_frontend_serving():
    """Verify root / serves the built React index.html."""
    resp = client.get("/")
    assert resp.status_code == 200
    assert "<html" in resp.text.lower()
    assert "AutoRoomEQ" in resp.text or "root" in resp.text
