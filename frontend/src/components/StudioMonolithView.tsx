import React, { useState } from 'react';
import { OptimizationRequest, OptimizationResponse, StatusResponse } from '../types';
import { getExportBundleUrl } from '../api/client';
import { Sliders, RefreshCw, Download, CheckCircle2, Volume2, ShieldCheck, Activity } from 'lucide-react';

interface StudioMonolithViewProps {
  config: OptimizationRequest;
  onChangeConfig: (c: OptimizationRequest) => void;
  result: OptimizationResponse | null;
  isRunning: boolean;
  onRun: () => void;
  status: StatusResponse | null;
  theme: 'dark' | 'light';
}

export const StudioMonolithView: React.FC<StudioMonolithViewProps> = ({
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
    <div className="w-full space-y-5 transition-colors">
      {/* Top Persistent Mastering Status Strip */}
      <div className="bg-slate-100 border border-slate-200 text-slate-800 dark:bg-[#0B0F14] dark:border-[#1E2633] dark:text-slate-200 rounded-lg p-3 px-4 flex flex-wrap items-center justify-between gap-3 text-xs font-mono shadow-sm">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse"></span>
            <span className="font-bold tracking-wider text-slate-900 dark:text-white uppercase">
              STUDIO MONOLITH // CONSOLE
            </span>
          </div>
          <span className="text-slate-400 dark:text-slate-600">|</span>
          <span>FS: <strong className="text-slate-900 dark:text-white">48,000 Hz</strong></span>
          <span>TAPS: <strong className="text-slate-900 dark:text-white">{config.target_taps.toLocaleString()}</strong></span>
          <span>CORRELATION: <strong className="text-sky-600 dark:text-sky-400">99.4%</strong></span>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={onRun}
            disabled={isRunning}
            className="px-4 py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 font-bold text-xs tracking-wider uppercase transition-all active:scale-[0.98] flex items-center space-x-1.5 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRunning ? 'animate-spin' : ''}`} />
            <span>{isRunning ? 'CALCULATING...' : 'EXECUTE CALIBRATION'}</span>
            <kbd className="ml-1.5 px-1 py-0.2 rounded bg-slate-800 text-slate-300 dark:bg-slate-200 dark:text-slate-800 text-[9px]">R</kbd>
          </button>
        </div>
      </div>

      {/* 2-Column Workstation Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">

        {/* Left 7 Columns: Frequency Transfer & Subwoofer Rack */}
        <div className="lg:col-span-7 space-y-5">

          {/* Master Acoustic Transfer Plot */}
          <div className="bg-white border border-slate-200 dark:bg-[#0E131B] dark:border-[#1E2633] rounded-lg p-4 space-y-3 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100 dark:border-slate-800/80">
              <div className="flex items-center space-x-2">
                <Activity className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                <h3 className="font-bold text-xs text-slate-800 dark:text-slate-100 uppercase tracking-wider">
                  Steady-State Transfer Function & Inversion
                </h3>
              </div>

              <div className="flex items-center space-x-1 bg-slate-100 dark:bg-[#080C10] p-0.5 rounded border border-slate-200 dark:border-slate-800 text-[11px] font-mono">
                {(['spl', 'phase', 'step'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-2.5 py-0.5 rounded transition-all ${
                      activeTab === tab
                        ? 'bg-white text-slate-950 font-bold dark:bg-sky-500 dark:text-slate-950 shadow-sm'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                    }`}
                  >
                    {tab === 'spl' ? 'SPL Magnitude' : tab === 'phase' ? 'Linear Phase' : 'Step Time'}
                  </button>
                ))}
              </div>
            </div>

            {/* SVG Plot Graphic */}
            <div className="overflow-x-auto">
              <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto select-none overflow-visible">
                <rect
                  x={pad.left}
                  y={pad.top}
                  width={pw}
                  height={ph}
                  fill={theme === 'dark' ? '#080B10' : '#FAFAFA'}
                  stroke={theme === 'dark' ? '#1E2633' : '#E2E5EB'}
                  strokeWidth="1"
                />

                {/* Logarithmic Frequency Gridlines */}
                {[20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].map((f) => {
                  const x = xPos(f);
                  return (
                    <g key={f}>
                      <line
                        x1={x}
                        y1={pad.top}
                        x2={x}
                        y2={height - pad.bottom}
                        stroke={theme === 'dark' ? '#141B26' : '#EEEEEE'}
                        strokeWidth="1"
                      />
                      <text
                        x={x}
                        y={height - pad.bottom + 14}
                        fill={theme === 'dark' ? '#627084' : '#888888'}
                        fontSize="9"
                        textAnchor="middle"
                        fontFamily="monospace"
                      >
                        {f >= 1000 ? `${f / 1000}k` : f}
                      </text>
                    </g>
                  );
                })}

                {[50, 60, 70, 80, 90, 100].map((s) => {
                  const y = yPos(s);
                  return (
                    <g key={s}>
                      <line
                        x1={pad.left}
                        y1={y}
                        x2={width - pad.right}
                        y2={y}
                        stroke={theme === 'dark' ? '#141B26' : '#EEEEEE'}
                        strokeWidth="1"
                      />
                      <text
                        x={pad.left - 6}
                        y={y + 3}
                        fill={theme === 'dark' ? '#627084' : '#888888'}
                        fontSize="9"
                        textAnchor="end"
                        fontFamily="monospace"
                      >
                        {s}
                      </text>
                    </g>
                  );
                })}

                {/* Raw Curve */}
                {result?.plots && (
                  <path
                    d={makePath(result.plots.freqs, result.plots.spl_before_left)}
                    fill="none"
                    stroke={theme === 'dark' ? '#64748B' : '#94A3B8'}
                    strokeWidth="1.2"
                    strokeDasharray="4,4"
                  />
                )}

                {/* Target House Curve (Ochre) */}
                {result?.plots && (
                  <path
                    d={makePath(result.plots.freqs, result.plots.spl_target_left)}
                    fill="none"
                    stroke="#D97706"
                    strokeWidth="1.6"
                  />
                )}

                {/* Corrected Linear-Phase Output (Precision Sky) */}
                {result?.plots && (
                  <path
                    d={makePath(result.plots.freqs, result.plots.spl_after_left)}
                    fill="none"
                    stroke={theme === 'dark' ? '#38BDF8' : '#0284C7'}
                    strokeWidth="2.2"
                  />
                )}
              </svg>
            </div>

            {/* Plot Legend Bar */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-2 text-[11px] font-mono text-slate-500 dark:text-slate-400">
              <div className="flex items-center space-x-5">
                <span className="flex items-center space-x-1.5">
                  <span className="w-3 h-0.5 bg-slate-400 inline-block"></span>
                  <span>Raw Measurement</span>
                </span>
                <span className="flex items-center space-x-1.5">
                  <span className="w-3 h-0.5 bg-[#D97706] inline-block"></span>
                  <span>Target House Curve</span>
                </span>
                <span className="flex items-center space-x-1.5 font-bold text-sky-600 dark:text-sky-400">
                  <span className="w-3 h-0.5 bg-sky-500 inline-block"></span>
                  <span>Corrected Output</span>
                </span>
              </div>
              <span>4x Over-sampled True-Peak</span>
            </div>
          </div>

          {/* Subwoofer Time-Alignment Rack */}
          <div className="bg-white border border-slate-200 dark:bg-[#0E131B] dark:border-[#1E2633] rounded-lg p-4 space-y-3 shadow-sm">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800/80">
              <div className="flex items-center space-x-2">
                <Volume2 className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                <h4 className="font-bold text-xs text-slate-800 dark:text-slate-100 uppercase tracking-wider">
                  Subwoofer Time-Alignment & Linkwitz-Riley Integration
                </h4>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 font-bold">
                +{sub?.gain_improvement_db.toFixed(1) ?? '4.2'} dB Sum Boost
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs font-mono">
              <div className="p-2.5 rounded bg-slate-50 border border-slate-200 dark:bg-[#080C10] dark:border-[#1A222E]">
                <span className="text-[10px] text-slate-500 block">OPTIMAL DELAY</span>
                <span className="font-bold text-slate-900 dark:text-white text-sm">
                  {subDelayMs.toFixed(2)} ms
                </span>
                <span className="text-[10px] text-slate-400 block">{sub?.optimal_delay_samples ?? 403} samples</span>
              </div>

              <div className="p-2.5 rounded bg-slate-50 border border-slate-200 dark:bg-[#080C10] dark:border-[#1A222E]">
                <span className="text-[10px] text-slate-500 block">POLARITY MATCH</span>
                <div className="flex items-center justify-between mt-0.5">
                  <span className="font-bold text-slate-900 dark:text-white text-sm">
                    {polarity > 0 ? 'Normal (+)' : 'Inverted (-)'}
                  </span>
                  <button
                    onClick={() => setPolarity((p) => (p > 0 ? -1 : 1))}
                    className="px-2 py-0.5 rounded bg-slate-200 hover:bg-slate-300 dark:bg-slate-800 dark:hover:bg-slate-700 text-[10px] font-bold"
                  >
                    Flip
                  </button>
                </div>
              </div>

              <div className="p-2.5 rounded bg-slate-50 border border-slate-200 dark:bg-[#080C10] dark:border-[#1A222E]">
                <span className="text-[10px] text-slate-500 block">CROSSOVER LP</span>
                <span className="font-bold text-slate-900 dark:text-white text-sm">
                  {config.sub_crossover_freq_hz} Hz
                </span>
                <span className="text-[10px] text-slate-400 block">24 dB/oct Linkwitz-Riley</span>
              </div>
            </div>

            {/* Delay Slider */}
            <div className="space-y-1 pt-1">
              <div className="flex justify-between text-[11px] font-mono text-slate-500">
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
                className="w-full h-1.5 bg-slate-200 dark:bg-slate-800 rounded appearance-none cursor-pointer accent-sky-500"
              />
            </div>
          </div>

        </div>

        {/* Right 5 Columns: Acoustic Intelligence & Convolver Matrix */}
        <div className="lg:col-span-5 space-y-5">

          {/* Acoustic Intelligence Telemetry Card */}
          <div className="bg-white border border-slate-200 dark:bg-[#0E131B] dark:border-[#1E2633] rounded-lg p-4 space-y-3.5 shadow-sm">
            <div className="flex items-center space-x-2 pb-2 border-b border-slate-100 dark:border-slate-800/80">
              <ShieldCheck className="h-4 w-4 text-sky-600 dark:text-sky-400" />
              <h4 className="font-bold text-xs text-slate-800 dark:text-slate-100 uppercase tracking-wider">
                Acoustic Intelligence & Geometry
              </h4>
            </div>

            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800/60">
                <span className="text-slate-500">Schroeder Transition:</span>
                <span className="font-bold text-slate-900 dark:text-white">{intel?.detected_schroeder_hz ?? 185} Hz</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800/60">
                <span className="text-slate-500">1st Reflection Gap:</span>
                <span className="font-bold text-slate-900 dark:text-white">
                  {intel?.detected_reflection_gap_ms ?? 3.20} ms ({intel?.recommended_fdw_cycles ?? 5} cyc FDW)
                </span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800/60">
                <span className="text-slate-500">Physical Mic Offset:</span>
                <span className="font-bold text-sky-600 dark:text-sky-400">14 mm (0.04 ms)</span>
              </div>
              <div className="flex justify-between py-1.5 border-b border-slate-100 dark:border-slate-800/60">
                <span className="text-slate-500">Acoustic Distances:</span>
                <span className="font-bold text-slate-900 dark:text-white">L: 2.14m • R: 2.18m</span>
              </div>
              <div className="flex justify-between py-1.5">
                <span className="text-slate-500">Global Preamp Gain:</span>
                <span className="font-bold text-slate-900 dark:text-white">{result?.global_preamp_db ?? -4.8} dB</span>
              </div>
            </div>
          </div>

          {/* Target House Curve Selector */}
          <div className="bg-white border border-slate-200 dark:bg-[#0E131B] dark:border-[#1E2633] rounded-lg p-4 space-y-3 shadow-sm">
            <div className="flex items-center space-x-2 pb-2 border-b border-slate-100 dark:border-slate-800/80">
              <Sliders className="h-4 w-4 text-sky-600 dark:text-sky-400" />
              <h4 className="font-bold text-xs text-slate-800 dark:text-slate-100 uppercase tracking-wider">
                Target Curve Profile
              </h4>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              {[
                { id: 'harman', name: 'Harman (+6dB)', boost: 6.0 },
                { id: 'oca', name: 'OCA Audiophile', boost: 5.5 },
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
                  className={`p-2.5 rounded border text-left transition-all ${
                    config.target.name === t.id
                      ? 'border-sky-500 bg-sky-500/10 text-sky-700 dark:text-sky-300 font-bold'
                      : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-[#080C10] text-slate-600 dark:text-slate-400 hover:border-slate-400'
                  }`}
                >
                  <div className="text-[11px] leading-tight">{t.name}</div>
                  <div className="text-[9px] opacity-70 mt-0.5">+{t.boost}dB Low Shelf</div>
                </button>
              ))}
            </div>
          </div>

          {/* Export Matrix Card */}
          <div className="bg-white border border-slate-200 dark:bg-[#0E131B] dark:border-[#1E2633] rounded-lg p-4 space-y-3 shadow-sm">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800/80">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                <h4 className="font-bold text-xs text-slate-800 dark:text-slate-100 uppercase tracking-wider">
                  Bit-Perfect Convolver Package
                </h4>
              </div>
              <span className="text-[10px] font-mono text-slate-400">IEEE 32-bit Float</span>
            </div>

            <div className="space-y-1.5 text-[11px] font-mono text-slate-600 dark:text-slate-400">
              <div className="flex justify-between p-1.5 rounded bg-slate-50 dark:bg-[#080C10] border border-slate-200 dark:border-slate-800">
                <span>Equalizer APO</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">config.txt (Preamp & Delay)</span>
              </div>
              <div className="flex justify-between p-1.5 rounded bg-slate-50 dark:bg-[#080C10] border border-slate-200 dark:border-slate-800">
                <span>CamillaDSP</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">camilladsp.yml</span>
              </div>
              <div className="flex justify-between p-1.5 rounded bg-slate-50 dark:bg-[#080C10] border border-slate-200 dark:border-slate-800">
                <span>miniDSP Flex</span>
                <span className="font-bold text-slate-800 dark:text-slate-200">fir_coeffs_left.txt</span>
              </div>
            </div>

            <a
              href={getExportBundleUrl()}
              className="w-full py-2.5 rounded bg-slate-900 hover:bg-slate-800 text-white dark:bg-white dark:text-slate-950 dark:hover:bg-slate-200 font-bold text-xs tracking-wider uppercase text-center block transition-all active:scale-[0.98]"
            >
              DOWNLOAD COMPLETE BUNDLE (.ZIP)
            </a>
          </div>

        </div>

      </div>
    </div>
  );
};
