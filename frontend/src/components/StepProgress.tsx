import React from 'react';
import { CheckCircle2, Circle, Sparkles } from 'lucide-react';
import { OptimizationResponse, ProgressEvent } from '../types';

interface StepProgressProps {
  isRunning: boolean;
  result: OptimizationResponse | null;
  progress?: ProgressEvent | null;
}

// Map backend pipeline stage names to the 8 checklist items
const STAGE_TO_STEP: Record<string, number> = {
  'Input Ingestion': 1,
  'Timing Alignment': 1,
  'Target Synthesis': 2,
  'Module 1: VBA Synthesis': 3,
  'Module 2: Magnitude Inversion': 4,
  'Module 3: Phase Linearization': 5,
  'Subwoofer Integration': 6,
  'Safeguards': 7,
  'Safeguards & Tap Trimming': 7,
  'Packaging Exports': 8,
};

export const StepProgress: React.FC<StepProgressProps> = ({ isRunning, result, progress }) => {
  if (!isRunning && !result) return null;

  const currentStepId = progress ? STAGE_TO_STEP[progress.step] ?? null : null;
  const livePct = progress?.pct ?? null;

  const steps = [
    {
      id: 1,
      title: 'Acoustic Timing & Ingestion',
      detail: result ? `Cross-correlation aligned Left & Right (${result.sample_rate ? result.sample_rate / 1000 + ' kHz' : '48 kHz'})` : 'Aligning impulse timing references...',
    },
    {
      id: 2,
      title: 'House Target Level Anchoring',
      detail: result ? 'Anchored in 300Hz-1kHz RMS band' : 'Calculating RMS acoustic sensitivity...',
    },
    {
      id: 3,
      title: 'Module 1: Virtual Bass Array (VBA)',
      detail: result
        ? `Identified P1(${result.modal_info_left.f_1.toFixed(1)}Hz), 24dB/oct LPF reflection canceller synthesized`
        : 'Scanning modal resonances with ±10% tolerance...',
    },
    {
      id: 4,
      title: 'Module 2: Regularized Magnitude Inversion',
      detail: result ? 'Tikhonov deconvolution (boost capped at +5.0 dB, cuts down to -20 dB)' : 'Inverting frequency response...',
    },
    {
      id: 5,
      title: 'Module 3: Crossover & Phase Linearization',
      detail: result ? '1-cycle FDW applied, 4th-order Linkwitz-Riley phase reversal synthesized' : 'Extracting excess phase...',
    },
    {
      id: 6,
      title: 'Subwoofer Co-Optimization',
      detail: result && result.sub_alignment
        ? `Aligned delay (+${result.sub_alignment.optimal_delay_ms.toFixed(2)} ms, ${result.sub_alignment.optimal_polarity}), +${result.sub_alignment.gain_improvement_db.toFixed(1)} dB boost`
        : 'Searching optimal sub time-delay grid...',
    },
    {
      id: 7,
      title: 'Pre-Ringing & Zwicker Safeguards',
      detail: result ? 'Pre-echo ratio verified below auditory threshold' : 'Validating psychoacoustic temporal masking...',
    },
    {
      id: 8,
      title: 'Export Multi-Platform Package',
      detail: result
        ? 'Equalizer APO, CamillaDSP, miniDSP & 32-bit WAV generated'
        : 'Generating WAV, CamillaDSP, Equalizer APO & miniDSP packages...',
    },
  ];

  return (
    <div className="bg-white border border-stone-200 text-stone-800 dark:bg-[#121316] dark:border-stone-800 dark:text-stone-100 rounded-lg p-5 transition-colors shadow-sm">
      <div className="flex items-center justify-between pb-3 border-b border-stone-200 dark:border-stone-800 transition-colors">
        <div className="flex items-center space-x-2">
          <Sparkles className="h-4 w-4 text-amber-700 dark:text-amber-500" />
          <h3 className="font-serif font-bold text-stone-900 dark:text-stone-100 text-sm tracking-tight">Optimization Pipeline Telemetry</h3>
        </div>
        {result ? (
          <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded bg-stone-100 text-stone-800 border border-stone-300 dark:bg-stone-800 dark:text-stone-200 dark:border-stone-700">
            All 8 Stages Complete
          </span>
        ) : livePct !== null ? (
          <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-500/30">
            {livePct}%
          </span>
        ) : null}
      </div>

      {/* Live progress bar while running */}
      {isRunning && livePct !== null && (
        <div className="mt-3">
          <div className="h-1 rounded bg-stone-200 dark:bg-stone-800 overflow-hidden">
            <div
              className="h-full bg-amber-700 dark:bg-amber-500 transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, livePct))}%` }}
            />
          </div>
          <div className="mt-1.5 text-[11px] font-mono text-amber-800 dark:text-amber-400 truncate">
            {progress?.step}
            {progress?.detail ? ` — ${progress.detail}` : ''}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4">
        {steps.map((step) => {
          const isDone = !!result;
          const isActive = isRunning && !result && currentStepId === step.id;
          const isPast = isRunning && !result && currentStepId !== null && step.id < currentStepId;
          return (
            <div
              key={step.id}
              className={`p-3 rounded border flex items-start space-x-3 transition-all ${
                isDone || isPast
                  ? 'bg-stone-50 border-stone-200 text-stone-800 dark:bg-[#0E0F12] dark:border-stone-800 dark:text-stone-200'
                  : isActive
                    ? 'bg-amber-50 border-amber-300 text-stone-900 dark:bg-amber-950/20 dark:border-amber-500/40 dark:text-stone-100'
                    : 'bg-stone-50/40 border-stone-100 text-stone-500 dark:bg-[#0E0F12]/40 dark:border-stone-800/40 dark:text-stone-400'
              }`}
            >
              {isDone || isPast ? (
                <CheckCircle2 className="h-4 w-4 text-amber-700 dark:text-amber-500 shrink-0 mt-0.5" />
              ) : isActive ? (
                <div className="h-4 w-4 border-2 border-amber-600 dark:border-amber-400 border-t-transparent rounded-full animate-spin shrink-0 mt-0.5" />
              ) : isRunning ? (
                <div className="h-4 w-4 border-2 border-stone-300 dark:border-stone-700 border-t-transparent rounded-full animate-spin shrink-0 mt-0.5 opacity-60" />
              ) : (
                <Circle className="h-4 w-4 text-stone-300 dark:text-stone-700 shrink-0 mt-0.5" />
              )}
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-stone-900 dark:text-stone-100 flex items-center justify-between">
                  <span>{step.title}</span>
                  <span className="text-[10px] font-mono text-stone-400">#{step.id}</span>
                </div>
                <div className={`text-[11px] font-mono mt-0.5 truncate ${isActive ? 'text-amber-800 dark:text-amber-300' : 'text-stone-500 dark:text-stone-400'}`}>
                  {step.detail}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
