"""
Tests for Room EQ Wizard (REW) Lifecycle and Process Management:
- Installation directory discovery
- Process status and API connectivity checks
- Setting persistence (auto-start preference)
- REST API endpoints (/api/rew/status, /api/rew/detect, /api/rew/settings, /api/status)
"""

import pytest
import os
import json
from fastapi.testclient import TestClient
from auto_roomeq.server.app import app
from auto_roomeq.integrations.rew_manager import (
    find_rew_executable,
    get_rew_status,
    load_altair_settings,
    save_altair_settings,
    SETTINGS_FILE,
)


@pytest.fixture
def client():
    return TestClient(app)


def test_rew_finder_locates_installation():
    """Verify that find_rew_executable detects REW on this machine."""
    exe_path, name = find_rew_executable()
    # If REW is installed on this test machine, it should find it
    if exe_path:
        assert os.path.exists(exe_path)
        assert "roomeqwizard" in exe_path.lower()
        assert name is not None


def test_settings_persistence():
    """Verify loading and saving auto_start_rew preference in settings file."""
    initial = load_altair_settings()
    try:
        # Toggle auto_start
        test_val = not initial.get("auto_start_rew", False)
        save_altair_settings({"auto_start_rew": test_val, "custom_rew_path": None})
        reloaded = load_altair_settings()
        assert reloaded.get("auto_start_rew") == test_val
    finally:
        # Restore initial
        save_altair_settings(initial)


def test_api_status_includes_rew_info(client):
    """Verify /api/status exposes REW directory, installation, and auto-start state."""
    resp = client.get("/api/status")
    assert resp.status_code == 200
    data = resp.json()
    assert "rew_installed" in data
    assert "rew_connected" in data
    assert "rew_auto_start" in data
    assert "rew_process_running" in data
    if data["rew_installed"]:
        assert data["rew_path"] is not None
        assert data["rew_dir"] is not None
        assert os.path.exists(data["rew_dir"])


def test_rew_status_endpoint(client):
    """Verify /api/rew/status returns detailed REW status."""
    resp = client.get("/api/rew/status")
    assert resp.status_code == 200
    data = resp.json()
    assert "installed" in data
    assert "directory" in data
    assert "process_running" in data
    assert "api_connected" in data
    assert "auto_start" in data
    assert data["port"] == 4735


def test_rew_detect_endpoint(client):
    """Verify /api/rew/detect scans and reports REW presence."""
    resp = client.post("/api/rew/detect")
    assert resp.status_code == 200
    data = resp.json()
    assert "installed" in data
    assert "executable_path" in data


def test_rew_settings_endpoint(client):
    """Verify /api/rew/settings updates preferences."""
    resp = client.post("/api/rew/settings", json={"auto_start": True})
    assert resp.status_code == 200
    data = resp.json()
    assert data["auto_start"] is True

    # Revert back to False
    resp2 = client.post("/api/rew/settings", json={"auto_start": False})
    assert resp2.status_code == 200
    assert resp2.json()["auto_start"] is False
