"""
Regression tests for bugs found during the full codebase audit.

Each test locks in one fix so the bug cannot silently return:
1. rew_api.execute_auto_repeated_sweeps used asyncio.sleep without importing
   asyncio -> NameError on the live-REW path.
2. rew_api._parse_frequency_response_data fed descending explicit arrays to
   np.interp (which requires ascending input) -> crash / garbage.
3. Orchestrator wavelet-decay pairing was positional; the analyzer may skip
   bands, silently mis-pairing dips (and empty probe lists triggered the
   analyzer's DEFAULT probe frequencies, polluting gating + neutral masks).
4. generate_log_chirp divided by ln(f_end/f_start) with no degenerate-input
   guard.
5. Session timestamps used deprecated datetime.utcnow().
"""

import asyncio
import datetime

import numpy as np
import pytest


def test_rew_client_frequency_response_sorting():
    """Explicit descending freq arrays must come back sorted ascending."""
    from auto_roomeq.integrations.rew_api import RewApiClient

    client = RewApiClient()

    freqs, spl = client._parse_frequency_response_data(
        [{"freq": 20000.0, "spl": 75.0}, {"freq": 20.0, "spl": 85.0}, {"freq": 1000.0, "spl": 90.0}]
    )
    assert np.all(np.diff(freqs) > 0)
    assert list(freqs) == [20.0, 1000.0, 20000.0]
    assert list(spl) == [85.0, 90.0, 75.0]

    freqs2, spl2 = client._parse_frequency_response_data(
        {"frequencies": [1000.0, 100.0, 10.0], "spl": [1.0, 2.0, 3.0]}
    )
    assert np.all(np.diff(freqs2) > 0)
    assert list(spl2) == [3.0, 2.0, 1.0]


def test_rew_client_auto_repeated_sweeps_uses_asyncio():
    """
    The live-REW repeated-sweep path awaits asyncio.sleep internally;
    before the fix this raised NameError: name 'asyncio' is not defined.
    Simulate a live REW: every poll returns one new measurement id.
    """
    from auto_roomeq.dsp.measurement import Measurement
    from auto_roomeq.integrations.rew_api import RewApiClient

    client = RewApiClient()

    fake_ir = np.zeros(4096)
    fake_ir[200] = 1.0
    fake_meas = Measurement(name="Fake REW", ir=fake_ir, sample_rate=48000, n_fft=4096)

    async def fake_get_measurements():
        return [{"id": 42}]

    async def fake_trigger_measurement(**kwargs):
        return {"id": 42}

    async def fake_get_measurement_data(measurement_id):
        return fake_meas

    client.get_measurements = fake_get_measurements
    client.trigger_measurement = fake_trigger_measurement
    client.get_measurement_data = fake_get_measurement_data

    result = asyncio.run(
        client.execute_auto_repeated_sweeps(channel="left", repetitions=1, sweep_length=128)
    )

    assert result["status"] == "success"
    assert result["repetitions_captured"] == 1
    assert result["measurement"].name == "ALTAIR_LEFT_1x_Stacked"
    assert np.max(np.abs(result["measurement"].ir)) > 0.9


def test_decay_entry_for_freq_keyed_pairing():
    """Skipped/unsorted decay bands must never be paired positionally."""
    from auto_roomeq.orchestrator import _decay_entry_for_freq

    decay = [
        {"freq_hz": 84.2, "decay_rt60_ms": 500.0, "is_true_mode": True},
        # band at 61.5 Hz "skipped" by the analyzer (list is shorter than probes)
        {"freq_hz": 61.5, "decay_rt60_ms": 80.0, "is_true_mode": False},
    ]

    assert _decay_entry_for_freq(decay, 61.0)["is_true_mode"] is False
    assert _decay_entry_for_freq(decay, 43.0) is None          # outside tolerance
    assert _decay_entry_for_freq(decay, 84.0)["is_true_mode"] is True
    assert _decay_entry_for_freq(None, 61.0) is None
    assert _decay_entry_for_freq([], 61.0) is None


def test_forced_neutral_mask_reordered_decay_entries():
    """Neutral-mask pairing is frequency-based, not positional."""
    from auto_roomeq.orchestrator import build_forced_neutral_mask

    freqs = np.geomspace(20.0, 20000.0, 2048)
    modal_info = {
        "peaks": [{"freq": 43.0, "spl": 90.0, "harmonic": 1, "is_harmonic_match": True}],
        "dips": [{"freq": 90.0, "spl": 70.0, "harmonic_dip": 1, "is_harmonic_match": True}],
    }
    # Deliberately reversed order + an extra entry to break positional pairing
    decay = [
        {"freq_hz": 90.0, "decay_rt60_ms": 60.0, "is_true_mode": False},
        {"freq_hz": 43.0, "decay_rt60_ms": 700.0, "is_true_mode": True},
    ]

    mask, report = build_forced_neutral_mask(freqs, None, modal_info, decay)

    band_90 = (freqs >= 90.0 * 2 ** (-1 / 6)) & (freqs <= 90.0 * 2 ** (1 / 6))
    band_43 = (freqs >= 43.0 * 2 ** (-1 / 6)) & (freqs <= 43.0 * 2 ** (1 / 6))
    assert np.all(mask[band_90])           # fast-decay dip clamped
    assert not np.all(mask[band_43])       # true mode untouched
    assert len(report) == 1
    assert report[0]["frequency_hz"] == pytest.approx(90.0, abs=0.2)


def test_generate_log_chirp_degenerate_guard():
    """f_end <= f_start must raise instead of silently producing a wrong sweep."""
    from auto_roomeq.dsp.acquisition import generate_log_chirp

    with pytest.raises(ValueError):
        generate_log_chirp(f_start=100.0, f_end=10.0, sample_rate=48000, length_samples=2048, include_timing_ref=False)
    with pytest.raises(ValueError):
        generate_log_chirp(f_start=0.0, f_end=1000.0, sample_rate=48000, length_samples=2048, include_timing_ref=False)
    with pytest.raises(ValueError):
        generate_log_chirp(f_start=100.0, f_end=30000.0, sample_rate=48000, length_samples=2048, include_timing_ref=False)


def test_session_timestamp_is_timezone_aware(tmp_path):
    """Session file metadata must not use deprecated naive utcnow()."""
    from auto_roomeq.server.routes import save_session
    import json

    import auto_roomeq.server.routes as routes_mod

    # isolate from any real session file
    old = routes_mod.SESSION_FILE
    fake = tmp_path / "altair_project.json"
    routes_mod.SESSION_FILE = str(fake)
    try:
        info = save_session()
        with open(info["path"], encoding="utf-8") as f:
            data = json.load(f)
        ts = datetime.datetime.fromisoformat(data["saved_at"])
        assert ts.tzinfo is not None
    finally:
        routes_mod.SESSION_FILE = old


# ---------------------------------------------------------------------------
# Second review round: Farina raw-recording contract, multi-sub state write,
# timing-preamble stripping, tolerance-keyed neutral-mask pairing.
# ---------------------------------------------------------------------------
def _make_raw_sweep_recording(sr=48000, n=8192, ir_peak=100, preamble=False):
    from scipy import signal as scipy_signal

    from auto_roomeq.dsp.acquisition import generate_log_chirp

    chirp, _ = generate_log_chirp(10.0, 24000.0, sample_rate=sr, length_samples=n, include_timing_ref=False)
    ir = np.zeros(n)
    ir[ir_peak] = 1.0
    ir[ir_peak + 30] = 0.5
    recorded = scipy_signal.fftconvolve(chirp, ir, mode="full")[:n]
    if preamble:
        ref_burst = 0.5 * np.sin(2.0 * np.pi * 8000.0 * np.linspace(0, 0.010, int(0.010 * sr), endpoint=False))
        ref_burst *= 0.5 * (1.0 - np.cos(2.0 * np.pi * np.linspace(0, 0.010, int(0.010 * sr), endpoint=False) / 0.010))
        preamble_samples = int(0.010 * sr) + int(0.100 * sr)
        recorded = np.concatenate([ref_burst, np.zeros(int(0.100 * sr)), recorded])
        return recorded, ir_peak, preamble_samples
    return recorded, ir_peak, 0


def test_recorded_sweep_to_measurement_expects_raw_recording():
    """
    Regression: the function used to feed the ALREADY-deconvolved IR into
    farina_harmonic_separation (which performs its own deconvolution), so every
    sweep-uploaded measurement was the room IR convolved with a tilted inverse
    sweep. A raw recording must now recover the true IR, peak-centered at the
    1,024-sample pre-context marker.
    """
    from auto_roomeq.dsp.acquisition import recorded_sweep_to_measurement

    recorded, ir_peak, _ = _make_raw_sweep_recording()
    meas, diag = recorded_sweep_to_measurement(recorded, sample_rate=48000, n_fft=8192)

    recovered_peak = int(np.argmax(np.abs(meas.ir)))
    assert abs(recovered_peak - 1024) <= 3, f"peak at {recovered_peak}, expected ~1024"
    assert diag["preamble_samples"] == 0
    # The tail echo at +30 samples must be preserved as well
    assert np.max(np.abs(meas.ir[1024 + 30 - 3 : 1024 + 30 + 3])) > 0.1


def test_recorded_sweep_to_measurement_strips_timing_preamble():
    """Recordings from /auto-sweep include the 110 ms timing preamble; it must be stripped."""
    from auto_roomeq.dsp.acquisition import recorded_sweep_to_measurement

    recorded, ir_peak, preamble_samples = _make_raw_sweep_recording(preamble=True)
    meas, diag = recorded_sweep_to_measurement(recorded, sample_rate=48000, n_fft=8192)

    assert diag["preamble_samples"] == preamble_samples
    recovered_peak = int(np.argmax(np.abs(meas.ir)))
    assert abs(recovered_peak - 1024) <= 3, f"peak at {recovered_peak}, expected ~1024"


def test_upload_multi_sub_updates_module_state():
    """
    Regression: the endpoint assigned the module-level current_sub_measurements
    without a `global` declaration, so the assignment created a local variable
    and the MSO path never activated despite a success response.
    """
    import io as io_mod

    import soundfile as sf
    from fastapi.testclient import TestClient

    from auto_roomeq.server.app import app as fastapi_app
    import auto_roomeq.server.routes as routes_mod

    _, _, sub = __import__("auto_roomeq.orchestrator", fromlist=["generate_demo_room_measurements"]).generate_demo_room_measurements(
        sample_rate=48000, n_fft=4096
    )
    buf1, buf2 = io_mod.BytesIO(), io_mod.BytesIO()
    sf.write(buf1, sub.ir, 48000, format="WAV", subtype="FLOAT")
    sf.write(buf2, np.roll(sub.ir, 16), 48000, format="WAV", subtype="FLOAT")

    try:
        with TestClient(fastapi_app) as client:
            r = client.post(
                "/api/measurements/upload-multi-sub",
                files=[
                    ("files", ("sub1.wav", buf1.getvalue(), "audio/wav")),
                    ("files", ("sub2.wav", buf2.getvalue(), "audio/wav")),
                ],
                data={"sample_rate": "48000"},
            )
            assert r.status_code == 200
            assert len(routes_mod.current_sub_measurements) == 2
            assert routes_mod.current_measurements["sub"].name.startswith("Subwoofer 1")
    finally:
        routes_mod.current_sub_measurements = []
        routes_mod.current_measurements.pop("sub", None)


def test_forced_neutral_mask_skipped_band_not_mispaired():
    """
    Regression: unbounded nearest-frequency pairing would clamp a dip whose
    decay band was skipped by the analyzer. Tolerance-keyed pairing must leave
    unknown dips alone.
    """
    from auto_roomeq.orchestrator import build_forced_neutral_mask

    freqs = np.geomspace(20.0, 20000.0, 2048)
    modal_info = {
        "peaks": [{"freq": 43.0, "spl": 90.0, "harmonic": 1, "is_harmonic_match": True}],
        "dips": [
            {"freq": 61.5, "spl": 70.0, "harmonic_dip": 1, "is_harmonic_match": True},
            {"freq": 90.0, "spl": 72.0, "harmonic_dip": 1, "is_harmonic_match": True},
        ],
    }
    # The 90 Hz band was "skipped" by the analyzer; only 43/61.5 present.
    decay = [
        {"freq_hz": 43.0, "decay_rt60_ms": 700.0, "is_true_mode": True},
        {"freq_hz": 61.5, "decay_rt60_ms": 80.0, "is_true_mode": False},
    ]

    mask, report = build_forced_neutral_mask(freqs, None, modal_info, decay)

    band_61 = (freqs >= 61.5 * 2 ** (-1 / 6)) & (freqs <= 61.5 * 2 ** (1 / 6))
    band_90 = (freqs >= 90.0 * 2 ** (-1 / 6)) & (freqs <= 90.0 * 2 ** (1 / 6))
    assert np.all(mask[band_61])          # confirmed fast-decay dip clamped
    assert not np.any(mask[band_90])      # unknown dip untouched (no decay data)
    assert len(report) == 1
    assert report[0]["frequency_hz"] == pytest.approx(61.5, abs=0.2)
