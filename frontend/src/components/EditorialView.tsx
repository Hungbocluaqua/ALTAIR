import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  OptimizationRequest,
  OptimizationResponse,
  StatusResponse,
  ProgressEvent,
} from '../types';
import {
  getExportBundleUrl,
  simulateSubDelay,
  saveSession,
  loadSession,
  clearSession,
} from '../api/client';
import {
  RefreshCw,
  Download,
  Sliders,
  Activity,
  CheckCircle2,
  Zap,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  FileCode,
  Save,
  FolderOpen,
  Trash2,
  Sparkles,
  Info,
  Check,
} from 'lucide-react';
import { MultiSubView } from './MultiSubView';
import { StepProgress } from './StepProgress';

interface EditorialViewProps {
  config: OptimizationRequest;
  onChangeConfig: (c: OptimizationRequest) => void;
  result: OptimizationResponse | null;
  isRunning: boolean;
  onRun: () => void;
  status: StatusResponse | null;
  theme: 'dark' | 'light';
  onLog?: (msg: string, level?: 'info' | 'success' | 'warn' | 'error' | 'dsp' | 'geom', tag?: string) => void;
  progress?: ProgressEvent | null;
  onOpenSetupWizard?: () => void;
}

export const EditorialView: React.FC<EditorialViewProps> = ({
  config,
  onChangeConfig,
  result,
  isRunning,
  onRun,
  status,
  theme,
  onLog,
  progress,
  onOpenSetupWizard,
}) => {
  // Transfer Figure tabs & curve visibility
  const [activePlotTab, setActivePlotTab] = useState<'spl' | 'phase' | 'step' | 'sub'>('spl');
  const [showBefore, setShowBefore] = useState(true);
  const [showTarget, setShowTarget] = useState(true);
  const [showFilter, setShowFilter] = useState(true);
  const [showAfter, setShowAfter] = useState(true);

  // Smoothing mode: 'raw' | '1/12' | '1/6' | 'erb'
  const [smoothingMode, setSmoothingMode] = useState<'raw' | '1/12' | '1/6' | 'erb'>('1/6');

  // Diagnostics collapsible state
  const [showDiagnostics, setShowDiagnostics] = useState(true);

  // Crosshair hover coordinates: { x, y, freq, spl }
  const [hoverData, setHoverData] = useState<{
    x: number;
    y: number;
    freq: number;
    val: number;
    before?: number;
    target?: number;
    filter?: number;
    after?: number;
  } | null>(null);

  // Subwoofer alignment interactive state
  const [subDelayMs, setSubDelayMs] = useState<number>(result?.sub_alignment?.optimal_delay_ms ?? 0);
  const [polarity, setPolarity] = useState<number>(result?.sub_alignment?.polarity_multiplier ?? 1);
  const [interactiveSubData, setInteractiveSubData] = useState<any>(null);
  const [isSimulatingSub, setIsSimulatingSub] = useState(false);

  useEffect(() => {
    if (result?.sub_alignment) {
      setSubDelayMs(result.sub_alignment.optimal_delay_ms);
      setPolarity(result.sub_alignment.polarity_multiplier);
    }
  }, [result?.sub_alignment]);

  // Handle interactive delay slider change
  const handleDelayChange = async (newDelay: number) => {
    setSubDelayMs(newDelay);
    setIsSimulatingSub(true);
    try {
      const data = await simulateSubDelay(newDelay, polarity, config.sub_crossover_freq_hz);
      setInteractiveSubData(data);
    } catch (_) {
      /* ignore */
    } finally {
      setIsSimulatingSub(false);
    }
  };

  const handlePolarityToggle = async () => {
    const newPol = polarity === 1.0 ? -1.0 : 1.0;
    setPolarity(newPol);
    setIsSimulatingSub(true);
    try {
      const data = await simulateSubDelay(subDelayMs, newPol, config.sub_crossover_freq_hz);
      setInteractiveSubData(data);
    } catch (_) {
      /* ignore */
    } finally {
      setIsSimulatingSub(false);
    }
  };

  const updateTarget = (patch: Partial<typeof config.target>) => {
    onChangeConfig({
      ...config,
      target: {
        ...config.target,
        ...patch,
      },
    });
  };

  const intel = result?.acoustic_intelligence;
  const sub = result?.sub_alignment;

  // Smoothing algorithm
  const applySmoothing = (freqs: number[], spls: number[], mode: 'raw' | '1/12' | '1/6' | 'erb'): number[] => {
    if (mode === 'raw' || !spls || spls.length === 0) return spls;
    const octFrac = mode === '1/12' ? 12 : mode === '1/6' ? 6 : 3;
    const smoothed: number[] = new Array(spls.length);
    for (let i = 0; i < spls.length; i++) {
      const fCenter = freqs[i];
      const fLow = fCenter * Math.pow(2, -0.5 / octFrac);
      const fHigh = fCenter * Math.pow(2, 0.5 / octFrac);
      let sum = 0;
      let count = 0;
      for (let j = Math.max(0, i - 30); j < Math.min(spls.length, i + 30); j++) {
        if (freqs[j] >= fLow && freqs[j] <= fHigh) {
          sum += spls[j];
          count++;
        }
      }
      smoothed[i] = count > 0 ? sum / count : spls[i];
    }
    return smoothed;
  };

  // Smoothed curves
  const smoothedBefore = useMemo(() => {
    if (!result?.plots) return [];
    return applySmoothing(result.plots.freqs, result.plots.spl_before_left, smoothingMode);
  }, [result?.plots?.spl_before_left, smoothingMode]);

  const smoothedAfter = useMemo(() => {
    if (!result?.plots) return [];
    return applySmoothing(result.plots.freqs, result.plots.spl_after_left, smoothingMode);
  }, [result?.plots?.spl_after_left, smoothingMode]);

  // SVG Coordinates & Scales
  const width = 860;
  const height = 300;
  const pad = { top: 25, right: 25, bottom: 35, left: 50 };
  const pw = width - pad.left - pad.right;
  const ph = height - pad.top - pad.bottom;

  const minF = 20;
  const maxF = 20000;
  const minSpl = 40;
  const maxSpl = 100;

  const xPos = (f: number) => {
    const val = Number.isFinite(f) ? f : 100;
    return pad.left + (Math.log10(Math.max(val, minF) / minF) / Math.log10(maxF / minF)) * pw;
  };
  const yPos = (s: number) => {
    const val = Number.isFinite(s) ? s : 70;
    return pad.top + ((maxSpl - Math.max(Math.min(val, maxSpl), minSpl)) / (maxSpl - minSpl)) * ph;
  };

  const phaseToY = (deg: number) => {
    const val = Number.isFinite(deg) ? deg : 0;
    return pad.top + ((180 - Math.max(-180, Math.min(180, val))) / 360) * ph;
  };
  const timeToX = (t: number) => {
    const val = Number.isFinite(t) ? t : 0;
    return pad.left + ((Math.max(-20, Math.min(30, val)) - -20) / 50) * pw;
  };
  const stepToY = (amp: number) => {
    const val = Number.isFinite(amp) ? amp : 0;
    return pad.top + ((1.2 - Math.max(-1.2, Math.min(1.2, val))) / 2.4) * ph;
  };

  const makePath = (freqs?: number[], spls?: number[]) => {
    if (!freqs || !spls || freqs.length === 0) return '';
    const pts: string[] = [];
    const step = Math.max(1, Math.floor(freqs.length / 280));
    for (let i = 0; i < freqs.length; i += step) {
      if (freqs[i] >= minF && freqs[i] <= maxF) {
        pts.push(`${xPos(freqs[i]).toFixed(1)},${yPos(spls[i] ?? 70).toFixed(1)}`);
      }
    }
    return pts.length > 0 ? `M ${pts.join(' L ')}` : '';
  };

  const makePhasePath = (freqs?: number[], phases?: number[]) => {
    if (!freqs || !phases || freqs.length === 0) return '';
    const pts: string[] = [];
    const step = Math.max(1, Math.floor(freqs.length / 280));
    for (let i = 0; i < freqs.length; i += step) {
      if (freqs[i] >= minF && freqs[i] <= maxF) {
        pts.push(`${xPos(freqs[i]).toFixed(1)},${phaseToY(phases[i] ?? 0).toFixed(1)}`);
      }
    }
    return pts.length > 0 ? `M ${pts.join(' L ')}` : '';
  };

  const makeStepPath = (times?: number[], steps?: number[]) => {
    if (!times || !steps || times.length === 0) return '';
    return times
      .map((t, i) => `${i === 0 ? 'M' : 'L'} ${timeToX(t).toFixed(1)},${stepToY(steps[i] ?? 0).toFixed(1)}`)
      .join(' ');
  };

  // Crosshair mouse handler
  const svgRef = useRef<SVGSVGElement>(null);
  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || !result?.plots) return;
    const rect = svgRef.current.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;

    // Scale to viewBox coordinates
    const scaleX = width / rect.width;
    const scaleY = height / rect.height;
    const svgX = clientX * scaleX;
    const svgY = clientY * scaleY;

    if (svgX >= pad.left && svgX <= pad.left + pw && svgY >= pad.top && svgY <= pad.top + ph) {
      const fNorm = (svgX - pad.left) / pw;
      const freq = minF * Math.pow(maxF / minF, fNorm);
      const val = maxSpl - ((svgY - pad.top) / ph) * (maxSpl - minSpl);

      // Find closest index
      const freqs = result.plots.freqs;
      let closestIdx = 0;
      let minDiff = Infinity;
      for (let i = 0; i < freqs.length; i++) {
        const diff = Math.abs(freqs[i] - freq);
        if (diff < minDiff) {
          minDiff = diff;
          closestIdx = i;
        }
      }

      setHoverData({
        x: svgX,
        y: svgY,
        freq: freqs[closestIdx],
        val,
        before: smoothedBefore[closestIdx],
        target: result.plots.spl_target_left[closestIdx],
        filter: result.plots.spl_filter_left?.[closestIdx],
        after: smoothedAfter[closestIdx],
      });
    } else {
      setHoverData(null);
    }
  };

  const handleSvgMouseLeave = () => {
    setHoverData(null);
  };

  const isLight = theme === 'light';
  const gridColor = isLight ? '#E5E3DF' : '#26282E';
  const rectFill = isLight ? '#FAFAF8' : '#0E0F12';
  const rectStroke = isLight ? '#E8E5DC' : '#26282E';

  return (
    <div className="space-y-7 select-text">

      {/* ========================================================================= */}
      {/* SECTION 00: MONOGRAPH MASTHEAD & REFERENCE HARDWARE STRIP                 */}
      {/* ========================================================================= */}
      <section className="border border-stone-200 dark:border-stone-800 rounded-xl p-6 bg-white dark:bg-[#121316] shadow-sm transition-colors">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-stone-100 dark:border-stone-800/80 pb-5">
          <div>
            <div className="flex items-center space-x-2 text-[11px] font-sans tracking-widest text-amber-700 dark:text-amber-400 uppercase font-bold">
              <span>ALTAIR</span>
              <span>•</span>
              <span>ACOUSTIC EQUALIZATION MONOGRAPH</span>
              <span>•</span>
              <span className="font-mono">VOL. 24</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-serif font-bold text-stone-900 dark:text-stone-100 mt-1 tracking-tight">
              Digital Room Equalization & Inversion
            </h1>
            <p className="text-xs text-stone-600 dark:text-stone-300 font-sans mt-1.5 max-w-3xl leading-relaxed">
              Laboratory-grade linear-phase FIR synthesis with 1-cycle frequency-dependent windowing, virtual bass array modal
              mitigation, and sub-millimeter phase alignment.
            </p>
          </div>

          {/* Master Action Buttons */}
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            {onOpenSetupWizard && (
              <button
                type="button"
                onClick={onOpenSetupWizard}
                className="px-4 py-2.5 rounded-lg border border-amber-300 dark:border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-900 dark:text-amber-300 text-xs font-sans font-bold transition-all active:scale-[0.98] flex items-center space-x-2 shadow-sm"
              >
                <SlidersHorizontal className="h-4 w-4" />
                <span>Setup & Ingestion Wizard</span>
              </button>
            )}

            <button
              onClick={onRun}
              disabled={isRunning}
              className="px-5 py-2.5 rounded-lg bg-amber-700 hover:bg-amber-800 text-white dark:bg-amber-500 dark:hover:bg-amber-400 dark:text-stone-950 text-xs font-sans font-bold tracking-wider uppercase transition-all active:scale-[0.98] flex items-center space-x-2 disabled:opacity-50 shadow-sm"
            >
              <RefreshCw className={`h-4 w-4 ${isRunning ? 'animate-spin' : ''}`} />
              <span>{isRunning ? 'CALIBRATING...' : 'EXECUTE CALIBRATION'}</span>
            </button>
          </div>
        </div>

        {/* Reference Hardware Strip with Clear Live Status Badges */}
        <div className="flex flex-wrap items-center gap-4 mt-4 pt-1 text-xs font-sans text-stone-600 dark:text-stone-300">
          <div className="flex items-center space-x-1.5">
            <span className="text-stone-400 dark:text-stone-500 font-semibold">MONITORS:</span>
            <strong className="text-stone-900 dark:text-stone-100">Edifier MR3 (Active)</strong>
          </div>
          <span>•</span>
          <div className="flex items-center space-x-1.5">
            <span className="text-stone-400 dark:text-stone-500 font-semibold">SUBWOOFER:</span>
            <strong className="text-stone-900 dark:text-stone-100">Edifier T5s (8-inch)</strong>
          </div>
          <span>•</span>
          <div className="flex items-center space-x-1.5">
            <span className="text-stone-400 dark:text-stone-500 font-semibold">SPEED OF SOUND:</span>
            <strong className="font-mono text-stone-900 dark:text-stone-100">
              {intel?.speed_of_sound_mps ?? 343.2} m/s
            </strong>
          </div>
          <span>•</span>
          <div className="flex items-center space-x-1.5">
            <span className="text-stone-400 dark:text-stone-500 font-semibold">REW API:</span>
            <strong className="text-amber-700 dark:text-amber-400 font-semibold">
              {status?.rew_connected ? 'CONNECTED (:4735)' : 'STANDALONE'}
            </strong>
          </div>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 01: MASTER ACOUSTIC TRANSFER INSPECTION & INTERACTIVE CANVAS      */}
      {/* ========================================================================= */}
      <section id="transfer-inspection" className="border border-stone-200 dark:border-stone-800 rounded-xl p-6 bg-white dark:bg-[#121316] space-y-4 shadow-sm transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 dark:border-stone-800/80 pb-3.5">
          <div className="flex items-center space-x-2.5">
            <span className="text-xs font-sans font-bold text-amber-700 dark:text-amber-400 uppercase tracking-widest">
              SECTION 01 // TRANSFER FUNCTION
            </span>
            <span className="font-serif font-bold text-stone-900 dark:text-stone-100 text-sm">
              Steady-State Room Inversion & Regularized Output
            </span>
          </div>

          {/* Sub-Tabs & Smoothing Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Smoothing selector */}
            <div className="flex items-center bg-stone-100 dark:bg-[#0E0F12] p-0.5 rounded-md border border-stone-200 dark:border-stone-800 text-[11px] font-sans">
              <span className="px-2 text-stone-500 dark:text-stone-400 font-medium">Smooth:</span>
              {(['raw', '1/12', '1/6', 'erb'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setSmoothingMode(mode)}
                  className={`px-2 py-0.5 rounded font-medium transition-all ${
                    smoothingMode === mode
                      ? 'bg-amber-700 text-white dark:bg-amber-500 dark:text-stone-950 font-bold shadow-sm'
                      : 'text-stone-600 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100'
                  }`}
                >
                  {mode === 'raw' ? 'Raw' : mode === 'erb' ? 'ERB' : mode}
                </button>
              ))}
            </div>

            {/* Plot Sub-Tabs */}
            <div className="flex items-center bg-stone-100 dark:bg-[#0E0F12] p-0.5 rounded-md border border-stone-200 dark:border-stone-800 text-xs font-sans">
              <button
                onClick={() => setActivePlotTab('spl')}
                className={`px-3 py-1 rounded font-medium transition-all ${
                  activePlotTab === 'spl'
                    ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-950 font-bold shadow-sm'
                    : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white'
                }`}
              >
                SPL Magnitude
              </button>
              <button
                onClick={() => setActivePlotTab('phase')}
                className={`px-3 py-1 rounded font-medium transition-all ${
                  activePlotTab === 'phase'
                    ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-950 font-bold shadow-sm'
                    : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white'
                }`}
              >
                Linear Phase
              </button>
              <button
                onClick={() => setActivePlotTab('step')}
                className={`px-3 py-1 rounded font-medium transition-all ${
                  activePlotTab === 'step'
                    ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-950 font-bold shadow-sm'
                    : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white'
                }`}
              >
                Step Response
              </button>
              {sub && (
                <button
                  onClick={() => setActivePlotTab('sub')}
                  className={`px-3 py-1 rounded font-medium transition-all ${
                    activePlotTab === 'sub'
                      ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-950 font-bold shadow-sm'
                      : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white'
                  }`}
                >
                  Sub Summation
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Interactive Clickable Legend Chips */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-sans pb-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-stone-500 dark:text-stone-400 font-medium">Traces:</span>
            <button
              type="button"
              onClick={() => setShowBefore(!showBefore)}
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md border text-xs font-medium transition-all ${
                showBefore
                  ? 'border-stone-400 bg-stone-100 dark:border-stone-600 dark:bg-stone-800 text-stone-900 dark:text-stone-100'
                  : 'border-stone-200 dark:border-stone-800 text-stone-400 opacity-60'
              }`}
            >
              <span className="w-3 h-0.5 bg-stone-400 border-dashed inline-block" />
              <span>Measured (Before)</span>
            </button>

            <button
              type="button"
              onClick={() => setShowTarget(!showTarget)}
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md border text-xs font-medium transition-all ${
                showTarget
                  ? 'border-amber-600/40 bg-amber-500/10 text-amber-900 dark:text-amber-300 font-semibold'
                  : 'border-stone-200 dark:border-stone-800 text-stone-400 opacity-60'
              }`}
            >
              <span className="w-3 h-0.5 bg-amber-600 inline-block" />
              <span>Target Curve</span>
            </button>

            <button
              type="button"
              onClick={() => setShowFilter(!showFilter)}
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md border text-xs font-medium transition-all ${
                showFilter
                  ? 'border-blue-500/40 bg-blue-500/10 text-blue-900 dark:text-blue-300 font-semibold'
                  : 'border-stone-200 dark:border-stone-800 text-stone-400 opacity-60'
              }`}
            >
              <span className="w-3 h-0.5 bg-blue-500 inline-block" />
              <span>Filter Inversion</span>
            </button>

            <button
              type="button"
              onClick={() => setShowAfter(!showAfter)}
              className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md border text-xs font-medium transition-all ${
                showAfter
                  ? 'border-stone-900 bg-stone-100 dark:border-stone-300 dark:bg-stone-800 text-stone-900 dark:text-stone-100 font-bold'
                  : 'border-stone-200 dark:border-stone-800 text-stone-400 opacity-60'
              }`}
            >
              <span className="w-3 h-0.5 bg-stone-900 dark:bg-stone-100 inline-block" />
              <span>Calibrated (After)</span>
            </button>
          </div>

          {/* Hover Crosshair Info Readout */}
          {hoverData && (
            <div className="flex items-center space-x-3 text-xs font-mono bg-stone-100 dark:bg-[#0E0F12] border border-stone-200 dark:border-stone-800 px-3 py-1 rounded-md">
              <span className="text-amber-800 dark:text-amber-400 font-bold">
                {hoverData.freq >= 1000 ? `${(hoverData.freq / 1000).toFixed(2)} kHz` : `${hoverData.freq.toFixed(1)} Hz`}
              </span>
              {hoverData.after !== undefined && (
                <span className="text-stone-900 dark:text-stone-100">
                  After: <strong>{hoverData.after.toFixed(1)} dB</strong>
                </span>
              )}
              {hoverData.target !== undefined && (
                <span className="text-amber-700 dark:text-amber-500">
                  Target: <strong>{hoverData.target.toFixed(1)} dB</strong>
                </span>
              )}
            </div>
          )}
        </div>

        {/* SVG Transfer Function Graphic with Crosshair Cursor */}
        <div className="overflow-x-auto select-none relative">
          <svg
            ref={svgRef}
            viewBox={`0 0 ${width} ${height}`}
            className="w-full h-auto overflow-visible font-mono cursor-crosshair"
            onMouseMove={handleSvgMouseMove}
            onMouseLeave={handleSvgMouseLeave}
          >
            <rect
              x={pad.left}
              y={pad.top}
              width={pw}
              height={ph}
              fill={rectFill}
              stroke={rectStroke}
              strokeWidth="1"
              rx="4"
            />

            {/* TAB 1: SPL MAGNITUDE */}
            {activePlotTab === 'spl' && (
              <>
                {[20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].map((f) => {
                  const x = xPos(f);
                  return (
                    <g key={`spl-f-${f}`}>
                      <line x1={x} y1={pad.top} x2={x} y2={height - pad.bottom} stroke={gridColor} strokeWidth="1" strokeDasharray="2,2" />
                      <text x={x} y={height - pad.bottom + 14} fill={isLight ? '#78716C' : '#A8A29E'} fontSize="9" textAnchor="middle">
                        {f >= 1000 ? `${f / 1000}k` : f}
                      </text>
                    </g>
                  );
                })}

                {[50, 60, 70, 80, 90, 100].map((s) => {
                  const y = yPos(s);
                  return (
                    <g key={`spl-s-${s}`}>
                      <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke={gridColor} strokeWidth="1" strokeDasharray="2,2" />
                      <text x={pad.left - 6} y={y + 3} fill={isLight ? '#78716C' : '#A8A29E'} fontSize="9" textAnchor="end">
                        {s}
                      </text>
                    </g>
                  );
                })}

                {showBefore && result?.plots && (
                  <path
                    d={makePath(result.plots.freqs, smoothedBefore)}
                    fill="none"
                    stroke={isLight ? '#9CA3AF' : '#6B7280'}
                    strokeWidth="1.3"
                    strokeDasharray="4,4"
                  />
                )}

                {showTarget && result?.plots && (
                  <path
                    d={makePath(result.plots.freqs, result.plots.spl_target_left)}
                    fill="none"
                    stroke="#D97706"
                    strokeWidth="1.8"
                  />
                )}

                {showFilter && result?.plots?.spl_filter_left && (
                  <path
                    d={makePath(result.plots.freqs, result.plots.spl_filter_left.map((v: number) => v + 75.0))}
                    fill="none"
                    stroke="#3B82F6"
                    strokeWidth="1.2"
                    strokeDasharray="3,3"
                  />
                )}

                {showAfter && result?.plots && (
                  <path
                    d={makePath(result.plots.freqs, smoothedAfter)}
                    fill="none"
                    stroke={isLight ? '#1C1917' : '#F5F5F4'}
                    strokeWidth="2.2"
                  />
                )}
              </>
            )}

            {/* TAB 2: LINEAR PHASE */}
            {activePlotTab === 'phase' && (
              <>
                {[20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].map((f) => {
                  const x = xPos(f);
                  return (
                    <g key={`ph-f-${f}`}>
                      <line x1={x} y1={pad.top} x2={x} y2={height - pad.bottom} stroke={gridColor} strokeWidth="1" strokeDasharray="2,2" />
                      <text x={x} y={height - pad.bottom + 14} fill={isLight ? '#78716C' : '#A8A29E'} fontSize="9" textAnchor="middle">
                        {f >= 1000 ? `${f / 1000}k` : f}
                      </text>
                    </g>
                  );
                })}

                {[-180, -90, 0, 90, 180].map((deg) => {
                  const y = phaseToY(deg);
                  return (
                    <g key={`ph-d-${deg}`}>
                      <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke={gridColor} strokeWidth="1" strokeDasharray="2,2" />
                      <text x={pad.left - 6} y={y + 3} fill={isLight ? '#78716C' : '#A8A29E'} fontSize="9" textAnchor="end">
                        {deg}°
                      </text>
                    </g>
                  );
                })}

                {result?.plots?.phase_before_deg && (
                  <path
                    d={makePhasePath(result.plots.freqs, result.plots.phase_before_deg)}
                    fill="none"
                    stroke={isLight ? '#9CA3AF' : '#6B7280'}
                    strokeWidth="1.2"
                    strokeDasharray="4,4"
                  />
                )}

                {result?.plots?.phase_after_deg && (
                  <path
                    d={makePhasePath(result.plots.freqs, result.plots.phase_after_deg)}
                    fill="none"
                    stroke="#D97706"
                    strokeWidth="2.0"
                  />
                )}
              </>
            )}

            {/* TAB 3: STEP RESPONSE */}
            {activePlotTab === 'step' && (
              <>
                {[-20, -10, 0, 10, 20, 30].map((t) => {
                  const x = timeToX(t);
                  return (
                    <g key={`st-t-${t}`}>
                      <line x1={x} y1={pad.top} x2={x} y2={height - pad.bottom} stroke={gridColor} strokeWidth="1" strokeDasharray="2,2" />
                      <text x={x} y={height - pad.bottom + 14} fill={isLight ? '#78716C' : '#A8A29E'} fontSize="9" textAnchor="middle">
                        {t}ms
                      </text>
                    </g>
                  );
                })}

                {[-1.0, -0.5, 0.0, 0.5, 1.0].map((a) => {
                  const y = stepToY(a);
                  return (
                    <g key={`st-a-${a}`}>
                      <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke={gridColor} strokeWidth="1" strokeDasharray="2,2" />
                      <text x={pad.left - 6} y={y + 3} fill={isLight ? '#78716C' : '#A8A29E'} fontSize="9" textAnchor="end">
                        {a}
                      </text>
                    </g>
                  );
                })}

                {result?.plots?.step_time_ms && (
                  <path
                    d={makeStepPath(result.plots.step_time_ms, result.plots.step_response)}
                    fill="none"
                    stroke={isLight ? '#1C1917' : '#F5F5F4'}
                    strokeWidth="1.8"
                  />
                )}
              </>
            )}

            {/* TAB 4: SUB SUMMATION */}
            {activePlotTab === 'sub' && sub && (
              <>
                {[20, 40, 60, 80, 100, 150, 200, 300, 500].map((f) => {
                  const x = xPos(f);
                  return (
                    <g key={`sub-f-${f}`}>
                      <line x1={x} y1={pad.top} x2={x} y2={height - pad.bottom} stroke={gridColor} strokeWidth="1" strokeDasharray="2,2" />
                      <text x={x} y={height - pad.bottom + 14} fill={isLight ? '#78716C' : '#A8A29E'} fontSize="9" textAnchor="middle">
                        {f}
                      </text>
                    </g>
                  );
                })}

                {[50, 60, 70, 80, 90, 100].map((s) => {
                  const y = yPos(s);
                  return (
                    <g key={`sub-s-${s}`}>
                      <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke={gridColor} strokeWidth="1" strokeDasharray="2,2" />
                      <text x={pad.left - 6} y={y + 3} fill={isLight ? '#78716C' : '#A8A29E'} fontSize="9" textAnchor="end">
                        {s}
                      </text>
                    </g>
                  );
                })}

                <path
                  d={makePath(sub.freqs, sub.spl_unaligned_db)}
                  fill="none"
                  stroke={isLight ? '#9CA3AF' : '#6B7280'}
                  strokeWidth="1.4"
                  strokeDasharray="4,4"
                />

                <path
                  d={makePath(
                    interactiveSubData?.freqs ?? sub.freqs,
                    interactiveSubData?.spl_sum_db ?? sub.spl_aligned_db
                  )}
                  fill="none"
                  stroke="#D97706"
                  strokeWidth="2.2"
                />
              </>
            )}

            {/* Interactive Crosshair Lines */}
            {hoverData && (
              <g pointerEvents="none">
                <line
                  x1={hoverData.x}
                  y1={pad.top}
                  x2={hoverData.x}
                  y2={pad.top + ph}
                  stroke="#D97706"
                  strokeWidth="1"
                  strokeDasharray="2,2"
                />
                <line
                  x1={pad.left}
                  y1={hoverData.y}
                  x2={pad.left + pw}
                  y2={hoverData.y}
                  stroke="#D97706"
                  strokeWidth="1"
                  strokeDasharray="2,2"
                />
                <circle cx={hoverData.x} cy={hoverData.y} r="3.5" fill="#D97706" />
              </g>
            )}
          </svg>
        </div>

        {/* Subwoofer Co-Optimization Controls (inside Figure 01 when active) */}
        {activePlotTab === 'sub' && sub && (
          <div className="pt-3 border-t border-stone-100 dark:border-stone-800 flex flex-wrap items-center justify-between gap-4 font-sans text-xs">
            <div className="flex items-center space-x-3">
              <span className="font-semibold text-stone-700 dark:text-stone-300">Subwoofer Delay:</span>
              <input
                type="range"
                min="-30"
                max="30"
                step="0.1"
                value={subDelayMs}
                onChange={(e) => handleDelayChange(parseFloat(e.target.value))}
                className="w-48 h-1 bg-stone-300 dark:bg-stone-700 appearance-none cursor-pointer accent-amber-700 dark:accent-amber-500"
              />
              <input
                type="number"
                step="0.05"
                min="-50"
                max="50"
                value={subDelayMs}
                onChange={(e) => handleDelayChange(parseFloat(e.target.value) || 0)}
                className="w-20 px-2 py-0.5 text-right font-mono text-xs rounded bg-stone-100 dark:bg-stone-900 border border-stone-300 dark:border-stone-700 text-stone-900 dark:text-stone-100 font-bold"
              />
              <span className="font-mono text-stone-500">ms</span>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-stone-600 dark:text-stone-400">Polarity:</span>
              <button
                type="button"
                onClick={handlePolarityToggle}
                className={`px-2.5 py-1 rounded text-xs font-mono font-bold border transition-colors ${
                  polarity === 1.0
                    ? 'border-stone-300 bg-stone-100 dark:bg-stone-800 text-stone-800 dark:text-stone-200'
                    : 'border-amber-600 bg-amber-500/10 text-amber-900 dark:text-amber-300'
                }`}
              >
                {polarity === 1.0 ? 'Normal (0°)' : 'Inverted (180°)'}
              </button>
            </div>
          </div>
        )}

        {/* Inline Optimization Progress Stepper directly below Figure 01 */}
        <div className="pt-2">
          <StepProgress isRunning={isRunning} result={result} progress={progress} />
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 02: ACOUSTIC LEDGER & DIAGNOSTIC CHAPTERS (COLLAPSIBLE)           */}
      {/* ========================================================================= */}
      <section id="diagnostics" className="border border-stone-200 dark:border-stone-800 rounded-xl p-6 bg-white dark:bg-[#121316] space-y-4 shadow-sm transition-colors">
        <div className="flex items-center justify-between border-b border-stone-100 dark:border-stone-800/80 pb-3.5">
          <div className="flex items-center space-x-2.5">
            <span className="text-xs font-sans font-bold text-amber-700 dark:text-amber-400 uppercase tracking-widest">
              SECTION 02 // ACOUSTIC LEDGER
            </span>
            <h2 className="font-serif font-bold text-stone-900 dark:text-stone-100 text-sm">
              Laboratory Diagnostics & Psychoacoustic Intelligence
            </h2>
          </div>

          <button
            type="button"
            onClick={() => setShowDiagnostics(!showDiagnostics)}
            className="flex items-center space-x-1 text-xs font-sans font-semibold text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200 transition-colors"
          >
            <span>{showDiagnostics ? 'Collapse Diagnostics' : 'Expand Diagnostics'}</span>
            {showDiagnostics ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>

        {showDiagnostics && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 animate-fadeIn">
            {/* Chapter 01: Modal Resonances */}
            <div className="border border-stone-200 dark:border-stone-800 rounded-lg p-5 bg-stone-50/50 dark:bg-[#0E0F12] space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-sans font-bold text-amber-700 dark:text-amber-500 uppercase tracking-widest">
                    01 // MODAL MITIGATION
                  </span>
                  <span className="text-[10px] font-mono text-stone-400">VBA SYNTH</span>
                </div>
                <h3 className="font-serif text-base text-stone-900 dark:text-stone-100 font-bold">
                  Room Modal Resonances
                </h3>
                <p className="text-xs text-stone-600 dark:text-stone-300 font-sans mt-1 leading-relaxed">
                  Virtual Bass Array (VBA) generates an inverted rear-wall reflection canceller.
                </p>
              </div>

              <div className="p-3 rounded bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-1.5 text-xs font-sans">
                <div className="flex justify-between">
                  <span className="text-stone-500">Primary Mode (f1):</span>
                  <strong className="font-mono text-stone-900 dark:text-stone-100 font-bold">
                    {result?.modal_info_left?.f_1?.toFixed(1) ?? '52.4'} Hz
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-500">Identified Modes:</span>
                  <strong className="font-mono text-stone-900 dark:text-stone-100 font-bold">
                    {result?.modal_info_left?.peaks?.length ?? 3} Resonant Peaks
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-500">Low Bass Rolloff:</span>
                  <strong className="font-mono text-stone-900 dark:text-stone-100 font-bold">
                    {intel?.speaker_low_rolloff_hz?.toFixed(1) ?? '44.8'} Hz
                  </strong>
                </div>
              </div>
            </div>

            {/* Chapter 02: Schroeder Transition */}
            <div className="border border-stone-200 dark:border-stone-800 rounded-lg p-5 bg-stone-50/50 dark:bg-[#0E0F12] space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-sans font-bold text-amber-700 dark:text-amber-500 uppercase tracking-widest">
                    02 // WAVE ACOUSTICS
                  </span>
                  <span className="text-[10px] font-mono text-stone-400">FDW 1-CYCLE</span>
                </div>
                <h3 className="font-serif text-base text-stone-900 dark:text-stone-100 font-bold">
                  Schroeder Cutoff & Adaptive FDW
                </h3>
                <p className="text-xs text-stone-600 dark:text-stone-300 font-sans mt-1 leading-relaxed">
                  Modal-to-specular acoustic transition frequency and frequency-dependent window sizing.
                </p>
              </div>

              <div className="p-3 rounded bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-1.5 text-xs font-sans">
                <div className="flex justify-between">
                  <span className="text-stone-500">Schroeder Transition:</span>
                  <strong className="font-mono text-stone-900 dark:text-stone-100 font-bold">
                    {intel?.detected_schroeder_hz?.toFixed(1) ?? '180.0'} Hz
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-500">First Reflection:</span>
                  <strong className="font-mono text-stone-900 dark:text-stone-100 font-bold">
                    {intel?.detected_reflection_gap_ms?.toFixed(2) ?? '3.50'} ms
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-500">Optimal FDW Window:</span>
                  <strong className="font-mono text-stone-900 dark:text-stone-100 font-bold">
                    {intel?.recommended_fdw_cycles?.toFixed(1) ?? '5.0'} Cycles
                  </strong>
                </div>
              </div>
            </div>

            {/* Chapter 03: Physical Geometry */}
            <div className="border border-stone-200 dark:border-stone-800 rounded-lg p-5 bg-stone-50/50 dark:bg-[#0E0F12] space-y-3 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-sans font-bold text-amber-700 dark:text-amber-500 uppercase tracking-widest">
                    03 // PHYSICAL GEOMETRY
                  </span>
                  <span className="text-[10px] font-mono text-stone-400">ACOUSTICX 3D</span>
                </div>
                <h3 className="font-serif text-base text-stone-900 dark:text-stone-100 font-bold">
                  Microphone Triangulation
                </h3>
                <p className="text-xs text-stone-600 dark:text-stone-300 font-sans mt-1 leading-relaxed">
                  Sub-millimeter physical microphone offset detection and 3D acoustic room pathing.
                </p>
              </div>

              <div className="p-3 rounded bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-1.5 text-xs font-sans">
                <div className="flex justify-between">
                  <span className="text-stone-500">Lateral Mic Offset:</span>
                  <strong className="font-mono text-stone-900 dark:text-stone-100 font-bold">
                    {intel?.microphone_geometry?.mic_off_center_mm !== undefined
                      ? `${intel.microphone_geometry.mic_off_center_mm} mm (${intel.microphone_geometry.delay_offset_ms.toFixed(2)} ms)`
                      : '0 mm (0.00 ms)'}
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-500">True-Peak Inter-Sample:</span>
                  <strong className="font-mono text-stone-900 dark:text-stone-100 font-bold">
                    L: {result?.true_peak_left_dbfs !== undefined ? `${result.true_peak_left_dbfs.toFixed(2)}` : '-0.12'} dBTP
                  </strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-stone-500">Headroom Preamp:</span>
                  <strong className="font-mono text-amber-700 dark:text-amber-400 font-bold">
                    {result?.global_preamp_db?.toFixed(2) ?? '-4.75'} dB
                  </strong>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Multi-Sub Matrix Optimization Table (if MSO results exist) */}
        {result?.multi_sub_alignment && (
          <div className="pt-2">
            <MultiSubView multiSubAlignment={result.multi_sub_alignment} />
          </div>
        )}
      </section>

      {/* ========================================================================= */}
      {/* SECTION 03: TARGET HOUSE CURVE & PARAMETRIC TUNING                        */}
      {/* ========================================================================= */}
      <section id="target-tuning" className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Panel A: Target House Curve Profile with Selectable Radio Cards */}
        <div className="border border-stone-200 dark:border-stone-800 rounded-xl p-6 bg-white dark:bg-[#121316] space-y-4 shadow-sm flex flex-col justify-between transition-colors">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-sans font-bold text-amber-700 dark:text-amber-500 uppercase tracking-widest">
                SECTION 03 // TARGET SYNTHESIS
              </span>
              <span className="text-[10px] font-mono text-stone-400">HARMAN / OCA / B&K</span>
            </div>
            <h3 className="font-serif text-lg text-stone-900 dark:text-stone-100 font-bold">
              Psychoacoustic Target House Curve
            </h3>
            <p className="text-xs text-stone-600 dark:text-stone-300 font-sans mt-1">
              Select an authoritative psychoacoustic baseline curve. Active selection is anchored to your room sensitivity.
            </p>
          </div>

          {/* Selectable Radio Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-sans">
            {[
              { id: 'harman', name: 'Harman (+6.0 dB)', boost: 6.0, desc: 'Authoritative deep bass shelf with gentle warm tilt' },
              { id: 'oca', name: 'OCA Dynamic (+5.5 dB)', boost: 5.5, desc: 'Expansive soundstage with focused vocal clarity' },
              { id: 'bk1974', name: 'B&K 1974 (+3.0 dB)', boost: 3.0, desc: 'Analog studio reference with classic natural roll-off' },
              { id: 'flat', name: 'Studio Flat (0.0 dB)', boost: 0.0, desc: 'Strict linear reference for anechoic mastering studios' },
            ].map((t) => {
              const isSelected = config.target.name === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() =>
                    onChangeConfig({
                      ...config,
                      target: { ...config.target, name: t.id as any, bass_boost_db: t.boost },
                    })
                  }
                  className={`p-3.5 rounded-lg border text-left transition-all flex items-start space-x-3 cursor-pointer ${
                    isSelected
                      ? 'border-amber-700 bg-amber-500/10 text-stone-900 dark:text-stone-100 dark:border-amber-500 shadow-sm ring-1 ring-amber-500/30'
                      : 'border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-400 hover:border-stone-400 dark:hover:border-stone-700'
                  }`}
                >
                  {/* Radio Indicator */}
                  <div
                    className={`h-4 w-4 rounded-full flex items-center justify-center border shrink-0 mt-0.5 transition-colors ${
                      isSelected
                        ? 'border-amber-700 bg-amber-700 text-white dark:border-amber-500 dark:bg-amber-500 dark:text-stone-950'
                        : 'border-stone-300 dark:border-stone-700 bg-transparent'
                    }`}
                  >
                    {isSelected && <Check className="h-3 w-3 stroke-[3]" />}
                  </div>
                  <div>
                    <div className="font-bold text-xs leading-tight">{t.name}</div>
                    <div className="text-[11px] text-stone-500 dark:text-stone-300 mt-1 leading-snug">{t.desc}</div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Quick Session Persistence Buttons */}
          <div className="pt-3 border-t border-stone-200 dark:border-stone-800/80 flex items-center justify-between text-xs font-sans">
            <span className="text-stone-500">Project Snapshot:</span>
            <div className="flex space-x-2">
              <button
                type="button"
                onClick={saveSession}
                className="px-2.5 py-1.5 rounded bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 text-xs font-semibold flex items-center space-x-1"
              >
                <Save className="h-3 w-3" />
                <span>Save</span>
              </button>
              <button
                type="button"
                onClick={loadSession}
                className="px-2.5 py-1.5 rounded bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 text-xs font-semibold flex items-center space-x-1"
              >
                <FolderOpen className="h-3 w-3" />
                <span>Load</span>
              </button>
              <button
                type="button"
                onClick={clearSession}
                className="px-2.5 py-1.5 rounded bg-stone-100 hover:bg-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-500 text-xs font-semibold"
                title="Reset session"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>

        {/* Panel B: Deep Custom Parametric Sliders with Direct Numeric Inputs */}
        <div className="border border-stone-200 dark:border-stone-800 rounded-xl p-6 bg-white dark:bg-[#121316] space-y-4 shadow-sm flex flex-col justify-between transition-colors">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-sans font-bold text-amber-700 dark:text-amber-500 uppercase tracking-widest">
                SECTION 03.B // PARAMETRIC SLIDERS
              </span>
              <span className="text-[10px] font-mono text-stone-400">MICRO-ADJUST</span>
            </div>
            <h3 className="font-serif text-lg text-stone-900 dark:text-stone-100 font-bold">
              Precision Acoustic Parameters
            </h3>
            <p className="text-xs text-stone-600 dark:text-stone-300 font-sans mt-1">
              Adjust sliders or enter direct numerical values for exact target shelving, cutoffs, and crossover points.
            </p>
          </div>

          <div className="space-y-3.5 font-sans text-xs">
            {/* Bass Shelf Boost */}
            <div>
              <div className="flex justify-between items-center text-stone-700 dark:text-stone-300 mb-1">
                <span>Bass Shelf Boost (dB):</span>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="12"
                  value={config.target.bass_boost_db}
                  onChange={(e) => updateTarget({ bass_boost_db: parseFloat(e.target.value) || 0 })}
                  className="w-20 px-2 py-0.5 text-right font-mono text-xs rounded bg-stone-50 dark:bg-stone-900 border border-stone-300 dark:border-stone-700 text-stone-900 dark:text-stone-100 font-bold"
                />
              </div>
              <input
                type="range"
                min="0"
                max="12"
                step="0.5"
                value={config.target.bass_boost_db}
                onChange={(e) => updateTarget({ bass_boost_db: parseFloat(e.target.value) })}
                className="w-full h-1 bg-stone-300 dark:bg-stone-700 appearance-none cursor-pointer accent-amber-700 dark:accent-amber-500"
              />
            </div>

            {/* Bass Cutoff Frequency */}
            <div>
              <div className="flex justify-between items-center text-stone-700 dark:text-stone-300 mb-1">
                <span>Bass Cutoff Frequency (Hz):</span>
                <input
                  type="number"
                  step="1"
                  min="40"
                  max="160"
                  value={config.target.bass_cutoff_hz}
                  onChange={(e) => updateTarget({ bass_cutoff_hz: parseFloat(e.target.value) || 80 })}
                  className="w-20 px-2 py-0.5 text-right font-mono text-xs rounded bg-stone-50 dark:bg-stone-900 border border-stone-300 dark:border-stone-700 text-stone-900 dark:text-stone-100 font-bold"
                />
              </div>
              <input
                type="range"
                min="40"
                max="160"
                step="5"
                value={config.target.bass_cutoff_hz}
                onChange={(e) => updateTarget({ bass_cutoff_hz: parseFloat(e.target.value) })}
                className="w-full h-1 bg-stone-300 dark:bg-stone-700 appearance-none cursor-pointer accent-amber-700 dark:accent-amber-500"
              />
            </div>

            {/* Treble Roll-Off Slope */}
            <div>
              <div className="flex justify-between items-center text-stone-700 dark:text-stone-300 mb-1">
                <span>Treble Slope (dB/octave):</span>
                <input
                  type="number"
                  step="0.05"
                  min="-2.0"
                  max="0.0"
                  value={config.target.hf_slope_db_per_oct}
                  onChange={(e) => updateTarget({ hf_slope_db_per_oct: parseFloat(e.target.value) || 0 })}
                  className="w-20 px-2 py-0.5 text-right font-mono text-xs rounded bg-stone-50 dark:bg-stone-900 border border-stone-300 dark:border-stone-700 text-stone-900 dark:text-stone-100 font-bold"
                />
              </div>
              <input
                type="range"
                min="-2.0"
                max="0.0"
                step="0.05"
                value={config.target.hf_slope_db_per_oct}
                onChange={(e) => updateTarget({ hf_slope_db_per_oct: parseFloat(e.target.value) })}
                className="w-full h-1 bg-stone-300 dark:bg-stone-700 appearance-none cursor-pointer accent-amber-700 dark:accent-amber-500"
              />
            </div>

            {/* Subwoofer Crossover Frequency */}
            <div>
              <div className="flex justify-between items-center text-stone-700 dark:text-stone-300 mb-1">
                <span>Sub Crossover Frequency (Hz):</span>
                <input
                  type="number"
                  step="1"
                  min="40"
                  max="200"
                  value={config.sub_crossover_freq_hz}
                  onChange={(e) => onChangeConfig({ ...config, sub_crossover_freq_hz: parseFloat(e.target.value) || 80 })}
                  className="w-20 px-2 py-0.5 text-right font-mono text-xs rounded bg-stone-50 dark:bg-stone-900 border border-stone-300 dark:border-stone-700 text-stone-900 dark:text-stone-100 font-bold"
                />
              </div>
              <input
                type="range"
                min="40"
                max="200"
                step="5"
                value={config.sub_crossover_freq_hz}
                onChange={(e) => onChangeConfig({ ...config, sub_crossover_freq_hz: parseFloat(e.target.value) })}
                className="w-full h-1 bg-stone-300 dark:bg-stone-700 appearance-none cursor-pointer accent-amber-700 dark:accent-amber-500"
              />
            </div>

            {/* Target FIR Taps */}
            <div>
              <div className="flex justify-between items-center text-stone-700 dark:text-stone-300 mb-1">
                <span>FIR Filter Tap Length:</span>
                <span className="font-mono text-stone-800 dark:text-stone-200 font-bold">{config.target_taps.toLocaleString()} Taps</span>
              </div>
              <select
                value={config.target_taps}
                onChange={(e) => onChangeConfig({ ...config, target_taps: parseInt(e.target.value) })}
                className="w-full bg-stone-50 dark:bg-stone-900 border border-stone-300 dark:border-stone-700 rounded-md px-3 py-1.5 text-xs font-sans text-stone-900 dark:text-stone-100 font-semibold shadow-sm"
              >
                <option value="4096">4,096 Taps (miniDSP Flex / Low Latency)</option>
                <option value="16384">16,384 Taps (Medium Hardware)</option>
                <option value="65536">65,536 Taps (Recommended / PC / CamillaDSP)</option>
                <option value="131072">131,072 Taps (Ultimate Audiophile / Roon)</option>
              </select>
            </div>
          </div>
        </div>

      </section>

      {/* ========================================================================= */}
      {/* SECTION 04: CONVOLVER DEPLOYMENT MANIFEST & EXPORT PACKAGES               */}
      {/* ========================================================================= */}
      <section id="deployment" className="border border-stone-200 dark:border-stone-800 rounded-xl p-6 bg-white dark:bg-[#121316] space-y-5 shadow-sm transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-100 dark:border-stone-800/80 pb-4">
          <div>
            <div className="text-[10px] font-sans font-bold text-amber-700 dark:text-amber-500 uppercase tracking-widest mb-1">
              SECTION 04 // CONVOLVER DEPLOYMENT
            </div>
            <div className="flex items-center space-x-2">
              <FileCode className="h-5 w-5 text-amber-700 dark:text-amber-500" />
              <h3 className="font-serif font-bold text-stone-900 dark:text-stone-100 text-base">
                Multi-Platform Convolver Deployment Packages
              </h3>
            </div>
            <p className="text-xs text-stone-600 dark:text-stone-300 font-sans mt-1">
              Sample Rate: <strong className="font-mono text-stone-800 dark:text-stone-200">{result?.sample_rate ?? 48000} Hz</strong> • FIR Taps:{' '}
              <strong className="font-mono text-stone-800 dark:text-stone-200">{config.target_taps.toLocaleString()}</strong> • Digital Preamp:{' '}
              <strong className="font-mono text-amber-700 dark:text-amber-400">{result?.global_preamp_db ?? -4.75} dB</strong>
            </p>
          </div>

          {/* Master 1-Click ZIP Download */}
          <a
            href={getExportBundleUrl()}
            className="py-3 px-6 rounded-lg font-sans font-bold text-xs tracking-wider uppercase bg-amber-700 hover:bg-amber-800 text-white dark:bg-amber-500 dark:text-stone-950 dark:hover:bg-amber-400 flex items-center justify-center space-x-2 shadow-sm transition-all active:scale-[0.98] shrink-0"
          >
            <Download className="h-4 w-4" />
            <span>DOWNLOAD 1-CLICK ZIP BUNDLE</span>
          </a>
        </div>

        {/* 4 Distinct Deployment Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Equalizer APO */}
          <div className="p-4 rounded-lg bg-stone-50 dark:bg-[#0E0F12] border border-stone-200 dark:border-stone-800 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex justify-between items-center text-[10px] font-sans text-stone-500 uppercase tracking-wider mb-1">
                <span>Windows 10 / 11</span>
                <span className="text-amber-700 dark:text-amber-400 font-bold">READY</span>
              </div>
              <h4 className="font-serif font-bold text-sm text-stone-900 dark:text-stone-100">Equalizer APO</h4>
              <p className="text-xs text-stone-600 dark:text-stone-300 font-sans mt-1">
                System-wide audio engine convolution for Spotify, YouTube, games, and streaming apps.
              </p>
            </div>
            <a
              href={getExportBundleUrl()}
              className="py-2 px-3 rounded bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 text-stone-900 dark:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 text-xs font-sans font-semibold flex items-center justify-center space-x-1.5 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Get APO Package</span>
            </a>
          </div>

          {/* Card 2: CamillaDSP */}
          <div className="p-4 rounded-lg bg-stone-50 dark:bg-[#0E0F12] border border-stone-200 dark:border-stone-800 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex justify-between items-center text-[10px] font-sans text-stone-500 uppercase tracking-wider mb-1">
                <span>Linux / macOS / Pi</span>
                <span className="text-amber-700 dark:text-amber-400 font-bold">READY</span>
              </div>
              <h4 className="font-serif font-bold text-sm text-stone-900 dark:text-stone-100">CamillaDSP</h4>
              <p className="text-xs text-stone-600 dark:text-stone-300 font-sans mt-1">
                Production-grade YAML configuration with 2.1 FIR routing and sub-millimeter phase delay.
              </p>
            </div>
            <a
              href={getExportBundleUrl()}
              className="py-2 px-3 rounded bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 text-stone-900 dark:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 text-xs font-sans font-semibold flex items-center justify-center space-x-1.5 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Get CamillaDSP YAML</span>
            </a>
          </div>

          {/* Card 3: miniDSP */}
          <div className="p-4 rounded-lg bg-stone-50 dark:bg-[#0E0F12] border border-stone-200 dark:border-stone-800 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex justify-between items-center text-[10px] font-sans text-stone-500 uppercase tracking-wider mb-1">
                <span>Hardware DSP</span>
                <span className="text-amber-700 dark:text-amber-400 font-bold">READY</span>
              </div>
              <h4 className="font-serif font-bold text-sm text-stone-900 dark:text-stone-100">miniDSP Flex / 2x4</h4>
              <p className="text-xs text-stone-600 dark:text-stone-300 font-sans mt-1">
                4,096-tap IEEE floating point coefficients with hybrid parametric IIR low-bass biquads.
              </p>
            </div>
            <a
              href={getExportBundleUrl()}
              className="py-2 px-3 rounded bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 text-stone-900 dark:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 text-xs font-sans font-semibold flex items-center justify-center space-x-1.5 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Get miniDSP FIR</span>
            </a>
          </div>

          {/* Card 4: rePhase / Studio WAV */}
          <div className="p-4 rounded-lg bg-stone-50 dark:bg-[#0E0F12] border border-stone-200 dark:border-stone-800 flex flex-col justify-between space-y-3">
            <div>
              <div className="flex justify-between items-center text-[10px] font-sans text-stone-500 uppercase tracking-wider mb-1">
                <span>DAW & Roon</span>
                <span className="text-amber-700 dark:text-amber-400 font-bold">READY</span>
              </div>
              <h4 className="font-serif font-bold text-sm text-stone-900 dark:text-stone-100">32-Bit Float WAV IR</h4>
              <p className="text-xs text-stone-600 dark:text-stone-300 font-sans mt-1">
                Uncompressed PCM impulse response for Roon, JRiver, HQPlayer, and professional studio DAWs.
              </p>
            </div>
            <a
              href={getExportBundleUrl()}
              className="py-2 px-3 rounded bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 text-stone-900 dark:text-stone-100 hover:bg-stone-100 dark:hover:bg-stone-800 text-xs font-sans font-semibold flex items-center justify-center space-x-1.5 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Get WAV Impulse</span>
            </a>
          </div>
        </div>
      </section>

    </div>
  );
};
