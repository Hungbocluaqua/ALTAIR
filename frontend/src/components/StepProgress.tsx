import React, { useState } from 'react';
import { CheckCircle2, Circle, Sparkles, ChevronRight, Info } from 'lucide-react';
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
      shortTitle: 'Timing & Ingest',
      title: 'Acoustic Timing & Ingestion',
      detail: result
        ? `Cross-correlation aligned Left & Right (${result.sample_rate ? result.sample_rate / 1000 + ' kHz' : '48 kHz'})`
        : 'Aligning impulse timing references...',
    },
    {
      id: 2,
      shortTitle: 'Target Anchoring',
      title: 'House Target Level Anchoring',
      detail: result ? 'Anchored in 300Hz-1kHz RMS band' : 'Calculating RMS acoustic sensitivity...',
    },
    {
      id: 3,
      shortTitle: 'VBA Cancellation',
      title: 'Module 1: Virtual Bass Array (VBA)',
      detail: result
        ? `Identified P1(${result.modal_info_left.f_1.toFixed(1)}Hz), 24dB/oct LPF synthesized`
        : 'Scanning modal resonances with ±10% tolerance...',
    },
    {
      id: 4,
      shortTitle: 'Tikhonov Inversion',
      title: 'Module 2: Regularized Magnitude Inversion',
      detail: result ? 'Tikhonov deconvolution (boost capped at +5.0 dB, cuts down to -20 dB)' : 'Inverting frequency response...',
    },
    {
      id: 5,
      shortTitle: 'Phase Linearize',
      title: 'Module 3: Crossover & Phase Linearization',
      detail: result ? '1-cycle FDW applied, 4th-order Linkwitz-Riley phase reversal synthesized' : 'Extracting excess phase...',
    },
    {
      id: 6,
      shortTitle: 'Sub Alignment',
      title: 'Subwoofer Co-Optimization',
      detail: result && result.sub_alignment
        ? `Aligned delay (${result.sub_alignment.optimal_delay_ms > 0 ? `+${result.sub_alignment.optimal_delay_ms.toFixed(2)}` : result.sub_alignment.optimal_delay_ms.toFixed(2)} ms, ${result.sub_alignment.optimal_polarity}), +${result.sub_alignment.gain_improvement_db.toFixed(1)} dB boost`
        : 'Searching optimal sub time-delay grid...',
    },
    {
      id: 7,
      shortTitle: 'Safeguards',
      title: 'Pre-Ringing & Zwicker Safeguards',
      detail: result ? 'Pre-echo ratio verified below auditory threshold' : 'Validating psychoacoustic temporal masking...',
    },
    {
      id: 8,
      shortTitle: 'Package Exports',
      title: 'Export Multi-Platform Package',
      detail: result
        ? 'Equalizer APO, CamillaDSP, miniDSP & 32-bit WAV generated'
        : 'Generating WAV, CamillaDSP, Equalizer APO & miniDSP packages...',
    },
  ];

  const [selectedStep, setSelectedStep] = useState<number | null>(null);
  const activeInspectStep = selectedStep !== null ? steps[selectedStep - 1] : (currentStepId ? steps[currentStepId - 1] : steps[steps.length - 1]);

  return (
    <div className="bg-white border border-stone-200 text-stone-800 dark:bg-[#121316] dark:border-stone-800 dark:text-stone-100 rounded-lg p-4 transition-colors shadow-sm space-y-3">
      {/* Stepper Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center space-x-2">
          <Sparkles className="h-4 w-4 text-amber-700 dark:text-amber-500" />
          <h3 className="font-serif font-bold text-stone-900 dark:text-stone-100 text-sm tracking-tight">
            Optimization Pipeline Telemetry
          </h3>
          <span className="text-[11px] text-stone-500 dark:text-stone-400 font-sans hidden sm:inline">
            (8-Stage Acoustic Pipeline)
          </span>
        </div>
        {result ? (
          <span className="text-[11px] font-mono font-bold px-2.5 py-0.5 rounded bg-amber-500/10 text-amber-900 dark:text-amber-300 border border-amber-300 dark:border-amber-500/30">
            ✓ Complete (All 8 Stages Verified)
          </span>
        ) : livePct !== null ? (
          <div className="flex items-center space-x-2">
            <span className="h-2 w-2 rounded-full bg-amber-600 dark:bg-amber-400 animate-pulse" />
            <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-500/30">
              {livePct}%
            </span>
          </div>
        ) : null}
      </div>

      {/* Thin live progress bar during execution */}
      {isRunning && livePct !== null && (
        <div className="h-1 w-full rounded bg-stone-200 dark:bg-stone-800 overflow-hidden">
          <div
            className="h-full bg-amber-700 dark:bg-amber-500 transition-all duration-300"
            style={{ width: `${Math.min(100, Math.max(0, livePct))}%` }}
          />
        </div>
      )}

      {/* Horizontal Inline Progress Stepper Bar */}
      <div className="overflow-x-auto pb-1">
        <div className="min-w-[680px] flex items-center justify-between relative">
          {/* Background Connector Track */}
          <div className="absolute left-4 right-4 top-3.5 h-0.5 bg-stone-200 dark:bg-stone-800 -z-0" />

          {steps.map((step) => {
            const isDone = !!result;
            const isActive = isRunning && !result && currentStepId === step.id;
            const isPast = isRunning && !result && currentStepId !== null && step.id < currentStepId;
            const isInspecting = activeInspectStep?.id === step.id;

            return (
              <button
                key={step.id}
                type="button"
                onClick={() => setSelectedStep(step.id)}
                className={`relative z-10 flex flex-col items-center group cursor-pointer focus:outline-none transition-all px-1.5`}
              >
                {/* Numbered Node Circle */}
                <div
                  className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-mono font-bold transition-all border shadow-sm ${
                    isDone || isPast
                      ? 'bg-amber-700 text-white border-amber-800 dark:bg-amber-500 dark:text-stone-950 dark:border-amber-400'
                      : isActive
                        ? 'bg-amber-100 text-amber-900 border-amber-500 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-400 ring-2 ring-amber-500/30 animate-pulse'
                        : isInspecting
                          ? 'bg-stone-200 text-stone-900 border-stone-400 dark:bg-stone-800 dark:text-stone-100 dark:border-stone-600'
                          : 'bg-stone-50 text-stone-500 border-stone-300 dark:bg-[#0E0F12] dark:text-stone-400 dark:border-stone-800'
                  }`}
                >
                  {isDone || isPast ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : isActive ? (
                    <div className="h-3 w-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    step.id
                  )}
                </div>

                {/* Stage Short Label */}
                <span
                  className={`text-[10px] font-sans font-medium mt-1 whitespace-nowrap transition-colors ${
                    isActive
                      ? 'text-amber-800 dark:text-amber-300 font-bold'
                      : isInspecting
                        ? 'text-stone-900 dark:text-stone-100 font-semibold'
                        : 'text-stone-600 dark:text-stone-400'
                  }`}
                >
                  {step.shortTitle}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Compact Inspector Strip for Active/Selected Stage */}
      {activeInspectStep && (
        <div className="flex items-center space-x-2 text-xs bg-stone-50 dark:bg-[#0E0F12] border border-stone-200/80 dark:border-stone-800/80 rounded px-3 py-2 transition-colors">
          <Info className="h-3.5 w-3.5 text-amber-700 dark:text-amber-500 shrink-0" />
          <span className="font-semibold text-stone-900 dark:text-stone-100 shrink-0 font-sans">
            Stage {activeInspectStep.id} ({activeInspectStep.title}):
          </span>
          <span className="text-stone-600 dark:text-stone-300 font-mono text-[11px] truncate flex-1">
            {activeInspectStep.detail}
          </span>
        </div>
      )}
    </div>
  );
};
