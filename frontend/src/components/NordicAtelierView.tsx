import React, { useState } from 'react';
import { OptimizationRequest, OptimizationResponse, StatusResponse } from '../types';
import { ConsoleLogEntry } from './ConsoleLog';
import { getExportBundleUrl } from '../api/client';

interface NordicAtelierViewProps {
  config: OptimizationRequest;
  onChangeConfig: (c: OptimizationRequest) => void;
  result: OptimizationResponse | null;
  isRunning: boolean;
  onRun: () => void;
  status: StatusResponse | null;
  logs: ConsoleLogEntry[];
}

export const NordicAtelierView: React.FC<NordicAtelierViewProps> = ({
  config,
  onChangeConfig,
  result,
  isRunning,
  onRun,
  status,
  logs,
}) => {
  const [selectedTarget, setSelectedTarget] = useState<'harman' | 'oca' | 'bk1974' | 'flat'>(config.target.name as any);

  const intel = result?.acoustic_intelligence;
  const sub = result?.sub_alignment;

  // Plot geometry
  const width = 640;
  const height = 280;
  const pad = { top: 20, right: 20, bottom: 40, left: 40 };
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
    const step = Math.max(1, Math.floor(freqs.length / 200));
    for (let i = 0; i < freqs.length; i += step) {
      if (freqs[i] >= minF && freqs[i] <= maxF) {
        pts.push(`${xPos(freqs[i]).toFixed(1)},${yPos(spls[i]).toFixed(1)}`);
      }
    }
    return pts.length > 0 ? `M ${pts.join(' L ')}` : '';
  };

  return (
    <div className="w-full bg-[#FFFFFF] text-[#111111] font-sans antialiased selection:bg-[#EAEAEA] selection:text-[#111111] py-16 px-4 sm:px-12 min-h-screen">
      <div className="max-w-5xl mx-auto space-y-16">

        {/* Minimal Navigation & Status */}
        <header className="flex items-baseline justify-between pb-6 border-b border-[#EFEFEF]">
          <div>
            <span className="font-mono text-[10px] tracking-widest text-[#8A8A86] uppercase block">
              ALTAIR STUDIO
            </span>
            <span className="text-sm font-semibold tracking-tight text-[#111111]">
              Acoustic Calibration
            </span>
          </div>

          <div className="flex items-center space-x-6">
            <span className="text-xs text-[#8A8A86] font-mono">
              {status?.rew_connected ? 'Connected to REW API' : 'Standalone Reference'}
            </span>
            <button
              onClick={onRun}
              disabled={isRunning}
              className="px-5 py-2 rounded-[6px] bg-[#111111] hover:bg-[#333333] active:scale-[0.98] text-[#FFFFFF] text-xs font-medium tracking-wide transition-all disabled:opacity-50"
            >
              {isRunning ? 'Calibrating...' : 'Calibrate Room'}
            </button>
          </div>
        </header>

        {/* Hero Section with Immense Macro-Whitespace */}
        <div className="max-w-2xl space-y-4">
          <h1 className="font-serif text-4xl sm:text-5xl font-normal text-[#111111] tracking-tight leading-[1.1]">
            Acoustic equilibrium for your room.
          </h1>
          <p className="text-base text-[#787774] leading-relaxed font-light">
            ALTAIR aligns loudspeaker phase response, resolves low-frequency modal resonances, and calculates time-domain sub integration for transparent monitoring.
          </p>
        </div>

        {/* Main 2-Column Asymmetrical Bento Section */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">

          {/* Left Column: Visual Transfer Function (7 Columns) */}
          <div className="lg:col-span-7 border border-[#EFEFEF] rounded-[12px] bg-[#FBFBFA] p-8 space-y-6">
            <div className="flex items-baseline justify-between">
              <div>
                <h3 className="font-serif text-2xl text-[#111111] font-normal">
                  Frequency Transfer
                </h3>
                <p className="text-xs text-[#8A8A86] mt-0.5">
                  Measured room transfer function before and after correction.
                </p>
              </div>

              <span className="text-[10px] font-mono text-[#8A8A86] px-2 py-0.5 rounded-[4px] border border-[#EFEFEF] bg-[#FFFFFF]">
                {config.target_taps.toLocaleString()} Taps
              </span>
            </div>

            {/* SVG Acoustic Contour */}
            <div className="overflow-x-auto">
              <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto select-none overflow-visible">
                {/* Hairline Frame */}
                <rect x={pad.left} y={pad.top} width={pw} height={ph} fill="#FFFFFF" stroke="#EFEFEF" strokeWidth="1" rx="6" />

                {/* Subdued Frequency Gridlines */}
                {[50, 100, 500, 1000, 5000, 10000].map((f) => {
                  const x = xPos(f);
                  return (
                    <g key={f}>
                      <line x1={x} y1={pad.top} x2={x} y2={height - pad.bottom} stroke="#F7F7F6" strokeWidth="1" />
                      <text x={x} y={height - pad.bottom + 16} fill="#A5A5A2" fontSize="9" textAnchor="middle" fontFamily="sans-serif">
                        {f >= 1000 ? `${f / 1000}k` : f}
                      </text>
                    </g>
                  );
                })}

                {[60, 75, 90].map((s) => {
                  const y = yPos(s);
                  return (
                    <g key={s}>
                      <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke="#F7F7F6" strokeWidth="1" />
                      <text x={pad.left - 8} y={y + 3} fill="#A5A5A2" fontSize="9" textAnchor="end" fontFamily="sans-serif">
                        {s}
                      </text>
                    </g>
                  );
                })}

                {/* Raw SPL Curve */}
                {result?.plots && (
                  <path d={makePath(result.plots.freqs, result.plots.spl_before_left)} fill="none" stroke="#D1D1CE" strokeWidth="1.2" />
                )}

                {/* Target Curve */}
                {result?.plots && (
                  <path d={makePath(result.plots.freqs, result.plots.spl_target_left)} fill="none" stroke="#C59B27" strokeWidth="1.2" strokeDasharray="3,3" />
                )}

                {/* Calibrated Result Curve */}
                {result?.plots && (
                  <path d={makePath(result.plots.freqs, result.plots.spl_after_left)} fill="none" stroke="#111111" strokeWidth="2.0" />
                )}
              </svg>
            </div>

            {/* Subtle Legend */}
            <div className="flex items-center space-x-6 text-xs text-[#787774] pt-2">
              <span className="flex items-center space-x-2">
                <span className="w-3 h-0.5 bg-[#D1D1CE] inline-block"></span>
                <span>Uncorrected</span>
              </span>
              <span className="flex items-center space-x-2">
                <span className="w-3 h-0.5 bg-[#C59B27] inline-block"></span>
                <span>Target</span>
              </span>
              <span className="flex items-center space-x-2 font-medium text-[#111111]">
                <span className="w-3 h-0.5 bg-[#111111] inline-block"></span>
                <span>Calibrated Result</span>
              </span>
            </div>
          </div>

          {/* Right Column: Hardware Context & Profile (5 Columns) */}
          <div className="lg:col-span-5 space-y-6">

            {/* Hardware Profile Card */}
            <div className="border border-[#EFEFEF] rounded-[12px] p-6 bg-[#FFFFFF] space-y-4">
              <h4 className="text-xs font-mono tracking-widest text-[#8A8A86] uppercase">
                MONITORING SYSTEM
              </h4>

              <div className="space-y-3 text-xs">
                <div className="flex justify-between py-2 border-b border-[#F5F5F3]">
                  <span className="text-[#787774]">Mains Loudspeakers</span>
                  <span className="font-medium text-[#111111]">Edifier MR3 (Active Studio)</span>
                </div>
                <div className="flex justify-between py-2 border-b border-[#F5F5F3]">
                  <span className="text-[#787774]">Subwoofer</span>
                  <span className="font-medium text-[#111111]">Edifier T5s (8-inch Powered)</span>
                </div>
                <div className="flex justify-between py-2 border-b border-[#F5F5F3]">
                  <span className="text-[#787774]">Physical Offset</span>
                  <span className="font-mono text-[#111111]">14 mm right (0.04 ms)</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-[#787774]">Sub Alignment Boost</span>
                  <span className="font-mono font-semibold text-[#111111]">
                    +{sub?.gain_improvement_db.toFixed(1) ?? '4.2'} dB SPL
                  </span>
                </div>
              </div>
            </div>

            {/* Target Profile Picker */}
            <div className="border border-[#EFEFEF] rounded-[12px] p-6 bg-[#FFFFFF] space-y-4">
              <h4 className="text-xs font-mono tracking-widest text-[#8A8A86] uppercase">
                HOUSE TARGET
              </h4>

              <div className="grid grid-cols-2 gap-2 text-xs">
                {[
                  { id: 'harman', name: 'Harman', desc: '+6dB bass shelf' },
                  { id: 'oca', name: 'OCA Audiophile', desc: '+5.5dB dynamic' },
                  { id: 'bk1974', name: 'B&K 1974', desc: '+3dB warm roll-off' },
                  { id: 'flat', name: 'Studio Flat', desc: '0dB neutral' },
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setSelectedTarget(t.id as any);
                      onChangeConfig({
                        ...config,
                        target: {
                          ...config.target,
                          name: t.id as any,
                        },
                      });
                    }}
                    className={`p-3 rounded-[8px] border text-left transition-all ${
                      selectedTarget === t.id
                        ? 'border-[#111111] bg-[#111111] text-[#FFFFFF]'
                        : 'border-[#EFEFEF] bg-[#FFFFFF] text-[#111111] hover:border-[#D0D0CE]'
                    }`}
                  >
                    <div className="font-medium">{t.name}</div>
                    <div className="text-[10px] opacity-70 mt-0.5">{t.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Export Action Card */}
            <div className="border border-[#EFEFEF] rounded-[12px] p-6 bg-[#FBFBFA] space-y-4">
              <div>
                <h4 className="text-xs font-mono tracking-widest text-[#8A8A86] uppercase">
                  EXPORT READY
                </h4>
                <p className="text-xs text-[#787774] mt-1">
                  Download Equalizer APO, CamillaDSP, and 32-bit float WAV packages.
                </p>
              </div>

              <a
                href={getExportBundleUrl()}
                className="w-full py-2.5 rounded-[6px] border border-[#111111] bg-[#111111] hover:bg-[#333333] text-[#FFFFFF] text-xs font-medium tracking-wide text-center block transition-colors"
              >
                Download Convolution Filters
              </a>
            </div>

          </div>

        </div>

        {/* Quiet Telemetry Metric Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-10 border-t border-[#EFEFEF] text-xs">
          <div>
            <span className="text-[#8A8A86] font-mono text-[10px] uppercase block">Schroeder Transition</span>
            <span className="font-serif text-2xl text-[#111111] mt-1 block">
              {intel?.detected_schroeder_hz ?? 185} <span className="text-sm font-sans text-[#8A8A86]">Hz</span>
            </span>
          </div>
          <div>
            <span className="text-[#8A8A86] font-mono text-[10px] uppercase block">First Reflection</span>
            <span className="font-serif text-2xl text-[#111111] mt-1 block">
              {intel?.detected_reflection_gap_ms ?? 3.20} <span className="text-sm font-sans text-[#8A8A86]">ms</span>
            </span>
          </div>
          <div>
            <span className="text-[#8A8A86] font-mono text-[10px] uppercase block">Subwoofer Delay</span>
            <span className="font-serif text-2xl text-[#111111] mt-1 block">
              +{sub?.optimal_delay_ms ?? 8.40} <span className="text-sm font-sans text-[#8A8A86]">ms</span>
            </span>
          </div>
          <div>
            <span className="text-[#8A8A86] font-mono text-[10px] uppercase block">Filter Preamp</span>
            <span className="font-serif text-2xl text-[#111111] mt-1 block">
              {result?.global_preamp_db ?? -4.8} <span className="text-sm font-sans text-[#8A8A86]">dB</span>
            </span>
          </div>
        </div>

      </div>
    </div>
  );
};
