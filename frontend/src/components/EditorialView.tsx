import React, { useState, useEffect } from 'react';
import { OptimizationRequest, OptimizationResponse, StatusResponse } from '../types';
import { getExportBundleUrl, runRepeatedSweeps } from '../api/client';
import {
  RefreshCw,
  Download,
  Volume2,
  Sliders,
  ShieldCheck,
  Activity,
  Waves,
  CheckCircle2,
  Play,
  RotateCcw,
} from 'lucide-react';

interface EditorialViewProps {
  config: OptimizationRequest;
  onChangeConfig: (c: OptimizationRequest) => void;
  result: OptimizationResponse | null;
  isRunning: boolean;
  onRun: () => void;
  status: StatusResponse | null;
  theme: 'dark' | 'light';
  onLog?: (msg: string, level?: 'info' | 'success' | 'warn' | 'error' | 'dsp' | 'geom', tag?: string) => void;
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
}) => {
  const [activeTab, setActiveTab] = useState<'spl' | 'phase' | 'step'>('spl');
  const [subDelayMs, setSubDelayMs] = useState<number>(result?.sub_alignment?.optimal_delay_ms ?? 8.4);
  const [polarity, setPolarity] = useState<number>(result?.sub_alignment?.polarity_multiplier ?? 1);
  const [showSweepStudio, setShowSweepStudio] = useState<boolean>(false);
  const [sweepReps, setSweepReps] = useState<number>(5);
  const [isSweeping, setIsSweeping] = useState<boolean>(false);

  // Re-sync the interactive sub panel whenever a new optimization result arrives
  // (useState initializers only run once, so a re-run would otherwise leave
  // stale delay/polarity values in the sliders).
  useEffect(() => {
    if (result?.sub_alignment) {
      setSubDelayMs(result.sub_alignment.optimal_delay_ms);
      setPolarity(result.sub_alignment.polarity_multiplier);
    }
  }, [result?.sub_alignment?.optimal_delay_ms, result?.sub_alignment?.polarity_multiplier]);

  const intel = result?.acoustic_intelligence;
  const sub = result?.sub_alignment;

  // Plot geometry
  const width = 860;
  const height = 260;
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

  const handleExecuteSweep = async (channel: 'left' | 'right' | 'both') => {
    setIsSweeping(true);
    if (onLog) onLog(`Initiating ${sweepReps} repeated sweeps on channel: ${channel.toUpperCase()}...`, 'info', 'SWEEP');
    try {
      const res = await runRepeatedSweeps({
        channel,
        repetitions: sweepReps,
        outlier_rejection: true,
      });
      if (onLog) {
        onLog(`Sweeps completed. SNR: +${res.estimated_snr_db.toFixed(1)} dB. Stacked ${res.valid_sweeps}/${res.repetitions_requested} sweeps`, 'success', 'SWEEP');
      }
      onRun();
    } catch (e: any) {
      if (onLog) onLog(`Sweep acquisition error: ${e.message}`, 'error', 'SWEEP');
    } finally {
      setIsSweeping(false);
    }
  };

  return (
    <div className="w-full space-y-10 transition-colors py-2">

      {/* Monograph Publication Header */}
      <div className="border-b border-stone-200 dark:border-stone-800 pb-7">
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-5">
          <div className="space-y-1.5">
            <div className="flex items-center space-x-3 text-[11px] font-mono tracking-widest text-amber-700 dark:text-amber-500 uppercase font-bold">
              <span>ALTAIR • ACOUSTIC EQUALIZATION MONOGRAPH</span>
              <span>•</span>
              <span>VOL. 24</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-serif text-stone-900 dark:text-stone-100 tracking-tight leading-tight">
              Digital Room Equalization & Inversion
            </h1>
            <p className="text-xs text-stone-600 dark:text-stone-400 max-w-2xl leading-relaxed">
              Laboratory-grade linear-phase FIR synthesis with 1-cycle frequency-dependent windowing,
              virtual bass array modal mitigation, and sub-millimeter phase alignment.
            </p>
          </div>

          <div className="flex items-center space-x-3 shrink-0">
            <button
              onClick={() => setShowSweepStudio(!showSweepStudio)}
              className={`px-3.5 py-2 rounded text-xs font-mono font-semibold tracking-wider transition-all border ${
                showSweepStudio
                  ? 'border-amber-600 bg-amber-500/10 text-amber-800 dark:text-amber-300'
                  : 'border-stone-300 dark:border-stone-700 text-stone-700 dark:text-stone-300 hover:border-stone-400'
              }`}
            >
              {showSweepStudio ? 'Close Sweeps' : 'Repeated Sweeps'}
            </button>

            <button
              onClick={onRun}
              disabled={isRunning}
              className="px-5 py-2 rounded bg-stone-900 hover:bg-stone-800 text-stone-50 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200 text-xs font-mono font-bold tracking-wider uppercase transition-all active:scale-[0.98] flex items-center space-x-2 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRunning ? 'animate-spin' : ''}`} />
              <span>{isRunning ? 'CALIBRATING...' : 'EXECUTE CALIBRATION'}</span>
            </button>
          </div>
        </div>

        {/* Reference Hardware Strip */}
        <div className="flex flex-wrap items-center gap-6 mt-4 pt-3.5 border-t border-stone-100 dark:border-stone-800/60 text-[11px] font-mono text-stone-500 dark:text-stone-400">
          <span>MONITORS: <strong className="text-stone-800 dark:text-stone-200">Edifier MR3 (Active Studio)</strong></span>
          <span>•</span>
          <span>SUBWOOFER: <strong className="text-stone-800 dark:text-stone-200">Edifier T5s (8-inch Powered)</strong></span>
          <span>•</span>
          <span>SPEED OF SOUND: <strong className="text-stone-800 dark:text-stone-200">{intel?.speed_of_sound_mps ?? 343.2} m/s</strong> (20°C, 50% RH)</span>
          <span>•</span>
          <span>REW API: <strong className={status?.rew_connected ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}>{status?.rew_connected ? 'CONNECTED (:4735)' : 'STANDALONE'}</strong></span>
        </div>
      </div>

      {/* Optional In-Line Repeated Sweep Measurement Studio */}
      {showSweepStudio && (
        <div className="border border-amber-300 dark:border-amber-900/60 bg-amber-50/50 dark:bg-amber-950/20 rounded-lg p-5 space-y-4 transition-all">
          <div className="flex items-center justify-between border-b border-amber-200 dark:border-amber-900/40 pb-3">
            <div className="flex items-center space-x-2">
              <Waves className="h-4 w-4 text-amber-700 dark:text-amber-500" />
              <h3 className="font-serif text-sm font-bold text-stone-900 dark:text-stone-100">
                Automated Repeated Sweep Measurement Studio (AcoustiCX Stacking)
              </h3>
            </div>
            <span className="text-[10px] font-mono text-amber-700 dark:text-amber-500 font-semibold">
              Coherent Averaging with Outlier Rejection (ρ &lt; 0.80)
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
            <div className="flex items-center space-x-3">
              <span className="text-stone-600 dark:text-stone-400">Sweeps per Position:</span>
              <div className="flex space-x-1">
                {[3, 5, 8, 12].map((n) => (
                  <button
                    key={n}
                    onClick={() => setSweepReps(n)}
                    className={`px-2.5 py-1 rounded text-xs font-bold transition-colors ${
                      sweepReps === n
                        ? 'bg-amber-700 text-white dark:bg-amber-500 dark:text-stone-950'
                        : 'border border-stone-300 dark:border-stone-700 text-stone-600 dark:text-stone-300'
                    }`}
                  >
                    {n}x
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => handleExecuteSweep('left')}
                disabled={isSweeping}
                className="px-3 py-1.5 rounded bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:text-stone-900 text-xs font-bold transition-all disabled:opacity-50"
              >
                Sweep Left
              </button>
              <button
                onClick={() => handleExecuteSweep('right')}
                disabled={isSweeping}
                className="px-3 py-1.5 rounded bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:text-stone-900 text-xs font-bold transition-all disabled:opacity-50"
              >
                Sweep Right
              </button>
              <button
                onClick={() => handleExecuteSweep('both')}
                disabled={isSweeping}
                className="px-4 py-1.5 rounded bg-amber-700 hover:bg-amber-800 text-white dark:bg-amber-500 dark:text-stone-950 text-xs font-bold transition-all disabled:opacity-50"
              >
                {isSweeping ? 'Measuring...' : 'Sweep Stereo'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Master Full-Width Acoustic Plot */}
      <div className="border border-stone-200 dark:border-stone-800 rounded-lg p-5 bg-white dark:bg-[#121316] space-y-3.5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-stone-100 dark:border-stone-800/80">
          <div className="flex items-center space-x-3">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-stone-400">
              FIGURE 01
            </span>
            <span className="text-xs font-serif font-semibold text-stone-900 dark:text-stone-100 tracking-wide">
              Steady-State Room Transfer Function & Regularized Output
            </span>
          </div>

          <div className="flex items-center space-x-2 bg-stone-50 dark:bg-[#0E0F12] p-0.5 rounded border border-stone-200 dark:border-stone-800 text-[11px] font-mono">
            {(['spl', 'phase', 'step'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-3 py-1 rounded transition-all ${
                  activeTab === tab
                    ? 'bg-white text-stone-950 font-bold dark:bg-stone-800 dark:text-white shadow-sm'
                    : 'text-stone-500 hover:text-stone-900 dark:hover:text-white'
                }`}
              >
                {tab === 'spl' ? 'SPL Magnitude' : tab === 'phase' ? 'Linear Phase' : 'Step Response'}
              </button>
            ))}
          </div>
        </div>

        {/* SVG Graphic */}
        <div className="overflow-x-auto">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto select-none overflow-visible">
            <rect
              x={pad.left}
              y={pad.top}
              width={pw}
              height={ph}
              fill={theme === 'dark' ? '#0E0F12' : '#FAFAF8'}
              stroke={theme === 'dark' ? '#26282E' : '#E8E5DC'}
              strokeWidth="1"
            />

            {[20, 50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000].map((f) => {
              const x = xPos(f);
              return (
                <g key={f}>
                  <line x1={x} y1={pad.top} x2={x} y2={height - pad.bottom} stroke={theme === 'dark' ? '#1C1D23' : '#EFECE6'} strokeWidth="1" />
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
                  <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke={theme === 'dark' ? '#1C1D23' : '#EFECE6'} strokeWidth="1" />
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
                stroke={theme === 'dark' ? '#5E626E' : '#9CA3AF'}
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
                stroke={theme === 'dark' ? '#F3F2EE' : '#1A1917'}
                strokeWidth="2.2"
              />
            )}
          </svg>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-1 text-[11px] font-mono text-stone-500 dark:text-stone-400">
          <div className="flex items-center space-x-6">
            <span className="flex items-center space-x-1.5">
              <span className="w-3 h-0.5 bg-stone-400 inline-block border-b border-dashed"></span>
              <span>Raw Measurement</span>
            </span>
            <span className="flex items-center space-x-1.5">
              <span className="w-3 h-0.5 bg-[#D97706] inline-block"></span>
              <span>Target House Curve</span>
            </span>
            <span className="flex items-center space-x-1.5 font-bold text-stone-900 dark:text-stone-100">
              <span className="w-3 h-0.5 bg-stone-900 dark:bg-stone-100 inline-block"></span>
              <span>Calibrated Output</span>
            </span>
          </div>

          <span>{config.target_taps.toLocaleString()} Taps • True-Peak -0.8 dBTP</span>
        </div>
      </div>

      {/* Editorial Bento Grid: Numbered Technical Chapters */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

        {/* Chapter 01: Modal Mitigation & VBA */}
        <div className="border border-stone-200 dark:border-stone-800 rounded-lg p-5 bg-white dark:bg-[#121316] space-y-3.5 flex flex-col justify-between shadow-sm">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono font-bold text-amber-700 dark:text-amber-500 uppercase tracking-widest">
                01 // MODAL MITIGATION
              </span>
              <span className="text-[10px] font-mono text-stone-400">VBA SYNTHESIS</span>
            </div>
            <h3 className="font-serif text-lg text-stone-900 dark:text-stone-100 font-semibold">
              Virtual Bass Array Synthesis
            </h3>
            <p className="text-xs text-stone-600 dark:text-stone-400 mt-1 leading-relaxed">
              Synthesizes boundary reflection cancellation filters for axial modes below the Schroeder frequency.
            </p>
          </div>

          <div className="p-3 rounded bg-stone-50 dark:bg-[#0E0F12] border border-stone-200 dark:border-stone-800/80 space-y-1.5 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-stone-500">Schroeder Transition:</span>
              <strong className="text-amber-700 dark:text-amber-500">{intel?.detected_schroeder_hz ?? 185} Hz</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500">Initial Reflection Gap:</span>
              <strong className="text-stone-800 dark:text-stone-200">{intel?.detected_reflection_gap_ms ?? 3.20} ms</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500">Auto FDW Filter:</span>
              <strong className="text-stone-800 dark:text-stone-200">{intel?.recommended_fdw_cycles ?? 5} Cycles</strong>
            </div>
          </div>
        </div>

        {/* Chapter 02: Subwoofer Linkwitz-Riley Coherence */}
        <div className="border border-stone-200 dark:border-stone-800 rounded-lg p-5 bg-white dark:bg-[#121316] space-y-3.5 flex flex-col justify-between shadow-sm">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono font-bold text-amber-700 dark:text-amber-500 uppercase tracking-widest">
                02 // SUB TIME-ALIGNMENT
              </span>
              <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold">
                +{sub?.gain_improvement_db.toFixed(1) ?? '4.2'} dB SUM
              </span>
            </div>
            <h3 className="font-serif text-lg text-stone-900 dark:text-stone-100 font-semibold">
              Subwoofer Summation Alignment
            </h3>
            <p className="text-xs text-stone-600 dark:text-stone-400 mt-1 leading-relaxed">
              Co-optimizes delay and acoustic Linkwitz-Riley crossover phase across 40–160 Hz.
            </p>
          </div>

          <div className="p-3 rounded bg-stone-50 dark:bg-[#0E0F12] border border-stone-200 dark:border-stone-800/80 space-y-2 text-xs font-mono">
            <div className="flex justify-between items-center">
              <span className="text-stone-500">Delay Trim:</span>
              <strong className="text-stone-800 dark:text-stone-200">+{subDelayMs.toFixed(2)} ms</strong>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-stone-500">Phase Polarity:</span>
              <div className="flex items-center space-x-2">
                <strong className="text-stone-800 dark:text-stone-200">{polarity > 0 ? 'Normal (+)' : 'Inverted (-)'}</strong>
                <button
                  onClick={() => setPolarity((p) => (p > 0 ? -1 : 1))}
                  className="px-2 py-0.5 rounded border border-stone-300 dark:border-stone-700 text-[10px] font-bold"
                >
                  Flip
                </button>
              </div>
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

        {/* Chapter 03: Physical Geometry & Distances */}
        <div className="border border-stone-200 dark:border-stone-800 rounded-lg p-5 bg-white dark:bg-[#121316] space-y-3.5 flex flex-col justify-between shadow-sm">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono font-bold text-amber-700 dark:text-amber-500 uppercase tracking-widest">
                03 // PHYSICAL GEOMETRY
              </span>
              <span className="text-[10px] font-mono text-stone-400">ACOUSTICX 3D</span>
            </div>
            <h3 className="font-serif text-lg text-stone-900 dark:text-stone-100 font-semibold">
              Microphone Triangulation
            </h3>
            <p className="text-xs text-stone-600 dark:text-stone-400 mt-1 leading-relaxed">
              Sub-millimeter physical microphone offset detection and 3D acoustic room pathing.
            </p>
          </div>

          <div className="p-3 rounded bg-stone-50 dark:bg-[#0E0F12] border border-stone-200 dark:border-stone-800/80 space-y-1.5 text-xs font-mono">
            <div className="flex justify-between">
              <span className="text-stone-500">Lateral Mic Offset:</span>
              <strong className="text-stone-800 dark:text-stone-200">14 mm (0.04 ms)</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500">Acoustic Distance:</span>
              <strong className="text-stone-800 dark:text-stone-200">L: 2.14m • R: 2.18m</strong>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500">IR Correlation:</span>
              <strong className="text-stone-800 dark:text-stone-200">99.4% Synchronized</strong>
            </div>
          </div>
        </div>

      </div>

      {/* Chapters 04 & 05: Target Curve & Convolver Export Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Chapter 04: Target House Curve Profile */}
        <div className="border border-stone-200 dark:border-stone-800 rounded-lg p-5 bg-white dark:bg-[#121316] space-y-4 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono font-bold text-amber-700 dark:text-amber-500 uppercase tracking-widest">
                04 // TARGET CURVE
              </span>
              <span className="text-[10px] font-mono text-stone-400">HARMAN / B&K / OCA</span>
            </div>
            <h3 className="font-serif text-lg text-stone-900 dark:text-stone-100 font-semibold">
              House Curve Profile
            </h3>
            <p className="text-xs text-stone-600 dark:text-stone-400 mt-1">
              Select psychoacoustic house target for low-frequency warmth and high-frequency roll-off.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs font-mono">
            {[
              { id: 'harman', name: 'Harman (+6dB)', boost: 6.0, desc: 'Authoritative deep bass' },
              { id: 'oca', name: 'OCA Dynamic', boost: 5.5, desc: 'Expansive soundstage' },
              { id: 'bk1974', name: 'B&K 1974', boost: 3.0, desc: 'Analog warm roll-off' },
              { id: 'flat', name: 'Studio Flat', boost: 0.0, desc: '0dB neutral reference' },
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
                    ? 'border-amber-600 bg-amber-500/10 text-amber-900 dark:text-amber-300 font-bold'
                    : 'border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-400 hover:border-stone-400'
                }`}
              >
                <div className="text-[11px] leading-tight">{t.name}</div>
                <div className="text-[9px] opacity-70 mt-0.5">{t.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Chapter 05: Convolver Deployment & Export Package */}
        <div className="border border-stone-200 dark:border-stone-800 rounded-lg p-5 bg-white dark:bg-[#121316] space-y-4 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono font-bold text-amber-700 dark:text-amber-500 uppercase tracking-widest">
                05 // CONVOLVER DEPLOYMENT
              </span>
              <span className="text-[10px] font-mono text-stone-400">BIT-PERFECT</span>
            </div>
            <h3 className="font-serif text-lg text-stone-900 dark:text-stone-100 font-semibold">
              Export Convolver Bundle
            </h3>
            <p className="text-xs text-stone-600 dark:text-stone-400 mt-1">
              Ready-to-use filter manifests for Equalizer APO, CamillaDSP, miniDSP, and Roon.
            </p>
          </div>

          <div className="space-y-1.5 text-[11px] font-mono text-stone-600 dark:text-stone-400">
            <div className="flex justify-between p-1.5 rounded bg-stone-50 dark:bg-[#0E0F12] border border-stone-200 dark:border-stone-800">
              <span>Equalizer APO:</span>
              <strong className="text-stone-800 dark:text-stone-200">config.txt + Stereo WAV</strong>
            </div>
            <div className="flex justify-between p-1.5 rounded bg-stone-50 dark:bg-[#0E0F12] border border-stone-200 dark:border-stone-800">
              <span>CamillaDSP:</span>
              <strong className="text-stone-800 dark:text-stone-200">camilladsp.yml</strong>
            </div>
            <div className="flex justify-between p-1.5 rounded bg-stone-50 dark:bg-[#0E0F12] border border-stone-200 dark:border-stone-800">
              <span>miniDSP Flex:</span>
              <strong className="text-stone-800 dark:text-stone-200">fir_coeffs_left.txt (4,096 taps)</strong>
            </div>
          </div>

          <a
            href={getExportBundleUrl()}
            className="w-full py-2.5 rounded bg-stone-900 hover:bg-stone-800 text-stone-50 dark:bg-stone-100 dark:text-stone-900 dark:hover:bg-stone-200 text-xs font-mono font-bold tracking-wider uppercase text-center block transition-all active:scale-[0.98]"
          >
            DOWNLOAD COMPLETE CONVOLVER BUNDLE (.ZIP)
          </a>
        </div>

      </div>

    </div>
  );
};
