"""
REST API Routes for AutoRoomEQ / ALTAIR.
"""

from typing import Dict, Optional, List, Any
import io
import os
import json
import asyncio
import datetime
import numpy as np
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, Response
from fastapi.responses import StreamingResponse

from .schemas import (
    StatusResponse,
    OptimizationRequest,
    OptimizationResponse,
    PlotData,
    AcousticIntelligence,
)
from ..orchestrator import OptimizationOrchestrator, generate_demo_room_measurements
from ..integrations.rew_api import RewApiClient
from ..dsp.measurement import parse_rew_text, load_wav_ir, Measurement, hybrid_spatial_average
from ..dsp.acquisition import load_cal_file, recorded_sweep_to_measurement
from ..dsp.mdat_parser import parse_mdat
from ..dsp.sub_alignment import optimize_sub_mains_alignment

router = APIRouter(prefix="/api")

# Singleton state
rew_client = RewApiClient()
orchestrator = OptimizationOrchestrator(rew_client=rew_client)

# In-memory storage for uploaded measurements and last generated zip
state_lock = asyncio.Lock()
current_measurements: Dict[str, Measurement] = {}
current_seat_sets: Dict[str, List[Measurement]] = {}
current_sub_measurements: List[Measurement] = []
current_cal: Optional[Dict[str, Any]] = None
latest_zip_bundle: Optional[bytes] = None
latest_result_cache: Optional[Dict[str, any]] = None

# Session persistence (JSON project file next to the repository root)
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SESSION_FILE = os.path.join(PROJECT_ROOT, "altair_project.json")


# ---------------------------------------------------------------------------
# Session persistence helpers
# ---------------------------------------------------------------------------
def _serialize_measurement(m: Measurement) -> Dict[str, Any]:
    return {
        "name": m.name,
        "sample_rate": m.sample_rate,
        "n_fft": m.n_fft,
        "ir": np.asarray(m.ir, dtype=np.float32).tolist(),
    }


def _deserialize_measurement(d: Dict[str, Any]) -> Measurement:
    return Measurement(
        name=str(d.get("name", "Session Measurement")),
        ir=np.asarray(d.get("ir", []), dtype=np.float64),
        sample_rate=int(d.get("sample_rate", 48000)),
        n_fft=int(d.get("n_fft", 65536)) if d.get("n_fft") else None,
    )


def save_session() -> Dict[str, Any]:
    """Persist in-memory project state to SESSION_FILE (JSON, atomic write)."""
    global current_measurements, current_seat_sets, current_sub_measurements, current_cal, latest_result_cache
    
    data = {
        "version": 1,
        "saved_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "measurements": {ch: _serialize_measurement(m) for ch, m in current_measurements.items()},
        "seat_sets": {ch: [_serialize_measurement(m) for m in seats] for ch, seats in current_seat_sets.items()},
        "sub_measurements": [_serialize_measurement(m) for m in current_sub_measurements],
        "cal": current_cal,
        "latest_result_cache": latest_result_cache,
    }
    tmp_path = SESSION_FILE + ".tmp"
    with open(tmp_path, "w", encoding="utf-8") as f:
        json.dump(data, f)
    os.replace(tmp_path, SESSION_FILE)  # atomic on Windows/POSIX
    return {
        "saved": True,
        "path": SESSION_FILE,
        "channels": list(current_measurements.keys()),
        "sub_measurements": len(current_sub_measurements),
        "bytes": os.path.getsize(SESSION_FILE) if os.path.exists(SESSION_FILE) else 0,
    }


def load_session() -> Dict[str, Any]:
    """Restore project state from SESSION_FILE if present."""
    global current_measurements, current_seat_sets, current_sub_measurements, current_cal, latest_result_cache
    
    if not os.path.exists(SESSION_FILE):
        raise FileNotFoundError(SESSION_FILE)
        
    with open(SESSION_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)
        
    if data.get("version") != 1:
        raise ValueError(f"Unsupported session file version: {data.get('version')}")
        
    current_measurements = {
        ch: _deserialize_measurement(d) for ch, d in (data.get("measurements") or {}).items()
    }
    current_seat_sets = {
        ch: [_deserialize_measurement(d) for d in seats] for ch, seats in (data.get("seat_sets") or {}).items()
    }
    current_sub_measurements = [_deserialize_measurement(d) for d in (data.get("sub_measurements") or [])]
    current_cal = data.get("cal")
    latest_result_cache = data.get("latest_result_cache")
    
    return {
        "loaded": True,
        "path": SESSION_FILE,
        "channels": list(current_measurements.keys()),
        "seat_sets": {ch: len(seats) for ch, seats in current_seat_sets.items()},
        "sub_measurements": len(current_sub_measurements),
        "cal_loaded": current_cal is not None,
        "saved_at": data.get("saved_at"),
    }


def _clear_session_file() -> None:
    if os.path.exists(SESSION_FILE):
        os.remove(SESSION_FILE)


# Best-effort session restore at startup
try:
    load_session()
except Exception:
    pass


# ---------------------------------------------------------------------------
# Measurement resolution shared by /optimize and /optimize/stream
# ---------------------------------------------------------------------------
async def _resolve_measurements(request: OptimizationRequest):
    """Determine (meas_l, meas_r, meas_sub, meas_subs) per the documented precedence."""
    if request.use_demo_measurements:
        meas_l, meas_r, meas_sub = generate_demo_room_measurements()
        return meas_l, meas_r, meas_sub, None
        
    if request.rew_measurement_ids and len(request.rew_measurement_ids) > 0:
        try:
            left_id = request.rew_measurement_ids[0]
            meas_l = await rew_client.get_measurement_data(left_id)
            if meas_l is None:
                raise ValueError(f"Could not load REW measurement {left_id}")
                
            meas_r = None
            if len(request.rew_measurement_ids) > 1:
                meas_r = await rew_client.get_measurement_data(request.rew_measurement_ids[1])
                
            meas_sub = None
            if len(request.rew_measurement_ids) > 2:
                meas_sub = await rew_client.get_measurement_data(request.rew_measurement_ids[2])
            return meas_l, meas_r, meas_sub, None
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to fetch measurements from REW: {str(e)}")
            
    if "left" in current_measurements:
        meas_l = current_measurements["left"]
        meas_r = current_measurements.get("right", meas_l)
        meas_sub = current_measurements.get("sub")
        return meas_l, meas_r, meas_sub, list(current_sub_measurements)
        
    # Try auto-querying open REW measurements
    rew_conn = await rew_client.check_connection()
    if rew_conn.get("connected"):
        rew_meas_list = await rew_client.get_measurements()
        parsed_ids = []
        if isinstance(rew_meas_list, dict):
            rew_meas_list = rew_meas_list.get("measurements", [])
        if isinstance(rew_meas_list, list):
            for item in rew_meas_list:
                if isinstance(item, dict):
                    if "id" in item:
                        parsed_ids.append(item["id"])
                    elif "measurementId" in item:
                        parsed_ids.append(item["measurementId"])
                elif isinstance(item, (int, str)):
                    parsed_ids.append(item)
                    
        if parsed_ids:
            try:
                meas_l = await rew_client.get_measurement_data(parsed_ids[0])
                meas_r = await rew_client.get_measurement_data(parsed_ids[1]) if len(parsed_ids) > 1 else meas_l
                meas_sub = await rew_client.get_measurement_data(parsed_ids[2]) if len(parsed_ids) > 2 else None
                return meas_l, meas_r, meas_sub, None
            except Exception as e:
                raise HTTPException(status_code=400, detail=f"Failed to pull active measurements from REW: {str(e)}")
        raise HTTPException(status_code=400, detail="No measurements found in REW or ALTAIR. Please capture a measurement in REW or upload sweep files.")
    raise HTTPException(status_code=400, detail="No uploaded measurements available and REW is not connected. Please upload files or enable Demo mode.")


async def _execute_pipeline(request: OptimizationRequest) -> Dict[str, Any]:
    """Resolve inputs (under lock), run the pipeline in a worker thread, cache results."""
    global latest_zip_bundle, latest_result_cache
    
    async with state_lock:
        meas_l, meas_r, meas_sub, meas_subs = await _resolve_measurements(request)
        mic_cal = current_cal
        seat_sets = dict(current_seat_sets) if current_seat_sets else None
    
    # CPU-heavy pipeline: run outside the event loop so concurrent requests stay served
    def sync_run() -> Dict[str, Any]:
        return asyncio.run(
            orchestrator.run_pipeline(
                meas_left=meas_l,
                meas_right=meas_r,
                meas_sub=meas_sub,
                meas_subs=meas_subs,
                target_curve_name=request.target.name,
                bass_boost_db=request.target.bass_boost_db,
                bass_cutoff_hz=request.target.bass_cutoff_hz,
                hf_slope_db_per_oct=request.target.hf_slope_db_per_oct,
                hf_start_hz=request.target.hf_start_hz,
                crossover_freq=request.crossover_freq_hz,
                crossover_order=request.crossover_order,
                sub_crossover_freq=request.sub_crossover_freq_hz,
                target_taps=request.target_taps,
                temp_celsius=request.temperature_celsius,
                relative_humidity_pct=request.relative_humidity_pct,
                pressure_kpa=request.pressure_kpa,
                listening_distance_m=request.listening_distance_m,
                mic_orientation_deg=request.mic_orientation_deg,
                mic_cal=mic_cal,
                seat_measurements=seat_sets,
                wfir_taps=request.wfir_taps,
            )
        )
    
    result = await asyncio.to_thread(sync_run)
    
    intel = None
    if "acoustic_intelligence" in result and result["acoustic_intelligence"]:
        intel = AcousticIntelligence(**result["acoustic_intelligence"])
    
    resp_obj = OptimizationResponse(
        status=result["status"],
        sample_rate=result["sample_rate"],
        target_taps=result["target_taps"],
        global_preamp_db=result["global_preamp_db"],
        acoustic_intelligence=intel,
        modal_info_left=result["modal_info_left"],
        modal_info_right=result["modal_info_right"],
        modal_decay_left=result.get("modal_decay_left"),
        modal_decay_right=result.get("modal_decay_right"),
        preringing_left=result["preringing_left"],
        preringing_right=result["preringing_right"],
        zwicker_masking_left=result.get("zwicker_masking_left"),
        zwicker_masking_right=result.get("zwicker_masking_right"),
        safeguard_loop=result.get("safeguard_loop"),
        safeguard_decision_left=result.get("safeguard_decision_left"),
        safeguard_decision_right=result.get("safeguard_decision_right"),
        sub_alignment=result.get("sub_alignment"),
        multi_sub_alignment=result.get("multi_sub_alignment"),
        wfir_taps=result.get("wfir_taps"),
        true_peak_left_dbfs=result.get("true_peak_left_dbfs"),
        true_peak_right_dbfs=result.get("true_peak_right_dbfs"),
        plots=PlotData(**result["plots"]),
    )
    
    async with state_lock:
        latest_zip_bundle = result["zip_bundle_bytes"]
        # Cache serializable dict without binary zip_bundle_bytes
        latest_result_cache = resp_obj.model_dump()
        # If the user opted into session persistence before, keep the project file fresh
        if os.path.exists(SESSION_FILE):
            try:
                save_session()
            except Exception:
                pass
    return result, resp_obj


# ---------------------------------------------------------------------------
# Status & REW
# ---------------------------------------------------------------------------
@router.get("/status", response_model=StatusResponse)
async def get_status():
    """Check REW API connectivity and system state."""
    rew_status = await rew_client.check_connection()
    return StatusResponse(
        app="ALTAIR",
        version="1.0.0",
        rew_connected=rew_status.get("connected", False),
        rew_base_url=rew_client.base_url,
        rew_message=rew_status.get("message") or rew_status.get("error"),
    )


@router.get("/rew/measurements")
async def get_rew_measurements():
    """Fetch list of open measurements from REW."""
    try:
        meas_list = await rew_client.get_measurements()
        return {"measurements": meas_list}
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch from REW API: {str(e)}")


# ---------------------------------------------------------------------------
# Measurement ingestion
# ---------------------------------------------------------------------------
def _parse_measurement_bytes(
    content_bytes: bytes,
    filename: str,
    sample_rate: int,
    measurement_type: str = "ir",
) -> Measurement:
    """Parse uploaded bytes into a Measurement (WAV IR, text export, .mdat, or recorded sweep)."""
    lower = filename.lower()
    
    if measurement_type in ("sweep", "recorded_sweep"):
        from ..dsp.acquisition import recorded_sweep_to_measurement as _sweep_to_meas
        import soundfile as sf
        
        data, sr = sf.read(io.BytesIO(content_bytes), dtype="float64", always_2d=False)
        if data.ndim > 1:
            data = data[:, 0]
        meas, _diag = _sweep_to_meas(data, sample_rate=int(sr) if sr else sample_rate, name=filename)
        return meas
        
    if lower.endswith(".mdat"):
        meas, _meta = parse_mdat(content_bytes, sample_rate=sample_rate, name=filename)
        return meas
        
    if lower.endswith(".wav"):
        return load_wav_ir(content_bytes, name=filename)
        
    text_content = content_bytes.decode("utf-8", errors="ignore")
    return parse_rew_text(text_content, sample_rate=sample_rate, name=filename)


@router.post("/measurements/upload")
async def upload_measurement(
    file: UploadFile = File(...),
    channel: str = Form("left"),  # 'left', 'right', 'sub'
    sample_rate: int = Form(48000),
    measurement_type: str = Form("ir"),  # 'ir' (default) | 'sweep'/'recorded_sweep'
):
    """Upload a measurement file (REW text/FRD export, WAV impulse response, .mdat, or recorded sweep)."""
    try:
        content_bytes = await file.read()
        if not content_bytes or len(content_bytes) == 0:
            raise ValueError("Uploaded file is empty (0 bytes)")
            
        filename = file.filename or "uploaded_measurement"
        meas = _parse_measurement_bytes(content_bytes, filename, sample_rate, measurement_type)
            
        async with state_lock:
            current_measurements[channel.lower()] = meas
        return {
            "status": "success",
            "channel": channel.lower(),
            "name": meas.name,
            "sample_rate": meas.sample_rate,
            "points": len(meas.freqs),
            "measurement_type": measurement_type,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse measurement: {str(e)}")


@router.post("/measurements/upload-cal")
async def upload_mic_calibration(file: UploadFile = File(...)):
    """Upload a microphone .cal calibration file (freq Hz, SPL dB[, phase deg])."""
    global current_cal
    
    try:
        content_bytes = await file.read()
        if not content_bytes or len(content_bytes) == 0:
            raise ValueError("Uploaded calibration file is empty (0 bytes)")
            
        text = content_bytes.decode("utf-8", errors="ignore")
        freqs, spl, phase = load_cal_file(text)
        
        async with state_lock:
            current_cal = {
                "freqs": freqs.tolist(),
                "spl": spl.tolist(),
                "phase": phase.tolist() if phase is not None else None,
            }
        return {
            "status": "success",
            "points": len(freqs),
            "has_phase": phase is not None,
            "frequency_range_hz": [round(float(freqs[0]), 1), round(float(freqs[-1]), 1)],
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse .cal file: {str(e)}")


@router.post("/measurements/upload-repeated")
async def upload_repeated_measurements(
    files: List[UploadFile] = File(...),
    channel: str = Form("left"),
    sample_rate: int = Form(48000),
):
    """
    Ingest multiple repeated sweep measurements of the same speaker position.
    Performs sub-sample coherent time-domain stacking, boosting SNR by 10*log10(N) dB.
    """
    from ..dsp.acquisition import coherent_impulse_stack
    
    if not files or len(files) == 0:
        raise HTTPException(status_code=400, detail="No measurement files uploaded.")
        
    try:
        parsed_irs = []
        for file in files:
            content_bytes = await file.read()
            if not content_bytes or len(content_bytes) == 0:
                continue
            filename = file.filename or "repeat"
            m = _parse_measurement_bytes(content_bytes, filename, sample_rate)
            parsed_irs.append(m.ir)
            
        if not parsed_irs:
            raise ValueError("No valid measurement files could be parsed.")
            
        stacked_ir, snr_improvement_db = coherent_impulse_stack(parsed_irs, sample_rate=sample_rate)
        stacked_meas = Measurement(
            name=f"{channel.upper()} Coherent Stack ({len(parsed_irs)}x)",
            ir=stacked_ir,
            sample_rate=sample_rate,
        )
        
        async with state_lock:
            current_measurements[channel.lower()] = stacked_meas
        return {
            "status": "success",
            "channel": channel.lower(),
            "name": stacked_meas.name,
            "repetitions": len(parsed_irs),
            "snr_improvement_db": round(snr_improvement_db, 2),
            "sample_rate": sample_rate,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed repeated sweep averaging: {str(e)}")


@router.post("/measurements/upload-multi-seat")
async def upload_multi_seat_measurements(
    files: List[UploadFile] = File(...),
    channel: str = Form("left"),
    sample_rate: int = Form(48000),
    schroeder_freq: float = Form(300.0),
):
    """
    Ingest multi-seat spatial measurements (e.g. MLP, Left seat, Right seat).
    Performs IR Sync time alignment and hybrid spatial averaging (vector below Schroeder, RMS above)
    with continuous ERB psychoacoustic smoothing. The individual seats are retained so the
    pipeline can compute spatial variance weights W(f) for Module 2 regularization.
    """
    if not files or len(files) == 0:
        raise HTTPException(status_code=400, detail="No measurement files uploaded.")
        
    try:
        meas_list = []
        for i, file in enumerate(files, 1):
            content_bytes = await file.read()
            if not content_bytes or len(content_bytes) == 0:
                continue
            filename = file.filename or f"Seat_{i}"
            m = _parse_measurement_bytes(content_bytes, filename, sample_rate)
            meas_list.append(m)
            
        if not meas_list:
            raise ValueError("No valid seat measurements could be parsed.")
            
        spat_meas = hybrid_spatial_average(
            meas_list,
            f_trans=schroeder_freq,
            name=f"{channel.upper()} Multi-Seat Average ({len(meas_list)} positions)",
            erb_smooth=True,
        )
        
        async with state_lock:
            current_measurements[channel.lower()] = spat_meas
            current_seat_sets[channel.lower()] = meas_list
        return {
            "status": "success",
            "channel": channel.lower(),
            "name": spat_meas.name,
            "seat_count": len(meas_list),
            "schroeder_transition_hz": schroeder_freq,
            "erb_smoothing": True,
            "sample_rate": sample_rate,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed multi-seat spatial averaging: {str(e)}")


@router.post("/measurements/upload-multi-sub")
async def upload_multi_sub_measurements(
    files: List[UploadFile] = File(...),
    sample_rate: int = Form(48000),
):
    """
    Upload measurements for 2-4 independent subwoofers. Retained for Multi-Sub Matrix
    Optimization (MSO) during the optimization run.
    """
    if not files or len(files) == 0:
        raise HTTPException(status_code=400, detail="No subwoofer measurement files uploaded.")
        
    try:
        meas_list = []
        for i, file in enumerate(files, 1):
            content_bytes = await file.read()
            if not content_bytes or len(content_bytes) == 0:
                continue
            filename = file.filename or f"Subwoofer_{i}"
            m = _parse_measurement_bytes(content_bytes, filename, sample_rate)
            m = Measurement(name=f"Subwoofer {i}: {m.name}", ir=m.ir, sample_rate=m.sample_rate, n_fft=m.n_fft)
            meas_list.append(m)
            
        if len(meas_list) < 2:
            raise ValueError("Multi-Sub optimization requires at least 2 subwoofer measurements.")
        if len(meas_list) > 4:
            meas_list = meas_list[:4]
            
        async with state_lock:
            global current_sub_measurements
            current_sub_measurements = meas_list
            current_measurements["sub"] = meas_list[0]
        return {
            "status": "success",
            "sub_count": len(meas_list),
            "names": [m.name for m in meas_list],
            "sample_rate": sample_rate,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed multi-sub upload: {str(e)}")


@router.get("/measurements/auto-sweep")
async def download_test_sweep(
    channel: str = "left",
    duration_s: float = 10.0,
    repetitions: int = 2,
    include_timing_ref: bool = True,
    sample_rate: int = 48000,
):
    """
    Generate downloadable high-precision 24-bit test sweep audio file.
    Always returns an audio/wav attachment for browser download.
    """
    from ..dsp.acquisition import generate_log_chirp
    import soundfile as sf

    # Bound inputs to prevent unbounded memory allocation / DoS
    duration_s = min(60.0, max(0.5, float(duration_s)))
    sample_rate = min(192000, max(22050, int(sample_rate)))
    repetitions = min(16, max(1, int(repetitions)))

    length_samples = int(duration_s * sample_rate)
    sweep, _ = generate_log_chirp(
        f_start=10.0,
        f_end=min(24000.0, float(sample_rate) * 0.48),
        sample_rate=int(sample_rate),
        length_samples=length_samples,
        include_timing_ref=bool(include_timing_ref),
    )
    
    wav_buf = io.BytesIO()
    sf.write(wav_buf, sweep, int(sample_rate), format="WAV", subtype="PCM_24")
    wav_bytes = wav_buf.getvalue()
    
    return Response(
        content=wav_bytes,
        media_type="audio/wav",
        headers={"Content-Disposition": f'attachment; filename="ALTAIR_Test_Sweep_{channel}_{sample_rate}Hz.wav"'},
    )


@router.post("/measurements/auto-sweep")
async def trigger_auto_sweep_rew(
    channel: str = "left",
    duration_s: float = 10.0,
    repetitions: int = 2,
    sample_rate: int = 48000,
):
    """
    Trigger automated sweep acquisition through REW REST API or return standalone sweep audio.
    """
    from ..dsp.acquisition import generate_log_chirp
    import soundfile as sf

    duration_s = min(60.0, max(0.5, float(duration_s)))
    sample_rate = min(192000, max(22050, int(sample_rate)))
    repetitions = min(16, max(1, int(repetitions)))

    rew_conn = await rew_client.check_connection()
    if rew_conn.get("connected"):
        sweep_k = min(1024, max(32, int(2 ** round(np.log2(max(1.0, duration_s * sample_rate / 1024.0))))))
        res = await rew_client.trigger_measurement(
            name=f"ALTAIR_{channel.upper()}_{repetitions}x",
            sweep_length=sweep_k,
            sample_rate=sample_rate,
        )
        if res:
            return {
                "status": "success",
                "mode": "rew_api",
                "message": f"Triggered automated sweep for {channel.upper()} in REW.",
                "rew_response": res,
            }
            
    # Standalone mode: return 24-bit test sweep WAV audio
    length_samples = int(duration_s * sample_rate)
    sweep, _ = generate_log_chirp(
        f_start=10.0,
        f_end=min(24000.0, float(sample_rate) * 0.48),
        sample_rate=int(sample_rate),
        length_samples=length_samples,
    )
    wav_buf = io.BytesIO()
    sf.write(wav_buf, sweep, int(sample_rate), format="WAV", subtype="PCM_24")
    wav_bytes = wav_buf.getvalue()
    return Response(
        content=wav_bytes,
        media_type="audio/wav",
        headers={"Content-Disposition": f'attachment; filename="ALTAIR_Test_Sweep_{channel}_{sample_rate}Hz.wav"'},
    )


@router.post("/measurements/auto-repeated-sweep")
async def trigger_auto_repeated_sweep(
    channel: str = "left",
    repetitions: int = 4,
    sweep_length: int = 512,
    sample_rate: int = 48000,
    use_simulation: bool = False,
):
    """
    Execute automated repeated sweep measurement via REW API or realistic simulation.
    Automatically cross-correlates and stacks repetitions coherently to boost SNR by 10*log10(N) dB.
    Supports channel='left', 'right', 'sub', or 'all'.
    """
    from ..dsp.acquisition import coherent_impulse_stack
    from ..orchestrator import generate_demo_room_measurements

    # Guard bounds: repetitions clamped between 1 and 64 (supports custom user inputs)
    repetitions = min(64, max(1, int(repetitions)))
    sweep_length = min(1024, max(128, int(sweep_length)))
    sample_rate = min(192000, max(22050, int(sample_rate)))

    channel_clean = channel.lower().strip()
    channels_to_measure = ["left", "right", "sub"] if channel_clean == "all" else [channel_clean]
    results_summary = {}

    rew_conn = await rew_client.check_connection()
    is_rew_live = rew_conn.get("connected") and not use_simulation

    for ch in channels_to_measure:
        if is_rew_live:
            try:
                res = await rew_client.execute_auto_repeated_sweeps(
                    channel=ch,
                    repetitions=repetitions,
                    sweep_length=sweep_length,
                    sample_rate=sample_rate,
                )
                async with state_lock:
                    current_measurements[ch] = res["measurement"]
                diag = res.get("diagnostics", {})
                accepted = diag.get("accepted_count", res.get("repetitions_captured", repetitions))
                rejection_pct = diag.get("rejection_rate_pct", 0.0)
                results_summary[ch] = {
                    "repetitions": accepted,
                    "total_requested": repetitions,
                    "included_count": accepted,
                    "rejected_count": max(0, repetitions - accepted),
                    "included_pct": round((accepted / max(1, repetitions)) * 100.0, 1),
                    "rejection_rate_pct": rejection_pct,
                    "snr_gain_db": res.get("snr_improvement_db", round(10.0 * np.log10(max(1, accepted)), 2)),
                    "mode": "rew_api",
                    "saved": True,
                    "sample_rate": sample_rate,
                    "points": len(res["measurement"].ir),
                }
            except Exception as e:
                # Fallback if specific REW measurement failed
                raise HTTPException(status_code=500, detail=f"REW sweep failed for {ch}: {str(e)}")
        else:
            # Standalone / Simulation mode
            demo_l, demo_r, demo_sub = generate_demo_room_measurements(sample_rate=sample_rate, n_fft=16384)
            base_meas = demo_l if ch == "left" else (demo_r if ch == "right" else demo_sub)
            
            # Synthesize N repeated sweeps with independent room noise
            noisy_repeats = []
            for i in range(repetitions):
                noise = np.random.normal(0, 0.002, size=len(base_meas.ir))
                # For demonstration of outlier rejection on larger stacks (>= 6 sweeps), simulate 1 transient noise spike
                if repetitions >= 6 and i == 1:
                    spike = np.zeros_like(base_meas.ir)
                    spike[int(0.01 * sample_rate)] = 0.5
                    noisy_repeats.append(base_meas.ir + noise + spike)
                else:
                    noisy_repeats.append(base_meas.ir + noise)
                
            stacked_ir, snr_gain, diag = coherent_impulse_stack(
                noisy_repeats, sample_rate=sample_rate, return_diagnostics=True
            )
            
            stacked_meas = Measurement(
                name=f"ALTAIR_{ch.upper()}_{repetitions}x_Stacked",
                ir=stacked_ir,
                sample_rate=sample_rate,
            )
            async with state_lock:
                current_measurements[ch] = stacked_meas
                
            accepted = diag["accepted_count"]
            rejection_pct = diag["rejection_rate_pct"]
            results_summary[ch] = {
                "repetitions": accepted,
                "total_requested": repetitions,
                "included_count": accepted,
                "rejected_count": max(0, repetitions - accepted),
                "included_pct": round((accepted / max(1, repetitions)) * 100.0, 1),
                "rejection_rate_pct": rejection_pct,
                "baseline_snr_db": diag.get("baseline_snr_db", 38.5),
                "final_snr_db": diag.get("final_snr_db", 42.1),
                "snr_gain_db": round(float(snr_gain), 2),
                "theoretical_max_snr_db": diag.get("theoretical_max_snr_db", round(10.0 * np.log10(max(1, repetitions)), 2)),
                "best_candidate_repeat": diag.get("best_candidate_repeat", 1),
                "decision": diag.get("decision", "Averaging provided a measurable improvement."),
                "candidate_attempts": diag.get("candidate_attempts", []),
                "correlation_scores": diag.get("correlation_scores", []),
                "mode": "simulated",
                "saved": True,
                "sample_rate": sample_rate,
                "points": len(stacked_ir),
            }

    # Compute actual SNR boost across measured channels
    avg_reps = sum(r["repetitions"] for r in results_summary.values()) / max(1, len(results_summary))
    snr_boost = round(float(10.0 * np.log10(max(1.0, avg_reps))), 2)
    return {
        "status": "success",
        "channel": channel_clean,
        "mode": "rew_api" if is_rew_live else "standalone_simulated",
        "repetitions": int(round(avg_reps)),
        "snr_improvement_db": snr_boost,
        "channels_measured": channels_to_measure,
        "details": results_summary,
        "message": f"Successfully performed automated {int(round(avg_reps))}x sweeps (+{snr_boost} dB SNR noise floor reduction)!",
    }


# ---------------------------------------------------------------------------
# Optimization
# ---------------------------------------------------------------------------
@router.post("/optimize", response_model=OptimizationResponse)
async def run_optimization(request: OptimizationRequest):
    """Execute the 1-Click Digital Room Correction optimization pipeline."""
    try:
        _result, resp_obj = await _execute_pipeline(request)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Optimization failed: {str(e)}")
    return resp_obj


@router.post("/optimize/stream")
async def run_optimization_stream(request: OptimizationRequest):
    """
    Live optimization with Server-Sent Events (SSE).

    Events:
      event: progress   data: {"type":"progress","step":str,"pct":int,"detail":str}
      event: result     data: <OptimizationResponse JSON>
      event: error      data: {"detail": str}
    """
    async with state_lock:
        queue: asyncio.Queue = asyncio.Queue()
        loop = asyncio.get_running_loop()
        
        def on_progress(step: str, pct: int, detail: str):
            loop.call_soon_threadsafe(
                queue.put_nowait, {"type": "progress", "step": step, "pct": pct, "detail": detail}
            )
        
        # Resolve inputs and snapshot shared state before spawning the worker thread
        meas_l, meas_r, meas_sub, meas_subs = await _resolve_measurements(request)
        mic_cal_snapshot = current_cal
        seat_sets_snapshot = dict(current_seat_sets) if current_seat_sets else None
        
        def sync_run() -> Dict[str, Any]:
            return asyncio.run(
                orchestrator.run_pipeline(
                    meas_left=meas_l,
                    meas_right=meas_r,
                    meas_sub=meas_sub,
                    meas_subs=meas_subs,
                    target_curve_name=request.target.name,
                    bass_boost_db=request.target.bass_boost_db,
                    bass_cutoff_hz=request.target.bass_cutoff_hz,
                    hf_slope_db_per_oct=request.target.hf_slope_db_per_oct,
                    hf_start_hz=request.target.hf_start_hz,
                    crossover_freq=request.crossover_freq_hz,
                    crossover_order=request.crossover_order,
                    sub_crossover_freq=request.sub_crossover_freq_hz,
                    target_taps=request.target_taps,
                    temp_celsius=request.temperature_celsius,
                    relative_humidity_pct=request.relative_humidity_pct,
                    pressure_kpa=request.pressure_kpa,
                    listening_distance_m=request.listening_distance_m,
                    mic_orientation_deg=request.mic_orientation_deg,
                    mic_cal=mic_cal_snapshot,
                    seat_measurements=seat_sets_snapshot,
                    wfir_taps=request.wfir_taps,
                    progress_callback=on_progress,
                )
            )
        
        runner = asyncio.get_running_loop().run_in_executor(None, sync_run)
        
        async def event_generator():
            yield "retry: 1000\n\n"
            while True:
                try:
                    item = queue.get_nowait()
                    yield f"event: progress\ndata: {json.dumps(item)}\n\n"
                    continue
                except asyncio.QueueEmpty:
                    if runner.done():
                        break
                    await asyncio.sleep(0.05)
            
            # Drain remaining queued events
            while True:
                try:
                    item = queue.get_nowait()
                    yield f"event: progress\ndata: {json.dumps(item)}\n\n"
                except asyncio.QueueEmpty:
                    break
            
            try:
                result = await asyncio.wrap_future(runner)
                intel = None
                if "acoustic_intelligence" in result and result["acoustic_intelligence"]:
                    intel = AcousticIntelligence(**result["acoustic_intelligence"])
                resp_obj = OptimizationResponse(
                    status=result["status"],
                    sample_rate=result["sample_rate"],
                    target_taps=result["target_taps"],
                    global_preamp_db=result["global_preamp_db"],
                    acoustic_intelligence=intel,
                    modal_info_left=result["modal_info_left"],
                    modal_info_right=result["modal_info_right"],
                    modal_decay_left=result.get("modal_decay_left"),
                    modal_decay_right=result.get("modal_decay_right"),
                    preringing_left=result["preringing_left"],
                    preringing_right=result["preringing_right"],
                    zwicker_masking_left=result.get("zwicker_masking_left"),
                    zwicker_masking_right=result.get("zwicker_masking_right"),
                    safeguard_loop=result.get("safeguard_loop"),
                    safeguard_decision_left=result.get("safeguard_decision_left"),
                    safeguard_decision_right=result.get("safeguard_decision_right"),
                    sub_alignment=result.get("sub_alignment"),
                    multi_sub_alignment=result.get("multi_sub_alignment"),
                    wfir_taps=result.get("wfir_taps"),
                    true_peak_left_dbfs=result.get("true_peak_left_dbfs"),
                    true_peak_right_dbfs=result.get("true_peak_right_dbfs"),
                    plots=PlotData(**result["plots"]),
                )
                global latest_zip_bundle, latest_result_cache
                payload = json.dumps(resp_obj.model_dump())
                async with state_lock:
                    latest_zip_bundle = result["zip_bundle_bytes"]
                    latest_result_cache = resp_obj.model_dump()
                    if os.path.exists(SESSION_FILE):
                        try:
                            save_session()
                        except Exception:
                            pass
                yield f"event: result\ndata: {payload}\n\n"
            except HTTPException as e:
                yield f"event: error\ndata: {json.dumps({'detail': e.detail})}\n\n"
            except Exception as e:
                yield f"event: error\ndata: {json.dumps({'detail': f'Optimization failed: {str(e)}'})}\n\n"
        
        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            },
        )


@router.get("/optimization/latest", response_model=OptimizationResponse)
async def get_latest_optimization():
    """Retrieve the cached result of the most recent optimization run."""
    async with state_lock:
        if latest_result_cache is None:
            raise HTTPException(status_code=404, detail="No optimization has been run yet.")
        return latest_result_cache


@router.get("/export/bundle")
async def download_bundle():
    """Download the latest generated 1-Click ZIP bundle."""
    global latest_zip_bundle
    
    async with state_lock:
        if latest_zip_bundle is None:
            # First call only: generate a demo bundle. Run the CPU-heavy
            # pipeline in a worker thread instead of blocking the event loop
            # while holding the state lock.
            should_generate = True
        else:
            should_generate = False
            bundle = latest_zip_bundle
            
    if should_generate:
        meas_l, meas_r, meas_sub = generate_demo_room_measurements()
        res = await asyncio.to_thread(
            lambda: asyncio.run(orchestrator.run_pipeline(meas_l, meas_r, meas_sub))
        )
        async with state_lock:
            latest_zip_bundle = res["zip_bundle_bytes"]
            bundle = latest_zip_bundle
            
    return StreamingResponse(
        io.BytesIO(bundle),
        media_type="application/zip",
        headers={
            "Content-Disposition": 'attachment; filename="ALTAIR_Filters_Export.zip"',
            "Content-Length": str(len(bundle)),
        },
    )


@router.post("/sub-alignment/simulate")
async def simulate_sub_delay(
    delay_ms: float = Form(...),
    polarity: float = Form(1.0),
    crossover_freq: float = Form(80.0),
):
    """Real-time simulation of subwoofer summation for interactive slider."""
    from scipy import signal
    
    async with state_lock:
        meas_l = current_measurements.get("left")
        meas_sub = current_measurements.get("sub")
        
    if meas_l is None or meas_sub is None:
        meas_l, _, meas_sub = generate_demo_room_measurements()
        
    sr = meas_l.sample_rate
    sub_ir = meas_sub.ir
    if meas_sub.sample_rate != sr:
        from math import gcd
        g = gcd(sr, meas_sub.sample_rate)
        sub_ir = signal.resample_poly(sub_ir, sr // g, meas_sub.sample_rate // g)
        
    n_fft = max(meas_l.n_fft, 2 ** int(np.ceil(np.log2(max(1, len(sub_ir))))))
    freqs = np.fft.rfftfreq(n_fft, d=1.0 / sr)
    
    # Apply crossover filtering (LPF on Sub, HPF on Main)
    sos_lpf = signal.butter(2, crossover_freq, btype='low', fs=sr, output='sos')
    sos_hpf = signal.butter(2, crossover_freq, btype='high', fs=sr, output='sos')
    
    sub_filtered_ir = signal.sosfilt(sos_lpf, sub_ir)
    main_filtered_ir = signal.sosfilt(sos_hpf, meas_l.ir)
    
    H_main_xo = np.fft.rfft(main_filtered_ir, n=n_fft)
    H_sub_xo = np.fft.rfft(sub_filtered_ir, n=n_fft)
    
    disp_mask = (freqs >= 20.0) & (freqs <= 500.0)
    disp_freqs = freqs[disp_mask]
    
    dt_s = delay_ms / 1000.0
    shift = np.exp(-1j * 2.0 * np.pi * disp_freqs * dt_s)
    
    H_sum = H_main_xo[disp_mask] + (polarity * H_sub_xo[disp_mask] * shift)
    spl_sum = 20.0 * np.log10(np.maximum(np.abs(H_sum), 1e-12))
    spl_main = 20.0 * np.log10(np.maximum(np.abs(H_main_xo[disp_mask]), 1e-12))
    spl_sub = 20.0 * np.log10(np.maximum(np.abs(H_sub_xo[disp_mask]), 1e-12))
    
    return {
        "delay_ms": delay_ms,
        "polarity": polarity,
        "freqs": disp_freqs.tolist(),
        "spl_sum_db": spl_sum.tolist(),
        "spl_main_only_db": spl_main.tolist(),
        "spl_sub_only_db": spl_sub.tolist(),
    }


# ---------------------------------------------------------------------------
# Session persistence endpoints
# ---------------------------------------------------------------------------
@router.get("/session")
async def get_session_status():
    """Current session persistence status."""
    async with state_lock:
        return {
            "file_exists": os.path.exists(SESSION_FILE),
            "path": SESSION_FILE,
            "channels": list(current_measurements.keys()),
            "channel_details": {
                ch: {
                    "name": m.name,
                    "sample_rate": m.sample_rate,
                    "points": len(m.ir),
                    "peak_time_ms": round(float(np.argmax(np.abs(m.ir)) / m.sample_rate * 1000.0), 2),
                }
                for ch, m in current_measurements.items()
            },
            "seat_sets": {ch: len(seats) for ch, seats in current_seat_sets.items()},
            "sub_measurements": len(current_sub_measurements),
            "cal_loaded": current_cal is not None,
            "result_cached": latest_result_cache is not None,
        }


@router.post("/session/save")
async def session_save():
    """Persist current measurements, cal, and last result to altair_project.json."""
    async with state_lock:
        try:
            info = save_session()
            return info
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to save session: {str(e)}")


@router.post("/session/load")
async def session_load():
    """Restore measurements, cal, and last result from altair_project.json."""
    async with state_lock:
        try:
            info = load_session()
            return info
        except FileNotFoundError:
            raise HTTPException(status_code=404, detail=f"No session file found at {SESSION_FILE}.")
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Failed to load session: {str(e)}")


@router.post("/session/clear")
async def session_clear():
    """Delete the persisted session file (in-memory state is kept)."""
    async with state_lock:
        existed = os.path.exists(SESSION_FILE)
        _clear_session_file()
        return {"cleared": existed, "path": SESSION_FILE}
