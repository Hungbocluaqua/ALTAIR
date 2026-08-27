import React, { useState } from 'react';
import { PlotData, SubAlignmentResult } from '../types';
import { Activity, Radio, Eye, EyeOff } from 'lucide-react';

interface AudioPlotProps {
  plots: PlotData | null;
  subAlignment?: SubAlignmentResult;
  theme?: 'dark' | 'light';
}

export const AudioPlot: React.FC<AudioPlotProps> = ({ plots, subAlignment, theme = 'dark' }) => {
  const [activeTab, setActiveTab] = useState<'magnitude' | 'phase' | 'step' | 'sub'>('magnitude');
  const [showBefore, setShowBefore] = useState(true);
  const [showTarget, setShowTarget] = useState(true);
  const [showFilter, setShowFilter] = useState(true);
  const [showAfter, setShowAfter] = useState(true);

  if (!plots) {
    return (
      <div className="h-[360px] bg-white border border-stone-200 dark:bg-[#121316] dark:border-stone-800 rounded-lg flex flex-col items-center justify-center text-stone-400 dark:text-stone-500 shadow-sm transition-colors">
        <Activity className="h-8 w-8 text-stone-300 dark:text-stone-700 mb-2 animate-pulse" />
        <p className="text-sm font-serif font-semibold text-stone-700 dark:text-stone-300">No acoustic plots generated yet</p>
        <p className="text-xs font-mono text-stone-400 dark:text-stone-500 mt-0.5">Execute calibration to inspect transfer functions & impulse response</p>
      </div>
    );
  }

  // Dimensions for SVG Plot
  const width = 860;
  const height = 300;
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
    const validSPL = isNaN(spl) || !isFinite(spl) ? 75 : spl;
    const clamped = Math.max(minSPL, Math.min(maxSPL, validSPL));
    return padding.top + ((maxSPL - clamped) / (maxSPL - minSPL)) * plotHeight;
  };

  // Phase mapper: -180deg to +180deg
  const phaseToY = (deg: number) => {
    const validDeg = isNaN(deg) || !isFinite(deg) ? 0 : deg;
    const clamped = Math.max(-180, Math.min(180, validDeg));
    return padding.top + ((180 - clamped) / 360) * plotHeight;
  };

  // Time mapper for step response: -20ms to +30ms
  const minTime = -20;
  const maxTime = 30;
  const timeToX = (t: number) => {
    const validT = isNaN(t) || !isFinite(t) ? 0 : t;
    const clamped = Math.max(minTime, Math.min(maxTime, validT));
    return padding.left + ((clamped - minTime) / (maxTime - minTime)) * plotWidth;
  };

  // Step amplitude mapper: -1.2 to +1.2
  const stepToY = (amp: number) => {
    const validA = isNaN(amp) || !isFinite(amp) ? 0 : amp;
    const clamped = Math.max(-1.2, Math.min(1.2, validA));
    return padding.top + ((1.2 - clamped) / 2.4) * plotHeight;
  };

  const makeSplPath = (freqs: number[], spls: number[]) => {
    if (!freqs || !spls || freqs.length === 0) return '';
    const step = Math.max(1, Math.floor(freqs.length / 280));
    const points: string[] = [];
    for (let i = 0; i < freqs.length; i += step) {
      if (freqs[i] >= minFreq && freqs[i] <= maxFreq) {
        points.push(`${freqToX(freqs[i]).toFixed(1)} ${splToY(spls[i]).toFixed(1)}`);
      }
    }
    return points.length > 0 ? `M ${points.join(' L ')}` : '';
  };

  const makePhasePath = (freqs: number[], phase: number[]) => {
    if (!freqs || !phase || freqs.length === 0) return '';
    const step = Math.max(1, Math.floor(freqs.length / 280));
    const points: string[] = [];
    for (let i = 0; i < freqs.length; i += step) {
      if (freqs[i] >= minFreq && freqs[i] <= maxFreq) {
        points.push(`${freqToX(freqs[i]).toFixed(1)} ${phaseToY(phase[i]).toFixed(1)}`);
      }
    }
    return points.length > 0 ? `M ${points.join(' L ')}` : '';
  };

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

  const isLight = theme === 'light';
  const gridColor = isLight ? '#E5E3DF' : '#26282E';
  const rectFill = isLight ? '#FAFAF8' : '#0E0F12';
  const rectStroke = isLight ? '#E8E5DC' : '#26282E';
  const baseLineColor = isLight ? '#D6D3CD' : '#3E414B';

  return (
    <div className="bg-white border border-stone-200 text-stone-800 dark:bg-[#121316] dark:border-stone-800 dark:text-stone-100 rounded-lg p-5 transition-colors shadow-sm">
      {/* Header & Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-200 dark:border-stone-800 transition-colors">
        <div className="flex items-center space-x-2">
          <Radio className="h-4 w-4 text-amber-700 dark:text-amber-500" />
          <h3 className="font-serif font-bold text-stone-900 dark:text-stone-100 text-base">Interactive Acoustic Inspection</h3>
        </div>

        {/* Tab Buttons */}
        <div className="flex items-center space-x-1 bg-stone-50 dark:bg-[#0E0F12] p-0.5 rounded border border-stone-200 dark:border-stone-800 text-xs font-mono transition-colors">
          <button
            onClick={() => setActiveTab('magnitude')}
            className={`px-3 py-1 rounded font-medium transition-all ${
              activeTab === 'magnitude'
                ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-950 font-bold shadow-sm'
                : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white'
            }`}
          >
            SPL Magnitude
          </button>
          <button
            onClick={() => setActiveTab('phase')}
            className={`px-3 py-1 rounded font-medium transition-all ${
              activeTab === 'phase'
                ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-950 font-bold shadow-sm'
                : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white'
            }`}
          >
            Phase Response
          </button>
          <button
            onClick={() => setActiveTab('step')}
            className={`px-3 py-1 rounded font-medium transition-all ${
              activeTab === 'step'
                ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-950 font-bold shadow-sm'
                : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white'
            }`}
          >
            Step & Pre-Ringing
          </button>
          {subAlignment && (
            <button
              onClick={() => setActiveTab('sub')}
              className={`px-3 py-1 rounded font-medium transition-all ${
                activeTab === 'sub'
                  ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-950 font-bold shadow-sm'
                  : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white'
              }`}
            >
              Subwoofer Summation
            </button>
          )}
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="w-full overflow-x-auto select-none mt-3">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto font-mono">
          <rect
            x={padding.left}
            y={padding.top}
            width={plotWidth}
            height={plotHeight}
            fill={rectFill}
            stroke={rectStroke}
            strokeWidth="1"
            rx="4"
          />

          {/* TAB 1: SPL MAGNITUDE */}
          {activeTab === 'magnitude' && (
            <>
              {freqGridLines.map((f) => {
                const x = freqToX(f);
                return (
                  <g key={`fgrid-${f}`}>
                    <line x1={x} y1={padding.top} x2={x} y2={height - padding.bottom} stroke={gridColor} strokeWidth="1" strokeDasharray="2,2" />
                    <text x={x} y={height - padding.bottom + 16} fill="#78716C" fontSize="10" textAnchor="middle">
                      {f >= 1000 ? `${f / 1000}k` : f}
                    </text>
                  </g>
                );
              })}

              {splGridLines.map((spl) => {
                const y = splToY(spl);
                return (
                  <g key={`sgrid-${spl}`}>
                    <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke={gridColor} strokeWidth="1" strokeDasharray="2,2" />
                    <text x={padding.left - 8} y={y + 3.5} fill="#78716C" fontSize="10" textAnchor="end">
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
                  stroke={isLight ? '#9CA3AF' : '#6B7280'}
                  strokeWidth="1.4"
                  strokeDasharray="4,4"
                />
              )}

              {showTarget && (
                <path
                  d={makeSplPath(plots.freqs, plots.spl_target_left)}
                  fill="none"
                  stroke="#D97706"
                  strokeWidth="1.8"
                />
              )}

              {showFilter && plots.spl_filter_left && plots.spl_filter_left.length > 0 && (
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
                  stroke={isLight ? '#78716C' : '#A8A29E'}
                  strokeWidth="1.2"
                  strokeDasharray="3,3"
                />
              )}

              {showAfter && (
                <path
                  d={makeSplPath(plots.freqs, plots.spl_after_left)}
                  fill="none"
                  stroke={isLight ? '#1C1917' : '#F5F5F4'}
                  strokeWidth="2.2"
                  strokeLinecap="round"
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
                    <line x1={x} y1={padding.top} x2={x} y2={height - padding.bottom} stroke={gridColor} strokeWidth="1" strokeDasharray="2,2" />
                    <text x={x} y={height - padding.bottom + 16} fill="#78716C" fontSize="10" textAnchor="middle">
                      {f >= 1000 ? `${f / 1000}k` : f}
                    </text>
                  </g>
                );
              })}

              {phaseGridLines.map((deg) => {
                const y = phaseToY(deg);
                return (
                  <g key={`pgrid-${deg}`}>
                    <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke={gridColor} strokeWidth="1" strokeDasharray="2,2" />
                    <text x={padding.left - 8} y={y + 3.5} fill="#78716C" fontSize="10" textAnchor="end">
                      {deg}°
                    </text>
                  </g>
                );
              })}

              <path
                d={makePhasePath(plots.freqs, plots.phase_before_deg)}
                fill="none"
                stroke={isLight ? '#9CA3AF' : '#6B7280'}
                strokeWidth="1.4"
                strokeDasharray="3,3"
              />

              <path
                d={makePhasePath(plots.freqs, plots.phase_after_deg)}
                fill="none"
                stroke="#D97706"
                strokeWidth="2.2"
              />
            </>
          )}

          {/* TAB 3: STEP RESPONSE */}
          {activeTab === 'step' && (
            <>
              {timeGridLines.map((t) => {
                const x = timeToX(t);
                return (
                  <g key={`tgrid-${t}`}>
                    <line x1={x} y1={padding.top} x2={x} y2={height - padding.bottom} stroke={gridColor} strokeWidth="1" strokeDasharray="2,2" />
                    <text x={x} y={height - padding.bottom + 16} fill="#78716C" fontSize="10" textAnchor="middle">
                      {t} ms
                    </text>
                  </g>
                );
              })}

              {[-1, -0.5, 0, 0.5, 1].map((amp) => {
                const y = stepToY(amp);
                return (
                  <g key={`agrid-${amp}`}>
                    <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke={amp === 0 ? baseLineColor : gridColor} strokeWidth={amp === 0 ? 1.5 : 1} strokeDasharray={amp === 0 ? 'none' : '2,2'} />
                    <text x={padding.left - 8} y={y + 3.5} fill="#78716C" fontSize="10" textAnchor="end">
                      {amp}
                    </text>
                  </g>
                );
              })}

              <path
                d={makeStepPath(plots.step_time_ms, plots.step_response)}
                fill="none"
                stroke={isLight ? '#1C1917' : '#F5F5F4'}
                strokeWidth="2.0"
              />
            </>
          )}

          {/* TAB 4: SUBWOOFER SUMMATION */}
          {activeTab === 'sub' && (
            subAlignment ? (
              <>
                {[20, 30, 40, 50, 60, 80, 100, 150, 200].map((f) => {
                  const x = freqToX(f);
                  return (
                    <g key={`sub-fgrid-${f}`}>
                      <line x1={x} y1={padding.top} x2={x} y2={height - padding.bottom} stroke={gridColor} strokeWidth="1" strokeDasharray="2,2" />
                      <text x={x} y={height - padding.bottom + 16} fill="#78716C" fontSize="10" textAnchor="middle">
                        {f}
                      </text>
                    </g>
                  );
                })}

                {splGridLines.map((spl) => {
                  const y = splToY(spl);
                  return (
                    <g key={`sub-sgrid-${spl}`}>
                      <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke={gridColor} strokeWidth="1" strokeDasharray="2,2" />
                      <text x={padding.left - 8} y={y + 3.5} fill="#78716C" fontSize="10" textAnchor="end">
                        {spl} dB
                      </text>
                    </g>
                  );
                })}

                <path
                  d={makeSplPath(subAlignment.freqs, subAlignment.spl_unaligned_db)}
                  fill="none"
                  stroke={isLight ? '#9CA3AF' : '#6B7280'}
                  strokeWidth="1.4"
                  strokeDasharray="4,4"
                />

                <path
                  d={makeSplPath(subAlignment.freqs, subAlignment.spl_aligned_db)}
                  fill="none"
                  stroke="#D97706"
                  strokeWidth="2.4"
                />
              </>
            ) : (
              <text x={width / 2} y={height / 2} fill="#78716C" fontSize="12" textAnchor="middle" fontFamily="serif">
                Subwoofer data available when Subwoofer measurement is provided
              </text>
            )
          )}
        </svg>
      </div>

      {/* Legend & Toggle Controls */}
      {activeTab === 'magnitude' && (
        <div className="flex flex-wrap items-center justify-center gap-6 mt-4 pt-3 border-t border-stone-200 dark:border-stone-800 text-xs font-mono transition-colors">
          <button
            onClick={() => setShowBefore(!showBefore)}
            className={`flex items-center space-x-2 px-2.5 py-1 rounded transition-colors ${
              showBefore ? 'text-stone-700 dark:text-stone-300 bg-stone-100 dark:bg-stone-800' : 'text-stone-400 dark:text-stone-600 line-through'
            }`}
          >
            <span className="h-1.5 w-3 border-b border-dashed border-stone-500"></span>
            <span>Raw Response</span>
            {showBefore ? <Eye className="h-3 w-3 ml-1" /> : <EyeOff className="h-3 w-3 ml-1" />}
          </button>

          <button
            onClick={() => setShowTarget(!showTarget)}
            className={`flex items-center space-x-2 px-2.5 py-1 rounded transition-colors ${
              showTarget ? 'text-amber-800 dark:text-amber-300 bg-amber-500/10' : 'text-stone-400 dark:text-stone-600 line-through'
            }`}
          >
            <span className="h-1.5 w-3 bg-[#D97706]"></span>
            <span>Target House Curve</span>
            {showTarget ? <Eye className="h-3 w-3 ml-1" /> : <EyeOff className="h-3 w-3 ml-1" />}
          </button>

          <button
            onClick={() => setShowFilter(!showFilter)}
            className={`flex items-center space-x-2 px-2.5 py-1 rounded transition-colors ${
              showFilter ? 'text-stone-600 dark:text-stone-400 bg-stone-100 dark:bg-stone-800' : 'text-stone-400 dark:text-stone-600 line-through'
            }`}
          >
            <span className="h-1.5 w-3 bg-stone-400"></span>
            <span>FIR Inversion Gain</span>
            {showFilter ? <Eye className="h-3 w-3 ml-1" /> : <EyeOff className="h-3 w-3 ml-1" />}
          </button>

          <button
            onClick={() => setShowAfter(!showAfter)}
            className={`flex items-center space-x-2 px-2.5 py-1 rounded transition-colors ${
              showAfter ? 'text-stone-900 dark:text-stone-100 bg-stone-100 dark:bg-stone-800 font-bold' : 'text-stone-400 dark:text-stone-600 line-through'
            }`}
          >
            <span className="h-1.5 w-3 bg-stone-900 dark:bg-stone-100"></span>
            <span>Calibrated Output</span>
            {showAfter ? <Eye className="h-3 w-3 ml-1" /> : <EyeOff className="h-3 w-3 ml-1" />}
          </button>
        </div>
      )}
    </div>
  );
};
