"""
REST API Routes for AutoRoomEQ.
"""

from typing import Dict, Optional, List
import io
import asyncio
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
state_lock = asyncio.Lock()
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
        if not content_bytes or len(content_bytes) == 0:
            raise ValueError("Uploaded file is empty (0 bytes)")
            
        filename = file.filename or "uploaded_measurement"
        
        if filename.lower().endswith(".wav"):
            meas = load_wav_ir(content_bytes, name=filename)
        else:
            text_content = content_bytes.decode("utf-8", errors="ignore")
            meas = parse_rew_text(text_content, sample_rate=sample_rate, name=filename)
            
        async with state_lock:
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
            if filename.lower().endswith(".wav"):
                m = load_wav_ir(content_bytes, name=filename)
            else:
                text_content = content_bytes.decode("utf-8", errors="ignore")
                m = parse_rew_text(text_content, sample_rate=sample_rate, name=filename)
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
    Performs IR Sync time alignment and hybrid spatial averaging (vector below Schroeder, RMS above).
    """
    from ..dsp.measurement import hybrid_spatial_average
    
    if not files or len(files) == 0:
        raise HTTPException(status_code=400, detail="No measurement files uploaded.")
        
    try:
        meas_list = []
        for i, file in enumerate(files, 1):
            content_bytes = await file.read()
            if not content_bytes or len(content_bytes) == 0:
                continue
            filename = file.filename or f"Seat_{i}"
            if filename.lower().endswith(".wav"):
                m = load_wav_ir(content_bytes, name=filename)
            else:
                text_content = content_bytes.decode("utf-8", errors="ignore")
                m = parse_rew_text(text_content, sample_rate=sample_rate, name=filename)
            meas_list.append(m)
            
        if not meas_list:
            raise ValueError("No valid seat measurements could be parsed.")
            
        spat_meas = hybrid_spatial_average(
            meas_list,
            f_trans=schroeder_freq,
            name=f"{channel.upper()} Multi-Seat Average ({len(meas_list)} positions)",
        )
        
        async with state_lock:
            current_measurements[channel.lower()] = spat_meas
        return {
            "status": "success",
            "channel": channel.lower(),
            "name": spat_meas.name,
            "seat_count": len(meas_list),
            "schroeder_transition_hz": schroeder_freq,
            "sample_rate": sample_rate,
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed multi-seat spatial averaging: {str(e)}")


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
        sweep_k = min(1024, max(128, int(2 ** round(np.log2(duration_s * sample_rate / 1024)))))
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

    # Guard bounds: repetitions clamped between 1 and 16
    repetitions = min(16, max(1, int(repetitions)))
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
                results_summary[ch] = {
                    "repetitions": res.get("repetitions_captured", repetitions),
                    "snr_gain_db": res.get("snr_improvement_db", round(10.0 * np.log10(repetitions), 2)),
                    "mode": "rew_api",
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
            for _ in range(repetitions):
                noise = np.random.normal(0, 0.002, size=len(base_meas.ir))
                noisy_repeats.append(base_meas.ir + noise)
                
            stacked_ir, snr_gain = coherent_impulse_stack(noisy_repeats, sample_rate=sample_rate)
            
            stacked_meas = Measurement(
                name=f"ALTAIR_{ch.upper()}_{repetitions}x_Stacked",
                ir=stacked_ir,
                sample_rate=sample_rate,
            )
            async with state_lock:
                current_measurements[ch] = stacked_meas
            results_summary[ch] = {
                "repetitions": repetitions,
                "snr_gain_db": round(float(snr_gain), 2),
                "mode": "simulated",
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



@router.post("/optimize", response_model=OptimizationResponse)
async def run_optimization(request: OptimizationRequest):
    """Execute the 1-Click Digital Room Correction optimization pipeline."""
    global latest_zip_bundle, latest_result_cache
    
    async with state_lock:
        # 1. Determine input measurements
        if not request.use_demo_measurements:
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
                except Exception as e:
                    raise HTTPException(status_code=400, detail=f"Failed to fetch measurements from REW: {str(e)}")
            elif "left" in current_measurements:
                meas_l = current_measurements["left"]
                meas_r = current_measurements.get("right", meas_l)
                meas_sub = current_measurements.get("sub")
            else:
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
                        except Exception as e:
                            raise HTTPException(status_code=400, detail=f"Failed to pull active measurements from REW: {str(e)}")
                    else:
                        raise HTTPException(status_code=400, detail="No measurements found in REW or ALTAIR. Please capture a measurement in REW or upload sweep files.")
                else:
                    raise HTTPException(status_code=400, detail="No uploaded measurements available and REW is not connected. Please upload files or enable Demo mode.")
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
                relative_humidity_pct=request.relative_humidity_pct,
                pressure_kpa=request.pressure_kpa,
                listening_distance_m=request.listening_distance_m,
                mic_orientation_deg=request.mic_orientation_deg,
            )
            
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
                preringing_left=result["preringing_left"],
                preringing_right=result["preringing_right"],
                zwicker_masking_left=result.get("zwicker_masking_left"),
                zwicker_masking_right=result.get("zwicker_masking_right"),
                sub_alignment=result.get("sub_alignment"),
                true_peak_left_dbfs=result.get("true_peak_left_dbfs"),
                true_peak_right_dbfs=result.get("true_peak_right_dbfs"),
                plots=PlotData(**result["plots"]),
            )
            
            latest_zip_bundle = result["zip_bundle_bytes"]
            # Cache serializable dict without binary zip_bundle_bytes
            latest_result_cache = resp_obj.model_dump()
            
            return resp_obj
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Optimization failed: {str(e)}")


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
    from scipy import signal
    
    async with state_lock:
        if "left" in current_measurements and "sub" in current_measurements:
            meas_l = current_measurements["left"]
            meas_sub = current_measurements["sub"]
        else:
            meas_l, _, meas_sub = generate_demo_room_measurements()
        
    sr = meas_l.sample_rate
    n_fft = max(meas_l.n_fft, meas_sub.n_fft)
    freqs = np.fft.rfftfreq(n_fft, d=1.0 / sr)
    
    # Apply crossover filtering (LPF on Sub, HPF on Main)
    sos_lpf = signal.butter(2, crossover_freq, btype='low', fs=sr, output='sos')
    sos_hpf = signal.butter(2, crossover_freq, btype='high', fs=sr, output='sos')
    
    sub_filtered_ir = signal.sosfilt(sos_lpf, meas_sub.ir)
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
