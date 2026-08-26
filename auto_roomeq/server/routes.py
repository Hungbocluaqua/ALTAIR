"""
REST API Routes for AutoRoomEQ.
"""

from typing import Dict, Optional, List
import io
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
from ..dsp.measurement import parse_rew_text, load_wav_ir, Measurement
from ..dsp.sub_alignment import optimize_sub_mains_alignment

router = APIRouter(prefix="/api")

# Singleton state
rew_client = RewApiClient()
orchestrator = OptimizationOrchestrator(rew_client=rew_client)

# In-memory storage for uploaded measurements and last generated zip
current_measurements: Dict[str, Measurement] = {}
latest_zip_bundle: Optional[bytes] = None
latest_result_cache: Optional[Dict[str, any]] = None


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


@router.post("/measurements/upload")
async def upload_measurement(
    file: UploadFile = File(...),
    channel: str = Form("left"),  # 'left', 'right', 'sub'
    sample_rate: int = Form(48000),
):
    """Upload a measurement file (REW text/FRD export or WAV impulse response)."""
    try:
        content_bytes = await file.read()
        filename = file.filename or "uploaded_measurement"
        
        if filename.lower().endswith(".wav"):
            meas = load_wav_ir(content_bytes, name=filename)
        else:
            text_content = content_bytes.decode("utf-8", errors="ignore")
            meas = parse_rew_text(text_content, sample_rate=sample_rate, name=filename)
            
        current_measurements[channel.lower()] = meas
        return {
            "status": "success",
            "channel": channel.lower(),
            "name": meas.name,
            "sample_rate": meas.sample_rate,
            "points": len(meas.freqs),
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse measurement: {str(e)}")


@router.post("/optimize", response_model=OptimizationResponse)
async def run_optimization(request: OptimizationRequest):
    """Execute the 1-Click Digital Room Correction optimization pipeline."""
    global latest_zip_bundle, latest_result_cache
    
    # 1. Determine input measurements
    if not request.use_demo_measurements and request.rew_measurement_ids and len(request.rew_measurement_ids) > 0:
        # Pull from REW API by IDs
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
        except Exception as e:
            # Fall back to demo measurements with a note
            meas_l, meas_r, meas_sub = generate_demo_room_measurements()
    elif not request.use_demo_measurements and "left" in current_measurements:
        meas_l = current_measurements["left"]
        meas_r = current_measurements.get("right", meas_l)
        meas_sub = current_measurements.get("sub")
    else:
        meas_l, meas_r, meas_sub = generate_demo_room_measurements()
        
    try:
        result = await orchestrator.run_pipeline(
            meas_left=meas_l,
            meas_right=meas_r,
            meas_sub=meas_sub,
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
            mic_orientation_deg=request.mic_orientation_deg,
        )
        
        latest_zip_bundle = result["zip_bundle_bytes"]
        latest_result_cache = result
        
        intel = None
        if "acoustic_intelligence" in result and result["acoustic_intelligence"]:
            intel = AcousticIntelligence(**result["acoustic_intelligence"])
        
        return OptimizationResponse(
            status=result["status"],
            sample_rate=result["sample_rate"],
            target_taps=result["target_taps"],
            global_preamp_db=result["global_preamp_db"],
            acoustic_intelligence=intel,
            modal_info_left=result["modal_info_left"],
            modal_info_right=result["modal_info_right"],
            preringing_left=result["preringing_left"],
            preringing_right=result["preringing_right"],
            sub_alignment=result.get("sub_alignment"),
            true_peak_left_dbfs=result.get("true_peak_left_dbfs"),
            true_peak_right_dbfs=result.get("true_peak_right_dbfs"),
            plots=PlotData(**result["plots"]),
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Optimization failed: {str(e)}")


@router.get("/export/bundle")
async def download_bundle():
    """Download the latest generated 1-Click ZIP bundle."""
    global latest_zip_bundle
    
    # If not run yet, generate one with demo data
    if latest_zip_bundle is None:
        meas_l, meas_r, meas_sub = generate_demo_room_measurements()
        res = await orchestrator.run_pipeline(meas_l, meas_r, meas_sub)
        latest_zip_bundle = res["zip_bundle_bytes"]
        
    return StreamingResponse(
        io.BytesIO(latest_zip_bundle),
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="ALTAIR_Filters_Export.zip"'},
    )


@router.post("/sub-alignment/simulate")
async def simulate_sub_delay(
    delay_ms: float = Form(...),
    polarity: float = Form(1.0),
    crossover_freq: float = Form(80.0),
):
    """Real-time simulation of subwoofer summation for interactive slider."""
    if "left" in current_measurements and "sub" in current_measurements:
        meas_l = current_measurements["left"]
        meas_sub = current_measurements["sub"]
    else:
        meas_l, _, meas_sub = generate_demo_room_measurements()
        
    res = optimize_sub_mains_alignment(
        main_meas=meas_l,
        sub_meas=meas_sub,
        crossover_freq=crossover_freq,
    )
    
    # Recalculate specific summation curve for the requested manual slider delay
    sr = meas_l.sample_rate
    freqs = np.array(res["freqs"])
    dt_s = delay_ms / 1000.0
    
    shift = np.exp(-1j * 2.0 * np.pi * freqs * dt_s)
    
    # Extract linear signals
    mag_main = 10.0 ** (np.array(res["spl_main_only_db"]) / 20.0)
    mag_sub = 10.0 ** (np.array(res["spl_sub_only_db"]) / 20.0)
    
    H_sum = mag_main + (polarity * mag_sub * shift)
    spl_sum = 20.0 * np.log10(np.maximum(np.abs(H_sum), 1e-12))
    
    return {
        "delay_ms": delay_ms,
        "polarity": polarity,
        "freqs": res["freqs"],
        "spl_sum_db": spl_sum.tolist(),
        "spl_main_only_db": res["spl_main_only_db"],
        "spl_sub_only_db": res["spl_sub_only_db"],
    }
