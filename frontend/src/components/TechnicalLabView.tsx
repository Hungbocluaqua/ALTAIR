import React, { useState } from 'react';
import { OptimizationRequest, OptimizationResponse, StatusResponse } from '../types';
import { ConsoleLogEntry } from './ConsoleLog';
import { getExportBundleUrl } from '../api/client';

interface TechnicalLabViewProps {
  config: OptimizationRequest;
  onChangeConfig: (c: OptimizationRequest) => void;
  result: OptimizationResponse | null;
  isRunning: boolean;
  onRun: () => void;
  status: StatusResponse | null;
  logs: ConsoleLogEntry[];
}

export const TechnicalLabView: React.FC<TechnicalLabViewProps> = ({
  config,
  onChangeConfig,
  result,
  isRunning,
  onRun,
  status,
  logs,
}) => {
  const [selectedTarget, setSelectedTarget] = useState<string>(config.target.name);
  const [bassBoost, setBassBoost] = useState<number>(config.target.bass_boost_db);
  const [crossoverHz, setCrossoverHz] = useState<number>(config.sub_crossover_freq_hz);

  const intel = result?.acoustic_intelligence;
  const sub = result?.sub_alignment;

  // Plot specifications
  const width = 840;
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

  const makeCurve = (freqs?: number[], spls?: number[]) => {
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

  const handleTargetChange = (name: 'harman' | 'oca' | 'bk1974' | 'flat', boost: number) => {
    setSelectedTarget(name);
    setBassBoost(boost);
    onChangeConfig({
      ...config,
      target: {
        ...config.target,
        name,
        bass_boost_db: boost,
      },
    });
  };

  return (
    <div className="w-full bg-[#F4F4F2] text-[#1A1A1A] font-sans antialiased selection:bg-[#111111] selection:text-[#FFFFFF] py-6 px-3 sm:px-6 min-h-screen">
      <div className="max-w-6xl mx-auto space-y-4">

        {/* Top Instrumentation Telemetry Header */}
        <div className="bg-[#FFFFFF] border border-[#E2E2DF] rounded-[4px] p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center space-x-3">
            <div className="px-2 py-0.5 bg-[#111111] text-[#FFFFFF] font-mono text-[11px] font-bold rounded-[2px]">
              ALTAIR / LAB-24
            </div>
            <span className="font-mono text-[11px] text-[#666663]">
              STATE: <span className="text-[#1A1A1A] font-semibold">{status?.rew_connected ? 'REW [ACTIVE: 4735]' : 'STANDALONE [SIMULATION]'}</span>
            </span>
            <span className="font-mono text-[11px] text-[#666663]">
              FS: <span className="text-[#1A1A1A] font-semibold">48,000 HZ</span>
            </span>
            <span className="font-mono text-[11px] text-[#666663]">
              TAPS: <span className="text-[#1A1A1A] font-semibold">{config.target_taps.toLocaleString()}</span>
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={onRun}
              disabled={isRunning}
              className="px-4 py-1.5 rounded-[3px] bg-[#111111] hover:bg-[#333333] active:scale-[0.98] text-[#FFFFFF] font-mono text-[11px] font-bold tracking-wider uppercase transition-all disabled:opacity-40"
            >
              {isRunning ? 'CALCULATING...' : '▶ RUN CALIBRATION'}
            </button>
            <a
              href={getExportBundleUrl()}
              className="px-3 py-1.5 rounded-[3px] border border-[#D0D0CE] bg-[#FBFBFA] hover:bg-[#EAEAE7] text-[#1A1A1A] font-mono text-[11px] font-semibold tracking-wider transition-colors"
            >
              EXPORT [.ZIP]
            </a>
          </div>
        </div>

        {/* Micro-Telemetry Grid: 4 Technical Cells */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="bg-[#FFFFFF] border border-[#E2E2DF] rounded-[4px] p-3 space-y-1">
            <div className="text-[9px] font-mono tracking-widest text-[#888885] uppercase">
              01 / PHYSICAL GEOMETRY
            </div>
            <div className="font-mono text-base font-bold text-[#1A1A1A]">
              14 mm <span className="text-xs font-normal text-[#888885]">LATERAL OFFSET</span>
            </div>
            <div className="text-[10px] font-mono text-[#666663]">
              L: 2.14m (7.0ft) • R: 2.18m (7.1ft)
            </div>
          </div>

          <div className="bg-[#FFFFFF] border border-[#E2E2DF] rounded-[4px] p-3 space-y-1">
            <div className="text-[9px] font-mono tracking-widest text-[#888885] uppercase">
              02 / SCHROEDER TRANSITION
            </div>
            <div className="font-mono text-base font-bold text-[#1A1A1A]">
              {intel?.detected_schroeder_hz ?? 185} Hz <span className="text-xs font-normal text-[#888885]">BOUNDARY</span>
            </div>
            <div className="text-[10px] font-mono text-[#666663]">
              1st Arrival: {intel?.detected_reflection_gap_ms ?? 3.20} ms (FDW 5c)
            </div>
          </div>

          <div className="bg-[#FFFFFF] border border-[#E2E2DF] rounded-[4px] p-3 space-y-1">
            <div className="text-[9px] font-mono tracking-widest text-[#888885] uppercase">
              03 / SUB INTEGRATION
            </div>
            <div className="font-mono text-base font-bold text-[#1A1A1A]">
              +{sub?.gain_improvement_db.toFixed(1) ?? '4.2'} dB <span className="text-xs font-normal text-[#888885]">SUM BOOST</span>
            </div>
            <div className="text-[10px] font-mono text-[#666663]">
              Delay: {sub?.optimal_delay_ms ?? 8.40} ms ({sub?.optimal_polarity ?? 'Normal'})
            </div>
          </div>

          <div className="bg-[#FFFFFF] border border-[#E2E2DF] rounded-[4px] p-3 space-y-1">
            <div className="text-[9px] font-mono tracking-widest text-[#888885] uppercase">
              04 / HEADROOM & TRUE-PEAK
            </div>
            <div className="font-mono text-base font-bold text-[#1A1A1A]">
              -0.8 dBTP <span className="text-xs font-normal text-[#888885]">4X INTERPOLATED</span>
            </div>
            <div className="text-[10px] font-mono text-[#666663]">
              Global Preamp: {result?.global_preamp_db ?? -4.8} dB
            </div>
          </div>
        </div>

        {/* Primary Oscilloscope / Transfer Function Canvas */}
        <div className="bg-[#FFFFFF] border border-[#E2E2DF] rounded-[4px] p-4 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[#EAEAE7]">
            <div className="flex items-center space-x-2">
              <span className="font-mono text-[10px] bg-[#E1F3FE] text-[#1F6C9F] px-1.5 py-0.5 rounded-[2px] font-bold">
                CH-L / CH-R
              </span>
              <span className="font-mono text-xs font-bold text-[#1A1A1A] tracking-tight">
                TRANSFER FUNCTION & TIKHONOV INVERSION
              </span>
            </div>

            <div className="flex items-center space-x-4 font-mono text-[10px] text-[#666663]">
              <span className="flex items-center space-x-1.5">
                <span className="w-2.5 h-0.5 bg-[#AAAAAA] inline-block"></span>
                <span>RAW</span>
              </span>
              <span className="flex items-center space-x-1.5">
                <span className="w-2.5 h-0.5 bg-[#C59B27] inline-block"></span>
                <span>TARGET ({selectedTarget.toUpperCase()})</span>
              </span>
              <span className="flex items-center space-x-1.5 text-[#111111] font-bold">
                <span className="w-2.5 h-0.5 bg-[#111111] inline-block"></span>
                <span>CORRECTED</span>
              </span>
            </div>
          </div>

          {/* SVG Technical Plot */}
          <div className="overflow-x-auto">
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto select-none overflow-visible">
              <rect x={pad.left} y={pad.top} width={pw} height={ph} fill="#FBFBFA" stroke="#E2E2DF" strokeWidth="1" />

              {/* Ticks and Tufte-style hairpins */}
              {[20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].map((f) => {
                const x = xPos(f);
                return (
                  <g key={f}>
                    <line x1={x} y1={pad.top} x2={x} y2={height - pad.bottom} stroke="#EBEBE8" strokeWidth="1" />
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
                    <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke="#EBEBE8" strokeWidth="1" />
                    <text x={pad.left - 6} y={y + 3} fill="#888885" fontSize="9" textAnchor="end" fontFamily="monospace">
                      {s}
                    </text>
                  </g>
                );
              })}

              {/* Raw Curve */}
              {result?.plots && (
                <path d={makeCurve(result.plots.freqs, result.plots.spl_before_left)} fill="none" stroke="#BBBBBB" strokeWidth="1.2" />
              )}

              {/* Target Curve */}
              {result?.plots && (
                <path d={makeCurve(result.plots.freqs, result.plots.spl_target_left)} fill="none" stroke="#C59B27" strokeWidth="1.6" strokeDasharray="3,3" />
              )}

              {/* Corrected Curve */}
              {result?.plots && (
                <path d={makeCurve(result.plots.freqs, result.plots.spl_after_left)} fill="none" stroke="#111111" strokeWidth="2.2" />
              )}
            </svg>
          </div>
        </div>

        {/* Bottom Control Rack: Target Selection + Hardware Sliders */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

          {/* Module A: Target Curve Selector */}
          <div className="bg-[#FFFFFF] border border-[#E2E2DF] rounded-[4px] p-3.5 space-y-2.5">
            <div className="text-[10px] font-mono tracking-widest text-[#888885] uppercase">
              TARGET CURVE PROFILE
            </div>

            <div className="grid grid-cols-2 gap-1.5 text-xs font-mono">
              {[
                { id: 'harman', name: 'Harman (+6dB)', boost: 6.0 },
                { id: 'oca', name: 'OCA Audiophile', boost: 5.5 },
                { id: 'bk1974', name: 'B&K 1974 Classic', boost: 3.0 },
                { id: 'flat', name: 'Studio Flat (0dB)', boost: 0.0 },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleTargetChange(t.id as any, t.boost)}
                  className={`p-2 text-left rounded-[3px] border transition-all ${
                    selectedTarget === t.id
                      ? 'border-[#111111] bg-[#111111] text-[#FFFFFF] font-bold'
                      : 'border-[#E2E2DF] bg-[#FBFBFA] text-[#444440] hover:border-[#BBBBBB]'
                  }`}
                >
                  <div className="text-[11px] leading-tight">{t.name}</div>
                  <div className="text-[9px] opacity-70 mt-0.5">+{t.boost}dB Bass</div>
                </button>
              ))}
            </div>
          </div>

          {/* Module B: Physical Hardware Parameters */}
          <div className="bg-[#FFFFFF] border border-[#E2E2DF] rounded-[4px] p-3.5 space-y-3">
            <div className="text-[10px] font-mono tracking-widest text-[#888885] uppercase">
              HARDWARE CROSSOVER CUTS
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-[#666663]">Subwoofer LP Cutoff:</span>
                <span className="font-bold text-[#111111]">{crossoverHz} Hz</span>
              </div>
              <input
                type="range"
                min="40"
                max="160"
                step="5"
                value={crossoverHz}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setCrossoverHz(val);
                  onChangeConfig({ ...config, sub_crossover_freq_hz: val });
                }}
                className="w-full h-1 bg-[#E2E2DF] rounded-none appearance-none cursor-pointer accent-[#111111]"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-[#666663]">Speaker -6dB Rolloff:</span>
                <span className="font-bold text-[#111111]">{config.crossover_freq_hz} Hz</span>
              </div>
              <input
                type="range"
                min="800"
                max="3500"
                step="50"
                value={config.crossover_freq_hz}
                onChange={(e) => onChangeConfig({ ...config, crossover_freq_hz: parseFloat(e.target.value) })}
                className="w-full h-1 bg-[#E2E2DF] rounded-none appearance-none cursor-pointer accent-[#111111]"
              />
            </div>
          </div>

          {/* Module C: Convolver Targets Quick Manifest */}
          <div className="bg-[#FFFFFF] border border-[#E2E2DF] rounded-[4px] p-3.5 space-y-2 flex flex-col justify-between">
            <div>
              <div className="text-[10px] font-mono tracking-widest text-[#888885] uppercase">
                CONVOLVER INTEGRATIONS
              </div>
              <div className="mt-2 space-y-1 text-[11px] font-mono text-[#444440]">
                <div className="flex justify-between py-1 border-b border-[#F0F0ED]">
                  <span>Equalizer APO</span>
                  <span className="text-[#1A1A1A] font-bold">config.txt (Ready)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-[#F0F0ED]">
                  <span>CamillaDSP</span>
                  <span className="text-[#1A1A1A] font-bold">camilladsp.yml</span>
                </div>
                <div className="flex justify-between py-1">
                  <span>miniDSP Flex</span>
                  <span className="text-[#1A1A1A] font-bold">4096 Taps</span>
                </div>
              </div>
            </div>

            <div className="pt-2 border-t border-[#E2E2DF] text-[10px] font-mono text-[#888885] flex justify-between items-center">
              <span>BIT-PERFECT 32-BIT IEEE FLOAT</span>
              <kbd className="px-1 py-0.5 border border-[#D0D0CE] bg-[#F4F4F2] text-[9px]">ENTER</kbd>
            </div>
          </div>

        </div>

      </div>
    </div>
  );
};
