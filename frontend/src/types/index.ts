export interface StatusResponse {
  app: string;
  version: string;
  rew_connected: boolean;
  rew_base_url: string;
  rew_message?: string;
  rew_installed?: boolean;
  rew_name?: string;
  rew_path?: string;
  rew_dir?: string;
  rew_process_running?: boolean;
  rew_auto_start?: boolean;
}

export interface RewStatusInfo {
  installed: boolean;
  name: string;
  executable_path: string | null;
  directory: string | null;
  process_running: boolean;
  api_connected: boolean;
  auto_start: boolean;
  port: number;
  base_url: string;
}

export interface TargetCurveConfig {
  name: 'harman' | 'bk1974' | 'flat' | 'oca' | 'custom';
  bass_boost_db: number;
  bass_cutoff_hz: number;
  hf_slope_db_per_oct: number;
  hf_start_hz: number;
}

export interface OptimizationRequest {
  target: TargetCurveConfig;
  crossover_freq_hz: number;
  crossover_order: number;
  sub_crossover_freq_hz: number;
  target_taps: number;
  temperature_celsius?: number;
  relative_humidity_pct?: number;
  pressure_kpa?: number;
  listening_distance_m?: number;
  mic_orientation_deg?: number;
  wfir_taps?: number | null;
  use_demo_measurements: boolean;
  rew_measurement_ids?: number[];
}

export interface DetectedCrossover {
  frequency_hz: number;
  group_delay_peak_ms: number;
  estimated_order: number;
}

export interface SbirDiagnostic {
  frequency_hz: number;
  dip_depth_db: number;
  estimated_boundary_distance_m: number;
  is_sbir_null: boolean;
  recommendation: string;
}

export interface MicrophoneGeometry {
  delay_offset_ms: number;
  path_difference_mm: number;
  mic_off_center_mm: number;
  off_center_direction: string;
  geometry_summary: string;
  impulse_response_correlation?: number;
  distances: {
    front_left: { meters: number; feet: number };
    front_right: { meters: number; feet: number };
    subwoofer?: { meters: number; feet: number };
  };
}

export interface CrossoverHardwareSnapping {
  left_optimal_hz: number;
  right_optimal_hz: number;
  mathematical_average_hz: number;
  snapped_hardware_crossover_hz: number;
  crossover_slope: string;
  rms_transition_error_db: number;
  summary: string;
}

export interface SplitGainStaging {
  net_volume_adjustment_db: number;
  recommended_hardware_db: number;
  dsp_fine_trim_db: number;
  summary: string;
}

export interface MicCalibrationInfo {
  points: number;
  applied: boolean;
  has_phase: boolean;
}

export interface SpatialVarianceWeighting {
  left_active: boolean;
  right_active: boolean;
  seats: number;
}

export interface WaveletDecayGating {
  left_true_modes: number[];
  left_fast_decay_dips: number[];
}

export interface AcousticIntelligence {
  detected_schroeder_hz: number;
  detected_reflection_gap_ms: number;
  recommended_fdw_cycles: number;
  speaker_low_rolloff_hz: number;
  speaker_high_rolloff_hz: number;
  recommended_sub_crossover_hz: number;
  detected_crossovers?: DetectedCrossover[];
  speed_of_sound_mps?: number;
  temperature_celsius?: number;
  relative_humidity_pct?: number;
  pressure_kpa?: number;
  air_absorption_loss_10k_db?: number;
  sbir_diagnostics?: SbirDiagnostic[];
  microphone_geometry?: MicrophoneGeometry;
  crossover_hardware_snapping?: CrossoverHardwareSnapping;
  split_gain_staging?: SplitGainStaging;
  mic_calibration?: MicCalibrationInfo;
  spatial_variance_weighting?: SpatialVarianceWeighting;
  target_air_adaptation_db_10k?: number;
  sbir_neutral_mask_frequencies?: number[];
  wavelet_decay_gating?: WaveletDecayGating;
}

export interface PlotData {
  freqs: number[];
  spl_before_left: number[];
  spl_target_left: number[];
  spl_filter_left: number[];
  spl_after_left: number[];
  phase_before_deg: number[];
  phase_after_deg: number[];
  step_time_ms: number[];
  step_response: number[];
}

export interface ModalInfo {
  f_1: number;
  f_opt: number;
  peaks: Array<{ freq: number; spl: number; harmonic: number; is_harmonic_match: boolean }>;
  dips: Array<{ freq: number; spl: number; harmonic_dip: number; is_harmonic_match: boolean }>;
  T_target_ms?: number;
  f_cutoff?: number;
  T_shift_ms?: number;
  d_samples?: number;
}

export interface ModalDecayEntry {
  freq_hz: number;
  decay_rt60_ms: number;
  is_true_mode: boolean;
}

export interface PreringingMetrics {
  passed: boolean;
  max_pre_amplitude: number;
  max_pre_amplitude_pct: number;
  impulse_pre_amplitude_pct?: number;
  threshold_pct: number;
  pre_energy_db: number;
  energy_threshold_db: number;
  t_start_ms: number;
  t_end_ms: number;
  peak_idx: number;
}

export interface ZwickerMaskingMetrics {
  is_masked: boolean;
  worst_margin_db: number;
  max_pre_amp_pct: number;
}

export interface SafeguardLoop {
  attempts: number;
  q_scale: number;
  beta_scale: number;
  auto_attenuated: boolean;
}

export interface SafeguardDecision {
  pre_ringing_passed: boolean;
  zwicker_masked: boolean;
  audible_pre_echo: boolean;
  verdict: string;
}

export interface SubAlignmentResult {
  optimal_delay_ms: number;
  optimal_delay_samples: number;
  optimal_polarity: string;
  polarity_multiplier: number;
  crossover_freq_hz: number;
  gain_improvement_db: number;
  freqs: number[];
  spl_unaligned_db: number[];
  spl_aligned_db: number[];
  spl_main_only_db: number[];
  spl_sub_only_db: number[];
}

export interface SubAlignmentInfo {
  sub_index: number;
  name: string;
  delay_ms: number;
  delay_samples: number;
  gain_db: number;
  polarity: number;
}

export interface MultiSubAlignment {
  sub_count: number;
  crossover_freq_hz: number;
  alignments: SubAlignmentInfo[];
}

export interface OptimizationResponse {
  status: string;
  sample_rate: number;
  target_taps: number;
  global_preamp_db: number;
  acoustic_intelligence?: AcousticIntelligence;
  modal_info_left: ModalInfo;
  modal_info_right: ModalInfo;
  modal_decay_left?: ModalDecayEntry[];
  modal_decay_right?: ModalDecayEntry[];
  preringing_left: PreringingMetrics;
  preringing_right: PreringingMetrics;
  zwicker_masking_left?: ZwickerMaskingMetrics;
  zwicker_masking_right?: ZwickerMaskingMetrics;
  safeguard_loop?: SafeguardLoop;
  safeguard_decision_left?: SafeguardDecision;
  safeguard_decision_right?: SafeguardDecision;
  sub_alignment?: SubAlignmentResult;
  multi_sub_alignment?: MultiSubAlignment;
  wfir_taps?: number | null;
  true_peak_left_dbfs?: number;
  true_peak_right_dbfs?: number;
  plots: PlotData;
}

export interface ProgressEvent {
  type: 'progress';
  step: string;
  pct: number;
  detail: string;
}

export interface SessionStatus {
  file_exists: boolean;
  path: string;
  channels: string[];
  channel_details?: Record<string, { name: string; sample_rate: number; points: number; peak_time_ms: number }>;
  seat_sets: Record<string, number>;
  sub_measurements: number;
  cal_loaded: boolean;
  result_cached: boolean;
}
