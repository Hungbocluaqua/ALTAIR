"""
Pydantic Schemas for AutoRoomEQ REST API.
"""

from typing import List, Dict, Optional, Any
from pydantic import BaseModel, Field


class StatusResponse(BaseModel):
    app: str = "ALTAIR"
    version: str = "1.0.0"
    rew_connected: bool
    rew_base_url: str
    rew_message: Optional[str] = None


class TargetCurveConfig(BaseModel):
    name: str = Field("harman", description="harman, bk1974, flat, oca, custom")
    bass_boost_db: float = 6.0
    bass_cutoff_hz: float = 80.0
    hf_slope_db_per_oct: float = -0.8
    hf_start_hz: float = 200.0


class OptimizationRequest(BaseModel):
    target: TargetCurveConfig = Field(default_factory=TargetCurveConfig)
    crossover_freq_hz: float = 2500.0
    crossover_order: int = 4
    sub_crossover_freq_hz: float = 80.0
    target_taps: int = 65536
    use_demo_measurements: bool = True
    rew_measurement_ids: Optional[List[int]] = None


class AcousticIntelligence(BaseModel):
    detected_schroeder_hz: float
    detected_reflection_gap_ms: float
    recommended_fdw_cycles: float
    speaker_low_rolloff_hz: float
    speaker_high_rolloff_hz: float
    recommended_sub_crossover_hz: float


class PlotData(BaseModel):
    freqs: List[float]
    spl_before_left: List[float]
    spl_target_left: List[float]
    spl_filter_left: List[float]
    spl_after_left: List[float]
    phase_before_deg: List[float]
    phase_after_deg: List[float]
    step_time_ms: List[float]
    step_response: List[float]


class OptimizationResponse(BaseModel):
    status: str
    sample_rate: int
    target_taps: int
    global_preamp_db: float
    acoustic_intelligence: Optional[AcousticIntelligence] = None
    modal_info_left: Dict[str, Any]
    modal_info_right: Dict[str, Any]
    preringing_left: Dict[str, Any]
    preringing_right: Dict[str, Any]
    sub_alignment: Optional[Dict[str, Any]] = None
    plots: PlotData
