import React, { useState } from 'react';
import { OptimizationRequest, OptimizationResponse, StatusResponse } from '../types';
import { getExportBundleUrl } from '../api/client';
import { RefreshCw, Download, ArrowUpRight } from 'lucide-react';

interface AudiophileEditorialViewProps {
  config: OptimizationRequest;
  onChangeConfig: (c: OptimizationRequest) => void;
  result: OptimizationResponse | null;
  isRunning: boolean;
  onRun: () => void;
  status: StatusResponse | null;
  theme: 'dark' | 'light';
}

export const AudiophileEditorialView: React.FC<AudiophileEditorialViewProps> = ({
  config,
  onChangeConfig,
  result,
  isRunning,
  onRun,
  status,
  theme,
}) => {
  const [subDelayMs, setSubDelayMs] = useState<number>(result?.sub_alignment?.optimal_delay_ms ?? 8.4);
  const [polarity, setPolarity] = useState<number>(result?.sub_alignment?.polarity_multiplier ?? 1);

  const intel = result?.acoustic_intelligence;
  const sub = result?.sub_alignment;

  // Plot geometry
  const width = 860;
  const height = 240;
  const pad = { top: 16, right: 24, bottom: 36, left: 44 };
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
    const step = Math.max(1, Math.floor(freqs.length / 280));
    for (let i = 0; i < freqs.length; i += step) {
      if (freqs[i] >= minF && freqs[i] <= maxF) {
        pts.push(`${xPos(freqs[i]).toFixed(1)},${yPos(spls[i]).toFixed(1)}`);
      }
    }
    return pts.length > 0 ? `M ${pts.join(' L ')}` : '';
  };

  return (
    <div className="w-full space-y-8 transition-colors">

      {/* Editorial Monograph Header */}
      <div className="border-b border-stone-200 dark:border-stone-800 pb-6">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4">
          <div>
            <span className="text-[11px] font-mono tracking-widest text-amber-700 dark:text-amber-500 uppercase font-semibold block mb-1">
              VOL. 24 • ACOUSTIC EQUALIZATION JOURNAL
            </span>
            <h2 className="text-2xl sm:text-3xl font-serif text-stone-900 dark:text-stone-100 tracking-tight">
              Acoustic Inversion & Room Mode Routine
            </h2>
            <p className="text-xs text-stone-600 dark:text-stone-400 mt-1 max-w-2xl leading-relaxed">
              Laboratory reference measurement with 1-cycle frequency-dependent windowing and sub-millimeter phase alignment.
            </p>
          </div>

          <div className="flex items-center space-x-3 shrink-0">
            <button
              onClick={onRun}
              disabled={isRunning}
              className="px-5 py-2 rounded bg-stone-900 hover:bg-stone-800 text-stone-50 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200 text-xs font-mono font-bold tracking-wider uppercase transition-all active:scale-[0.98] flex items-center space-x-2 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRunning ? 'animate-spin' : ''}`} />
              <span>{isRunning ? 'CALIBRATING...' : 'EXECUTE CALIBRATION'}</span>
            </button>
          </div>
        </div>

        {/* Ambient Hardware Metadata Tagline */}
        <div className="flex flex-wrap items-center gap-6 mt-4 text-[11px] font-mono text-stone-500 dark:text-stone-400">
          <span>HARDWARE: <strong className="text-stone-800 dark:text-stone-200">Edifier MR3 + T5s Subwoofer</strong></span>
          <span>•</span>
          <span>ATMOSPHERE: <strong className="text-stone-800 dark:text-stone-200">20°C, 50% RH (c=343.2 m/s)</strong></span>
          <span>•</span>
          <span>STATE: <strong className="text-amber-600 dark:text-amber-400">{status?.rew_connected ? 'REW REST API' : 'Standalone Mode'}</strong></span>
        </div>
      </div>

      {/* Master Full-Width Transfer Function Plot */}
      <div className="border border-stone-200 dark:border-stone-800 rounded-lg p-5 bg-white dark:bg-[#121316] space-y-3">
        <div className="flex items-center justify-between pb-3 border-b border-stone-100 dark:border-stone-800/80">
          <div className="flex items-center space-x-3">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-stone-400">
              FIGURE 01
            </span>
            <span className="text-xs font-semibold text-stone-800 dark:text-stone-200 uppercase tracking-wider">
              Steady-State Transfer Function (SPL Before / After)
            </span>
          </div>

          <div className="flex items-center space-x-6 text-[11px] font-mono text-stone-500">
            <span className="flex items-center space-x-1.5">
              <span className="w-3 h-0.5 bg-stone-400 inline-block border-b border-dashed"></span>
              <span>Raw Response</span>
            </span>
            <span className="flex items-center space-x-1.5">
              <span className="w-3 h-0.5 bg-[#D97706] inline-block"></span>
              <span>Target Curve</span>
            </span>
            <span className="flex items-center space-x-1.5 font-bold text-stone-900 dark:text-stone-100">
              <span className="w-3 h-0.5 bg-stone-900 dark:bg-stone-100 inline-block"></span>
              <span>Linearized Acoustic Output</span>
            </span>
          </div>
        </div>

        {/* SVG Graphic */}
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto select-none overflow-visible">
            <rect
              x={pad.left}
              y={pad.top}
              width={pw}
              height={ph}
              fill={theme === 'dark' ? '#0F1013' : '#FCFCFA'}
              stroke={theme === 'dark' ? '#26282E' : '#E8E6E1'}
              strokeWidth="1"
            />

            {[20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].map((f) => {
              const x = xPos(f);
              return (
                <g key={f}>
                  <line x1={x} y1={pad.top} x2={x} y2={height - pad.bottom} stroke={theme === 'dark' ? '#1E2026' : '#F0EFEA'} strokeWidth="1" />
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
                  <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke={theme === 'dark' ? '#1E2026' : '#F0EFEA'} strokeWidth="1" />
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
                stroke={theme === 'dark' ? '#5E626E' : '#9CA3AF'}
                strokeWidth="1.2"
                strokeDasharray="4,4"
              />
            )}

            {result?.plots && (
              <path
                d={makePath(result.plots.freqs, result.plots.spl_target_left)}
                fill="none"
                stroke="#D97706"
                strokeWidth="1.5"
              />
            )}

            {result?.plots && (
              <path
                d={makePath(result.plots.freqs, result.plots.spl_after_left)}
                fill="none"
                stroke={theme === 'dark' ? '#EDEDEC' : '#171717'}
                strokeWidth="2.2"
              />
            )}
          </svg>
        </div>
      </div>

      {/* Three Numbered Technical Chapters */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

        {/* Chapter 01: Modal Absorption */}
        <div className="border border-stone-200 dark:border-stone-800 rounded-lg p-5 bg-white dark:bg-[#121316] space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono tracking-widest text-amber-700 dark:text-amber-500 uppercase font-bold">
                01 / MODAL MITIGATION
              </span>
              <span className="text-[10px] font-mono text-stone-500">SCHROEDER</span>
            </div>
            <h3 className="font-serif text-lg text-stone-900 dark:text-stone-100">
              Virtual Bass Array Synthesis
            </h3>
            <p className="text-xs text-stone-600 dark:text-stone-400 mt-1 leading-relaxed">
              Synthesizes boundary reflection cancellation filters for axial room modes below Schroeder frequency.
            </p>
          </div>

          <div className="p-3 rounded bg-stone-50 dark:bg-[#0F1013] border border-stone-200 dark:border-stone-800/80 space-y-1.5 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-stone-500">Schroeder Transition:</span>
              <span className="font-bold text-stone-800 dark:text-stone-200">{intel?.detected_schroeder_hz ?? 185} Hz</span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500">First Reflection:</span>
              <span className="font-bold text-stone-800 dark:text-stone-200">{intel?.detected_reflection_gap_ms ?? 3.2} ms</span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500">Auto FDW Window:</span>
              <span className="font-bold text-amber-600 dark:text-amber-400">{intel?.recommended_fdw_cycles ?? 5} Cycles</span>
            </div>
          </div>
        </div>

        {/* Chapter 02: Phase Integration */}
        <div className="border border-stone-200 dark:border-stone-800 rounded-lg p-5 bg-white dark:bg-[#121316] space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono tracking-widest text-amber-700 dark:text-amber-500 uppercase font-bold">
                02 / TIME INTEGRATION
              </span>
              <span className="text-[10px] font-mono text-stone-500">LINKWITZ-RILEY</span>
            </div>
            <h3 className="font-serif text-lg text-stone-900 dark:text-stone-100">
              Subwoofer Summation Alignment
            </h3>
            <p className="text-xs text-stone-600 dark:text-stone-400 mt-1 leading-relaxed">
              Calculates phase coherence across 40–160 Hz acoustic crossover eliminating destructive cancellation.
            </p>
          </div>

          <div className="p-3 rounded bg-stone-50 dark:bg-[#0F1013] border border-stone-200 dark:border-stone-800/80 space-y-2 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-stone-500">Optimal Delay Trim:</span>
              <span className="font-bold text-stone-800 dark:text-stone-200">+{subDelayMs.toFixed(2)} ms</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-stone-500">Phase Polarity:</span>
              <button
                onClick={() => setPolarity((p) => (p > 0 ? -1 : 1))}
                className="px-2 py-0.5 rounded bg-stone-200 dark:bg-stone-800 text-[10px] font-bold text-stone-800 dark:text-stone-200"
              >
                {polarity > 0 ? 'Normal (+)' : 'Inverted (-)'}
              </button>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500">Summation Gain:</span>
              <span className="font-bold text-amber-600 dark:text-amber-400">+{sub?.gain_improvement_db.toFixed(1) ?? '4.2'} dB SPL</span>
            </div>
          </div>
        </div>

        {/* Chapter 03: Export Package */}
        <div className="border border-stone-200 dark:border-stone-800 rounded-lg p-5 bg-white dark:bg-[#121316] space-y-3 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono tracking-widest text-amber-700 dark:text-amber-500 uppercase font-bold">
                03 / CONVOLVER DEPLOYMENT
              </span>
              <span className="text-[10px] font-mono text-stone-500">BIT-PERFECT</span>
            </div>
            <h3 className="font-serif text-lg text-stone-900 dark:text-stone-100">
              Convolver Packages & Manifest
            </h3>
            <p className="text-xs text-stone-600 dark:text-stone-400 mt-1 leading-relaxed">
              Export ready IEEE 32-bit floating point convolution filters for Equalizer APO, CamillaDSP, and miniDSP.
            </p>
          </div>

          <div className="space-y-2">
            <div className="text-[11px] font-mono text-stone-500 dark:text-stone-400 space-y-1">
              <div className="flex justify-between">
                <span>Windows:</span>
                <strong className="text-stone-800 dark:text-stone-200">Equalizer APO (config.txt)</strong>
              </div>
              <div className="flex justify-between">
                <span>Linux / Pi:</span>
                <strong className="text-stone-800 dark:text-stone-200">CamillaDSP (.yml)</strong>
              </div>
            </div>

            <a
              href={getExportBundleUrl()}
              className="w-full py-2.5 rounded bg-stone-900 hover:bg-stone-800 text-stone-50 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200 text-xs font-mono font-bold tracking-wider uppercase text-center block transition-all active:scale-[0.98]"
            >
              DOWNLOAD BUNDLE (.ZIP)
            </a>
          </div>
        </div>

      </div>

    </div>
  );
};
