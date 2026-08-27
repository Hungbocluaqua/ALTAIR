import React, { useState, useEffect, useRef } from 'react';
import { OptimizationRequest, OptimizationResponse, StatusResponse, TargetCurveConfig, SessionStatus, ProgressEvent } from '../types';
import {
  getExportBundleUrl,
  simulateSubDelay,
  uploadMeasurementFile,
  uploadRepeatedMeasurementFiles,
  uploadMultiSeatMeasurementFiles,
  uploadMultiSubMeasurementFiles,
  uploadCalFile,
  triggerAutoRepeatedSweep,
  getSessionStatus,
  saveSession,
  loadSession,
  clearSession,
} from '../api/client';
import {
  RefreshCw,
  Download,
  Volume2,
  Sliders,
  ShieldCheck,
  Activity,
  Waves,
  CheckCircle2,
  PlayCircle,
  Zap,
  Upload,
  Music,
  Settings2,
  ArrowRightLeft,
  Radio,
  FileCode,
  Check,
  Boxes,
  Thermometer,
  Wind,
  Eye,
  EyeOff,
  Save,
  FolderOpen,
  Trash2,
  Sparkles,
} from 'lucide-react';
import { MultiSubView } from './MultiSubView';

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
}) => {
  // Transfer Figure tabs & curve visibility
  const [activePlotTab, setActivePlotTab] = useState<'spl' | 'phase' | 'step' | 'sub'>('spl');
  const [showBefore, setShowBefore] = useState(true);
  const [showTarget, setShowTarget] = useState(true);
  const [showFilter, setShowFilter] = useState(true);
  const [showAfter, setShowAfter] = useState(true);

  // Subwoofer alignment state
  const [subDelayMs, setSubDelayMs] = useState<number>(result?.sub_alignment?.optimal_delay_ms ?? 0);
  const [polarity, setPolarity] = useState<number>(result?.sub_alignment?.polarity_multiplier ?? 1);
  const debounceSubRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Automated Repeated Sweep State
  const [autoRepetitions, setAutoRepetitions] = useState<number>(4);
  const [isMeasuringAuto, setIsMeasuringAuto] = useState<boolean>(false);
  const [autoProgressText, setAutoProgressText] = useState<string | null>(null);
  const [autoSweepResult, setAutoSweepResult] = useState<any>(null);

  // Measurement File Ingestion State
  const fileLeftRef = useRef<HTMLInputElement>(null);
  const fileRightRef = useRef<HTMLInputElement>(null);
  const fileSubRef = useRef<HTMLInputElement>(null);
  const calFileRef = useRef<HTMLInputElement>(null);
  const multiSubRef = useRef<HTMLInputElement>(null);
  const [measurementMode, setMeasurementMode] = useState<'single' | 'repeated' | 'multi_seat'>('repeated');
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [calStatus, setCalStatus] = useState<string | null>(null);
  const [multiSubStatus, setMultiSubStatus] = useState<string | null>(null);
  const [sessionInfo, setSessionInfo] = useState<SessionStatus | null>(null);

  // Synchronize state when new results arrive
  useEffect(() => {
    if (result?.sub_alignment) {
      setSubDelayMs(result.sub_alignment.optimal_delay_ms);
      setPolarity(result.sub_alignment.polarity_multiplier);
    }
  }, [result?.sub_alignment?.optimal_delay_ms, result?.sub_alignment?.polarity_multiplier]);

  // Subwoofer simulation runner
  const runSubSimulation = async (val: number, pol: number) => {
    if (!result?.sub_alignment) return;
    try {
      const res = await simulateSubDelay(val, pol, result.sub_alignment.crossover_freq_hz);
      if (res.spl_sum_db && result.sub_alignment) {
        result.sub_alignment.spl_aligned_db = res.spl_sum_db;
      }
    } catch (e) {
      console.error('Subwoofer simulation error:', e);
    }
  };

  const handleSubSlider = (val: number) => {
    setSubDelayMs(val);
    if (debounceSubRef.current) clearTimeout(debounceSubRef.current);
    debounceSubRef.current = setTimeout(() => {
      runSubSimulation(val, polarity);
    }, 40);
  };

  const togglePolarity = () => {
    const nextPol = polarity > 0 ? -1.0 : 1.0;
    setPolarity(nextPol);
    runSubSimulation(subDelayMs, nextPol);
  };

  const resetToOptimalSub = () => {
    if (!result?.sub_alignment) return;
    setSubDelayMs(result.sub_alignment.optimal_delay_ms);
    setPolarity(result.sub_alignment.polarity_multiplier);
    runSubSimulation(result.sub_alignment.optimal_delay_ms, result.sub_alignment.polarity_multiplier);
  };

  // Automated Repeated Sweep Trigger
  const handleAutoMeasure = async (channel: string) => {
    setIsMeasuringAuto(true);
    const chLabel = channel === 'all' ? 'FULL 2.1 SYSTEM (Mains + Sub)' : channel.toUpperCase();
    setAutoProgressText(`⏳ Firing automated ${autoRepetitions}x coherent sweeps for ${chLabel}...`);
    onLog?.(`Triggered automated ${autoRepetitions}x repeated sweeps for ${chLabel}...`, 'info', 'SWEEP');

    try {
      const res = await triggerAutoRepeatedSweep(channel, autoRepetitions, 48000, !status?.rew_connected);
      setAutoSweepResult(res);
      setAutoProgressText(`✅ ${chLabel} completed: ${res.status} (+${res.snr_improvement_db} dB SNR boost)`);
      onLog?.(`Completed repeated sweeps for ${chLabel} (+${res.snr_improvement_db} dB SNR boost)`, 'success', 'SWEEP');
      onChangeConfig({ ...config, use_demo_measurements: false });
    } catch (err: any) {
      setAutoProgressText(`❌ Error: ${err.message}`);
      onLog?.(`Auto-sweep failed: ${err.message}`, 'error', 'SWEEP');
    } finally {
      setIsMeasuringAuto(false);
    }
  };

  // File Upload Handlers
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, channel: 'left' | 'right' | 'sub') => {
    if (!e.target.files || e.target.files.length === 0) return;
    const files = e.target.files;
    try {
      if (measurementMode === 'single') {
        const file = files[0];
        setUploadStatus(`Uploading ${channel} speaker measurement: ${file.name}...`);
        const res = await uploadMeasurementFile(file, channel);
        setUploadStatus(`✅ ${channel} loaded: ${res.sample_rate} Hz, ${res.duration_s?.toFixed(2)}s`);
        onLog?.(`Loaded ${channel} measurement ${file.name} (${res.sample_rate} Hz)`, 'success', 'INGEST');
      } else if (measurementMode === 'repeated') {
        setUploadStatus(`Uploading ${files.length} repeated sweeps for ${channel}...`);
        const res = await uploadRepeatedMeasurementFiles(files, channel);
        setUploadStatus(`✅ ${channel} stacked: ${res.valid_runs}/${res.runs_processed} runs (+${res.snr_boost_db.toFixed(1)} dB SNR)`);
        onLog?.(`Stacked ${res.valid_runs} sweeps for ${channel} (+${res.snr_boost_db.toFixed(1)} dB SNR boost)`, 'success', 'INGEST');
      } else if (measurementMode === 'multi_seat') {
        setUploadStatus(`Uploading multi-seat spatial files for ${channel}...`);
        const res = await uploadMultiSeatMeasurementFiles(files, channel);
        setUploadStatus(`✅ ${channel} spatial hybrid: ${res.seat_count} seats averaged`);
        onLog?.(`Averaged ${res.seat_count} seats for ${channel}`, 'success', 'INGEST');
      }
      onChangeConfig({ ...config, use_demo_measurements: false });
    } catch (err: any) {
      setUploadStatus(`❌ Upload error: ${err.message}`);
      onLog?.(`Upload error for ${channel}: ${err.message}`, 'error', 'INGEST');
    }
  };

  const handleCalUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    try {
      setCalStatus(`Uploading ${file.name}...`);
      const res = await uploadCalFile(file);
      setCalStatus(`✅ Mic .cal loaded: ${res.points} points (${res.has_phase ? 'mag + phase' : 'magnitude'})`);
      onLog?.(`Microphone calibration ${file.name} loaded (${res.points} points)`, 'success', 'CAL');
    } catch (err: any) {
      setCalStatus(`❌ .cal error: ${err.message}`);
    }
  };

  const handleMultiSubUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const files = e.target.files;
    try {
      setMultiSubStatus(`Uploading ${files.length} subwoofer measurements...`);
      const res = await uploadMultiSubMeasurementFiles(files);
      setMultiSubStatus(`✅ MSO ready: ${res.sub_count} subwoofers (${res.names.join(', ')})`);
      onLog?.(`Multi-Sub Matrix armed with ${res.sub_count} subwoofers`, 'success', 'MSO');
    } catch (err: any) {
      setMultiSubStatus(`❌ Multi-sub error: ${err.message}`);
    }
  };

  const handleSessionSave = async () => {
    try {
      const info = await saveSession();
      setUploadStatus(`✅ Project saved to ${info.path}`);
      onLog?.('Project session saved to disk', 'success', 'SESSION');
      const s = await getSessionStatus().catch(() => null);
      setSessionInfo(s);
    } catch (err: any) {
      setUploadStatus(`❌ Save error: ${err.message}`);
    }
  };

  const handleSessionLoad = async () => {
    try {
      const info = await loadSession();
      setUploadStatus(`✅ Session restored: ${info.channels.join(', ') || 'empty'}`);
      onLog?.('Project session restored from disk', 'success', 'SESSION');
      onChangeConfig({ ...config, use_demo_measurements: false });
    } catch (err: any) {
      setUploadStatus(`❌ Load error: ${err.message}`);
    }
  };

  const updateTarget = (partial: Partial<TargetCurveConfig>) => {
    onChangeConfig({
      ...config,
      target: {
        ...config.target,
        name: 'custom',
        ...partial,
      },
    });
  };

  const intel = result?.acoustic_intelligence;
  const sub = result?.sub_alignment;

  // Plot Geometry Setup
  const width = 860;
  const height = 280;
  const pad = { top: 16, right: 24, bottom: 36, left: 48 };
  const pw = width - pad.left - pad.right;
  const ph = height - pad.top - pad.bottom;

  const minF = 20;
  const maxF = 20000;
  const minSpl = 40;
  const maxSpl = 100;

  const xPos = (f: number) => pad.left + (Math.log10(Math.max(f, minF) / minF) / Math.log10(maxF / minF)) * pw;
  const yPos = (s: number) => pad.top + ((maxSpl - Math.max(Math.min(s, maxSpl), minSpl)) / (maxSpl - minSpl)) * ph;

  // Phase & Time Mappers
  const phaseToY = (deg: number) => pad.top + ((180 - Math.max(-180, Math.min(180, deg))) / 360) * ph;
  const timeToX = (t: number) => pad.left + ((Math.max(-20, Math.min(30, t)) - -20) / 50) * pw;
  const stepToY = (amp: number) => pad.top + ((1.2 - Math.max(-1.2, Math.min(1.2, amp))) / 2.4) * ph;

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

  const makePhasePath = (freqs?: number[], phases?: number[]) => {
    if (!freqs || !phases || freqs.length === 0) return '';
    const pts: string[] = [];
    const step = Math.max(1, Math.floor(freqs.length / 280));
    for (let i = 0; i < freqs.length; i += step) {
      if (freqs[i] >= minF && freqs[i] <= maxF) {
        pts.push(`${xPos(freqs[i]).toFixed(1)},${phaseToY(phases[i]).toFixed(1)}`);
      }
    }
    return pts.length > 0 ? `M ${pts.join(' L ')}` : '';
  };

  const makeStepPath = (times?: number[], steps?: number[]) => {
    if (!times || !steps || times.length === 0) return '';
    return times
      .map((t, i) => `${i === 0 ? 'M' : 'L'} ${timeToX(t).toFixed(1)},${stepToY(steps[i]).toFixed(1)}`)
      .join(' ');
  };

  const isLight = theme === 'light';
  const gridColor = isLight ? '#E5E3DF' : '#26282E';
  const rectFill = isLight ? '#FAFAF8' : '#0E0F12';
  const rectStroke = isLight ? '#E8E5DC' : '#26282E';

  return (
    <div className="space-y-8 select-text">

      {/* ========================================================================= */}
      {/* SECTION 00: MONOGRAPH MASTHEAD & REFERENCE HARDWARE STRIP                 */}
      {/* ========================================================================= */}
      <section className="border border-stone-200 dark:border-stone-800 rounded-lg p-6 bg-white dark:bg-[#121316] shadow-sm transition-colors">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-stone-100 dark:border-stone-800/80 pb-5">
          <div>
            <div className="flex items-center space-x-2 text-[11px] font-mono tracking-widest text-amber-700 dark:text-amber-500 uppercase font-semibold">
              <span>ALTAIR</span>
              <span>•</span>
              <span>ACOUSTIC EQUALIZATION MONOGRAPH</span>
              <span>•</span>
              <span>VOL. 24</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-serif font-bold text-stone-900 dark:text-stone-100 mt-1 tracking-tight">
              Digital Room Equalization & Inversion
            </h1>
            <p className="text-xs text-stone-600 dark:text-stone-400 mt-1 max-w-3xl leading-relaxed">
              Laboratory-grade linear-phase FIR synthesis with 1-cycle frequency-dependent windowing, virtual bass array modal
              mitigation, and sub-millimeter phase alignment.
            </p>
          </div>

          {/* Master Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              onClick={() => handleAutoMeasure('all')}
              disabled={isMeasuringAuto || isRunning}
              className="px-4 py-2 rounded border border-amber-300 dark:border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-900 dark:text-amber-300 text-xs font-mono font-bold transition-all active:scale-[0.98] flex items-center space-x-1.5 disabled:opacity-50"
              title="Measure all channels and calibrate"
            >
              <Zap className="h-3.5 w-3.5" />
              <span>1-Click 2.1 Measure</span>
            </button>

            <button
              onClick={onRun}
              disabled={isRunning}
              className="px-5 py-2 rounded bg-amber-700 hover:bg-amber-800 text-white dark:bg-amber-500 dark:hover:bg-amber-400 dark:text-stone-950 text-xs font-mono font-bold tracking-wider uppercase transition-all active:scale-[0.98] flex items-center space-x-2 disabled:opacity-50 shadow-sm"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isRunning ? 'animate-spin' : ''}`} />
              <span>{isRunning ? 'CALIBRATING...' : 'EXECUTE CALIBRATION'}</span>
            </button>
          </div>
        </div>

        {/* Reference Hardware Strip */}
        <div className="flex flex-wrap items-center gap-6 mt-4 pt-1 text-[11px] font-mono text-stone-500 dark:text-stone-400">
          <span>MONITORS: <strong className="text-stone-800 dark:text-stone-200">Edifier MR3 (Active Studio)</strong></span>
          <span>•</span>
          <span>SUBWOOFER: <strong className="text-stone-800 dark:text-stone-200">Edifier T5s (8-inch Powered)</strong></span>
          <span>•</span>
          <span>SPEED OF SOUND: <strong className="text-stone-800 dark:text-stone-200">{intel?.speed_of_sound_mps ?? 343.2} m/s</strong> (20°C, 50% RH)</span>
          <span>•</span>
          <span>REW API: <strong className="text-amber-700 dark:text-amber-400 font-semibold">{status?.rew_connected ? 'ACTIVE (:4735)' : 'STANDALONE'}</strong></span>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 01: FIGURE 01 MASTER ACOUSTIC TRANSFER INSPECTION                 */}
      {/* ========================================================================= */}
      <section id="figure-01" className="border border-stone-200 dark:border-stone-800 rounded-lg p-5 bg-white dark:bg-[#121316] space-y-4 shadow-sm transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 dark:border-stone-800/80 pb-3">
          <div className="flex items-center space-x-2">
            <span className="text-xs font-mono font-bold text-amber-700 dark:text-amber-500 uppercase tracking-widest">
              FIGURE 01
            </span>
            <span className="font-serif font-semibold text-stone-900 dark:text-stone-100 text-sm">
              Steady-State Room Transfer Function & Regularized Output
            </span>
          </div>

          {/* Sub-Tabs */}
          <div className="flex items-center space-x-1 bg-stone-50 dark:bg-[#0E0F12] p-0.5 rounded border border-stone-200 dark:border-stone-800 text-xs font-mono">
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

        {/* SVG Transfer Function Graphic */}
        <div className="overflow-x-auto select-none">
          <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible font-mono">
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
                      <text x={x} y={height - pad.bottom + 14} fill="#78716C" fontSize="9" textAnchor="middle">
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
                      <text x={pad.left - 6} y={y + 3} fill="#78716C" fontSize="9" textAnchor="end">
                        {s}
                      </text>
                    </g>
                  );
                })}

                {showBefore && result?.plots && (
                  <path
                    d={makePath(result.plots.freqs, result.plots.spl_before_left)}
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

                {showAfter && result?.plots && (
                  <path
                    d={makePath(result.plots.freqs, result.plots.spl_after_left)}
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
                      <text x={x} y={height - pad.bottom + 14} fill="#78716C" fontSize="9" textAnchor="middle">
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
                      <text x={pad.left - 6} y={y + 3} fill="#78716C" fontSize="9" textAnchor="end">
                        {deg}°
                      </text>
                    </g>
                  );
                })}

                {result?.plots && (
                  <>
                    <path
                      d={makePhasePath(result.plots.freqs, result.plots.phase_before_deg)}
                      fill="none"
                      stroke={isLight ? '#9CA3AF' : '#6B7280'}
                      strokeWidth="1.3"
                      strokeDasharray="3,3"
                    />
                    <path
                      d={makePhasePath(result.plots.freqs, result.plots.phase_after_deg)}
                      fill="none"
                      stroke="#D97706"
                      strokeWidth="2.2"
                    />
                  </>
                )}
              </>
            )}

            {/* TAB 3: STEP RESPONSE */}
            {activePlotTab === 'step' && (
              <>
                {[-20, -10, 0, 10, 20, 30].map((t) => {
                  const x = timeToX(t);
                  return (
                    <g key={`step-t-${t}`}>
                      <line x1={x} y1={pad.top} x2={x} y2={height - pad.bottom} stroke={gridColor} strokeWidth="1" strokeDasharray="2,2" />
                      <text x={x} y={height - pad.bottom + 14} fill="#78716C" fontSize="9" textAnchor="middle">
                        {t} ms
                      </text>
                    </g>
                  );
                })}

                {[-1, -0.5, 0, 0.5, 1].map((a) => {
                  const y = stepToY(a);
                  return (
                    <g key={`step-a-${a}`}>
                      <line x1={pad.left} y1={y} x2={width - pad.right} y2={y} stroke={a === 0 ? '#78716C' : gridColor} strokeWidth="1" strokeDasharray={a === 0 ? 'none' : '2,2'} />
                      <text x={pad.left - 6} y={y + 3} fill="#78716C" fontSize="9" textAnchor="end">
                        {a}
                      </text>
                    </g>
                  );
                })}

                {result?.plots && (
                  <path
                    d={makeStepPath(result.plots.step_time_ms, result.plots.step_response)}
                    fill="none"
                    stroke={isLight ? '#1C1917' : '#F5F5F4'}
                    strokeWidth="2.0"
                  />
                )}
              </>
            )}

            {/* TAB 4: SUBWOOFER SUMMATION */}
            {activePlotTab === 'sub' && (
              sub ? (
                <>
                  {[20, 30, 40, 50, 60, 80, 100, 150, 200].map((f) => {
                    const x = xPos(f);
                    return (
                      <g key={`sub-f-${f}`}>
                        <line x1={x} y1={pad.top} x2={x} y2={height - pad.bottom} stroke={gridColor} strokeWidth="1" strokeDasharray="2,2" />
                        <text x={x} y={height - pad.bottom + 14} fill="#78716C" fontSize="9" textAnchor="middle">
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
                        <text x={pad.left - 6} y={y + 3} fill="#78716C" fontSize="9" textAnchor="end">
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
                    d={makePath(sub.freqs, sub.spl_aligned_db)}
                    fill="none"
                    stroke="#D97706"
                    strokeWidth="2.4"
                  />
                </>
              ) : null
            )}
          </svg>
        </div>

        {/* Legend & Interactive Visibility Toggles */}
        <div className="flex flex-wrap items-center justify-between gap-4 pt-1 text-[11px] font-mono text-stone-500 dark:text-stone-400">
          <div className="flex items-center space-x-5">
            <button
              onClick={() => setShowBefore(!showBefore)}
              className={`flex items-center space-x-1.5 ${showBefore ? 'text-stone-700 dark:text-stone-300' : 'line-through opacity-50'}`}
            >
              <span className="w-3 h-0.5 bg-stone-400 inline-block border-b border-dashed"></span>
              <span>Raw Measurement</span>
            </button>

            <button
              onClick={() => setShowTarget(!showTarget)}
              className={`flex items-center space-x-1.5 ${showTarget ? 'text-amber-800 dark:text-amber-400' : 'line-through opacity-50'}`}
            >
              <span className="w-3 h-0.5 bg-[#D97706] inline-block"></span>
              <span>Target House Curve</span>
            </button>

            <button
              onClick={() => setShowAfter(!showAfter)}
              className={`flex items-center space-x-1.5 font-bold ${showAfter ? 'text-stone-900 dark:text-stone-100' : 'line-through opacity-50'}`}
            >
              <span className="w-3 h-0.5 bg-stone-900 dark:bg-stone-100 inline-block"></span>
              <span>Calibrated Output</span>
            </button>
          </div>

          <span>
            {config.target_taps.toLocaleString()} Taps • True-Peak{' '}
            {result?.true_peak_left_dbfs !== undefined ? `${result.true_peak_left_dbfs.toFixed(2)} dBTP` : '-0.8 dBTP'}
          </span>
        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 02: NUMBERED ACOUSTIC ANALYSIS CHAPTERS (BENTO GRID)              */}
      {/* ========================================================================= */}
      <section id="chapters" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

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
              <span className="text-[10px] font-mono text-amber-700 dark:text-amber-400 font-bold">
                +{sub?.gain_improvement_db !== undefined ? sub.gain_improvement_db.toFixed(1) : '4.2'} dB SUM
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
              <strong className="text-stone-800 dark:text-stone-200">
                {subDelayMs > 0 ? `+${subDelayMs.toFixed(2)}` : subDelayMs.toFixed(2)} ms
              </strong>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-stone-500">Phase Polarity:</span>
              <div className="flex items-center space-x-2">
                <strong className="text-stone-800 dark:text-stone-200">{polarity > 0 ? 'Normal (+)' : 'Inverted (-)'}</strong>
                <button
                  onClick={togglePolarity}
                  className="px-2 py-0.5 rounded border border-stone-300 dark:border-stone-700 text-[10px] font-bold hover:bg-stone-200 dark:hover:bg-stone-800 transition-colors"
                >
                  Flip
                </button>
                <button
                  onClick={resetToOptimalSub}
                  title="Reset to algorithm optimum"
                  className="px-2 py-0.5 rounded border border-amber-300 dark:border-amber-600 text-[10px] text-amber-800 dark:text-amber-400 font-bold hover:bg-amber-50 dark:hover:bg-amber-950/40"
                >
                  Opt
                </button>
              </div>
            </div>
            <input
              type="range"
              min="-20"
              max="20"
              step="0.1"
              value={subDelayMs}
              onChange={(e) => handleSubSlider(parseFloat(e.target.value))}
              className="w-full h-1 bg-stone-300 dark:bg-stone-800 appearance-none cursor-pointer accent-amber-700 dark:accent-amber-500"
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
              <strong className="text-stone-800 dark:text-stone-200">
                {intel?.microphone_geometry?.mic_off_center_mm !== undefined
                  ? `${intel.microphone_geometry.mic_off_center_mm} mm (${intel.microphone_geometry.delay_offset_ms.toFixed(2)} ms)`
                  : '0 mm (0.00 ms)'}
              </strong>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500">Acoustic Distance:</span>
              <strong className="text-stone-800 dark:text-stone-200">
                {intel?.microphone_geometry?.distances?.front_left
                  ? `L: ${intel.microphone_geometry.distances.front_left.meters.toFixed(2)}m • R: ${intel.microphone_geometry.distances.front_right.meters.toFixed(2)}m`
                  : `c = ${intel?.speed_of_sound_mps ?? 343.2} m/s (20°C)`}
              </strong>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-500">IR Correlation:</span>
              <strong className="text-stone-800 dark:text-stone-200">
                {intel?.microphone_geometry?.impulse_response_correlation !== undefined
                  ? `${(intel.microphone_geometry.impulse_response_correlation * 100).toFixed(1)}% Synchronized`
                  : '99.8% Synchronized'}
              </strong>
            </div>
          </div>
        </div>

      </section>

      {/* Multi-Sub Matrix Optimization Table (if MSO results exist) */}
      {result?.multi_sub_alignment && (
        <MultiSubView multiSubAlignment={result.multi_sub_alignment} />
      )}

      {/* ========================================================================= */}
      {/* SECTION 03: ACOUSTIC LABORATORY & AUTOMATED SWEEPS (INTEGRATED)          */}
      {/* ========================================================================= */}
      <section id="sweeps" className="border border-stone-200 dark:border-stone-800 rounded-lg p-6 bg-white dark:bg-[#121316] space-y-6 shadow-sm transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-stone-100 dark:border-stone-800/80 pb-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded border border-stone-300 dark:border-stone-700 bg-stone-100 dark:bg-stone-900 text-amber-700 dark:text-amber-500">
              <Waves className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[10px] font-mono font-bold text-amber-700 dark:text-amber-500 uppercase tracking-widest">
                SECTION 04 // MEASUREMENT STUDIO
              </div>
              <h2 className="text-lg font-serif font-bold text-stone-900 dark:text-stone-100 tracking-tight">
                Automated Repeated Sweep Studio & Noise Rejection
              </h2>
            </div>
          </div>

          {/* Repetition Selector */}
          <div className="flex items-center space-x-1 bg-stone-50 border border-stone-200 dark:bg-stone-900 dark:border-stone-800 p-0.5 rounded shadow-sm text-xs font-mono">
            <span className="text-[11px] text-stone-500 dark:text-stone-400 font-medium px-2">Stack:</span>
            {[
              { count: 1, label: '1x Test', snr: 'Single' },
              { count: 2, label: '2x Fast', snr: '+3.0 dB' },
              { count: 4, label: '4x Rec.', snr: '+6.0 dB' },
              { count: 8, label: '8x Safe', snr: '+9.0 dB' },
            ].map((r) => (
              <button
                key={r.count}
                type="button"
                onClick={() => setAutoRepetitions(r.count)}
                className={`px-2.5 py-1 text-xs rounded font-bold transition-all ${
                  autoRepetitions === r.count
                    ? 'bg-amber-700 text-white dark:bg-amber-500 dark:text-stone-950 shadow-sm'
                    : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200'
                }`}
              >
                {r.label} <span className="text-[9.5px] font-mono opacity-80">({r.snr})</span>
              </button>
            ))}
          </div>
        </div>

        {/* Step Instructions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-stone-700 dark:text-stone-300 font-mono">
          <div className="p-2.5 rounded bg-stone-50 border border-stone-200 dark:bg-[#0E0F12] dark:border-stone-800 flex items-start space-x-2 shadow-sm">
            <span className="h-4 w-4 rounded-full bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-300 font-bold flex items-center justify-center shrink-0 text-[10px]">1</span>
            <span>Position measurement mic at ear level in primary listening chair.</span>
          </div>
          <div className="p-2.5 rounded bg-stone-50 border border-stone-200 dark:bg-[#0E0F12] dark:border-stone-800 flex items-start space-x-2 shadow-sm">
            <span className="h-4 w-4 rounded-full bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-300 font-bold flex items-center justify-center shrink-0 text-[10px]">2</span>
            <span>{status?.rew_connected ? 'REW API is connected on port 4735.' : 'REW offline; firing internal log-chirp generator.'}</span>
          </div>
          <div className="p-2.5 rounded bg-stone-50 border border-stone-200 dark:bg-[#0E0F12] dark:border-stone-800 flex items-start space-x-2 shadow-sm">
            <span className="h-4 w-4 rounded-full bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-300 font-bold flex items-center justify-center shrink-0 text-[10px]">3</span>
            <span>Click any channel below to trigger automated coherent sweep stacking.</span>
          </div>
        </div>

        {/* Sweep Trigger Buttons */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <button
            type="button"
            disabled={isMeasuringAuto}
            onClick={() => handleAutoMeasure('left')}
            className="py-2.5 px-3 rounded bg-stone-50 hover:bg-stone-100 text-stone-800 border border-stone-200 dark:bg-stone-900 dark:hover:bg-stone-800 dark:text-stone-100 dark:border-stone-800 disabled:opacity-50 font-mono font-bold text-xs flex items-center justify-center space-x-2 shadow-sm transition-all active:scale-[0.98]"
          >
            <PlayCircle className="h-4 w-4 text-amber-700 dark:text-amber-500" />
            <span>Auto Left ({autoRepetitions}x)</span>
          </button>

          <button
            type="button"
            disabled={isMeasuringAuto}
            onClick={() => handleAutoMeasure('right')}
            className="py-2.5 px-3 rounded bg-stone-50 hover:bg-stone-100 text-stone-800 border border-stone-200 dark:bg-stone-900 dark:hover:bg-stone-800 dark:text-stone-100 dark:border-stone-800 disabled:opacity-50 font-mono font-bold text-xs flex items-center justify-center space-x-2 shadow-sm transition-all active:scale-[0.98]"
          >
            <PlayCircle className="h-4 w-4 text-amber-700 dark:text-amber-500" />
            <span>Auto Right ({autoRepetitions}x)</span>
          </button>

          <button
            type="button"
            disabled={isMeasuringAuto}
            onClick={() => handleAutoMeasure('sub')}
            className="py-2.5 px-3 rounded bg-stone-50 hover:bg-stone-100 text-stone-800 border border-stone-200 dark:bg-stone-900 dark:hover:bg-stone-800 dark:text-stone-100 dark:border-stone-800 disabled:opacity-50 font-mono font-bold text-xs flex items-center justify-center space-x-2 shadow-sm transition-all active:scale-[0.98]"
          >
            <PlayCircle className="h-4 w-4 text-amber-700 dark:text-amber-500" />
            <span>Auto Sub ({autoRepetitions}x)</span>
          </button>

          <button
            type="button"
            disabled={isMeasuringAuto}
            onClick={() => handleAutoMeasure('all')}
            className="py-2.5 px-3 rounded bg-amber-700 hover:bg-amber-800 text-white dark:bg-amber-500 dark:hover:bg-amber-400 dark:text-stone-950 disabled:opacity-50 font-mono font-bold text-xs flex items-center justify-center space-x-1.5 shadow-sm transition-all active:scale-[0.98]"
          >
            <Zap className="h-4 w-4" />
            <span>1-Click Full 2.1</span>
          </button>
        </div>

        {/* Live Feedback Banner */}
        {autoProgressText && (
          <div className="p-3 rounded bg-stone-50 border border-amber-300 dark:bg-[#0E0F12] dark:border-amber-500/30 text-xs text-amber-900 dark:text-amber-200 font-mono flex items-center justify-between shadow-sm">
            <span>{autoProgressText}</span>
            {isMeasuringAuto && <RefreshCw className="h-4 w-4 text-amber-700 dark:text-amber-400 animate-spin ml-2 shrink-0" />}
          </div>
        )}

        {/* AcoustiCX Stacking Report */}
        {autoSweepResult && autoSweepResult.details && (
          <div className="p-3.5 rounded bg-stone-50 dark:bg-[#0E0F12] border border-amber-300 dark:border-amber-500/30 space-y-2 text-xs font-mono">
            <div className="flex items-center justify-between text-amber-800 dark:text-amber-400 font-bold uppercase tracking-wider text-[11px]">
              <span>📊 AcoustiCX Intelligent Stacking Diagnostics</span>
              <span className="text-amber-900 dark:text-amber-200 bg-amber-100 dark:bg-amber-950/80 px-2 py-0.5 rounded border border-amber-300 dark:border-amber-500/30">
                SNR Boost: +{autoSweepResult.snr_improvement_db} dB
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
              {Object.entries(autoSweepResult.details).map(([ch, det]: [string, any]) => (
                <div key={ch} className="p-2 rounded bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 space-y-1">
                  <div className="flex items-center justify-between text-stone-900 dark:text-stone-100 font-bold capitalize">
                    <span>{ch} Channel</span>
                    <span className="text-[10px] text-stone-400">({det.repetitions} sweeps)</span>
                  </div>
                  <div className="text-stone-600 dark:text-stone-400 text-[11px] space-y-0.5">
                    <div className="flex justify-between">
                      <span>Accepted:</span>
                      <strong className="text-amber-700 dark:text-amber-400">{det.accepted_runs} runs</strong>
                    </div>
                    <div className="flex justify-between">
                      <span>Correlation:</span>
                      <strong>{det.mean_correlation ? `${(det.mean_correlation * 100).toFixed(1)}%` : 'N/A'}</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* ========================================================================= */}
      {/* SECTION 04: MEASUREMENT FILE INGESTION & ENVIRONMENTAL CALIBRATION        */}
      {/* ========================================================================= */}
      <section id="lab-ingestion" className="border border-stone-200 dark:border-stone-800 rounded-lg p-6 bg-white dark:bg-[#121316] space-y-6 shadow-sm transition-colors">
        <div className="flex items-center space-x-3 border-b border-stone-100 dark:border-stone-800/80 pb-4">
          <div className="p-2 rounded border border-stone-300 dark:border-stone-700 bg-stone-100 dark:bg-stone-900 text-amber-700 dark:text-amber-500">
            <Upload className="h-5 w-5" />
          </div>
          <div>
            <div className="text-[10px] font-mono font-bold text-amber-700 dark:text-amber-500 uppercase tracking-widest">
              SECTION 05 // LABORATORY INGESTION
            </div>
            <h2 className="text-lg font-serif font-bold text-stone-900 dark:text-stone-100 tracking-tight">
              Acoustic Measurement Ingestion & Environmental Physics
            </h2>
          </div>
        </div>

        {/* 3-Column Lab Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

          {/* Col 1: File Ingestion */}
          <div className="p-4 rounded bg-stone-50 dark:bg-[#0E0F12] border border-stone-200 dark:border-stone-800 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-serif font-bold text-stone-900 dark:text-stone-100">
                Measurement Files
              </h4>
              <div className="flex bg-stone-100 border border-stone-200 dark:bg-stone-900 dark:border-stone-800 p-0.5 rounded text-xs font-mono">
                <button
                  type="button"
                  onClick={() => setMeasurementMode('single')}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded transition-all ${measurementMode === 'single' ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-950 shadow-sm' : 'text-stone-500'}`}
                >
                  1x
                </button>
                <button
                  type="button"
                  onClick={() => setMeasurementMode('repeated')}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded transition-all ${measurementMode === 'repeated' ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-950 shadow-sm' : 'text-stone-500'}`}
                >
                  Repeats
                </button>
                <button
                  type="button"
                  onClick={() => setMeasurementMode('multi_seat')}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded transition-all ${measurementMode === 'multi_seat' ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-950 shadow-sm' : 'text-stone-500'}`}
                >
                  Multi-Seat
                </button>
              </div>
            </div>

            {uploadStatus && (
              <div className="p-2 rounded bg-amber-50 border border-amber-200 text-[11px] font-mono text-amber-900 dark:bg-amber-950/40 dark:border-amber-500/30 dark:text-amber-200">
                {uploadStatus}
              </div>
            )}

            {/* Left Channel File */}
            <div className="p-2.5 rounded bg-white border border-stone-200 dark:bg-stone-900 dark:border-stone-800 flex items-center justify-between text-xs">
              <div>
                <div className="font-semibold text-stone-800 dark:text-stone-200">Left Speaker (Mains)</div>
                <div className="text-[10px] text-stone-400 font-mono">REW .txt / .frd / .wav IR</div>
              </div>
              <input type="file" ref={fileLeftRef} multiple={measurementMode !== 'single'} onChange={(e) => handleFileUpload(e, 'left')} className="hidden" accept=".txt,.frd,.csv,.wav,.mdat" />
              <button onClick={() => fileLeftRef.current?.click()} className="px-3 py-1 bg-stone-100 hover:bg-stone-200 text-stone-800 dark:bg-stone-800 dark:hover:bg-stone-700 dark:text-stone-200 rounded text-xs font-mono font-medium transition-colors">
                Browse
              </button>
            </div>

            {/* Right Channel File */}
            <div className="p-2.5 rounded bg-white border border-stone-200 dark:bg-stone-900 dark:border-stone-800 flex items-center justify-between text-xs">
              <div>
                <div className="font-semibold text-stone-800 dark:text-stone-200">Right Speaker</div>
                <div className="text-[10px] text-stone-400 font-mono">REW .txt / .frd / .wav IR</div>
              </div>
              <input type="file" ref={fileRightRef} multiple={measurementMode !== 'single'} onChange={(e) => handleFileUpload(e, 'right')} className="hidden" accept=".txt,.frd,.csv,.wav,.mdat" />
              <button onClick={() => fileRightRef.current?.click()} className="px-3 py-1 bg-stone-100 hover:bg-stone-200 text-stone-800 dark:bg-stone-800 dark:hover:bg-stone-700 dark:text-stone-200 rounded text-xs font-mono font-medium transition-colors">
                Browse
              </button>
            </div>

            {/* Subwoofer Channel File */}
            <div className="p-2.5 rounded bg-white border border-stone-200 dark:bg-stone-900 dark:border-stone-800 flex items-center justify-between text-xs">
              <div>
                <div className="font-semibold text-stone-800 dark:text-stone-200">Subwoofer (Optional)</div>
                <div className="text-[10px] text-stone-400 font-mono">Dedicated sub measurement</div>
              </div>
              <input type="file" ref={fileSubRef} onChange={(e) => handleFileUpload(e, 'sub')} className="hidden" accept=".txt,.frd,.csv,.wav,.mdat" />
              <button onClick={() => fileSubRef.current?.click()} className="px-3 py-1 bg-stone-100 hover:bg-stone-200 text-stone-800 dark:bg-stone-800 dark:hover:bg-stone-700 dark:text-stone-200 rounded text-xs font-mono font-medium transition-colors">
                Browse
              </button>
            </div>

            {/* Test Chirps */}
            <div className="pt-1 flex items-center justify-between text-[11px] font-mono text-stone-500">
              <span>Test Chirps (24-bit):</span>
              <div className="flex space-x-1">
                {(['left', 'right', 'sub'] as const).map((ch) => (
                  <a key={ch} href={`/api/measurements/test-chirp?channel=${ch}`} download className="px-1.5 py-0.5 rounded bg-stone-200 hover:bg-stone-300 dark:bg-stone-800 dark:hover:bg-stone-700 text-[10px] uppercase font-bold text-stone-700 dark:text-stone-300">
                    {ch}
                  </a>
                ))}
              </div>
            </div>
          </div>

          {/* Col 2: Environmental Physics */}
          <div className="p-4 rounded bg-stone-50 dark:bg-[#0E0F12] border border-stone-200 dark:border-stone-800 space-y-4">
            <h4 className="text-xs font-serif font-bold text-stone-900 dark:text-stone-100 flex items-center space-x-1.5">
              <Thermometer className="h-4 w-4 text-amber-700 dark:text-amber-500" />
              <span>Environmental Physics (ISO 9613-1)</span>
            </h4>

            {/* Room Temperature */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-stone-600 dark:text-stone-400">Room Temperature</span>
                <span className="text-amber-700 dark:text-amber-400 font-bold">{config.temperature_celsius ?? 20}°C</span>
              </div>
              <input
                type="range"
                min="10"
                max="38"
                step="0.5"
                value={config.temperature_celsius ?? 20}
                onChange={(e) => onChangeConfig({ ...config, temperature_celsius: parseFloat(e.target.value) })}
                className="w-full h-1 bg-stone-300 dark:bg-stone-800 appearance-none cursor-pointer accent-amber-700 dark:accent-amber-500"
              />
            </div>

            {/* Relative Humidity */}
            <div className="space-y-1">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-stone-600 dark:text-stone-400">Relative Humidity</span>
                <span className="text-amber-700 dark:text-amber-400 font-bold">{config.relative_humidity_pct ?? 50}% RH</span>
              </div>
              <input
                type="range"
                min="20"
                max="90"
                step="5"
                value={config.relative_humidity_pct ?? 50}
                onChange={(e) => onChangeConfig({ ...config, relative_humidity_pct: parseFloat(e.target.value) })}
                className="w-full h-1 bg-stone-300 dark:bg-stone-800 appearance-none cursor-pointer accent-amber-700 dark:accent-amber-500"
              />
            </div>

            {/* Mic Polar Orientation */}
            <div className="pt-1">
              <div className="flex justify-between text-xs font-mono mb-1.5">
                <span className="text-stone-600 dark:text-stone-400">Mic Orientation</span>
                <span className="text-stone-800 dark:text-stone-200 font-bold">{(config.mic_orientation_deg ?? 0) === 0 ? '0° (On-Axis)' : '90° (Diffuse)'}</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <button
                  type="button"
                  onClick={() => onChangeConfig({ ...config, mic_orientation_deg: 0 })}
                  className={`py-1.5 rounded border text-center font-semibold transition-all ${
                    (config.mic_orientation_deg ?? 0) === 0
                      ? 'border-amber-600 bg-amber-500/10 text-amber-900 dark:text-amber-300'
                      : 'border-stone-200 dark:border-stone-800 text-stone-500 hover:border-stone-400'
                  }`}
                >
                  0° On-Axis
                </button>
                <button
                  type="button"
                  onClick={() => onChangeConfig({ ...config, mic_orientation_deg: 90 })}
                  className={`py-1.5 rounded border text-center font-semibold transition-all ${
                    (config.mic_orientation_deg ?? 0) === 90
                      ? 'border-amber-600 bg-amber-500/10 text-amber-900 dark:text-amber-300'
                      : 'border-stone-200 dark:border-stone-800 text-stone-500 hover:border-stone-400'
                  }`}
                >
                  90° Diffuse
                </button>
              </div>
            </div>
          </div>

          {/* Col 3: Advanced Laboratory Tools */}
          <div className="p-4 rounded bg-stone-50 dark:bg-[#0E0F12] border border-stone-200 dark:border-stone-800 space-y-3">
            <h4 className="text-xs font-serif font-bold text-stone-900 dark:text-stone-100 flex items-center space-x-1.5">
              <Settings2 className="h-4 w-4 text-amber-700 dark:text-amber-500" />
              <span>Advanced Laboratory Utilities</span>
            </h4>

            {/* Mic .cal */}
            <div className="p-2.5 rounded bg-white border border-stone-200 dark:bg-stone-900 dark:border-stone-800 flex items-center justify-between text-xs">
              <div>
                <div className="font-semibold text-stone-800 dark:text-stone-200">Mic .cal File</div>
                <div className="text-[10px] text-stone-400 font-mono">{calStatus ?? 'Optional mic calibration'}</div>
              </div>
              <input type="file" ref={calFileRef} onChange={handleCalUpload} className="hidden" accept=".cal,.txt" />
              <button onClick={() => calFileRef.current?.click()} className="px-2.5 py-1 bg-stone-100 hover:bg-stone-200 text-stone-800 dark:bg-stone-800 dark:hover:bg-stone-700 dark:text-stone-200 rounded text-xs font-mono font-medium">
                Upload .cal
              </button>
            </div>

            {/* MSO */}
            <div className="p-2.5 rounded bg-white border border-stone-200 dark:bg-stone-900 dark:border-stone-800 flex items-center justify-between text-xs">
              <div>
                <div className="font-semibold text-stone-800 dark:text-stone-200">Multi-Sub (MSO)</div>
                <div className="text-[10px] text-stone-400 font-mono">{multiSubStatus ?? '2-4 subwoofers'}</div>
              </div>
              <input type="file" ref={multiSubRef} multiple onChange={handleMultiSubUpload} className="hidden" accept=".txt,.frd,.csv,.wav" />
              <button onClick={() => multiSubRef.current?.click()} className="px-2.5 py-1 bg-stone-100 hover:bg-stone-200 text-stone-800 dark:bg-stone-800 dark:hover:bg-stone-700 dark:text-stone-200 rounded text-xs font-mono font-medium">
                Upload Subs
              </button>
            </div>

            {/* Warped FIR Toggle */}
            <div className="p-2.5 rounded bg-white border border-stone-200 dark:bg-stone-900 dark:border-stone-800 flex items-center justify-between text-xs font-mono">
              <span className="text-stone-700 dark:text-stone-300">Warped FIR (WFIR)</span>
              <button
                type="button"
                onClick={() => onChangeConfig({ ...config, wfir_taps: config.wfir_taps ? null : 4096 })}
                className={`px-2 py-0.5 rounded text-[10px] font-bold border transition-colors ${
                  config.wfir_taps
                    ? 'border-amber-600 bg-amber-500/10 text-amber-900 dark:text-amber-300'
                    : 'border-stone-300 dark:border-stone-700 text-stone-400'
                }`}
              >
                {config.wfir_taps ? 'ACTIVE' : 'OFF'}
              </button>
            </div>

            {/* Project Session Buttons */}
            <div className="pt-2 border-t border-stone-200 dark:border-stone-800/80 flex items-center justify-between text-xs font-mono">
              <span className="text-stone-500">Session:</span>
              <div className="flex space-x-1.5">
                <button onClick={handleSessionSave} className="px-2 py-1 rounded bg-stone-200 hover:bg-stone-300 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 text-[10px] font-bold flex items-center space-x-1">
                  <Save className="h-3 w-3" />
                  <span>Save</span>
                </button>
                <button onClick={handleSessionLoad} className="px-2 py-1 rounded bg-stone-200 hover:bg-stone-300 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 text-[10px] font-bold flex items-center space-x-1">
                  <FolderOpen className="h-3 w-3" />
                  <span>Load</span>
                </button>
                <button onClick={async () => { await clearSession(); setUploadStatus('Session cleared'); }} className="px-2 py-1 rounded bg-stone-200 hover:bg-stone-300 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-500 text-[10px] font-bold">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ========================================================================= */}
      {/* SECTION 05: PARAMETRIC TARGET TUNING & ACOUSTIC CROSSOVER MATRIX          */}
      {/* ========================================================================= */}
      <section id="tuning" className="grid grid-cols-1 md:grid-cols-2 gap-6">

        {/* Panel A: Target House Curve Profile & Deep Sliders */}
        <div className="border border-stone-200 dark:border-stone-800 rounded-lg p-6 bg-white dark:bg-[#121316] space-y-4 shadow-sm flex flex-col justify-between transition-colors">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono font-bold text-amber-700 dark:text-amber-500 uppercase tracking-widest">
                SECTION 06 // TARGET SYNTHESIS
              </span>
              <span className="text-[10px] font-mono text-stone-400">HARMAN / B&K / OCA</span>
            </div>
            <h3 className="font-serif text-lg text-stone-900 dark:text-stone-100 font-semibold">
              House Target Curve & Custom Sliders
            </h3>
            <p className="text-xs text-stone-600 dark:text-stone-400 mt-1">
              Select psychoacoustic baseline preset or fine-tune shelf boost, cutoff frequency, and high-frequency roll-off slope.
            </p>
          </div>

          {/* Preset Buttons */}
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

          {/* Deep Custom Parametric Sliders */}
          <div className="p-3.5 rounded bg-stone-50 dark:bg-[#0E0F12] border border-stone-200 dark:border-stone-800 space-y-3 font-mono text-xs">
            <div>
              <div className="flex justify-between text-stone-700 dark:text-stone-300 mb-1">
                <span>Bass Shelf Boost:</span>
                <span className="text-amber-700 dark:text-amber-400 font-bold">+{config.target.bass_boost_db.toFixed(1)} dB</span>
              </div>
              <input
                type="range"
                min="0"
                max="12"
                step="0.5"
                value={config.target.bass_boost_db}
                onChange={(e) => updateTarget({ bass_boost_db: parseFloat(e.target.value) })}
                className="w-full h-1 bg-stone-300 dark:bg-stone-800 appearance-none cursor-pointer accent-amber-700 dark:accent-amber-500"
              />
            </div>

            <div>
              <div className="flex justify-between text-stone-700 dark:text-stone-300 mb-1">
                <span>Bass Cutoff Frequency:</span>
                <span className="text-amber-700 dark:text-amber-400 font-bold">{config.target.bass_cutoff_hz.toFixed(0)} Hz</span>
              </div>
              <input
                type="range"
                min="40"
                max="160"
                step="5"
                value={config.target.bass_cutoff_hz}
                onChange={(e) => updateTarget({ bass_cutoff_hz: parseFloat(e.target.value) })}
                className="w-full h-1 bg-stone-300 dark:bg-stone-800 appearance-none cursor-pointer accent-amber-700 dark:accent-amber-500"
              />
            </div>

            <div>
              <div className="flex justify-between text-stone-700 dark:text-stone-300 mb-1">
                <span>Treble Roll-Off Slope:</span>
                <span className="text-amber-700 dark:text-amber-400 font-bold">{config.target.hf_slope_db_per_oct.toFixed(2)} dB/oct</span>
              </div>
              <input
                type="range"
                min="-2.0"
                max="0.0"
                step="0.1"
                value={config.target.hf_slope_db_per_oct}
                onChange={(e) => updateTarget({ hf_slope_db_per_oct: parseFloat(e.target.value) })}
                className="w-full h-1 bg-stone-300 dark:bg-stone-800 appearance-none cursor-pointer accent-amber-700 dark:accent-amber-500"
              />
            </div>
          </div>
        </div>

        {/* Panel B: Acoustic Crossovers & Tap Sizes */}
        <div className="border border-stone-200 dark:border-stone-800 rounded-lg p-6 bg-white dark:bg-[#121316] space-y-4 shadow-sm flex flex-col justify-between transition-colors">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono font-bold text-amber-700 dark:text-amber-500 uppercase tracking-widest">
                SECTION 07 // FILTER MATRIX
              </span>
              <span className="text-[10px] font-mono text-stone-400">HARDWARE FIR</span>
            </div>
            <h3 className="font-serif text-lg text-stone-900 dark:text-stone-100 font-semibold">
              Acoustic Crossover & Hardware Taps
            </h3>
            <p className="text-xs text-stone-600 dark:text-stone-400 mt-1">
              Configure speaker acoustic crossover point, subwoofer crossover frequency, and FIR convolver tap resolution.
            </p>
          </div>

          <div className="p-3.5 rounded bg-stone-50 dark:bg-[#0E0F12] border border-stone-200 dark:border-stone-800 space-y-3 font-mono text-xs">
            <div>
              <div className="flex justify-between text-stone-700 dark:text-stone-300 mb-1">
                <span>Loudspeaker Crossover:</span>
                <span className="text-amber-700 dark:text-amber-400 font-bold">{config.crossover_freq_hz} Hz</span>
              </div>
              <input
                type="range"
                min="800"
                max="4500"
                step="50"
                value={config.crossover_freq_hz}
                onChange={(e) => onChangeConfig({ ...config, crossover_freq_hz: parseFloat(e.target.value) })}
                className="w-full h-1 bg-stone-300 dark:bg-stone-800 appearance-none cursor-pointer accent-amber-700 dark:accent-amber-500"
              />
            </div>

            <div>
              <div className="flex justify-between text-stone-700 dark:text-stone-300 mb-1">
                <span>Subwoofer Crossover:</span>
                <span className="text-amber-700 dark:text-amber-400 font-bold">{config.sub_crossover_freq_hz} Hz</span>
              </div>
              <input
                type="range"
                min="40"
                max="160"
                step="5"
                value={config.sub_crossover_freq_hz}
                onChange={(e) => onChangeConfig({ ...config, sub_crossover_freq_hz: parseFloat(e.target.value) })}
                className="w-full h-1 bg-stone-300 dark:bg-stone-800 appearance-none cursor-pointer accent-amber-700 dark:accent-amber-500"
              />
            </div>

            <div>
              <label className="text-stone-700 dark:text-stone-300 block mb-1">FIR Convolver Tap Resolution:</label>
              <select
                value={config.target_taps}
                onChange={(e) => onChangeConfig({ ...config, target_taps: parseInt(e.target.value) })}
                className="w-full bg-white border border-stone-200 dark:bg-stone-900 dark:border-stone-800 rounded px-2.5 py-1.5 text-xs font-mono text-stone-800 dark:text-stone-200 font-bold shadow-sm"
              >
                <option value="4096">4,096 Taps (miniDSP Flex / Low Latency)</option>
                <option value="16384">16,384 Taps (Medium Hardware)</option>
                <option value="65536">65,536 Taps (Recommended / PC / CamillaDSP)</option>
                <option value="131072">131,072 Taps (Ultimate Audiophile / Roon)</option>
              </select>
            </div>
          </div>

          <button
            onClick={onRun}
            disabled={isRunning}
            className="w-full py-2.5 px-4 rounded font-mono font-bold text-xs tracking-wider uppercase bg-amber-700 hover:bg-amber-800 text-white dark:bg-amber-500 dark:hover:bg-amber-400 dark:text-stone-950 flex items-center justify-center space-x-2 transition-all active:scale-[0.98] shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isRunning ? 'animate-spin' : ''}`} />
            <span>{isRunning ? 'CALCULATING FILTERS...' : 'RE-CALCULATE OPTIMIZED FILTERS'}</span>
          </button>
        </div>

      </section>

      {/* ========================================================================= */}
      {/* SECTION 06: CONVOLVER DEPLOYMENT MANIFEST & EXPORT PACKAGE                */}
      {/* ========================================================================= */}
      <section id="export" className="border border-stone-200 dark:border-stone-800 rounded-lg p-6 bg-white dark:bg-[#121316] space-y-4 shadow-sm transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-stone-100 dark:border-stone-800/80 pb-4">
          <div>
            <div className="flex items-center space-x-2">
              <FileCode className="h-5 w-5 text-amber-700 dark:text-amber-500" />
              <h3 className="font-serif font-bold text-stone-900 dark:text-stone-100 text-base">
                Multi-Platform Convolver Deployment Manifest
              </h3>
            </div>
            <p className="text-xs font-mono text-stone-500 dark:text-stone-400 mt-1">
              Sample Rate: <span className="text-stone-800 dark:text-stone-200 font-bold">{result?.sample_rate ?? 48000} Hz</span> • FIR Taps:{' '}
              <span className="text-stone-800 dark:text-stone-200 font-bold">{config.target_taps.toLocaleString()}</span> • Headroom Preamp:{' '}
              <span className="text-amber-700 dark:text-amber-400 font-bold">{result?.global_preamp_db ?? -4.75} dB</span>
            </p>
          </div>

          <a
            href={getExportBundleUrl()}
            className="py-2.5 px-6 rounded font-mono font-bold text-xs tracking-widest uppercase bg-stone-900 hover:bg-stone-800 text-stone-50 dark:bg-stone-100 dark:text-stone-950 dark:hover:bg-stone-200 flex items-center justify-center space-x-2 shadow-sm transition-all active:scale-[0.98]"
          >
            <Download className="h-4 w-4" />
            <span>DOWNLOAD CONVOLVER BUNDLE (.ZIP)</span>
          </a>
        </div>

        {/* Platform Manifest Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          {[
            { name: 'Equalizer APO', desc: 'System-wide Windows DSP', files: 'config.txt + Stereo WAV', badge: 'Windows' },
            { name: 'CamillaDSP', desc: 'Linux / Streamer pipeline', files: 'camilladsp.yml + WAV FIR', badge: 'Linux / Pi' },
            { name: 'miniDSP Flex', desc: 'Hardware DSP coefficients', files: 'fir_coeffs_left.txt (4,096 taps)', badge: 'Hardware' },
            { name: 'Roon / HQPlayer', desc: 'Bit-perfect convolution', files: 'ALTAIR_Stereo_FIR_32bit.wav', badge: 'Audiophile' },
          ].map((p) => (
            <div key={p.name} className="p-3.5 rounded border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-[#0E0F12] flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="font-serif font-bold text-xs text-stone-900 dark:text-stone-100">{p.name}</span>
                  <span className="text-[9px] font-mono px-1.5 py-0.2 rounded border border-stone-300 dark:border-stone-700 text-stone-600 dark:text-stone-400">{p.badge}</span>
                </div>
                <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-1">{p.desc}</p>
              </div>
              <div className="mt-3 pt-2 border-t border-stone-200/60 dark:border-stone-800/60 flex items-center text-[10px] font-mono text-amber-800 dark:text-amber-400">
                <Check className="h-3 w-3 mr-1 text-emerald-600 dark:text-emerald-400" />
                <span className="truncate">{p.files}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
};
