"""
DSP Core for AutoRoomEQ.
Implements the 3-module pipeline from Information.md:
- Module 1: Virtual Bass Array (VBA) Modal Inversion
- Module 2: Tikhonov Regularized Magnitude Inversion & Hilbert Min-Phase
- Module 3: 1-Cycle FDW & Crossover Phase Linearization
Plus Pre-Ringing Safeguards, Subwoofer Alignment, and Tap Trimming.
"""

from .acquisition import generate_log_chirp, deconvolve, load_cal_file, apply_cal_file
from .acoustic_analysis import (
    log_smoothed_fast,
    erb_smoothed_fast,
    detect_schroeder_statistical,
    detect_reflection_gap,
    ir_gap_to_fdw_cycles,
    detect_speaker_rolloff,
    compute_spatial_variance_weight,
)
from .measurement import (
    Measurement,
    cross_correlate_align,
    vector_average,
    rms_magnitude_average,
    hybrid_spatial_average,
    parse_rew_text,
    load_wav_ir,
)
from .targets import generate_harman_target, generate_bk1974_target, generate_flat_target, generate_custom_target, anchor_target_to_measurement
from .vba_synth import detect_modal_peaks_dips, synthesize_vba_filter
from .mag_inversion import tikhonov_magnitude_inversion, extract_minimum_phase, synthesize_mag_inversion_filter
from .phase_linearization import frequency_dependent_window, synthesize_crossover_phase_reversal, synthesize_phase_linearization_filter
from .preringing import evaluate_step_response_preringing, auto_attenuate_preringing
from .filter_assembly import assemble_final_filter, calculate_preamp_headroom
from .sub_alignment import optimize_sub_mains_alignment

__all__ = [
    "generate_log_chirp",
    "deconvolve",
    "load_cal_file",
    "apply_cal_file",
    "Measurement",
    "cross_correlate_align",
    "vector_average",
    "rms_magnitude_average",
    "hybrid_spatial_average",
    "parse_rew_text",
    "load_wav_ir",
    "generate_harman_target",
    "generate_bk1974_target",
    "generate_flat_target",
    "generate_custom_target",
    "anchor_target_to_measurement",
    "detect_modal_peaks_dips",
    "synthesize_vba_filter",
    "tikhonov_magnitude_inversion",
    "extract_minimum_phase",
    "synthesize_mag_inversion_filter",
    "frequency_dependent_window",
    "synthesize_crossover_phase_reversal",
    "synthesize_phase_linearization_filter",
    "evaluate_step_response_preringing",
    "auto_attenuate_preringing",
    "assemble_final_filter",
    "calculate_preamp_headroom",
    "optimize_sub_mains_alignment",
]
