"""
Pydantic Schemas for ALTAIR REST API.
"""

from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


class StatusResponse(BaseModel):
    app: str = "ALTAIR"
    version: str = "1.0.0"
    rew_connected: bool
    rew_base_url: str
    rew_message: Optional[str] = None


class TargetConfig(BaseModel):
    name: str = "harman"  # 'harman', 'bk1974', 'flat', 'oca', 'custom'
    bass_boost_db: float = 6.0
    bass_cutoff_hz: float = 80.0
    hf_slope_db_per_oct: float = -0.8
    hf_start_hz: float = 200.0


class OptimizationRequest(BaseModel):
    target: TargetConfig = Field(default_factory=TargetConfig)
    crossover_freq_hz: float = Field(2500.0, ge=10.0, le=20000.0)
    crossover_order: int = Field(4, ge=1, le=8)
    sub_crossover_freq_hz: float = Field(80.0, ge=20.0, le=500.0)
    target_taps: int = Field(65536, ge=1024, le=131072)
    temperature_celsius: float = Field(20.0, ge=-20.0, le=60.0)
    relative_humidity_pct: float = Field(50.0, ge=0.0, le=100.0)
    pressure_kpa: float = Field(101.325, ge=50.0, le=120.0)
    listening_distance_m: float = Field(3.0, ge=0.1, le=30.0)
    mic_orientation_deg: float = Field(0.0, ge=0.0, le=90.0)  # 0.0 on-axis, 90.0 ceiling/diffuse
    wfir_taps: Optional[int] = Field(None, ge=512, le=16384)  # Warped FIR export target taps
    use_demo_measurements: bool = False
    rew_measurement_ids: Optional[List[int]] = None


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


class AcousticIntelligence(BaseModel):
    detected_schroeder_hz: float
    detected_reflection_gap_ms: float
    recommended_fdw_cycles: float
    speaker_low_rolloff_hz: float
    speaker_high_rolloff_hz: float
    recommended_sub_crossover_hz: float
    detected_crossovers: Optional[List[Dict[str, Any]]] = None
    speed_of_sound_mps: Optional[float] = None
    temperature_celsius: Optional[float] = None
    relative_humidity_pct: Optional[float] = None
    pressure_kpa: Optional[float] = None
    air_absorption_loss_10k_db: Optional[float] = None
    sbir_diagnostics: Optional[List[Dict[str, Any]]] = None
    microphone_geometry: Optional[Dict[str, Any]] = None
    crossover_hardware_snapping: Optional[Dict[str, Any]] = None
    split_gain_staging: Optional[Dict[str, Any]] = None
    mic_calibration: Optional[Dict[str, Any]] = None
    spatial_variance_weighting: Optional[Dict[str, Any]] = None
    target_air_adaptation_db_10k: Optional[float] = None
    sbir_neutral_mask_frequencies: Optional[List[float]] = None
    wavelet_decay_gating: Optional[Dict[str, Any]] = None


class SubAlignmentResult(BaseModel):
    optimal_delay_ms: float
    optimal_delay_samples: int
    optimal_polarity: str
    polarity_multiplier: float
    crossover_freq_hz: float
    gain_improvement_db: float
    freqs: List[float]
    spl_unaligned_db: List[float]
    spl_aligned_db: List[float]
    spl_main_only_db: List[float]
    spl_sub_only_db: List[float]


class OptimizationResponse(BaseModel):
    status: str
    sample_rate: int
    target_taps: int
    global_preamp_db: float
    acoustic_intelligence: Optional[AcousticIntelligence] = None
    modal_info_left: Dict[str, Any]
    modal_info_right: Dict[str, Any]
    modal_decay_left: Optional[List[Dict[str, Any]]] = None
    modal_decay_right: Optional[List[Dict[str, Any]]] = None
    preringing_left: Dict[str, Any]
    preringing_right: Dict[str, Any]
    zwicker_masking_left: Optional[Dict[str, Any]] = None
    zwicker_masking_right: Optional[Dict[str, Any]] = None
    safeguard_loop: Optional[Dict[str, Any]] = None
    safeguard_decision_left: Optional[Dict[str, Any]] = None
    safeguard_decision_right: Optional[Dict[str, Any]] = None
    sub_alignment: Optional[SubAlignmentResult] = None
    multi_sub_alignment: Optional[Dict[str, Any]] = None
    wfir_taps: Optional[int] = None
    true_peak_left_dbfs: Optional[float] = None
    true_peak_right_dbfs: Optional[float] = None
    plots: PlotData
