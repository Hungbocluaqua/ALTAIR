import React from 'react';
import { CheckCircle2, Circle, AlertCircle, Sparkles } from 'lucide-react';
import { OptimizationResponse } from '../types';

interface StepProgressProps {
  isRunning: boolean;
  result: OptimizationResponse | null;
}

export const StepProgress: React.FC<StepProgressProps> = ({ isRunning, result }) => {
  if (!isRunning && !result) return null;

  const steps = [
    {
      id: 1,
      title: 'Acoustic Timing & Ingestion',
      detail: result ? `Cross-correlation aligned Left & Right (48 kHz)` : 'Aligning impulse timing references...',
    },
    {
      id: 2,
      title: 'House Target Level Anchoring',
      detail: result ? `Anchored in 300Hz-1kHz RMS band` : 'Calculating RMS acoustic sensitivity...',
    },
    {
      id: 3,
      title: 'Module 1: Virtual Bass Array (VBA)',
      detail: result
        ? `Identified P1(${result.modal_info_left.f_1.toFixed(1)}Hz), 8th-order 48dB/oct LPF reflection canceller synthesized`
        : 'Scanning modal resonances with ±10% tolerance...',
    },
    {
      id: 4,
      title: 'Module 2: Regularized Magnitude Inversion',
      detail: result ? `Tikhonov deconvolution (max boost capped at +5.0 dB, cuts down to -20 dB)` : 'Inverting frequency response...',
    },
    {
      id: 5,
      title: 'Module 3: Crossover & Phase Linearization',
      detail: result ? `1-cycle FDW applied, 4th-order Linkwitz-Riley crossover phase reversal synthesized` : 'Extracting excess phase...',
    },
    {
      id: 6,
      title: 'Subwoofer + Mains Phase & Delay Integration',
      detail: result?.sub_alignment
        ? `Optimal Delay: ${result.sub_alignment.optimal_delay_ms} ms (${result.sub_alignment.optimal_polarity}), +${result.sub_alignment.gain_improvement_db} dB summation`
        : 'Optimizing crossover summation...',
    },
    {
      id: 7,
      title: 'Pre-Ringing Safeguard & Time-Domain Envelope Check',
      detail: result
        ? `Step pre-ringing amplitude: ${result.preringing_left.max_pre_amplitude_pct.toFixed(1)}% (Threshold: ${result.preringing_left.threshold_pct.toFixed(0)}%) - ${result.preringing_left.passed ? 'PASSED ✓' : 'ATTENUATED'}`
        : 'Evaluating step response between -20ms and -5ms...',
    },
    {
      id: 8,
      title: 'Tap Trimming & Multi-Platform Export Generation',
      detail: result
        ? `Tukey windowed to ${result.target_taps.toLocaleString()} taps, Headroom Preamp: ${result.global_preamp_db} dB`
        : 'Generating WAV, CamillaDSP, Equalizer APO, miniDSP & rePhase packages...',
    },
  ];

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl">
      <div className="flex items-center justify-between pb-3 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <Sparkles className="h-4 w-4 text-cyan-400" />
          <h3 className="font-bold text-slate-100 text-xs tracking-wider uppercase">Live Optimization Pipeline Progress</h3>
        </div>
        {result && (
          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            All 8 Stages Complete
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
        {steps.map((step) => {
          const isDone = !!result;
          return (
            <div
              key={step.id}
              className={`p-3 rounded-xl border flex items-start space-x-3 transition-all ${
                isDone
                  ? 'bg-slate-950/60 border-slate-800/80 text-slate-200'
                  : 'bg-slate-950/30 border-slate-800/40 text-slate-400'
              }`}
            >
              {isDone ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : isRunning ? (
                <div className="h-4 w-4 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin shrink-0 mt-0.5" />
              ) : (
                <Circle className="h-4 w-4 text-slate-600 shrink-0 mt-0.5" />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-slate-100 flex items-center justify-between">
                  <span>{step.title}</span>
                  <span className="text-[10px] font-mono text-slate-500">#{step.id}</span>
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5 truncate">{step.detail}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
