"""
Enhancement Roadmap Tests (ALTAIR 1.1).

Covers everything activated by the accuracy/physical-fidelity roadmap:
- Farina harmonic separation ingestion for recorded sweeps
- Mic .cal calibration application in the pipeline
- Multi-seat spatial variance weighting into Module 2
- SBIR / wavelet-decay hard neutral masking (beta -> infinity equivalent)
- Closed-loop pre-ringing safeguard with Zwicker masking gate
- Multi-Sub Matrix Optimization (MSO) activation
- ISO 9613-1 air-absorption target adaptation
- Continuous ERB psychoacoustic smoothing in hybrid spatial averaging
- Regularized excess-phase inversion in Module 3
- miniDSP hybrid IIR+FIR project export
- Warped FIR (WFIR) bundle exports
- SSE progress streaming endpoint
- .mdat binary parser bridge (ZIP + Java-serialization scan)
- Session persistence (save/load/clear)
"""

import io
import json
import os
import struct
import zipfile

import numpy as np
import pytest
from fastapi.testclient import TestClient


# ---------------------------------------------------------------------------
# Session file hygiene: never touch the developer's real altair_project.json
# ---------------------------------------------------------------------------
@pytest.fixture(autouse=True)
def _clean_session_file(tmp_path, monkeypatch):
    from auto_roomeq.server import routes as routes_mod
    
    fake = tmp_path / "altair_project.json"
    monkeypatch.setattr(routes_mod, "SESSION_FILE", str(fake))
    yield
    # tmp_path is auto-removed by pytest; nothing else to do.


def test_farina_recorded_sweep_ingestion():
    """Raw recorded log-sine sweep -> deconvolution + Farina harmonic windowing."""
    from auto_roomeq.dsp.acquisition import generate_log_chirp, recorded_sweep_to_measurement
    
    sr = 48000
    n = 8192
    sweep, _ = generate_log_chirp(10.0, 24000.0, sample_rate=sr, length_samples=n, include_timing_ref=False)
    
    meas, diag = recorded_sweep_to_measurement(sweep, sample_rate=sr, name="Test Sweep", n_fft=n)
    
    assert meas.sample_rate == sr
    assert len(meas.ir) == n
    assert np.all(np.isfinite(meas.ir))
    assert diag["sweep_duration_s"] == pytest.approx(n / sr, abs=1e-3)
    assert diag["harmonics_windowed"] == [2, 3, 4, 5]
    assert 0.0 <= diag["thd_percent"] <= 100.0


def test_forced_neutral_mask_forces_zero_db_correction():
    """Tikhonov with forced_neutral_mask == beta->infinity (0 dB correction) at flagged bins."""
    from auto_roomeq.dsp.mag_inversion import tikhonov_magnitude_inversion
    
    n = 256
    freqs = np.fft.rfftfreq(n * 2, d=1.0 / 48000)
    H = np.ones(len(freqs), dtype=np.complex128)
    # Deep dip at some frequency the inverter would otherwise boost
    dip_band = (freqs >= 50.0) & (freqs <= 70.0)
    H[dip_band] *= 0.01
    target = np.full(len(freqs), 1.0)
    
    mask = np.zeros(len(freqs), dtype=bool)
    mask[dip_band] = True
    
    H_inv = tikhonov_magnitude_inversion(H, target, freqs, beta=0.04, forced_neutral_mask=mask)
    inv_db = 20.0 * np.log10(np.maximum(np.abs(H_inv), 1e-12))
    
    # Correction must be exactly 0 dB where the mask is active...
    assert np.all(np.abs(inv_db[dip_band]) < 0.05)
    # ...while non-masked regions can still deviate from 0 dB.
    outside = ~mask & (freqs < 4000.0)
    assert np.max(np.abs(inv_db[outside])) > 0.01


def test_build_forced_neutral_mask_sbir_and_decay():
    """Mask builder flags SBIR nulls and fast-decay dips but leaves true modes alone."""
    from auto_roomeq.orchestrator import build_forced_neutral_mask
    
    freqs = np.geomspace(20.0, 20000.0, 2048)
    sbir = [{"frequency_hz": 62.0, "dip_depth_db": 12.0, "is_sbir_null": True}]
    modal_info = {
        "peaks": [{"freq": 43.0, "spl": 90.0, "harmonic": 1, "is_harmonic_match": True}],
        "dips": [{"freq": 90.0, "spl": 70.0, "harmonic_dip": 1, "is_harmonic_match": True}],
    }
    decay = [
        {"freq_hz": 43.0, "decay_rt60_ms": 600.0, "is_true_mode": True},   # peak: keep
        {"freq_hz": 90.0, "decay_rt60_ms": 80.0, "is_true_mode": False},   # dip: clamp
    ]
    
    mask, report = build_forced_neutral_mask(freqs, sbir, modal_info, decay)
    
    # SBIR null band and fast-decay dip band must be clamped
    for f0 in (62.0, 90.0):
        band = (freqs >= f0 * 2 ** (-1 / 6)) & (freqs <= f0 * 2 ** (1 / 6))
        assert np.all(mask[band])
    # The 43 Hz true mode must NOT be clamped
    band_43 = (freqs >= 43.0 * 2 ** (-1 / 6)) & (freqs <= 43.0 * 2 ** (1 / 6))
    assert not np.all(mask[band_43])
    assert len(report) == 2


def test_regularized_excess_phase_inverse_bounded():
    """Regularized excess-phase inverse: unit magnitude, bounded phase delta, HF neutral."""
    from auto_roomeq.dsp.phase_linearization import synthesize_regularized_excess_phase_inverse
    
    freqs = np.fft.rfftfreq(4096, d=1.0 / 48000)
    excess = np.full(len(freqs), np.radians(180.0))  # wildly excessive phase
    H = synthesize_regularized_excess_phase_inverse(freqs, excess, max_delta_deg=45.0)
    
    assert np.allclose(np.abs(H), 1.0)
    # Active band: phase limited to +/-45 deg
    active = freqs < 250.0
    assert np.all(np.abs(np.angle(H[active])) <= np.radians(45.0) + 1e-9)
    # Above the fade-out band: no correction
    assert np.allclose(H[freqs > 500.0], 1.0)


def test_air_absorption_target_adaptation_lowers_hf_target():
    """ISO 9613-1 loss bends the target down above the blend band."""
    from auto_roomeq.dsp.acoustic_analysis import adapt_target_for_air_absorption
    
    freqs = np.array([100.0, 500.0, 1000.0, 4000.0, 10000.0, 20000.0])
    target = np.zeros_like(freqs)
    loss = np.array([0.001, 0.01, 0.05, 0.3, 1.2, 2.0])  # positive attenuation dB
    
    adapted = adapt_target_for_air_absorption(target, freqs, loss)
    
    assert adapted[0] == pytest.approx(0.0, abs=0.02)          # bass untouched
    assert adapted[-2] == pytest.approx(-1.2, abs=0.05)        # fully blended by 4 kHz+
    assert adapted[-1] == pytest.approx(-2.0, abs=0.05)
    assert np.all(adapted <= target + 1e-9)


def test_hybrid_spatial_average_erb_smoothing():
    """ERB-smoothed hybrid average runs and stays within magnitude bounds."""
    from auto_roomeq.dsp.measurement import Measurement, hybrid_spatial_average
    
    rng = np.random.RandomState(7)
    n = 4096
    m1 = Measurement(name="Seat 1", ir=rng.normal(0, 1, n) + np.eye(1, n)[0], sample_rate=48000, n_fft=n)
    m2 = Measurement(name="Seat 2", ir=rng.normal(0, 1, n) + np.eye(1, n)[0], sample_rate=48000, n_fft=n)
    
    avg = hybrid_spatial_average([m1, m2], f_trans=300.0, erb_smooth=True)
    
    assert isinstance(avg, Measurement)
    assert np.all(np.isfinite(avg.ir))


def test_module3_excess_phase_inversion_flag():
    """Module 3 accepts the excess-phase inversion flag and returns valid filters."""
    from auto_roomeq.dsp.measurement import Measurement
    from auto_roomeq.dsp.phase_linearization import synthesize_phase_linearization_filter
    
    rng = np.random.RandomState(3)
    n = 4096
    ir = rng.normal(0, 0.05, n)
    ir[100] = 1.0
    meas = Measurement(name="h2", ir=ir, sample_rate=48000, n_fft=n)
    
    h_phase, meas_h3 = synthesize_phase_linearization_filter(
        meas, crossover_freq=2500.0, crossover_order=4, sample_rate=48000,
        apply_excess_phase_inversion=True,
    )
    
    assert len(h_phase) == n
    assert np.all(np.isfinite(h_phase))
    assert np.max(np.abs(h_phase)) > 0.0


def test_minidsp_hybrid_project_export():
    """miniDSP hybrid project summary lists biquads and FIR instructions."""
    from auto_roomeq.exporters.minidsp_exporter import export_minidsp_hybrid_project
    
    biquads = [{"frequency_hz": 43.0, "gain_db": -9.0, "q": 3.5, "b0": 1.0, "b1": -1.9, "b2": 0.9, "a1": -1.9, "a2": 0.9}]
    text = export_minidsp_hybrid_project(biquads, [], sample_rate=48000, preamp_db=-4.75, compact_fir_taps=4096)
    
    assert "Hybrid IIR+FIR" in text
    assert "43.0 Hz" in text
    assert "-9.00 dB" in text
    assert "4096 taps" in text


# ---------------------------------------------------------------------------
# Orchestrator-level wiring
# ---------------------------------------------------------------------------
def _fast_demo():
    from auto_roomeq.orchestrator import generate_demo_room_measurements
    return generate_demo_room_measurements(sample_rate=48000, n_fft=16384)


def test_pipeline_cal_spatial_safeguard_wiring():
    """Orchestrator applies .cal, spatial weights, and reports the safeguard loop."""
    import asyncio
    from auto_roomeq.orchestrator import OptimizationOrchestrator
    
    l, r, sub = _fast_demo()
    seats = {
        "left": [l, r],  # r used as a second seat position (fine for weight computation)
        "right": [r, l],
    }
    cal = {
        "freqs": [20.0, 20000.0],
        "spl": [0.0, 0.0],
        "phase": None,
    }
    
    res = asyncio.run(OptimizationOrchestrator().run_pipeline(
        l, r, sub, target_taps=8192, mic_cal=cal, seat_measurements=seats,
    ))
    
    assert res["status"] == "success"
    assert res["acoustic_intelligence"]["mic_calibration"]["applied"] is True
    assert res["acoustic_intelligence"]["spatial_variance_weighting"]["left_active"] is True
    assert "safeguard_loop" in res and res["safeguard_loop"]["attempts"] >= 1
    assert "safeguard_decision_left" in res
    assert "modal_decay_left" in res
    assert len(res["acoustic_intelligence"]["sbir_neutral_mask_frequencies"]) >= 0


def test_pipeline_multi_sub_mso():
    """Orchestrator routes 2+ subwoofers into the MSO path."""
    import asyncio
    from auto_roomeq.orchestrator import OptimizationOrchestrator
    from auto_roomeq.dsp.measurement import Measurement
    
    l, r, sub = _fast_demo()
    # Second sub: same response shifted by 1 ms (different position)
    sub2_ir = np.roll(sub.ir.copy(), 48)
    sub2 = Measurement(name="Demo Subwoofer 2", ir=sub2_ir, sample_rate=48000, n_fft=16384)
    
    res = asyncio.run(OptimizationOrchestrator().run_pipeline(
        l, r, meas_subs=[sub, sub2], target_taps=8192,
    ))
    
    assert res["multi_sub_alignment"] is not None
    assert res["multi_sub_alignment"]["sub_count"] == 2
    assert len(res["multi_sub_alignment"]["alignments"]) == 2
    assert res["sub_alignment"] is None


def test_pipeline_wfir_bundle():
    """WFIR export adds warped FIR WAVs to the ZIP bundle."""
    import asyncio
    import zipfile as zf_mod
    
    from auto_roomeq.orchestrator import OptimizationOrchestrator
    
    l, r, sub = _fast_demo()
    res = asyncio.run(OptimizationOrchestrator().run_pipeline(l, r, sub, target_taps=8192, wfir_taps=1024))
    
    assert res["wfir_taps"] == 1024
    with zf_mod.ZipFile(io.BytesIO(res["zip_bundle_bytes"])) as zf:
        names = zf.namelist()
        assert "WAV_Filters/ALTAIR_WFIR_1024_Stereo.wav" in names
        assert "miniDSP/ALTAIR_miniDSP_Setup.txt" in names


# ---------------------------------------------------------------------------
# .mdat parser bridge
# ---------------------------------------------------------------------------
def test_mdat_parser_zip_text_export():
    """ZIP-packaged REW text export inside a .mdat payload is extracted."""
    from auto_roomeq.dsp.mdat_parser import parse_mdat
    
    text = "* Freq(Hz) SPL(dB) Phase(degrees)\n20.0 80.0 0.0\n100.0 82.0 -10.0\n1000.0 85.0 -40.0\n10000.0 80.0 -120.0\n20000.0 75.0 -170.0\n"
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("Measurement_export.txt", text)
    
    meas, meta = parse_mdat(buf.getvalue(), sample_rate=48000, name="Test .mdat")
    
    assert meta["parser"] == "zip_text_export"
    assert meas.sample_rate == 48000
    assert np.all(np.isfinite(meas.ir))


def test_mdat_parser_java_serialization_scan():
    """Java-serialized double[] arrays (frequency/SPL/phase) are recovered by the tokenizer."""
    from auto_roomeq.dsp.mdat_parser import parse_mdat
    
    freq = np.geomspace(20.0, 20000.0, 128)
    spl = 85.0 + 3.0 * np.sin(np.linspace(0, 4 * np.pi, len(freq)))
    phase = -40.0 * np.log2(freq / 100.0)
    
    def be_doubles(arr):
        return b"".join(struct.pack(">d", float(v)) for v in arr)
    
    def java_double_array(values, handle):
        out = b"\x75"  # TC_ARRAY
        out += b"\x71" + struct.pack(">I", 0x7E0000)  # TC_REFERENCE -> classDesc "[D" (handle 0)
        out += struct.pack(">I", handle)              # newHandle
        out += struct.pack(">I", len(values))         # element count
        out += be_doubles(values)
        return out
    
    # Minimal real Java serialization stream:
    payload = b"\xAC\xED\x00\x05"                     # magic + version
    payload += b"\x72" + struct.pack(">H", 2) + b"[D" # TC_CLASSDESC for "[D" (handle 0x7E0000)
    payload += struct.pack(">q", 0x1234567890ABCDEF)  # serialVersionUID
    payload += b"\x02"                                # SC_SERIALIZABLE
    payload += b"\x78"                                # TC_ENDBLOCKDATA (no fields)
    payload += b"\x74" + struct.pack(">H", len(b"DemoMDAT")) + b"DemoMDAT"  # TC_STRING (handle 0x7E0001)
    payload += java_double_array(freq, 0x7E0002)
    payload += java_double_array(spl, 0x7E0003)
    payload += java_double_array(phase, 0x7E0004)
    
    meas, meta = parse_mdat(payload, sample_rate=48000, name="Test .mdat")
    
    assert meta["parser"] == "java_serialization_scan"
    assert meta["frequency_points"] == len(freq)
    assert meta["phase_recovered"] is True
    assert np.all(np.isfinite(meas.ir))
    assert "DemoMDAT" in meas.name


def test_mdat_parser_rejects_garbage():
    from auto_roomeq.dsp.mdat_parser import parse_mdat
    
    with pytest.raises(ValueError):
        parse_mdat(b"\x00" * 64, sample_rate=48000)


# ---------------------------------------------------------------------------
# API: upload-cal, multi-sub upload, SSE stream, session persistence
# ---------------------------------------------------------------------------
@pytest.fixture(scope="module")
def client():
    with TestClient(__import__("auto_roomeq.server.app", fromlist=["app"]).app) as c:
        yield c


def test_upload_cal_endpoint(client):
    cal = b"* Freq SPL Phase\n20.0 -0.5 0.0\n100.0 0.0 2.0\n1000.0 0.1 5.0\n20000.0 0.4 20.0\n"
    r = client.post(
        "/api/measurements/upload-cal",
        files={"file": ("umik.cal", cal, "text/plain")},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["points"] == 4
    assert body["has_phase"] is True


def test_upload_multi_sub_endpoint(client):
    from auto_roomeq.orchestrator import generate_demo_room_measurements
    import soundfile as sf
    
    _, _, sub = generate_demo_room_measurements(sample_rate=48000, n_fft=4096)
    buf1, buf2 = io.BytesIO(), io.BytesIO()
    sf.write(buf1, sub.ir, 48000, format="WAV", subtype="FLOAT")
    sf.write(buf2, np.roll(sub.ir, 16), 48000, format="WAV", subtype="FLOAT")
    
    r = client.post(
        "/api/measurements/upload-multi-sub",
        files=[
            ("files", ("sub1.wav", buf1.getvalue(), "audio/wav")),
            ("files", ("sub2.wav", buf2.getvalue(), "audio/wav")),
        ],
        data={"sample_rate": "48000"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["sub_count"] == 2
    assert len(body["names"]) == 2


def test_session_round_trip(client):
    r = client.post("/api/session/save")
    assert r.status_code == 200 and r.json()["saved"] is True
    
    r = client.get("/api/session")
    assert r.json()["file_exists"] is True
    
    r = client.post("/api/session/load")
    assert r.status_code == 200 and r.json()["loaded"] is True
    
    r = client.post("/api/session/clear")
    assert r.status_code == 200
    assert client.get("/api/session").json()["file_exists"] is False


def test_optimize_stream_sse(client):
    events = []
    with client.stream(
        "POST",
        "/api/optimize/stream",
        json={"use_demo_measurements": True, "target_taps": 8192},
    ) as resp:
        assert resp.status_code == 200
        assert resp.headers["content-type"].startswith("text/event-stream")
        current_event = None
        for raw in resp.iter_lines():
            if raw.startswith("event: "):
                current_event = raw.split(": ", 1)[1]
            elif raw.startswith("data: ") and current_event:
                payload = json.loads(raw.split(": ", 1)[1])
                events.append((current_event, payload))
                current_event = None
    
    assert any(evt == "progress" for evt, _ in events)
    final = [p for evt, p in events if evt == "result"]
    assert len(final) == 1
    assert final[0]["status"] == "success"
    assert final[0]["safeguard_loop"]["attempts"] >= 1
