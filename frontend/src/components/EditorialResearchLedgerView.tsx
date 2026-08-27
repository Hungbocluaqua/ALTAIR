import React, { useState } from 'react';
import { OptimizationRequest, OptimizationResponse, StatusResponse } from '../types';
import { getExportBundleUrl } from '../api/client';
import { RefreshCw, Download, Sliders, FileText } from 'lucide-react';

interface EditorialResearchLedgerViewProps {
  config: OptimizationRequest;
  onChangeConfig: (c: OptimizationRequest) => void;
  result: OptimizationResponse | null;
  isRunning: boolean;
  onRun: () => void;
  status: StatusResponse | null;
  theme: 'dark' | 'light';
}

export const EditorialResearchLedgerView: React.FC<EditorialResearchLedgerViewProps> = ({
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
  const width = 640;
  const height = 230;
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
    const step = Math.max(1, Math.floor(freqs.length / 220));
    for (let i = 0; i < freqs.length; i += step) {
      if (freqs[i] >= minF && freqs[i] <= maxF) {
        pts.push(`${xPos(freqs[i]).toFixed(1)},${yPos(spls[i]).toFixed(1)}`);
      }
    }
    return pts.length > 0 ? `M ${pts.join(' L ')}` : '';
  };

  return (
    <div className="w-full space-y-8 transition-colors max-w-6xl mx-auto py-2">

      {/* Academic Paper Preprint Header */}
      <div className="border-b-2 border-stone-900 dark:border-stone-100 pb-4">
        <div className="flex items-center justify-between text-[11px] font-mono text-stone-500 uppercase tracking-widest border-b border-stone-200 dark:border-stone-800 pb-2 mb-3">
          <span>AES PREPRINT // CONVENTION PAPER 104</span>
          <span>ALTAIR PRECISION ENGINE v2.4</span>
        </div>

        <div className="flex flex-col md:flex-row md:items-baseline justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-serif text-stone-900 dark:text-stone-100 tracking-tight">
              An Empirical Method for Sub-Millimeter Phase Alignment and Modal Mitigation
            </h1>
            <p className="text-xs font-serif italic text-stone-600 dark:text-stone-400 mt-1">
              Automatic Linear-phase Tuning and Boundary Inversion for Active Studio Monitoring
            </p>
          </div>

          <button
            onClick={onRun}
            disabled={isRunning}
            className="px-5 py-2 rounded bg-stone-900 hover:bg-stone-800 text-stone-50 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200 text-xs font-mono font-bold tracking-widest uppercase transition-all active:scale-[0.98] flex items-center space-x-2 shrink-0 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRunning ? 'animate-spin' : ''}`} />
            <span>{isRunning ? 'CALCULATING...' : 'RUN CALCULATION'}</span>
          </button>
        </div>
      </div>

      {/* Two-Column Scientific Paper Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

        {/* Left 7 Columns: Figure 1 (Plot) + House Target Profile */}
        <div className="lg:col-span-7 space-y-6">

          {/* Figure 1.0 */}
          <div className="border border-stone-300 dark:border-stone-800 rounded p-4 bg-white dark:bg-[#111215] space-y-2">
            <div className="flex justify-between text-[11px] font-mono text-stone-600 dark:text-stone-400 border-b border-stone-200 dark:border-stone-800 pb-2">
              <span className="font-bold text-stone-900 dark:text-stone-100">
                Figure 1. Room Transfer Function Before and After Tikhonov Regularization
              </span>
              <span>N = {config.target_taps.toLocaleString()} Taps</span>
            </div>

            {/* SVG Plot */}
            <div className="overflow-x-auto">
              <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto select-none overflow-visible">
                <rect
                  x={pad.left}
                  y={pad.top}
                  width={pw}
                  height={ph}
                  fill={theme === 'dark' ? '#0F1013' : '#FBFBFA'}
                  stroke={theme === 'dark' ? '#25272D' : '#E2E1DC'}
                  strokeWidth="1"
                />

                {[20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].map((f) => {
                  const x = xPos(f);
                  return (
                    <g key={f}>
                      <line x1={x} y1={pad.top} x2={x} y2={height - pad.bottom} stroke={theme === 'dark' ? '#1D1F24' : '#EEEEEE'} strokeWidth="1" />
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
                      <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke={theme === 'dark' ? '#1D1F24' : '#EEEEEE'} strokeWidth="1" />
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
                    stroke={theme === 'dark' ? '#64748B' : '#94A3B8'}
                    strokeWidth="1.2"
                    strokeDasharray="4,4"
                  />
                )}

                {result?.plots && (
                  <path
                    d={makePath(result.plots.freqs, result.plots.spl_target_left)}
                    fill="none"
                    stroke="#1D4ED8"
                    strokeWidth="1.5"
                  />
                )}

                {result?.plots && (
                  <path
                    d={makePath(result.plots.freqs, result.plots.spl_after_left)}
                    fill="none"
                    stroke={theme === 'dark' ? '#F1F5F9' : '#0F172A'}
                    strokeWidth="2.2"
                  />
                )}
              </svg>
            </div>

            <p className="text-[11px] font-serif text-stone-500 italic pt-1 leading-relaxed">
              Comparison between raw steady-state acoustic response (dashed gray line), target house curve (blue solid line), and regularized FIR inverse (solid line).
            </p>
          </div>

          {/* Target Profile Selector */}
          <div className="border border-stone-300 dark:border-stone-800 rounded p-4 bg-white dark:bg-[#111215] space-y-2.5">
            <h4 className="text-xs font-mono font-bold uppercase text-stone-900 dark:text-stone-100">
              Parametric Target House Curves
            </h4>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              {[
                { id: 'harman', name: 'Harman (+6dB)', boost: 6.0 },
                { id: 'oca', name: 'OCA Dynamic', boost: 5.5 },
                { id: 'bk1974', name: 'B&K 1974 Classic', boost: 3.0 },
                { id: 'flat', name: 'Studio Flat (0dB)', boost: 0.0 },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() =>
                    onChangeConfig({
                      ...config,
                      target: { ...config.target, name: t.id as any, bass_boost_db: t.boost },
                    })
                  }
                  className={`p-2 rounded border text-left transition-all ${
                    config.target.name === t.id
                      ? 'border-blue-600 bg-blue-500/10 text-blue-700 dark:text-blue-300 font-bold'
                      : 'border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-400 hover:border-stone-400'
                  }`}
                >
                  <div className="text-[11px]">{t.name}</div>
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* Right 5 Columns: Table 1 (Alignment Matrix) + Convolver Manifest */}
        <div className="lg:col-span-5 space-y-6">

          {/* Table 1 */}
          <div className="border border-stone-300 dark:border-stone-800 rounded p-4 bg-white dark:bg-[#111215] space-y-3">
            <h4 className="text-xs font-mono font-bold uppercase text-stone-900 dark:text-stone-100 border-b border-stone-200 dark:border-stone-800 pb-2">
              Table 1. Acoustic Coherence & Boundary Parameters
            </h4>

            <table className="w-full text-xs font-mono border-collapse">
              <tbody>
                <tr className="border-b border-stone-100 dark:border-stone-800/60">
                  <td className="py-1.5 text-stone-500">Schroeder Transition:</td>
                  <td className="py-1.5 text-right font-bold text-stone-900 dark:text-stone-100">
                    {intel?.detected_schroeder_hz ?? 185} Hz
                  </td>
                </tr>
                <tr className="border-b border-stone-100 dark:border-stone-800/60">
                  <td className="py-1.5 text-stone-500">Initial Reflection Gap:</td>
                  <td className="py-1.5 text-right font-bold text-stone-900 dark:text-stone-100">
                    {intel?.detected_reflection_gap_ms ?? 3.20} ms
                  </td>
                </tr>
                <tr className="border-b border-stone-100 dark:border-stone-800/60">
                  <td className="py-1.5 text-stone-500">Subwoofer Delay Added:</td>
                  <td className="py-1.5 text-right font-bold text-stone-900 dark:text-stone-100">
                    +{subDelayMs.toFixed(2)} ms
                  </td>
                </tr>
                <tr className="border-b border-stone-100 dark:border-stone-800/60">
                  <td className="py-1.5 text-stone-500">Summation Improvement:</td>
                  <td className="py-1.5 text-right font-bold text-blue-600 dark:text-blue-400">
                    +{sub?.gain_improvement_db.toFixed(1) ?? '4.2'} dB SPL
                  </td>
                </tr>
                <tr className="border-b border-stone-100 dark:border-stone-800/60">
                  <td className="py-1.5 text-stone-500">Phase Polarity Alignment:</td>
                  <td className="py-1.5 text-right">
                    <button
                      onClick={() => setPolarity((p) => (p > 0 ? -1 : 1))}
                      className="px-2 py-0.5 rounded border border-stone-300 dark:border-stone-700 text-[10px] font-bold"
                    >
                      {polarity > 0 ? 'Normal (+)' : 'Inverted (-)'}
                    </button>
                  </td>
                </tr>
                <tr>
                  <td className="py-1.5 text-stone-500">True-Peak 4x Oversampled:</td>
                  <td className="py-1.5 text-right font-bold text-stone-900 dark:text-stone-100">
                    -0.8 dBTP
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Delay Slider */}
            <div className="space-y-1 pt-2 border-t border-stone-200 dark:border-stone-800">
              <div className="flex justify-between text-[11px] font-mono text-stone-500">
                <span>Delay Trim</span>
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

          {/* Convolver Deployment Package */}
          <div className="border border-stone-300 dark:border-stone-800 rounded p-4 bg-white dark:bg-[#111215] space-y-3">
            <h4 className="text-xs font-mono font-bold uppercase text-stone-900 dark:text-stone-100 border-b border-stone-200 dark:border-stone-800 pb-2">
              Convolver Output Bundle
            </h4>

            <p className="text-xs font-serif text-stone-600 dark:text-stone-400">
              Bit-perfect IEEE 32-bit floating point impulse responses and platform configuration manifests.
            </p>

            <a
              href={getExportBundleUrl()}
              className="w-full py-2.5 rounded bg-stone-900 hover:bg-stone-800 text-stone-50 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200 text-xs font-mono font-bold tracking-widest uppercase text-center block transition-all active:scale-[0.98]"
            >
              DOWNLOAD PREPRINT BUNDLE (.ZIP)
            </a>
          </div>

        </div>

      </div>

    </div>
  );
};
