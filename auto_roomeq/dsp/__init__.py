"""
DSP Core Package for ALTAIR (Automated Linear-phase Tuning & Acoustic Inversion Routine).
"""

from .acquisition import (
    generate_log_chirp,
    deconvolve,
    load_cal_file,
    apply_cal_file,
    coherent_impulse_stack,
    recorded_sweep_to_measurement,
)
from .mdat_parser import parse_mdat
from .measurement import (
    Measurement,
    cross_correlate_align,
    vector_average,
    hybrid_spatial_average,
    parse_rew_text,
    load_wav_ir,
)
from .targets import (
    generate_harman_target,
    generate_bk1974_target,
    generate_flat_target,
    generate_oca_target,
    generate_custom_target,
    anchor_target_to_measurement,
)
from .vba_synth import (
    synthesize_vba_filter,
    detect_modal_peaks_dips,
)
from .mag_inversion import (
    synthesize_mag_inversion_filter,
    tikhonov_magnitude_inversion,
    extract_minimum_phase,
)
from .phase_linearization import (
    frequency_dependent_window,
    synthesize_crossover_phase_reversal,
    synthesize_low_q_phase_correction,
    synthesize_regularized_excess_phase_inverse,
    synthesize_phase_linearization_filter,
)
from .preringing import (
    evaluate_step_response_preringing,
    auto_attenuate_preringing,
)
from .filter_assembly import (
    assemble_final_filter,
    calculate_preamp_headroom,
)
from .sub_alignment import (
    optimize_sub_mains_alignment,
    optimize_multi_sub_matrix,
)
from .acoustic_analysis import (
    log_smoothed_fast,
    erb_smoothed_fast,
    detect_schroeder_statistical,
    detect_reflection_gap,
    ir_gap_to_fdw_cycles,
    detect_speaker_rolloff,
    compute_spatial_variance_weight,
    analyze_wavelet_modal_decay,
    adapt_target_for_air_absorption,
)
from .farina import (
    farina_harmonic_separation,
    compute_snr_mask,
    apply_polar_diffraction_calibration,
)
from .advanced_dsp import (
    calculate_speed_of_sound,
    compute_frequency_dependent_beta,
    homomorphic_mixed_phase_split,
    detect_group_delay_crossovers,
    calculate_itu_r_bs1770_true_peak,
    generate_hybrid_iir_fir_split,
)

__all__ = [
    "generate_log_chirp",
    "deconvolve",
    "load_cal_file",
    "apply_cal_file",
    "Measurement",
    "cross_correlate_align",
    "vector_average",
    "hybrid_spatial_average",
    "parse_rew_text",
    "load_wav_ir",
    "generate_harman_target",
    "generate_bk1974_target",
    "generate_flat_target",
    "generate_oca_target",
    "generate_custom_target",
    "anchor_target_to_measurement",
    "synthesize_vba_filter",
    "detect_modal_peaks_dips",
    "synthesize_mag_inversion_filter",
    "tikhonov_magnitude_inversion",
    "extract_minimum_phase",
    "frequency_dependent_window",
    "synthesize_crossover_phase_reversal",
    "synthesize_low_q_phase_correction",
    "synthesize_phase_linearization_filter",
    "evaluate_step_response_preringing",
    "auto_attenuate_preringing",
    "assemble_final_filter",
    "calculate_preamp_headroom",
    "optimize_sub_mains_alignment",
    "optimize_multi_sub_matrix",
    "log_smoothed_fast",
    "erb_smoothed_fast",
    "detect_schroeder_statistical",
    "detect_reflection_gap",
    "ir_gap_to_fdw_cycles",
    "detect_speaker_rolloff",
    "compute_spatial_variance_weight",
    "analyze_wavelet_modal_decay",
    "farina_harmonic_separation",
    "compute_snr_mask",
    "apply_polar_diffraction_calibration",
    "calculate_speed_of_sound",
    "compute_frequency_dependent_beta",
    "homomorphic_mixed_phase_split",
    "detect_group_delay_crossovers",
    "calculate_itu_r_bs1770_true_peak",
    "generate_hybrid_iir_fir_split",
]
