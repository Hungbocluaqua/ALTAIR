import React, { useState } from 'react';
import { OptimizationRequest, OptimizationResponse, StatusResponse } from '../types';
import { getExportBundleUrl } from '../api/client';
import { RefreshCw, Download, Music2, Sparkles, Sliders } from 'lucide-react';

interface EditorialTokyoArchiveViewProps {
  config: OptimizationRequest;
  onChangeConfig: (c: OptimizationRequest) => void;
  result: OptimizationResponse | null;
  isRunning: boolean;
  onRun: () => void;
  status: StatusResponse | null;
  theme: 'dark' | 'light';
}

export const EditorialTokyoArchiveView: React.FC<EditorialTokyoArchiveViewProps> = ({
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
  const width = 840;
  const height = 230;
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
    <div className="w-full space-y-12 transition-colors max-w-5xl mx-auto py-2">

      {/* Chapter 00: Publication Masthead */}
      <div className="border-b border-stone-300 dark:border-stone-800/80 pb-6">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4">
          <div className="space-y-1">
            <span className="text-[11px] font-mono tracking-widest text-amber-700 dark:text-amber-500 uppercase font-semibold block">
              TOKYO SOUND ARCHIVE • 季刊音響精密選集
            </span>
            <h1 className="text-3xl sm:text-4xl font-serif text-stone-900 dark:text-stone-100 tracking-tight">
              Acoustic Equalization Monograph
            </h1>
            <p className="text-xs text-stone-600 dark:text-stone-400 mt-1 max-w-xl leading-relaxed">
              Precision time-domain alignment and boundary reflection cancellation for Edifier MR3 studio monitors with Edifier T5s active subwoofer.
            </p>
          </div>

          <button
            onClick={onRun}
            disabled={isRunning}
            className="px-5 py-2.5 rounded bg-stone-900 hover:bg-stone-800 text-stone-50 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200 text-xs font-mono font-bold tracking-wider uppercase transition-all active:scale-[0.98] flex items-center space-x-2 shrink-0 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRunning ? 'animate-spin' : ''}`} />
            <span>{isRunning ? 'CALCULATING...' : 'EXECUTE CALIBRATION'}</span>
          </button>
        </div>

        {/* Japanese Audio Journal Reference Strip */}
        <div className="flex flex-wrap items-center gap-6 mt-4 pt-3 border-t border-stone-200 dark:border-stone-800/60 text-[11px] font-mono text-stone-500 dark:text-stone-400">
          <span>MONITOR SYSTEM: <strong className="text-stone-800 dark:text-stone-200">Edifier MR3 (Active Studio)</strong></span>
          <span>•</span>
          <span>SUBWOOFER: <strong className="text-stone-800 dark:text-stone-200">Edifier T5s (8-inch Powered)</strong></span>
          <span>•</span>
          <span>SPEED OF SOUND: <strong className="text-stone-800 dark:text-stone-200">{intel?.speed_of_sound_mps ?? 343.2} m/s</strong></span>
        </div>
      </div>

      {/* Chapter 01: Transfer Function Inversion */}
      <section className="space-y-4">
        <div className="flex items-center justify-between border-b border-stone-200 dark:border-stone-800/80 pb-2">
          <div className="flex items-center space-x-3">
            <span className="text-[10px] font-mono font-bold text-amber-700 dark:text-amber-500 uppercase tracking-widest">
              第一章 // 伝達関数補正
            </span>
            <span className="text-xs font-serif font-normal text-stone-800 dark:text-stone-200">
              Acoustic Transfer Function & Tikhonov Regularization
            </span>
          </div>

          <div className="flex items-center space-x-5 text-[11px] font-mono text-stone-500">
            <span className="flex items-center space-x-1.5">
              <span className="w-3 h-0.5 bg-stone-400 inline-block border-b border-dashed"></span>
              <span>Raw Response</span>
            </span>
            <span className="flex items-center space-x-1.5">
              <span className="w-3 h-0.5 bg-[#D97706] inline-block"></span>
              <span>Target House Curve</span>
            </span>
            <span className="flex items-center space-x-1.5 font-bold text-stone-900 dark:text-stone-100">
              <span className="w-3 h-0.5 bg-stone-900 dark:bg-stone-100 inline-block"></span>
              <span>Linear Phase Output</span>
            </span>
          </div>
        </div>

        {/* SVG Graphic */}
        <div className="overflow-x-auto border border-stone-200 dark:border-stone-800/80 rounded-lg p-3 bg-white dark:bg-[#111215]">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto select-none overflow-visible">
            <rect
              x={pad.left}
              y={pad.top}
              width={pw}
              height={ph}
              fill={theme === 'dark' ? '#0E0F12' : '#F7F5F0'}
              stroke={theme === 'dark' ? '#23252B' : '#E8E5DC'}
              strokeWidth="1"
            />

            {[20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].map((f) => {
              const x = xPos(f);
              return (
                <g key={f}>
                  <line x1={x} y1={pad.top} x2={x} y2={height - pad.bottom} stroke={theme === 'dark' ? '#1B1D22' : '#ECE8DF'} strokeWidth="1" />
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
                  <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke={theme === 'dark' ? '#1B1D22' : '#ECE8DF'} strokeWidth="1" />
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
                stroke={theme === 'dark' ? '#5A5E6B' : '#A8A29E'}
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
                stroke={theme === 'dark' ? '#FAFAF9' : '#1C1917'}
                strokeWidth="2.2"
              />
            )}
          </svg>
        </div>
      </section>

      {/* Chapters 02 & 03: 2-Column Monograph Study */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10">

        {/* Chapter 02: Modal Resonance Mitigation */}
        <section className="space-y-4">
          <div className="border-b border-stone-200 dark:border-stone-800/80 pb-2">
            <span className="text-[10px] font-mono font-bold text-amber-700 dark:text-amber-500 uppercase tracking-widest block">
              第二章 // 低域定在波抑制
            </span>
            <h3 className="text-base font-serif text-stone-900 dark:text-stone-100">
              Virtual Bass Array Modal Mitigation
            </h3>
          </div>

          <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
            Mitigates primary axial room resonances below the room Schroeder frequency ({intel?.detected_schroeder_hz ?? 185} Hz) by generating an anti-phase mirror impulse reflecting off rear room boundaries.
          </p>

          <div className="border border-stone-200 dark:border-stone-800/80 rounded-lg p-4 bg-white dark:bg-[#111215] space-y-2 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-stone-500">Detected Schroeder Cut:</span>
              <strong className="text-amber-700 dark:text-amber-500 font-bold">{intel?.detected_schroeder_hz ?? 185} Hz</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500">Initial Reflection Gap:</span>
              <strong className="text-stone-800 dark:text-stone-200">{intel?.detected_reflection_gap_ms ?? 3.20} ms</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500">Recommended FDW Filter:</span>
              <strong className="text-stone-800 dark:text-stone-200">{intel?.recommended_fdw_cycles ?? 5} Cycles</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500">True-Peak Headroom (4x):</span>
              <strong className="text-stone-800 dark:text-stone-200">-0.8 dBTP</strong>
            </div>
          </div>
        </section>

        {/* Chapter 03: Subwoofer Phase Integration */}
        <section className="space-y-4">
          <div className="border-b border-stone-200 dark:border-stone-800/80 pb-2">
            <span className="text-[10px] font-mono font-bold text-amber-700 dark:text-amber-500 uppercase tracking-widest block">
              第三章 // サブウーファー位相統合
            </span>
            <h3 className="text-base font-serif text-stone-900 dark:text-stone-100">
              Subwoofer Linkwitz-Riley Coherence
            </h3>
          </div>

          <p className="text-xs text-stone-600 dark:text-stone-400 leading-relaxed">
            Co-optimizes time-delay and acoustic Linkwitz-Riley 4th order crossover phase across 40–160 Hz, boosting summed SPL by +{sub?.gain_improvement_db.toFixed(1) ?? '4.2'} dB.
          </p>

          <div className="border border-stone-200 dark:border-stone-800/80 rounded-lg p-4 bg-white dark:bg-[#111215] space-y-3 text-xs font-mono">
            <div className="flex justify-between items-center">
              <span className="text-stone-500">Optimal Delay Added:</span>
              <strong className="text-stone-900 dark:text-stone-100 text-sm">+{subDelayMs.toFixed(2)} ms</strong>
            </div>

            <div className="flex justify-between items-center">
              <span className="text-stone-500">Polarity Switch:</span>
              <div className="flex items-center space-x-2">
                <strong className="text-stone-900 dark:text-stone-100">{polarity > 0 ? 'Normal (+)' : 'Inverted (-)'}</strong>
                <button
                  onClick={() => setPolarity((p) => (p > 0 ? -1 : 1))}
                  className="px-2 py-0.5 rounded border border-stone-300 dark:border-stone-700 text-[10px] font-bold"
                >
                  Flip
                </button>
              </div>
            </div>

            {/* Delay Slider */}
            <div className="space-y-1 pt-1">
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
        </section>

      </div>

      {/* Chapter 04: Convolver Output Packages */}
      <section className="border-t border-stone-300 dark:border-stone-800/80 pt-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <span className="text-[10px] font-mono font-bold text-amber-700 dark:text-amber-500 uppercase tracking-widest block">
              第四章 // 畳み込みフィルター出力
            </span>
            <h3 className="text-base font-serif text-stone-900 dark:text-stone-100">
              Export Bit-Perfect FIR Convolver Bundle
            </h3>
          </div>

          <a
            href={getExportBundleUrl()}
            className="px-6 py-2.5 rounded bg-stone-900 hover:bg-stone-800 text-stone-50 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200 text-xs font-mono font-bold tracking-widest uppercase transition-all active:scale-[0.98] text-center"
          >
            DOWNLOAD ARCHIVE PACKAGE (.ZIP)
          </a>
        </div>
      </section>

    </div>
  );
};
