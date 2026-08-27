import React, { useState } from 'react';
import { OptimizationRequest, OptimizationResponse, StatusResponse } from '../types';
import { getExportBundleUrl } from '../api/client';
import { RefreshCw, Download, Sliders, Volume2, ArrowRight } from 'lucide-react';

interface EditorialArchitecturalViewProps {
  config: OptimizationRequest;
  onChangeConfig: (c: OptimizationRequest) => void;
  result: OptimizationResponse | null;
  isRunning: boolean;
  onRun: () => void;
  status: StatusResponse | null;
  theme: 'dark' | 'light';
}

export const EditorialArchitecturalView: React.FC<EditorialArchitecturalViewProps> = ({
  config,
  onChangeConfig,
  result,
  isRunning,
  onRun,
  status,
  theme,
}) => {
  const [activeTab, setActiveTab] = useState<'spl' | 'phase' | 'step'>('spl');
  const [subDelayMs, setSubDelayMs] = useState<number>(result?.sub_alignment?.optimal_delay_ms ?? 8.4);
  const [polarity, setPolarity] = useState<number>(result?.sub_alignment?.polarity_multiplier ?? 1);

  const intel = result?.acoustic_intelligence;
  const sub = result?.sub_alignment;

  // Plot geometry
  const width = 760;
  const height = 250;
  const pad = { top: 16, right: 20, bottom: 32, left: 40 };
  const pw = width - pad.left - pad.right;
  const ph = height - pad.top - pad.bottom;

  const minF = 20;
  const maxF = 20000;
  const minSpl = 40;
  const maxSpl = 100;

  const xPos = (f: number) => pad.left + (Math.log10(Math.max(f, minF) / minF) / Math.log10(maxF / minF)) * pw;
  const yPos = (s: number) => pad.top + ((maxSpl - Math.max(Math.min(s, maxSpl), minSpl)) / (maxSpl - minSpl)) * ph;

  const makePath = (freqs?: number[], spls?: number[]) => {
    if (!freqs || !spls || freqs.length === 0) return '';
    const pts: string[] = [];
    const step = Math.max(1, Math.floor(freqs.length / 260));
    for (let i = 0; i < freqs.length; i += step) {
      if (freqs[i] >= minF && freqs[i] <= maxF) {
        pts.push(`${xPos(freqs[i]).toFixed(1)},${yPos(spls[i]).toFixed(1)}`);
      }
    }
    return pts.length > 0 ? `M ${pts.join(' L ')}` : '';
  };

  return (
    <div className="w-full space-y-10 transition-colors">
      {/* Monograph Title Block */}
      <div className="border-b border-stone-300 dark:border-stone-800 pb-8">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center space-x-3 text-[11px] font-mono tracking-widest text-amber-700 dark:text-amber-500 uppercase font-bold">
              <span>ARCHITECTURAL MONOGRAPH</span>
              <span>•</span>
              <span>SPEC. 01/24</span>
              <span>•</span>
              <span>LARS MÜLLER GRID</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-serif font-normal text-stone-900 dark:text-stone-100 tracking-tight leading-none">
              Acoustic Inversion Protocol
            </h1>
            <p className="text-xs text-stone-600 dark:text-stone-400 max-w-xl leading-relaxed">
              Linear-phase FIR deconvolution with 1-cycle frequency-dependent windowing and physical microphone triangulation.
            </p>
          </div>

          <div className="flex items-center space-x-4 shrink-0">
            <button
              onClick={onRun}
              disabled={isRunning}
              className="px-6 py-2.5 rounded bg-stone-900 hover:bg-stone-800 text-stone-50 dark:bg-stone-100 dark:text-stone-950 dark:hover:bg-stone-200 text-xs font-mono font-bold tracking-widest uppercase transition-all active:scale-[0.98] flex items-center space-x-2 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRunning ? 'animate-spin' : ''}`} />
              <span>{isRunning ? 'INVERTING...' : 'RUN INVERSION'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Asymmetric 12-Column Architectural Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

        {/* Left 4 Columns: Dense Technical Specifications & Math */}
        <div className="lg:col-span-4 space-y-6 border-r border-stone-200 dark:border-stone-800/80 pr-0 lg:pr-8">
          
          {/* Section A: Atmospheric Calibration */}
          <div className="space-y-2">
            <h4 className="text-[10px] font-mono tracking-widest uppercase text-amber-700 dark:text-amber-500 font-bold">
              01 // ATMOSPHERIC VECTOR
            </h4>
            <div className="border-t border-stone-300 dark:border-stone-800 pt-2 space-y-1.5 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-stone-500">Speed of Sound:</span>
                <strong className="text-stone-800 dark:text-stone-200">{intel?.speed_of_sound_mps ?? 343.2} m/s</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Ambient Temp:</span>
                <strong className="text-stone-800 dark:text-stone-200">20.0 °C (50% RH)</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Air Absorption (10k):</span>
                <strong className="text-stone-800 dark:text-stone-200">0.18 dB/m</strong>
              </div>
            </div>
          </div>

          {/* Section B: Room Dimensions & Schroeder Boundary */}
          <div className="space-y-2">
            <h4 className="text-[10px] font-mono tracking-widest uppercase text-amber-700 dark:text-amber-500 font-bold">
              02 // ROOM TRANSITION METRICS
            </h4>
            <div className="border-t border-stone-300 dark:border-stone-800 pt-2 space-y-1.5 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-stone-500">Schroeder Transition:</span>
                <strong className="text-amber-600 dark:text-amber-400 font-bold">{intel?.detected_schroeder_hz ?? 185} Hz</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">First Reflection Gap:</span>
                <strong className="text-stone-800 dark:text-stone-200">{intel?.detected_reflection_gap_ms ?? 3.20} ms</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Auto FDW Window:</span>
                <strong className="text-stone-800 dark:text-stone-200">{intel?.recommended_fdw_cycles ?? 5} Cycles</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-500">Mic Lateral Offset:</span>
                <strong className="text-stone-800 dark:text-stone-200">14 mm (0.04 ms)</strong>
              </div>
            </div>
          </div>

          {/* Section C: Target House Curve Profile */}
          <div className="space-y-2">
            <h4 className="text-[10px] font-mono tracking-widest uppercase text-amber-700 dark:text-amber-500 font-bold">
              03 // TARGET HOUSE PROFILE
            </h4>
            <div className="border-t border-stone-300 dark:border-stone-800 pt-2 grid grid-cols-2 gap-1.5 text-xs font-mono">
              {[
                { id: 'harman', name: 'Harman (+6dB)', boost: 6.0 },
                { id: 'oca', name: 'OCA Dynamic', boost: 5.5 },
                { id: 'bk1974', name: 'B&K 1974', boost: 3.0 },
                { id: 'flat', name: 'Flat (0dB)', boost: 0.0 },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() =>
                    onChangeConfig({
                      ...config,
                      target: { ...config.target, name: t.id as any, bass_boost_db: t.boost },
                    })
                  }
                  className={`p-2 text-left rounded border transition-all ${
                    config.target.name === t.id
                      ? 'border-stone-900 bg-stone-900 text-white dark:border-stone-100 dark:bg-stone-100 dark:text-stone-950 font-bold'
                      : 'border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-400 hover:border-stone-400'
                  }`}
                >
                  <div className="text-[11px] leading-tight">{t.name}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Section D: Export Package Link */}
          <div className="pt-2">
            <a
              href={getExportBundleUrl()}
              className="w-full py-2.5 rounded border border-stone-900 bg-stone-900 hover:bg-stone-800 text-white dark:border-stone-100 dark:bg-stone-100 dark:text-stone-950 dark:hover:bg-stone-200 text-xs font-mono font-bold tracking-widest uppercase text-center block transition-all active:scale-[0.98]"
            >
              DOWNLOAD CONVOLVER BUNDLE (.ZIP)
            </a>
          </div>
        </div>

        {/* Right 8 Columns: Master Acoustic Curve & Sub Alignment */}
        <div className="lg:col-span-8 space-y-8">

          {/* Figure 1.0: Transfer Function Plot */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-stone-300 dark:border-stone-800 pb-2">
              <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-stone-500">
                FIG. 1.0 // STEADY-STATE ROOM TRANSFER FUNCTION
              </span>

              <div className="flex items-center space-x-1 text-[11px] font-mono">
                {(['spl', 'phase', 'step'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-2.5 py-0.5 rounded transition-all ${
                      activeTab === tab
                        ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-950 font-bold'
                        : 'text-stone-500 hover:text-stone-900 dark:hover:text-white'
                    }`}
                  >
                    {tab === 'spl' ? 'SPL' : tab === 'phase' ? 'Phase' : 'Step'}
                  </button>
                ))}
              </div>
            </div>

            {/* SVG Canvas */}
            <div className="overflow-x-auto">
              <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto select-none overflow-visible">
                <rect
                  x={pad.left}
                  y={pad.top}
                  width={pw}
                  height={ph}
                  fill={theme === 'dark' ? '#141518' : '#FAFAF8'}
                  stroke={theme === 'dark' ? '#27292F' : '#E5E4DE'}
                  strokeWidth="1"
                />

                {[20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].map((f) => {
                  const x = xPos(f);
                  return (
                    <g key={f}>
                      <line x1={x} y1={pad.top} x2={x} y2={height - pad.bottom} stroke={theme === 'dark' ? '#222328' : '#ECEBE5'} strokeWidth="1" />
                      <text x={x} y={height - pad.bottom + 14} fill="#888885" fontSize="9" textAnchor="middle" fontFamily="monospace">
                        {f >= 1000 ? `${f / 1000}k` : f}
                      </text>
                    </g>
                  );
                })}

                {[50, 60, 70, 80, 90, 100].map((s) => {
                  const y = yPos(s);
                  return (
                    <g key={s}>
                      <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke={theme === 'dark' ? '#222328' : '#ECEBE5'} strokeWidth="1" />
                      <text x={pad.left - 6} y={y + 3} fill="#888885" fontSize="9" textAnchor="end" fontFamily="monospace">
                        {s}
                      </text>
                    </g>
                  );
                })}

                {result?.plots && (
                  <path
                    d={makePath(result.plots.freqs, result.plots.spl_before_left)}
                    fill="none"
                    stroke={theme === 'dark' ? '#6B7280' : '#9CA3AF'}
                    strokeWidth="1.2"
                    strokeDasharray="4,4"
                  />
                )}

                {result?.plots && (
                  <path
                    d={makePath(result.plots.freqs, result.plots.spl_target_left)}
                    fill="none"
                    stroke="#C2410C"
                    strokeWidth="1.5"
                  />
                )}

                {result?.plots && (
                  <path
                    d={makePath(result.plots.freqs, result.plots.spl_after_left)}
                    fill="none"
                    stroke={theme === 'dark' ? '#F3F4F6' : '#111827'}
                    strokeWidth="2.2"
                  />
                )}
              </svg>
            </div>

            {/* Legend */}
            <div className="flex flex-wrap items-center justify-between gap-4 text-[11px] font-mono text-stone-500 pt-1">
              <div className="flex items-center space-x-5">
                <span className="flex items-center space-x-1.5">
                  <span className="w-3 h-0.5 bg-stone-400 inline-block border-b border-dashed"></span>
                  <span>Uncorrected Room</span>
                </span>
                <span className="flex items-center space-x-1.5">
                  <span className="w-3 h-0.5 bg-[#C2410C] inline-block"></span>
                  <span>Target House Curve</span>
                </span>
                <span className="flex items-center space-x-1.5 font-bold text-stone-900 dark:text-stone-100">
                  <span className="w-3 h-0.5 bg-stone-900 dark:bg-stone-100 inline-block"></span>
                  <span>Calibrated Transfer Function</span>
                </span>
              </div>
              <span>{config.target_taps.toLocaleString()} Taps • IEEE 32-bit Float</span>
            </div>
          </div>

          {/* Subwoofer Time-Alignment & Linkwitz-Riley Rack */}
          <div className="border-t border-stone-300 dark:border-stone-800 pt-6 space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono font-bold uppercase tracking-widest text-stone-500">
                FIG. 2.0 // SUBWOOFER TIME-ALIGNMENT & SUMMATION
              </span>
              <span className="text-[11px] font-mono font-bold text-amber-700 dark:text-amber-500">
                +{sub?.gain_improvement_db.toFixed(1) ?? '4.2'} dB SPL Crossover Gain
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono">
              <div className="border border-stone-200 dark:border-stone-800 p-3 rounded bg-stone-50/50 dark:bg-stone-900/30">
                <span className="text-[10px] text-stone-500 block">DELAY TRIM</span>
                <strong className="text-base text-stone-900 dark:text-stone-100 mt-0.5 block">
                  +{subDelayMs.toFixed(2)} ms
                </strong>
                <span className="text-[10px] text-stone-400">{sub?.optimal_delay_samples ?? 403} samples</span>
              </div>

              <div className="border border-stone-200 dark:border-stone-800 p-3 rounded bg-stone-50/50 dark:bg-stone-900/30">
                <span className="text-[10px] text-stone-500 block">POLARITY MATCH</span>
                <div className="flex items-center justify-between mt-0.5">
                  <strong className="text-base text-stone-900 dark:text-stone-100">
                    {polarity > 0 ? 'Normal (+)' : 'Inverted (-)'}
                  </strong>
                  <button
                    onClick={() => setPolarity((p) => (p > 0 ? -1 : 1))}
                    className="px-2 py-0.5 rounded border border-stone-300 dark:border-stone-700 text-[10px] font-bold"
                  >
                    Flip
                  </button>
                </div>
              </div>

              <div className="border border-stone-200 dark:border-stone-800 p-3 rounded bg-stone-50/50 dark:bg-stone-900/30">
                <span className="text-[10px] text-stone-500 block">ACOUSTIC CROSSOVER</span>
                <strong className="text-base text-stone-900 dark:text-stone-100 mt-0.5 block">
                  {config.sub_crossover_freq_hz} Hz
                </strong>
                <span className="text-[10px] text-stone-400">24 dB/oct Linkwitz-Riley</span>
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-[11px] font-mono text-stone-500">
                <span>Micro-Delay Scrubber</span>
                <span>{subDelayMs.toFixed(2)} ms</span>
              </div>
              <input
                type="range"
                min="-20"
                max="20"
                step="0.1"
                value={subDelayMs}
                onChange={(e) => setSubDelayMs(parseFloat(e.target.value))}
                className="w-full h-1 bg-stone-300 dark:bg-stone-800 appearance-none cursor-pointer accent-stone-900 dark:accent-stone-100"
              />
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
