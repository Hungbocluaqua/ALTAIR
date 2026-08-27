import React, { useState } from 'react';
import { PlotData, SubAlignmentResult } from '../types';
import { Activity, Radio, Eye, EyeOff } from 'lucide-react';

interface AudioPlotProps {
  plots: PlotData | null;
  subAlignment?: SubAlignmentResult;
}

export const AudioPlot: React.FC<AudioPlotProps> = ({ plots, subAlignment }) => {
  const [activeTab, setActiveTab] = useState<'magnitude' | 'phase' | 'step' | 'sub'>('magnitude');
  const [showBefore, setShowBefore] = useState(true);
  const [showTarget, setShowTarget] = useState(true);
  const [showFilter, setShowFilter] = useState(true);
  const [showAfter, setShowAfter] = useState(true);

  if (!plots) {
    return (
      <div className="h-[420px] bg-slate-900/60 border border-slate-800 rounded-2xl flex flex-col items-center justify-center text-slate-500">
        <Activity className="h-10 w-10 text-slate-600 mb-3 animate-pulse" />
        <p className="text-sm font-medium">No acoustic plots generated yet</p>
        <p className="text-xs text-slate-600 mt-1">Run 1-Click Optimization to view acoustic measurements & filters</p>
      </div>
    );
  }

  // Dimensions for SVG Plot
  const width = 860;
  const height = 340;
  const padding = { top: 20, right: 30, bottom: 40, left: 55 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  // Log scale mapper for frequency 20Hz -> 20000Hz
  const minFreq = 20;
  const maxFreq = 20000;
  const minLog = Math.log10(minFreq);
  const maxLog = Math.log10(maxFreq);

  const freqToX = (f: number) => {
    const validF = isNaN(f) || !isFinite(f) ? 100 : f;
    const clamped = Math.max(minFreq, Math.min(maxFreq, validF));
    const logVal = Math.log10(clamped);
    return padding.left + ((logVal - minLog) / (maxLog - minLog)) * plotWidth;
  };

  // Magnitude mapper: 40dB to 105dB
  const minSPL = 40;
  const maxSPL = 105;
  const splToY = (spl: number) => {
    const validSpl = isNaN(spl) || !isFinite(spl) ? 50 : spl;
    const clamped = Math.max(minSPL, Math.min(maxSPL, validSpl));
    return padding.top + (1 - (clamped - minSPL) / (maxSPL - minSPL)) * plotHeight;
  };

  // Phase mapper: -180 deg to +180 deg
  const phaseToY = (deg: number) => {
    const validDeg = isNaN(deg) || !isFinite(deg) ? 0 : deg;
    const clamped = Math.max(-180, Math.min(180, validDeg));
    return padding.top + (1 - (clamped + 180) / 360) * plotHeight;
  };

  // Step response mapper: time -25ms to +35ms, amplitude -0.2 to 1.2
  const minTime = -25;
  const maxTime = 35;
  const timeToX = (t: number) => {
    const validT = isNaN(t) || !isFinite(t) ? 0 : t;
    return padding.left + ((validT - minTime) / (maxTime - minTime)) * plotWidth;
  };
  const stepToY = (s: number) => {
    const validS = isNaN(s) || !isFinite(s) ? 0 : s;
    const clamped = Math.max(-0.2, Math.min(1.2, validS));
    return padding.top + (1 - (clamped - (-0.2)) / 1.4) * plotHeight;
  };

  // Generate SVG path for SPL curves
  const makeSplPath = (freqs: number[], spls: number[]) => {
    if (!freqs || !spls || freqs.length === 0) return '';
    return freqs
      .map((f, i) => `${i === 0 ? 'M' : 'L'} ${freqToX(f).toFixed(1)} ${splToY(spls[i]).toFixed(1)}`)
      .join(' ');
  };

  // Generate SVG path for Phase curves
  const makePhasePath = (freqs: number[], phases: number[]) => {
    if (!freqs || !phases || freqs.length === 0) return '';
    return freqs
      .map((f, i) => `${i === 0 ? 'M' : 'L'} ${freqToX(f).toFixed(1)} ${phaseToY(phases[i]).toFixed(1)}`)
      .join(' ');
  };

  // Generate SVG path for Step response
  const makeStepPath = (times: number[], steps: number[]) => {
    if (!times || !steps || times.length === 0) return '';
    return times
      .map((t, i) => `${i === 0 ? 'M' : 'L'} ${timeToX(t).toFixed(1)} ${stepToY(steps[i]).toFixed(1)}`)
      .join(' ');
  };

  const freqGridLines = [20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000];
  const splGridLines = [50, 60, 70, 80, 90, 100];
  const phaseGridLines = [-180, -90, 0, 90, 180];
  const timeGridLines = [-20, -10, 0, 10, 20, 30];

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl">
      {/* Header & Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <Radio className="h-5 w-5 text-cyan-400" />
          <h3 className="font-bold text-slate-100 text-sm tracking-wide uppercase">Interactive Audio Visualizer</h3>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center space-x-1 bg-slate-950/80 p-1 rounded-xl border border-slate-800/80 text-xs">
          <button
            onClick={() => setActiveTab('magnitude')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeTab === 'magnitude'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            SPL Magnitude
          </button>
          <button
            onClick={() => setActiveTab('phase')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeTab === 'phase'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Phase Response
          </button>
          <button
            onClick={() => setActiveTab('step')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              activeTab === 'step'
                ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            Step & Pre-Ringing
          </button>
          {subAlignment && (
            <button
              onClick={() => setActiveTab('sub')}
              className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
                activeTab === 'sub'
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Sub Summation
            </button>
          )}
        </div>
      </div>

      {/* SVG Canvas Area */}
      <div className="relative mt-4">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto select-none overflow-visible">
          {/* Background grid */}
          <rect
            x={padding.left}
            y={padding.top}
            width={plotWidth}
            height={plotHeight}
            fill="#090d16"
            stroke="#1e293b"
            strokeWidth="1"
            rx="6"
          />

          {/* TAB 1: MAGNITUDE SPL */}
          {activeTab === 'magnitude' && (
            <>
              {/* Frequency grid lines */}
              {freqGridLines.map((f) => {
                const x = freqToX(f);
                return (
                  <g key={`fgrid-${f}`}>
                    <line x1={x} y1={padding.top} x2={x} y2={height - padding.bottom} stroke="#172236" strokeWidth="1" strokeDasharray="3,3" />
                    <text x={x} y={height - padding.bottom + 16} fill="#64748b" fontSize="10" textAnchor="middle" fontFamily="monospace">
                      {f >= 1000 ? `${f / 1000}k` : f}
                    </text>
                  </g>
                );
              })}

              {/* SPL grid lines */}
              {splGridLines.map((spl) => {
                const y = splToY(spl);
                return (
                  <g key={`sgrid-${spl}`}>
                    <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#172236" strokeWidth="1" strokeDasharray="3,3" />
                    <text x={padding.left - 8} y={y + 3.5} fill="#64748b" fontSize="10" textAnchor="end" fontFamily="monospace">
                      {spl} dB
                    </text>
                  </g>
                );
              })}

              {/* Curves */}
              {showBefore && (
                <path
                  d={makeSplPath(plots.freqs, plots.spl_before_left)}
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="2.2"
                  strokeOpacity="0.75"
                  className="transition-opacity duration-300"
                />
              )}

              {showTarget && (
                <path
                  d={makeSplPath(plots.freqs, plots.spl_target_left)}
                  fill="none"
                  stroke="#f59e0b"
                  strokeWidth="2.5"
                  strokeDasharray="6,4"
                  strokeOpacity="0.9"
                />
              )}

              {showFilter && (
                <path
                  d={makeSplPath(
                    plots.freqs,
                    plots.spl_filter_left.map((db) => {
                      const refTarget = plots.spl_target_left && plots.spl_target_left.length > 0
                        ? plots.spl_target_left[Math.floor(plots.spl_target_left.length / 2)]
                        : 75.0;
                      return db + refTarget;
                    })
                  )}
                  fill="none"
                  stroke="#06b6d4"
                  strokeWidth="1.8"
                  strokeOpacity="0.8"
                />
              )}

              {showAfter && (
                <path
                  d={makeSplPath(plots.freqs, plots.spl_after_left)}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="3.0"
                  strokeLinecap="round"
                  className="filter drop-shadow-[0_0_8px_rgba(16,185,129,0.3)]"
                />
              )}
            </>
          )}

          {/* TAB 2: PHASE RESPONSE */}
          {activeTab === 'phase' && (
            <>
              {freqGridLines.map((f) => {
                const x = freqToX(f);
                return (
                  <g key={`p-fgrid-${f}`}>
                    <line x1={x} y1={padding.top} x2={x} y2={height - padding.bottom} stroke="#172236" strokeWidth="1" strokeDasharray="3,3" />
                    <text x={x} y={height - padding.bottom + 16} fill="#64748b" fontSize="10" textAnchor="middle" fontFamily="monospace">
                      {f >= 1000 ? `${f / 1000}k` : f}
                    </text>
                  </g>
                );
              })}

              {phaseGridLines.map((deg) => {
                const y = phaseToY(deg);
                return (
                  <g key={`pgrid-${deg}`}>
                    <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#172236" strokeWidth="1" strokeDasharray="3,3" />
                    <text x={padding.left - 8} y={y + 3.5} fill="#64748b" fontSize="10" textAnchor="end" fontFamily="monospace">
                      {deg}°
                    </text>
                  </g>
                );
              })}

              <path
                d={makePhasePath(plots.freqs, plots.phase_before_deg)}
                fill="none"
                stroke="#ef4444"
                strokeWidth="2"
                strokeOpacity="0.6"
              />

              <path
                d={makePhasePath(plots.freqs, plots.phase_after_deg)}
                fill="none"
                stroke="#10b981"
                strokeWidth="2.5"
                className="filter drop-shadow-[0_0_6px_rgba(16,185,129,0.3)]"
              />
            </>
          )}

          {/* TAB 3: STEP RESPONSE & PRE-RINGING ENVELOPE */}
          {activeTab === 'step' && (
            <>
              {/* Highlight Pre-Ringing Safe Zone (-20ms to -5ms) */}
              <rect
                x={timeToX(-20)}
                y={padding.top}
                width={timeToX(-5) - timeToX(-20)}
                height={plotHeight}
                fill="#f43f5e"
                fillOpacity="0.08"
              />
              <line x1={timeToX(-20)} y1={padding.top} x2={timeToX(-20)} y2={height - padding.bottom} stroke="#f43f5e" strokeWidth="1.5" strokeDasharray="4,4" />
              <line x1={timeToX(-5)} y1={padding.top} x2={timeToX(-5)} y2={height - padding.bottom} stroke="#f43f5e" strokeWidth="1.5" strokeDasharray="4,4" />
              
              {/* Safe 10% envelope boundary line */}
              <line x1={timeToX(-20)} y1={stepToY(0.10)} x2={timeToX(-5)} y2={stepToY(0.10)} stroke="#f59e0b" strokeWidth="1.8" strokeDasharray="3,3" />
              <text x={timeToX(-12.5)} y={stepToY(0.10) - 6} fill="#f59e0b" fontSize="9" textAnchor="middle" fontFamily="monospace">
                10% Pre-Ringing Limit
              </text>
              <text x={timeToX(-12.5)} y={height - padding.bottom - 10} fill="#f43f5e" fontSize="10" textAnchor="middle" fontWeight="bold">
                Pre-Ringing Zone
              </text>

              {timeGridLines.map((t) => {
                const x = timeToX(t);
                return (
                  <g key={`tgrid-${t}`}>
                    <line x1={x} y1={padding.top} x2={x} y2={height - padding.bottom} stroke="#172236" strokeWidth="1" strokeDasharray="3,3" />
                    <text x={x} y={height - padding.bottom + 16} fill="#64748b" fontSize="10" textAnchor="middle" fontFamily="monospace">
                      {t} ms
                    </text>
                  </g>
                );
              })}

              <line x1={padding.left} y1={stepToY(0)} x2={width - padding.right} y2={stepToY(0)} stroke="#334155" strokeWidth="1.5" />
              <line x1={padding.left} y1={stepToY(1.0)} x2={width - padding.right} y2={stepToY(1.0)} stroke="#334155" strokeWidth="1" strokeDasharray="4,4" />

              <path
                d={makeStepPath(plots.step_time_ms, plots.step_response)}
                fill="none"
                stroke="#06b6d4"
                strokeWidth="2.5"
                className="filter drop-shadow-[0_0_8px_rgba(6,182,212,0.3)]"
              />
            </>
          )}

          {/* TAB 4: SUBWOOFER SUMMATION */}
          {activeTab === 'sub' && (
            subAlignment ? (
              <>
                {freqGridLines.filter((f) => f <= 500).map((f) => {
                  const x = freqToX(f);
                  return (
                    <g key={`sub-fgrid-${f}`}>
                      <line x1={x} y1={padding.top} x2={x} y2={height - padding.bottom} stroke="#172236" strokeWidth="1" strokeDasharray="3,3" />
                      <text x={x} y={height - padding.bottom + 16} fill="#64748b" fontSize="10" textAnchor="middle" fontFamily="monospace">
                        {f} Hz
                      </text>
                    </g>
                  );
                })}

                {splGridLines.map((spl) => {
                  const y = splToY(spl);
                  return (
                    <g key={`sub-sgrid-${spl}`}>
                      <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#172236" strokeWidth="1" strokeDasharray="3,3" />
                      <text x={padding.left - 8} y={y + 3.5} fill="#64748b" fontSize="10" textAnchor="end" fontFamily="monospace">
                        {spl} dB
                      </text>
                    </g>
                  );
                })}

                <path
                  d={makeSplPath(subAlignment.freqs, subAlignment.spl_unaligned_db)}
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="2"
                  strokeOpacity="0.65"
                />

                <path
                  d={makeSplPath(subAlignment.freqs, subAlignment.spl_aligned_db)}
                  fill="none"
                  stroke="#10b981"
                  strokeWidth="3.0"
                  className="filter drop-shadow-[0_0_8px_rgba(16,185,129,0.35)]"
                />
              </>
            ) : (
              <text x={width / 2} y={height / 2} fill="#64748b" fontSize="13" textAnchor="middle" fontFamily="sans-serif">
                Subwoofer data available when Subwoofer measurement is provided
              </text>
            )
          )}
        </svg>
      </div>

      {/* Legend & Toggle Controls */}
      {activeTab === 'magnitude' && (
        <div className="flex flex-wrap items-center justify-center gap-6 mt-4 pt-3 border-t border-slate-800 text-xs font-medium">
          <button
            onClick={() => setShowBefore(!showBefore)}
            className={`flex items-center space-x-2 px-2.5 py-1 rounded-lg transition-colors ${
              showBefore ? 'text-red-400 bg-red-500/10' : 'text-slate-600 line-through'
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-red-500"></span>
            <span>Before Correction</span>
            {showBefore ? <Eye className="h-3 w-3 ml-1" /> : <EyeOff className="h-3 w-3 ml-1" />}
          </button>

          <button
            onClick={() => setShowTarget(!showTarget)}
            className={`flex items-center space-x-2 px-2.5 py-1 rounded-lg transition-colors ${
              showTarget ? 'text-amber-400 bg-amber-500/10' : 'text-slate-600 line-through'
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-amber-500"></span>
            <span>Target House Curve</span>
            {showTarget ? <Eye className="h-3 w-3 ml-1" /> : <EyeOff className="h-3 w-3 ml-1" />}
          </button>

          <button
            onClick={() => setShowFilter(!showFilter)}
            className={`flex items-center space-x-2 px-2.5 py-1 rounded-lg transition-colors ${
              showFilter ? 'text-cyan-400 bg-cyan-500/10' : 'text-slate-600 line-through'
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-cyan-500"></span>
            <span>FIR Correction Gain (Aligned to Target)</span>
            {showFilter ? <Eye className="h-3 w-3 ml-1" /> : <EyeOff className="h-3 w-3 ml-1" />}
          </button>

          <button
            onClick={() => setShowAfter(!showAfter)}
            className={`flex items-center space-x-2 px-2.5 py-1 rounded-lg transition-colors ${
              showAfter ? 'text-emerald-400 bg-emerald-500/10 font-bold' : 'text-slate-600 line-through'
            }`}
          >
            <span className="h-2 w-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50"></span>
            <span>Simulated Result (After)</span>
            {showAfter ? <Eye className="h-3 w-3 ml-1" /> : <EyeOff className="h-3 w-3 ml-1" />}
          </button>
        </div>
      )}

      {activeTab === 'phase' && (
        <div className="flex flex-wrap items-center justify-center gap-6 mt-4 pt-3 border-t border-slate-800 text-xs font-medium">
          <div className="flex items-center space-x-2 text-red-400">
            <span className="h-2 w-2 rounded-full bg-red-500"></span>
            <span>Raw Acoustic Phase (Wrapped)</span>
          </div>
          <div className="flex items-center space-x-2 text-emerald-400 font-bold">
            <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
            <span>Linearized Phase (0° Flat Target)</span>
          </div>
        </div>
      )}

      {activeTab === 'step' && (
        <div className="flex flex-wrap items-center justify-center gap-6 mt-4 pt-3 border-t border-slate-800 text-xs font-medium">
          <div className="flex items-center space-x-2 text-cyan-400 font-bold">
            <span className="h-2 w-2 rounded-full bg-cyan-500"></span>
            <span>Normalized Step Response s[n]</span>
          </div>
          <div className="flex items-center space-x-2 text-amber-400">
            <span className="h-2 w-2 rounded-full bg-amber-500"></span>
            <span>10% Max Pre-Ringing Threshold</span>
          </div>
          <div className="flex items-center space-x-2 text-rose-400">
            <span className="h-2 w-2 rounded-full bg-rose-500"></span>
            <span>Pre-Ringing Evaluation Zone (-20ms to -5ms)</span>
          </div>
        </div>
      )}

      {activeTab === 'sub' && subAlignment && (
        <div className="flex flex-wrap items-center justify-center gap-6 mt-4 pt-3 border-t border-slate-800 text-xs font-medium">
          <div className="flex items-center space-x-2 text-red-400">
            <span className="h-2 w-2 rounded-full bg-red-500"></span>
            <span>Unaligned Summation (0 ms Delay)</span>
          </div>
          <div className="flex items-center space-x-2 text-emerald-400 font-bold">
            <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
            <span>Optimized Acoustic Alignment (+{subAlignment.gain_improvement_db.toFixed(1)} dB Boost)</span>
          </div>
        </div>
      )}
    </div>
  );
};
