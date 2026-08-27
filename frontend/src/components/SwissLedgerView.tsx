import React, { useState } from 'react';
import { OptimizationRequest, OptimizationResponse, StatusResponse } from '../types';
import { ConsoleLogEntry } from './ConsoleLog';
import { getExportBundleUrl } from '../api/client';

interface SwissLedgerViewProps {
  config: OptimizationRequest;
  onChangeConfig: (c: OptimizationRequest) => void;
  result: OptimizationResponse | null;
  isRunning: boolean;
  onRun: () => void;
  status: StatusResponse | null;
  logs: ConsoleLogEntry[];
}

export const SwissLedgerView: React.FC<SwissLedgerViewProps> = ({
  config,
  onChangeConfig,
  result,
  isRunning,
  onRun,
  status,
  logs,
}) => {
  const [activeCurveTab, setActiveCurveTab] = useState<'spl' | 'phase' | 'step'>('spl');
  const [subDelay, setSubDelay] = useState<number>(result?.sub_alignment?.optimal_delay_ms ?? 0);
  const [polarity, setPolarity] = useState<number>(result?.sub_alignment?.polarity_multiplier ?? 1);

  const intel = result?.acoustic_intelligence;
  const sub = result?.sub_alignment;

  // SVG Frequency Plot Dimensions
  const plotWidth = 720;
  const plotHeight = 260;
  const pad = { top: 20, right: 24, bottom: 36, left: 48 };
  const w = plotWidth - pad.left - pad.right;
  const h = plotHeight - pad.top - pad.bottom;

  const minF = 20;
  const maxF = 20000;
  const minSpl = 40;
  const maxSpl = 100;

  const fToX = (f: number) => pad.left + (Math.log10(Math.max(f, minF) / minF) / Math.log10(maxF / minF)) * w;
  const sToY = (spl: number) => pad.top + ((maxSpl - Math.max(Math.min(spl, maxSpl), minSpl)) / (maxSpl - minSpl)) * h;

  const makeSplPath = (freqs: number[], spls: number[]) => {
    if (!freqs || !spls || freqs.length === 0) return '';
    const points: string[] = [];
    const step = Math.max(1, Math.floor(freqs.length / 240));
    for (let i = 0; i < freqs.length; i += step) {
      if (freqs[i] >= minF && freqs[i] <= maxF) {
        points.push(`${fToX(freqs[i]).toFixed(1)},${sToY(spls[i]).toFixed(1)}`);
      }
    }
    return points.length > 0 ? `M ${points.join(' L ')}` : '';
  };

  return (
    <div className="w-full bg-[#F7F6F3] text-[#111111] font-sans antialiased selection:bg-[#EAEAEA] selection:text-[#111111] py-8 px-4 sm:px-8 min-h-screen">
      <div className="max-w-5xl mx-auto space-y-10">

        {/* Faux-OS Window Chrome */}
        <div className="border border-[#EAEAEA] rounded-[8px] bg-[#FFFFFF] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-[#FFFFFF] border-b border-[#EAEAEA]">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-[#E0E0DE]"></span>
              <span className="w-2.5 h-2.5 rounded-full bg-[#E0E0DE]"></span>
              <span className="w-2.5 h-2.5 rounded-full bg-[#E0E0DE]"></span>
            </div>
            <div className="font-mono text-[11px] text-[#787774] tracking-wider uppercase">
              ALTAIR / SPECIFICATION DOC. 01 — ROOM ACOUSTIC CORRECTION
            </div>
            <div className="flex items-center space-x-2">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-[#346538]"></span>
              <span className="font-mono text-[10px] text-[#787774]">CALIBRATED</span>
            </div>
          </div>

          {/* Document Header */}
          <div className="p-8 sm:p-12 border-b border-[#EAEAEA] bg-[#FFFFFF]">
            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-4">
              <div>
                <div className="font-mono text-[11px] text-[#787774] tracking-widest uppercase mb-2">
                  ACOUSTIC ARCHIVE & DSP ROUTINE
                </div>
                <h1 className="font-serif text-3xl sm:text-4xl text-[#111111] tracking-tight leading-[1.15]">
                  Digital Room Equalization Ledger
                </h1>
                <p className="text-[13px] text-[#787774] mt-2 max-w-2xl leading-relaxed">
                  Calibrated FIR inversion routine with 1-cycle frequency-dependent windowing, 
                  virtual bass array modal mitigation, and sub-millimeter phase alignment.
                </p>
              </div>

              <div className="shrink-0 flex items-center space-x-3">
                <button
                  onClick={onRun}
                  disabled={isRunning}
                  className="px-5 py-2.5 rounded-[4px] bg-[#111111] hover:bg-[#2A2A2A] active:scale-[0.98] text-[#FFFFFF] text-xs font-medium tracking-wide transition-all flex items-center space-x-2 disabled:opacity-50"
                >
                  <span>{isRunning ? 'CALCULATING...' : 'EXECUTE CALIBRATION'}</span>
                  <kbd className="px-1.5 py-0.5 border border-[#444444] rounded bg-[#222222] font-mono text-[9px] text-[#CCCCCC]">R</kbd>
                </button>
              </div>
            </div>

            {/* Environmental & Hardware Metadata Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-8 pt-6 border-t border-[#EAEAEA] text-xs">
              <div>
                <span className="font-mono text-[10px] text-[#787774] block uppercase">SPEED OF SOUND</span>
                <span className="font-mono font-medium text-[#111111] text-[13px]">
                  {intel?.speed_of_sound_mps ?? 343.2} m/s
                </span>
                <span className="text-[10px] text-[#787774] block">20.0°C • 50% RH</span>
              </div>
              <div>
                <span className="font-mono text-[10px] text-[#787774] block uppercase">SCHROEDER FREQUENCY</span>
                <span className="font-mono font-medium text-[#111111] text-[13px]">
                  {intel?.detected_schroeder_hz ?? 185} Hz
                </span>
                <span className="text-[10px] text-[#787774] block">Modal / Diffuse cut</span>
              </div>
              <div>
                <span className="font-mono text-[10px] text-[#787774] block uppercase">MONITOR CUTOFF</span>
                <span className="font-mono font-medium text-[#111111] text-[13px]">
                  {intel?.speaker_low_rolloff_hz ?? 54} Hz
                </span>
                <span className="text-[10px] text-[#787774] block">Edifier MR3 box limit</span>
              </div>
              <div>
                <span className="font-mono text-[10px] text-[#787774] block uppercase">SUBWOOFER GAIN</span>
                <span className="font-mono font-medium text-[#111111] text-[13px]">
                  +{sub?.gain_improvement_db.toFixed(1) ?? '4.2'} dB SPL
                </span>
                <span className="text-[10px] text-[#787774] block">Linkwitz-Riley 80 Hz</span>
              </div>
            </div>
          </div>

          {/* Interactive Bento Grid Layout */}
          <div className="p-8 sm:p-12 space-y-8 bg-[#FBFBFA]">

            {/* Section 1: Frequency Plot Card */}
            <div className="border border-[#EAEAEA] rounded-[8px] bg-[#FFFFFF] p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[#EAEAEA]">
                <div className="flex items-center space-x-3">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-[#787774]">FIGURE 1.0</span>
                  <span className="text-xs font-semibold text-[#111111] tracking-wide uppercase">
                    Steady-State Acoustic Transfer Function
                  </span>
                </div>

                <div className="flex items-center space-x-1 border border-[#EAEAEA] rounded-[4px] p-0.5 bg-[#F7F6F3]">
                  {(['spl', 'phase', 'step'] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setActiveCurveTab(tab)}
                      className={`px-2.5 py-1 text-[11px] font-mono rounded-[3px] transition-colors ${
                        activeCurveTab === tab
                          ? 'bg-[#FFFFFF] text-[#111111] font-semibold border border-[#EAEAEA]'
                          : 'text-[#787774] hover:text-[#111111]'
                      }`}
                    >
                      {tab === 'spl' ? 'SPL Magnitude' : tab === 'phase' ? 'Phase Linear' : 'Step Response'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Minimal SVG Graphic */}
              <div className="mt-4 overflow-x-auto">
                <svg viewBox={`0 0 ${plotWidth} ${plotHeight}`} className="w-full h-auto select-none overflow-visible">
                  {/* Background Canvas */}
                  <rect x={pad.left} y={pad.top} width={w} height={h} fill="#FFFFFF" stroke="#EAEAEA" strokeWidth="1" />

                  {/* Grid Lines */}
                  {[30, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].map((f) => {
                    const x = fToX(f);
                    return (
                      <g key={f}>
                        <line x1={x} y1={pad.top} x2={x} y2={plotHeight - pad.bottom} stroke="#F2F2F0" strokeWidth="1" strokeDasharray="2,3" />
                        <text x={x} y={plotHeight - pad.bottom + 14} fill="#999996" fontSize="9" textAnchor="middle" fontFamily="monospace">
                          {f >= 1000 ? `${f / 1000}k` : f}
                        </text>
                      </g>
                    );
                  })}

                  {[50, 60, 70, 80, 90].map((s) => {
                    const y = sToY(s);
                    return (
                      <g key={s}>
                        <line x1={pad.left} y1={y} x2={plotWidth - pad.right} y2={y} stroke="#F2F2F0" strokeWidth="1" strokeDasharray="2,3" />
                        <text x={pad.left - 8} y={y + 3} fill="#999996" fontSize="9" textAnchor="end" fontFamily="monospace">
                          {s}dB
                        </text>
                      </g>
                    );
                  })}

                  {/* Before Curve (Muted Carbon Hairline) */}
                  {result?.plots && (
                    <path
                      d={makeSplPath(result.plots.freqs, result.plots.spl_before_left)}
                      fill="none"
                      stroke="#AAAAAA"
                      strokeWidth="1.2"
                      strokeDasharray="4,4"
                    />
                  )}

                  {/* Target House Curve (Washed Ochre) */}
                  {result?.plots && (
                    <path
                      d={makeSplPath(result.plots.freqs, result.plots.spl_target_left)}
                      fill="none"
                      stroke="#C59B27"
                      strokeWidth="1.5"
                    />
                  )}

                  {/* Simulated Result Curve (Solid Black Precision) */}
                  {result?.plots && (
                    <path
                      d={makeSplPath(result.plots.freqs, result.plots.spl_after_left)}
                      fill="none"
                      stroke="#111111"
                      strokeWidth="2.0"
                    />
                  )}
                </svg>
              </div>

              {/* Minimal Legend Strip */}
              <div className="flex flex-wrap items-center justify-between gap-4 mt-4 pt-3 border-t border-[#EAEAEA] text-xs">
                <div className="flex items-center space-x-6">
                  <div className="flex items-center space-x-2 text-[11px] text-[#787774]">
                    <span className="w-4 h-0.5 bg-[#AAAAAA] border-b border-dashed"></span>
                    <span>Raw Acoustic Response</span>
                  </div>
                  <div className="flex items-center space-x-2 text-[11px] text-[#787774]">
                    <span className="w-4 h-0.5 bg-[#C59B27]"></span>
                    <span>Target House Curve</span>
                  </div>
                  <div className="flex items-center space-x-2 text-[11px] text-[#111111] font-semibold">
                    <span className="w-4 h-0.5 bg-[#111111]"></span>
                    <span>Corrected Transfer Function</span>
                  </div>
                </div>

                <span className="font-mono text-[10px] text-[#787774]">
                  65,536 Taps • 32-bit Float
                </span>
              </div>
            </div>

            {/* Section 2: Two-Column Bento Layout */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

              {/* Subwoofer Linkwitz-Riley Integration Card */}
              <div className="border border-[#EAEAEA] rounded-[8px] bg-[#FFFFFF] p-6 space-y-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-[#787774]">MODULE 02</span>
                    <span className="px-2 py-0.5 rounded-[9999px] text-[10px] font-mono uppercase tracking-wider bg-[#EDF3EC] text-[#346538]">
                      Co-Optimized
                    </span>
                  </div>
                  <h3 className="font-serif text-xl text-[#111111] tracking-tight">
                    Subwoofer Phase Integration
                  </h3>
                  <p className="text-xs text-[#787774] mt-1 leading-relaxed">
                    Acoustic delay and Linkwitz-Riley 4th order phase compensation eliminating crossover nulls.
                  </p>
                </div>

                <div className="border border-[#EAEAEA] rounded-[6px] p-4 bg-[#FBFBFA] space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-[#787774] font-medium">Optimal Delay Added:</span>
                    <span className="font-mono font-bold text-[#111111]">
                      {sub?.optimal_delay_ms ?? 0} ms ({sub?.optimal_delay_samples ?? 0} samples)
                    </span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-[#787774] font-medium">Polarity Alignment:</span>
                    <div className="flex items-center space-x-2">
                      <span className="font-mono font-bold text-[#346538]">
                        {(sub?.polarity_multiplier ?? 1) > 0 ? 'Normal (+)' : 'Inverted (-)'}
                      </span>
                      <button
                        onClick={() => setPolarity(p => p > 0 ? -1 : 1)}
                        className="px-2 py-0.5 border border-[#EAEAEA] rounded-[3px] bg-[#FFFFFF] text-[10px] font-mono hover:bg-[#F7F6F3]"
                      >
                        Flip
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between items-center text-xs pt-2 border-t border-[#EAEAEA]">
                    <span className="text-[#787774] font-medium">Crossover Band Boost:</span>
                    <span className="font-mono font-bold text-[#111111]">
                      +{sub?.gain_improvement_db.toFixed(1) ?? '4.2'} dB SPL
                    </span>
                  </div>
                </div>

                {/* Delay Slider */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-[11px] font-mono text-[#787774]">
                    <span>Fine Trim</span>
                    <span>{subDelay.toFixed(2)} ms</span>
                  </div>
                  <input
                    type="range"
                    min="-20"
                    max="20"
                    step="0.1"
                    value={subDelay}
                    onChange={(e) => setSubDelay(parseFloat(e.target.value))}
                    className="w-full h-1 bg-[#EAEAEA] rounded-[2px] appearance-none cursor-pointer accent-[#111111]"
                  />
                </div>
              </div>

              {/* Platform Export Package Card */}
              <div className="border border-[#EAEAEA] rounded-[8px] bg-[#FFFFFF] p-6 space-y-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-mono text-[10px] uppercase tracking-widest text-[#787774]">MODULE 03</span>
                    <span className="px-2 py-0.5 rounded-[9999px] text-[10px] font-mono uppercase tracking-wider bg-[#E1F3FE] text-[#1F6C9F]">
                      Ready
                    </span>
                  </div>
                  <h3 className="font-serif text-xl text-[#111111] tracking-tight">
                    Convolver Packages & Manifest
                  </h3>
                  <p className="text-xs text-[#787774] mt-1 leading-relaxed">
                    Directly export bit-perfect 32-bit floating point convolution filters for major audio platforms.
                  </p>
                </div>

                <div className="space-y-2 text-xs">
                  {[
                    { name: 'Equalizer APO', desc: 'config.txt + Stereo WAV FIR', tag: 'Windows' },
                    { name: 'CamillaDSP', desc: 'camilladsp.yml + WAV FIR', tag: 'Linux/Pi' },
                    { name: 'miniDSP Flex', desc: 'fir_coeffs_left.txt (4096 taps)', tag: 'Hardware' },
                    { name: 'Roon / HQPlayer', desc: 'ALTAIR_Stereo_FIR_32bit.wav', tag: 'Audiophile' },
                  ].map((p) => (
                    <div key={p.name} className="flex items-center justify-between p-2 rounded-[4px] border border-[#EAEAEA] bg-[#FBFBFA]">
                      <div>
                        <span className="font-semibold text-[#111111]">{p.name}</span>
                        <span className="text-[11px] text-[#787774] ml-2 font-mono">{p.desc}</span>
                      </div>
                      <span className="font-mono text-[9px] px-1.5 py-0.5 rounded border border-[#EAEAEA] bg-[#FFFFFF] text-[#787774]">
                        {p.tag}
                      </span>
                    </div>
                  ))}
                </div>

                <a
                  href={getExportBundleUrl()}
                  className="w-full py-2.5 rounded-[4px] border border-[#111111] bg-[#111111] hover:bg-[#2A2A2A] text-[#FFFFFF] text-xs font-medium tracking-wide text-center block transition-colors"
                >
                  DOWNLOAD COMPLETE BUNDLE (.ZIP)
                </a>
              </div>

            </div>

            {/* Section 3: Telemetry Event Ledger */}
            <div className="border border-[#EAEAEA] rounded-[8px] bg-[#FFFFFF] p-6 space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-[#EAEAEA]">
                <div className="flex items-center space-x-2">
                  <span className="font-mono text-[10px] uppercase tracking-widest text-[#787774]">SYSTEM AUDIT</span>
                  <span className="text-xs font-semibold text-[#111111] uppercase tracking-wider">
                    Acoustic Pipeline Event Chronology
                  </span>
                </div>
                <span className="font-mono text-[10px] text-[#787774]">{logs.length} EVENTS RECORDED</span>
              </div>

              <div className="max-h-40 overflow-y-auto font-mono text-[11px] text-[#444444] space-y-1 pr-2">
                {logs.slice(-8).map((log) => (
                  <div key={log.id} className="flex items-baseline space-x-3">
                    <span className="text-[#999996] shrink-0 text-[10px]">{log.timestamp}</span>
                    <span className="px-1 py-0.2 rounded border border-[#EAEAEA] text-[9px] bg-[#F7F6F3] text-[#787774] shrink-0">
                      {log.tag}
                    </span>
                    <span className="truncate text-[#222222]">{log.message}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Document Footer Note */}
          <div className="px-8 py-4 bg-[#FFFFFF] border-t border-[#EAEAEA] flex items-center justify-between text-[11px] text-[#787774] font-mono">
            <span>ALTAIR v2.4 • SYSTEMATISCHE RAUMKORREKTUR</span>
            <span>END OF DOCUMENTATION</span>
          </div>
        </div>

      </div>
    </div>
  );
};
