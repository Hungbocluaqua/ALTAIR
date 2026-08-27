import React, { useState } from 'react';
import { OptimizationRequest, OptimizationResponse, StatusResponse } from '../types';
import { getExportBundleUrl } from '../api/client';
import { Sparkles, RefreshCw, Sliders, Volume2, ShieldCheck, Download, Zap } from 'lucide-react';

interface CyberGlassViewProps {
  config: OptimizationRequest;
  onChangeConfig: (c: OptimizationRequest) => void;
  result: OptimizationResponse | null;
  isRunning: boolean;
  onRun: () => void;
  status: StatusResponse | null;
  theme: 'dark' | 'light';
}

export const CyberGlassView: React.FC<CyberGlassViewProps> = ({
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
  const width = 800;
  const height = 240;
  const pad = { top: 16, right: 20, bottom: 32, left: 44 };
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
    <div className="w-full space-y-6 transition-colors">

      {/* Floating Glass Telemetry Strip */}
      <div className="backdrop-blur-md bg-white/80 border border-slate-200/90 text-slate-800 dark:bg-[#0A0E1A]/80 dark:border-white/10 dark:text-slate-200 rounded-xl p-3.5 px-5 flex flex-wrap items-center justify-between gap-4 shadow-lg shadow-cyan-500/5 transition-all">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-500"></span>
            </span>
            <span className="font-bold text-xs tracking-wider text-slate-900 dark:text-white uppercase font-mono">
              CYBER GLASS HUD // ALTAIR PRECISION
            </span>
          </div>

          <span className="text-slate-300 dark:text-slate-700">|</span>
          <span className="text-xs font-mono">
            REW REST API: <strong className="text-emerald-500">{status?.rew_connected ? 'LIVE (PORT 4735)' : 'STANDALONE'}</strong>
          </span>
          <span className="text-xs font-mono">
            SCHROEDER: <strong className="text-cyan-500">{intel?.detected_schroeder_hz ?? 185} HZ</strong>
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={onRun}
            disabled={isRunning}
            className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs tracking-wider uppercase transition-all shadow-md shadow-cyan-500/25 active:scale-[0.98] flex items-center space-x-2 disabled:opacity-50"
          >
            <Zap className={`h-3.5 w-3.5 ${isRunning ? 'animate-spin' : ''}`} />
            <span>{isRunning ? 'CALIBRATING...' : 'RUN OPTIMIZATION'}</span>
          </button>
        </div>
      </div>

      {/* Main Glass Canvas Section */}
      <div className="backdrop-blur-md bg-white/80 border border-slate-200/90 dark:bg-[#0A0E1A]/80 dark:border-white/10 rounded-2xl p-5 space-y-4 shadow-xl shadow-cyan-500/5">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-white/5">
          <div>
            <span className="text-[10px] font-mono text-cyan-600 dark:text-cyan-400 font-bold tracking-widest uppercase block">
              REAL-TIME ACOUSTIC CANVAS
            </span>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white tracking-tight">
              Tikhonov Regularized Deconvolution & Phase Linearization
            </h3>
          </div>

          <div className="flex items-center space-x-6 text-[11px] font-mono text-slate-500">
            <span className="flex items-center space-x-1.5">
              <span className="w-3 h-0.5 bg-slate-400 inline-block"></span>
              <span>Raw Response</span>
            </span>
            <span className="flex items-center space-x-1.5">
              <span className="w-3 h-0.5 bg-amber-500 inline-block"></span>
              <span>Target Curve</span>
            </span>
            <span className="flex items-center space-x-1.5 font-bold text-cyan-500">
              <span className="w-3 h-0.5 bg-cyan-500 inline-block"></span>
              <span>Linear Phase Output</span>
            </span>
          </div>
        </div>

        {/* SVG Graphic with Subtle Cyan Glow */}
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto select-none overflow-visible">
            <rect
              x={pad.left}
              y={pad.top}
              width={pw}
              height={ph}
              fill={theme === 'dark' ? '#070A12' : '#F8FAFC'}
              stroke={theme === 'dark' ? '#172236' : '#E2E8F0'}
              strokeWidth="1"
              rx="8"
            />

            {[20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].map((f) => {
              const x = xPos(f);
              return (
                <g key={f}>
                  <line x1={x} y1={pad.top} x2={x} y2={height - pad.bottom} stroke={theme === 'dark' ? '#111B2B' : '#EDF2F7'} strokeWidth="1" />
                  <text x={x} y={height - pad.bottom + 14} fill="#64748B" fontSize="9" textAnchor="middle" fontFamily="monospace">
                    {f >= 1000 ? `${f / 1000}k` : f}
                  </text>
                </g>
              );
            })}

            {[50, 60, 70, 80, 90, 100].map((s) => {
              const y = yPos(s);
              return (
                <g key={s}>
                  <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke={theme === 'dark' ? '#111B2B' : '#EDF2F7'} strokeWidth="1" />
                  <text x={pad.left - 6} y={y + 3} fill="#64748B" fontSize="9" textAnchor="end" fontFamily="monospace">
                    {s}
                  </text>
                </g>
              );
            })}

            {result?.plots && (
              <path
                d={makePath(result.plots.freqs, result.plots.spl_before_left)}
                fill="none"
                stroke={theme === 'dark' ? '#475569' : '#94A3B8'}
                strokeWidth="1.2"
                strokeDasharray="4,4"
              />
            )}

            {result?.plots && (
              <path
                d={makePath(result.plots.freqs, result.plots.spl_target_left)}
                fill="none"
                stroke="#F59E0B"
                strokeWidth="1.6"
              />
            )}

            {result?.plots && (
              <path
                d={makePath(result.plots.freqs, result.plots.spl_after_left)}
                fill="none"
                stroke={theme === 'dark' ? '#22D3EE' : '#06B6D4'}
                strokeWidth="2.2"
              />
            )}
          </svg>
        </div>
      </div>

      {/* Floating 2-Card Deck: Sub Alignment & Diagnostic Telemetry */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

        {/* Subwoofer Glass Controller */}
        <div className="backdrop-blur-md bg-white/80 border border-slate-200/90 dark:bg-[#0A0E1A]/80 dark:border-white/10 rounded-2xl p-5 space-y-4 shadow-lg shadow-cyan-500/5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-white/5">
              <div className="flex items-center space-x-2">
                <Volume2 className="h-4 w-4 text-cyan-500" />
                <h4 className="font-bold text-xs text-slate-900 dark:text-white uppercase tracking-wider">
                  Subwoofer Phase & Summation
                </h4>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 font-bold border border-cyan-500/20">
                +{sub?.gain_improvement_db.toFixed(1) ?? '4.2'} dB SPL Summation
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-3 text-xs font-mono">
              <div className="p-3 rounded-xl bg-slate-50/80 dark:bg-white/5 border border-slate-200/60 dark:border-white/5">
                <span className="text-[10px] text-slate-500 block">OPTIMAL DELAY</span>
                <span className="font-bold text-slate-900 dark:text-white text-base mt-0.5 block">
                  {subDelayMs.toFixed(2)} ms
                </span>
              </div>

              <div className="p-3 rounded-xl bg-slate-50/80 dark:bg-white/5 border border-slate-200/60 dark:border-white/5">
                <span className="text-[10px] text-slate-500 block">POLARITY MATCH</span>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="font-bold text-slate-900 dark:text-white text-sm">
                    {polarity > 0 ? 'Normal' : 'Inverted'}
                  </span>
                  <button
                    onClick={() => setPolarity((p) => (p > 0 ? -1 : 1))}
                    className="px-2 py-0.5 rounded bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30 text-[10px] font-bold"
                  >
                    Flip
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <div className="flex justify-between text-[11px] font-mono text-slate-500">
              <span>Delay Fine Scrubber</span>
              <span>{subDelayMs.toFixed(2)} ms</span>
            </div>
            <input
              type="range"
              min="-20"
              max="20"
              step="0.1"
              value={subDelayMs}
              onChange={(e) => setSubDelayMs(parseFloat(e.target.value))}
              className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
          </div>
        </div>

        {/* Acoustic Intelligence & Target Presets */}
        <div className="backdrop-blur-md bg-white/80 border border-slate-200/90 dark:bg-[#0A0E1A]/80 dark:border-white/10 rounded-2xl p-5 space-y-4 shadow-lg shadow-cyan-500/5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-white/5">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="h-4 w-4 text-cyan-500" />
                <h4 className="font-bold text-xs text-slate-900 dark:text-white uppercase tracking-wider">
                  Target Curve & Intelligence
                </h4>
              </div>
              <span className="text-[10px] font-mono text-slate-400">
                14 mm Lateral Offset
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-3 text-xs font-mono">
              {[
                { id: 'harman', name: 'Harman (+6dB)', boost: 6.0 },
                { id: 'oca', name: 'OCA Dynamic', boost: 5.5 },
                { id: 'bk1974', name: 'B&K 1974', boost: 3.0 },
                { id: 'flat', name: 'Studio Flat', boost: 0.0 },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() =>
                    onChangeConfig({
                      ...config,
                      target: { ...config.target, name: t.id as any, bass_boost_db: t.boost },
                    })
                  }
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    config.target.name === t.id
                      ? 'border-cyan-500 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 font-bold shadow-sm'
                      : 'border-slate-200 dark:border-white/5 bg-slate-50/80 dark:bg-white/5 text-slate-600 dark:text-slate-400 hover:border-slate-400'
                  }`}
                >
                  <div className="text-[11px] leading-tight">{t.name}</div>
                  <div className="text-[9px] opacity-70 mt-0.5">+{t.boost}dB Bass Shelf</div>
                </button>
              ))}
            </div>
          </div>

          <a
            href={getExportBundleUrl()}
            className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 font-bold text-xs tracking-wider uppercase text-center block transition-all shadow-md active:scale-[0.98]"
          >
            EXPORT MULTI-PLATFORM BUNDLE (.ZIP)
          </a>
        </div>

      </div>

    </div>
  );
};
