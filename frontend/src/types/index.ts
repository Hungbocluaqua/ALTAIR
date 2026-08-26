export interface StatusResponse {
  app: string;
  version: string;
  rew_connected: boolean;
  rew_base_url: string;
  rew_message?: string;
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
  use_demo_measurements: boolean;
  rew_measurement_ids?: number[];
}

export interface AcousticIntelligence {
  detected_schroeder_hz: number;
  detected_reflection_gap_ms: number;
  recommended_fdw_cycles: number;
  speaker_low_rolloff_hz: number;
  speaker_high_rolloff_hz: number;
  recommended_sub_crossover_hz: number;
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

export interface OptimizationResponse {
  status: string;
  sample_rate: number;
  target_taps: number;
  global_preamp_db: number;
  acoustic_intelligence?: AcousticIntelligence;
  modal_info_left: ModalInfo;
  modal_info_right: ModalInfo;
  preringing_left: PreringingMetrics;
  preringing_right: PreringingMetrics;
  sub_alignment?: SubAlignmentResult;
  plots: PlotData;
}
