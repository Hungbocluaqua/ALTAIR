import React, { useRef, useState } from 'react';
import { TargetCurveConfig, OptimizationRequest, SessionStatus } from '../types';
import { Sliders, Upload, Music, Settings2, RefreshCw, Thermometer, Compass, Layers, PlayCircle, Download, Zap, Radio, CheckCircle2, AlertCircle, Database, Save, FolderOpen, Trash2, Waves } from 'lucide-react';
import {
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

interface ExpertStudioProps {
  config: OptimizationRequest;
  onChange: (config: OptimizationRequest) => void;
  onRun: () => void;
  isRunning: boolean;
  rewConnected?: boolean;
  onLog?: (message: string, level?: 'info' | 'success' | 'warn' | 'error' | 'dsp' | 'geom', tag?: string, detail?: string) => void;
}

export const ExpertStudio: React.FC<ExpertStudioProps> = ({
  config,
  onChange,
  onRun,
  isRunning,
  rewConnected = false,
  onLog,
}) => {
  const fileLeftRef = useRef<HTMLInputElement>(null);
  const fileRightRef = useRef<HTMLInputElement>(null);
  const fileSubRef = useRef<HTMLInputElement>(null);
  const calFileRef = useRef<HTMLInputElement>(null);
  const multiSubRef = useRef<HTMLInputElement>(null);
  const [measurementMode, setMeasurementMode] = useState<'single' | 'repeated' | 'multi_seat'>('repeated');
  const [measurementType, setMeasurementType] = useState<'ir' | 'sweep'>('ir');
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [calStatus, setCalStatus] = useState<string | null>(null);
  const [multiSubStatus, setMultiSubStatus] = useState<string | null>(null);
  const [sessionInfo, setSessionInfo] = useState<SessionStatus | null>(null);

  // Automated Repeated Sweep State
  const [autoRepetitions, setAutoRepetitions] = useState<number>(4);
  const [isMeasuringAuto, setIsMeasuringAuto] = useState<boolean>(false);
  const [autoProgressText, setAutoProgressText] = useState<string | null>(null);
  const [autoSweepResult, setAutoSweepResult] = useState<any>(null);

  const handleAutoMeasure = async (channel: string) => {
    setIsMeasuringAuto(true);
    const chLabel = channel === 'all' ? 'FULL 2.1 SYSTEM (L + R + Sub)' : channel.toUpperCase();
    setAutoProgressText(`⏳ Triggering automated ${autoRepetitions}x repeated sweeps for ${chLabel}... Please remain quiet.`);
    onLog?.(`Triggered automated ${autoRepetitions}x repeated sweeps for ${chLabel}...`, 'info', 'SWEEP');
    
    try {
      const res = await triggerAutoRepeatedSweep(channel, autoRepetitions, 48000, !rewConnected);
      setAutoSweepResult(res);
      setAutoProgressText(`✅ ${res.message || `Captured & coherently stacked ${autoRepetitions}x sweeps (+${res.snr_improvement_db} dB SNR boost)!`}`);
      onLog?.(`Averaging complete for ${chLabel}: ${res.repetitions} sweeps accepted (+${res.snr_improvement_db} dB SNR boost)`, 'success', 'STACK');
      onChange({ ...config, use_demo_measurements: false });
    } catch (err: any) {
      setAutoProgressText(`❌ Automated sweep failed: ${err.message}`);
      onLog?.(`Automated sweep failed: ${err.message}`, 'error', 'ERR');
    } finally {
      setIsMeasuringAuto(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, channel: string) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const files = e.target.files;
    
    try {
      if (files.length > 1 && measurementMode === 'repeated') {
        setUploadStatus(`Stacking ${files.length} repeated sweeps for ${channel.toUpperCase()}...`);
        const res = await uploadRepeatedMeasurementFiles(files, channel);
        setUploadStatus(`✅ ${channel.toUpperCase()}: Coherently stacked ${res.repetitions}x sweeps (+${res.snr_improvement_db} dB SNR gain)!`);
      } else if (files.length > 1 && measurementMode === 'multi_seat') {
        setUploadStatus(`Spatially averaging ${files.length} seat positions for ${channel.toUpperCase()}...`);
        const res = await uploadMultiSeatMeasurementFiles(files, channel);
        setUploadStatus(`✅ ${channel.toUpperCase()}: Hybrid spatial average computed across ${res.seat_count} seats!`);
      } else {
        const file = files[0];
        setUploadStatus(`Uploading ${file.name}...`);
        const res = await uploadMeasurementFile(file, channel, measurementType);
        setUploadStatus(`✅ ${channel.toUpperCase()}: ${file.name} uploaded successfully (${res.points ?? ''} points)!`);
      }
      onChange({ ...config, use_demo_measurements: false });
    } catch (err: any) {
      setUploadStatus(`❌ Upload error: ${err.message}`);
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
    if (e.target) e.target.value = '';
  };

  const handleMultiSubUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const files = e.target.files;
    try {
      setMultiSubStatus(`Uploading ${files.length} subwoofer measurements...`);
      const res = await uploadMultiSubMeasurementFiles(files);
      setMultiSubStatus(`✅ MSO ready: ${res.sub_count} subwoofers (${res.names.join(', ')})`);
      onLog?.(`Multi-Sub Matrix Optimization armed with ${res.sub_count} subwoofers`, 'success', 'MSO');
    } catch (err: any) {
      setMultiSubStatus(`❌ Multi-sub error: ${err.message}`);
    }
    if (e.target) e.target.value = '';
  };

  const refreshSessionStatus = async () => {
    try {
      const status = await getSessionStatus();
      setSessionInfo(status);
    } catch (_) {
      setSessionInfo(null);
    }
  };

  const handleSessionSave = async () => {
    try {
      const info = await saveSession();
      setUploadStatus(`✅ Project saved to ${info.path} (${(info.bytes / 1024).toFixed(0)} KB)`);
      onLog?.('Project session saved to disk', 'success', 'SESSION');
      await refreshSessionStatus();
    } catch (err: any) {
      setUploadStatus(`❌ Session save error: ${err.message}`);
    }
  };

  const handleSessionLoad = async () => {
    try {
      const info = await loadSession();
      setUploadStatus(`✅ Session loaded: ${info.channels.join(', ') || 'no measurements'} (${info.saved_at ?? 'unknown date'})`);
      onLog?.('Project session restored from disk', 'success', 'SESSION');
      onChange({ ...config, use_demo_measurements: false });
      await refreshSessionStatus();
    } catch (err: any) {
      setUploadStatus(`❌ Session load error: ${err.message}`);
    }
  };

  const handleSessionClear = async () => {
    try {
      await clearSession();
      setUploadStatus('🗑 Project session file deleted');
      await refreshSessionStatus();
    } catch (err: any) {
      setUploadStatus(`❌ Session clear error: ${err.message}`);
    }
  };

  const downloadTestSweep = (channel: string) => {
    window.open(`/api/measurements/auto-sweep?channel=${channel}&duration_s=10.0&repetitions=2`, '_blank');
  };

  const updateTarget = (partial: Partial<TargetCurveConfig>) => {
    onChange({
      ...config,
      target: {
        ...config.target,
        name: 'custom',
        ...partial,
      },
    });
  };

  return (
    <div className="bg-white border border-stone-200 text-stone-800 shadow-xl shadow-stone-200/50 dark:bg-stone-900/80 dark:border-stone-800 dark:text-stone-100 dark:shadow-2xl rounded-lg p-6 space-y-6 transition-colors">
      <div className="flex items-center justify-between pb-4 border-b border-stone-200 dark:border-stone-800 transition-colors">
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded border border-stone-300 dark:border-stone-700 bg-stone-100 dark:bg-stone-900 text-amber-700 dark:text-amber-500">
            <Settings2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-serif font-bold text-stone-900 dark:text-stone-100 tracking-tight">Expert Acoustic Studio</h2>
            <p className="text-xs text-stone-500 dark:text-stone-400">Automated Repeated Sweeps, Noise Floor Stacking & Custom Target Tuning</p>
          </div>
        </div>

        <div className="flex items-center space-x-2 text-xs font-mono">
          <span className={`h-2 w-2 rounded-full ${rewConnected ? 'bg-amber-600 dark:bg-amber-400 animate-pulse' : 'bg-stone-400 dark:bg-stone-600'}`}></span>
          <span className="text-stone-600 dark:text-stone-300 font-medium">
            {rewConnected ? 'REW Direct Active (:4735)' : 'Standalone Mode'}
          </span>
        </div>
      </div>

      {/* DEDICATED SECTION: 1-Click Automated Repeated Sweep Studio */}
      <div className="bg-stone-50 border border-stone-200 text-stone-800 dark:bg-[#0E0F12] dark:border-stone-800 dark:text-stone-100 rounded-lg p-5 shadow-sm dark:shadow-xl space-y-4 transition-colors">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-amber-100/80 text-amber-800 border border-amber-200 dark:bg-amber-500/20 dark:text-amber-400 dark:border-amber-500/30">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-stone-900 dark:text-white tracking-wide uppercase flex items-center space-x-2">
                <span>Automated Repeated Sweep Studio</span>
                <span className="text-[10px] normal-case font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30">
                  AcoustiX +9dB Noise Filter
                </span>
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400">
                Sequentially fires sweeps through REW, aligns impulse peaks to sub-sample precision, and stacks time-domain waveforms.
              </p>
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

        {/* Step-by-Step Instructions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1 text-xs text-stone-700 dark:text-stone-300 font-mono">
          <div className="p-2.5 rounded bg-white border border-stone-200 dark:bg-stone-900/60 dark:border-stone-800 flex items-start space-x-2 shadow-sm">
            <span className="h-4 w-4 rounded-full bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-300 font-bold flex items-center justify-center shrink-0 text-[10px]">1</span>
            <span>Position mic at ear level in your primary listening seat.</span>
          </div>
          <div className="p-2.5 rounded bg-white border border-stone-200 dark:bg-stone-900/60 dark:border-stone-800 flex items-start space-x-2 shadow-sm">
            <span className="h-4 w-4 rounded-full bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-300 font-bold flex items-center justify-center shrink-0 text-[10px]">2</span>
            <span>{rewConnected ? 'REW API is connected and ready to receive commands.' : 'Start REW with Preferences → API → Start Server (or use Standalone).'}</span>
          </div>
          <div className="p-2.5 rounded bg-white border border-stone-200 dark:bg-stone-900/60 dark:border-stone-800 flex items-start space-x-2 shadow-sm">
            <span className="h-4 w-4 rounded-full bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-300 font-bold flex items-center justify-center shrink-0 text-[10px]">3</span>
            <span>Click any channel below to run automated coherent sweep stacking.</span>
          </div>
        </div>

        {/* Automated Action Buttons */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          <button
            type="button"
            disabled={isMeasuringAuto}
            onClick={() => handleAutoMeasure('left')}
            className="py-2.5 px-3 rounded bg-white hover:bg-stone-100 text-stone-800 border border-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 dark:text-stone-100 dark:border-stone-700 disabled:opacity-50 font-mono font-bold text-xs flex items-center justify-center space-x-2 shadow-sm transition-all active:scale-[0.98]"
          >
            <PlayCircle className="h-4 w-4 text-amber-700 dark:text-amber-500" />
            <span>Auto Left ({autoRepetitions}x)</span>
          </button>

          <button
            type="button"
            disabled={isMeasuringAuto}
            onClick={() => handleAutoMeasure('right')}
            className="py-2.5 px-3 rounded bg-white hover:bg-stone-100 text-stone-800 border border-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 dark:text-stone-100 dark:border-stone-700 disabled:opacity-50 font-mono font-bold text-xs flex items-center justify-center space-x-2 shadow-sm transition-all active:scale-[0.98]"
          >
            <PlayCircle className="h-4 w-4 text-amber-700 dark:text-amber-500" />
            <span>Auto Right ({autoRepetitions}x)</span>
          </button>

          <button
            type="button"
            disabled={isMeasuringAuto}
            onClick={() => handleAutoMeasure('sub')}
            className="py-2.5 px-3 rounded bg-white hover:bg-stone-100 text-stone-800 border border-stone-200 dark:bg-stone-800 dark:hover:bg-stone-700 dark:text-stone-100 dark:border-stone-700 disabled:opacity-50 font-mono font-bold text-xs flex items-center justify-center space-x-2 shadow-sm transition-all active:scale-[0.98]"
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

        {/* Live Auto-Sweep Status Feedback */}
        {autoProgressText && (
          <div className="p-3 rounded-xl bg-white border border-amber-200 text-xs text-amber-900 dark:bg-stone-900 dark:border-amber-500/30 dark:text-amber-200 flex items-center justify-between animate-fadeIn shadow-sm">
            <span className="font-mono">{autoProgressText}</span>
            {isMeasuringAuto && <RefreshCw className="h-4 w-4 text-amber-600 dark:text-amber-400 animate-spin ml-2 shrink-0" />}
          </div>
        )}

        {/* AcoustiCX Intelligent Averaging Diagnostics */}
        {autoSweepResult && autoSweepResult.details && (
          <div className="p-3.5 rounded bg-stone-50 dark:bg-[#0E0F12] border border-amber-300 dark:border-amber-500/30 space-y-2 text-xs font-mono">
            <div className="flex items-center justify-between text-amber-800 dark:text-amber-400 font-bold uppercase tracking-wider text-[11px]">
              <span className="flex items-center space-x-1.5">
                <span>📊 AcoustiCX Intelligent Stacking Report</span>
              </span>
              <span className="text-amber-900 dark:text-amber-200 font-mono bg-amber-100 dark:bg-amber-950/80 px-2 py-0.5 rounded border border-amber-300 dark:border-amber-500/30 font-bold">
                SNR Boost: +{autoSweepResult.snr_improvement_db} dB
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 font-mono text-[11.5px]">
              {Object.entries(autoSweepResult.details).map(([ch, det]: [string, any]) => (
                <div key={ch} className="p-2.5 rounded-lg bg-stone-900/90 border border-stone-800 space-y-1">
                  <div className="flex items-center justify-between text-amber-300 font-bold capitalize">
                    <span>{ch} Channel</span>
                    <span className="text-[10px] text-stone-400">({det.repetitions} sweeps)</span>
                  </div>
                  <div className="text-stone-300 space-y-0.5 text-[11px]">
                    <div className="flex justify-between">
                      <span className="text-stone-400">Accepted:</span>
                      <span className="text-emerald-400">{det.repetitions}/{det.total_requested || det.repetitions} ({det.rejection_rate_pct ?? 0}% rejected)</span>
                    </div>
                    {det.baseline_snr_db !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-stone-400">Single SNR:</span>
                        <span className="text-stone-200">{det.baseline_snr_db} dB</span>
                      </div>
                    )}
                    {det.final_snr_db !== undefined && (
                      <div className="flex justify-between">
                        <span className="text-stone-400">Stacked SNR:</span>
                        <span className="text-amber-300 font-semibold">{det.final_snr_db} dB</span>
                      </div>
                    )}
                    <div className="flex justify-between font-bold pt-0.5 border-t border-stone-800">
                      <span className="text-stone-400">SNR Gain:</span>
                      <span className="text-emerald-400">+{det.snr_gain_db} dB</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Calibration, Multi-Sub MSO, WFIR & Project Session */}
      <div className="bg-stone-50/90 border border-stone-200 dark:bg-stone-950/60 dark:border-stone-800/80 rounded-lg p-4 space-y-3 transition-colors">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Mic .cal calibration */}
          <div className="p-3 rounded-xl bg-white border border-stone-200 dark:bg-stone-900/60 dark:border-stone-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider flex items-center space-x-2">
                <Radio className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <span>Mic .cal Calibration</span>
              </span>
              <input
                type="file"
                ref={calFileRef}
                onChange={handleCalUpload}
                className="hidden"
                accept=".cal,.txt"
              />
              <button
                onClick={() => calFileRef.current?.click()}
                className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-800 dark:bg-amber-500/20 dark:hover:bg-amber-500/30 dark:text-amber-300 rounded-lg text-[11px] font-semibold transition-colors"
              >
                Upload .cal
              </button>
            </div>
            {calStatus && <div className="text-[11px] font-mono text-amber-800 dark:text-amber-200">{calStatus}</div>}
            {!calStatus && (
              <div className="text-[10.5px] text-stone-500 dark:text-stone-400">
                Applies magnitude (+ phase if present) correction to H(f) during ingestion.
              </div>
            )}
          </div>

          {/* Multi-Sub MSO upload */}
          <div className="p-3 rounded-xl bg-white border border-stone-200 dark:bg-stone-900/60 dark:border-stone-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider flex items-center space-x-2">
                <Waves className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                <span>Multi-Sub Matrix (MSO)</span>
              </span>
              <input
                type="file"
                ref={multiSubRef}
                multiple
                onChange={handleMultiSubUpload}
                className="hidden"
                accept=".txt,.frd,.csv,.wav,.mdat"
              />
              <button
                onClick={() => multiSubRef.current?.click()}
                className="px-2.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-800 dark:bg-amber-500/20 dark:hover:bg-amber-500/30 dark:text-amber-300 rounded-lg text-[11px] font-semibold transition-colors"
              >
                Upload 2-4 Subs
              </button>
            </div>
            {multiSubStatus && <div className="text-[11px] font-mono text-amber-800 dark:text-amber-200">{multiSubStatus}</div>}
            {!multiSubStatus && (
              <div className="text-[10.5px] text-stone-500 dark:text-stone-400">
                Co-optimizes per-sub delay / gain / polarity to flatten seat-to-seat bass.
              </div>
            )}
          </div>

          {/* WFIR export + measurement type */}
          <div className="p-3 rounded-xl bg-white border border-stone-200 dark:bg-stone-900/60 dark:border-stone-800 flex items-center justify-between">
            <span className="text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider">Warped FIR (WFIR) Export</span>
            <button
              type="button"
              onClick={() => onChange({ ...config, wfir_taps: config.wfir_taps ? null : 4096 })}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                config.wfir_taps
                  ? 'bg-amber-500 text-stone-950 border-amber-400'
                  : 'bg-white text-stone-500 border-stone-200 dark:bg-stone-900 dark:text-stone-400 dark:border-stone-800'
              }`}
            >
              {config.wfir_taps ? `ON (${config.wfir_taps} taps)` : 'OFF'}
            </button>
          </div>

          {/* Recorded sweep Farina mode */}
          <div className="p-3 rounded-xl bg-white border border-stone-200 dark:bg-stone-900/60 dark:border-stone-800 flex items-center justify-between">
            <span className="text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider">Single-file type</span>
            <button
              type="button"
              onClick={() => setMeasurementType(measurementType === 'ir' ? 'sweep' : 'ir')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all ${
                measurementType === 'sweep'
                  ? 'bg-amber-500 text-stone-950 border-amber-400'
                  : 'bg-white text-stone-500 border-stone-200 dark:bg-stone-900 dark:text-stone-400 dark:border-stone-800'
              }`}
              title="'sweep' = raw recorded log-sine sweep; Farina harmonic separation is applied on ingestion"
            >
              {measurementType === 'sweep' ? 'Recorded Sweep (Farina)' : 'IR / Frequency Response'}
            </button>
          </div>
        </div>

        {/* Project session persistence */}
        <div className="p-3 rounded-xl bg-white border border-stone-200 dark:bg-stone-900/60 dark:border-stone-800 flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <div className="flex items-center space-x-2 text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider shrink-0">
            <Database className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <span>Project Session</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button onClick={handleSessionSave} className="px-2.5 py-1 bg-stone-100 hover:bg-stone-200 text-stone-700 dark:bg-stone-800 dark:hover:bg-stone-700 dark:text-stone-200 rounded-lg text-[11px] font-semibold flex items-center space-x-1 transition-colors">
              <Save className="h-3 w-3" /> Save
            </button>
            <button onClick={handleSessionLoad} className="px-2.5 py-1 bg-stone-100 hover:bg-stone-200 text-stone-700 dark:bg-stone-800 dark:hover:bg-stone-700 dark:text-stone-200 rounded-lg text-[11px] font-semibold flex items-center space-x-1 transition-colors">
              <FolderOpen className="h-3 w-3" /> Load
            </button>
            <button onClick={handleSessionClear} className="px-2.5 py-1 bg-stone-100 hover:bg-stone-200 text-stone-700 dark:bg-stone-800 dark:hover:bg-stone-700 dark:text-stone-200 rounded-lg text-[11px] font-semibold flex items-center space-x-1 transition-colors">
              <Trash2 className="h-3 w-3" /> Delete File
            </button>
            <button onClick={refreshSessionStatus} className="px-2.5 py-1 bg-stone-100 hover:bg-stone-200 text-stone-700 dark:bg-stone-800 dark:hover:bg-stone-700 dark:text-stone-200 rounded-lg text-[11px] font-semibold flex items-center space-x-1 transition-colors">
              <RefreshCw className="h-3 w-3" /> Status
            </button>
          </div>
          {sessionInfo && (
            <span className="text-[10.5px] font-mono text-stone-500 dark:text-stone-400 truncate">
              {sessionInfo.file_exists
                ? `altair_project.json — channels: ${sessionInfo.channels.join(', ') || 'none'}, cal: ${sessionInfo.cal_loaded ? 'yes' : 'no'}, result: ${sessionInfo.result_cached ? 'yes' : 'no'}`
                : 'no saved project yet'}
            </span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Panel 1: File Uploader & Measurement Ingestion Mode */}
        <div className="bg-stone-50/90 border border-stone-200 dark:bg-stone-950/60 dark:border-stone-800/80 rounded-lg p-4 space-y-3 transition-colors">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider flex items-center space-x-2">
              <Upload className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <span>Measurement Ingestion</span>
            </h4>
            <div className="flex bg-stone-100 border border-stone-200 dark:bg-stone-900 dark:border-stone-800 p-0.5 rounded text-xs font-mono">
              <button
                type="button"
                onClick={() => setMeasurementMode('single')}
                className={`px-2 py-0.5 text-[10px] font-bold rounded transition-all ${measurementMode === 'single' ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-950 shadow-sm' : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200'}`}
              >
                1x
              </button>
              <button
                type="button"
                onClick={() => setMeasurementMode('repeated')}
                className={`px-2 py-0.5 text-[10px] font-bold rounded transition-all ${measurementMode === 'repeated' ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-950 shadow-sm' : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200'}`}
                title="Repeated Sweeps (+6dB to +9dB SNR boost)"
              >
                Repeats (SNR+)
              </button>
              <button
                type="button"
                onClick={() => setMeasurementMode('multi_seat')}
                className={`px-2 py-0.5 text-[10px] font-bold rounded transition-all ${measurementMode === 'multi_seat' ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-950 shadow-sm' : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-200'}`}
                title="Multi-Seat Positions (Spatial Hybrid Averaging)"
              >
                Multi-Seat
              </button>
            </div>
          </div>

          {uploadStatus && (
            <div className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-900 dark:bg-amber-950/40 dark:border-amber-500/30 dark:text-amber-200">
              {uploadStatus}
            </div>
          )}

          {/* Left Speaker */}
          <div className="p-2.5 rounded-xl bg-white border border-stone-200 dark:bg-stone-900/60 dark:border-stone-800 flex items-center justify-between shadow-sm">
            <div>
              <div className="text-xs font-semibold text-stone-800 dark:text-stone-200">Left Speaker (Mains)</div>
              <div className="text-[10px] text-stone-500 dark:text-stone-400">
                {measurementMode === 'repeated' ? 'Select 2x - 8x sweeps (Auto +SNR)' : measurementMode === 'multi_seat' ? 'Select all seat positions' : 'REW .txt / .frd or .wav IR'}
              </div>
            </div>
            <input
              type="file"
              ref={fileLeftRef}
              multiple={measurementMode !== 'single'}
              onChange={(e) => handleFileUpload(e, 'left')}
              className="hidden"
              accept=".txt,.frd,.csv,.wav,.mdat"
            />
            <button
              onClick={() => fileLeftRef.current?.click()}
              className="px-3 py-1 bg-stone-100 hover:bg-stone-200 text-stone-700 dark:bg-stone-800 dark:hover:bg-stone-700 dark:text-stone-200 rounded-lg text-xs font-medium transition-colors"
            >
              Browse
            </button>
          </div>

          {/* Right Speaker */}
          <div className="p-2.5 rounded-xl bg-white border border-stone-200 dark:bg-stone-900/60 dark:border-stone-800 flex items-center justify-between shadow-sm">
            <div>
              <div className="text-xs font-semibold text-stone-800 dark:text-stone-200">Right Speaker</div>
              <div className="text-[10px] text-stone-500 dark:text-stone-400">
                {measurementMode === 'repeated' ? 'Select 2x - 8x sweeps (Auto +SNR)' : measurementMode === 'multi_seat' ? 'Select all seat positions' : 'REW .txt / .frd or .wav IR'}
              </div>
            </div>
            <input
              type="file"
              ref={fileRightRef}
              multiple={measurementMode !== 'single'}
              onChange={(e) => handleFileUpload(e, 'right')}
              className="hidden"
              accept=".txt,.frd,.csv,.wav,.mdat"
            />
            <button
              onClick={() => fileRightRef.current?.click()}
              className="px-3 py-1 bg-stone-100 hover:bg-stone-200 text-stone-700 dark:bg-stone-800 dark:hover:bg-stone-700 dark:text-stone-200 rounded-lg text-xs font-medium transition-colors"
            >
              Browse
            </button>
          </div>

          {/* Subwoofer */}
          <div className="p-2.5 rounded-xl bg-white border border-stone-200 dark:bg-stone-900/60 dark:border-stone-800 flex items-center justify-between shadow-sm">
            <div>
              <div className="text-xs font-semibold text-stone-800 dark:text-stone-200">Subwoofer (Optional)</div>
              <div className="text-[10px] text-stone-500 dark:text-stone-400">REW .txt / .frd or .wav IR</div>
            </div>
            <input
              type="file"
              ref={fileSubRef}
              multiple={measurementMode !== 'single'}
              onChange={(e) => handleFileUpload(e, 'sub')}
              className="hidden"
              accept=".txt,.frd,.csv,.wav,.mdat"
            />
            <button
              onClick={() => fileSubRef.current?.click()}
              className="px-3 py-1 bg-stone-100 hover:bg-stone-200 text-stone-700 dark:bg-stone-800 dark:hover:bg-stone-700 dark:text-stone-200 rounded-lg text-xs font-medium transition-colors"
            >
              Browse
            </button>
          </div>

          {/* Automated Test Signal Generator */}
          <div className="pt-2 border-t border-stone-200 dark:border-stone-800/80 flex items-center justify-between text-xs text-stone-600 dark:text-stone-300">
            <span className="flex items-center space-x-1.5">
              <Download className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
              <span>Test Sweeps (24-bit)</span>
            </span>
            <div className="flex space-x-1">
              <button
                type="button"
                onClick={() => downloadTestSweep('left')}
                className="px-2 py-0.5 bg-stone-100 hover:bg-stone-200 text-stone-700 dark:bg-stone-800 dark:hover:bg-stone-700 text-[10px] rounded dark:text-stone-300 transition-colors"
              >
                Left
              </button>
              <button
                type="button"
                onClick={() => downloadTestSweep('right')}
                className="px-2 py-0.5 bg-stone-100 hover:bg-stone-200 text-stone-700 dark:bg-stone-800 dark:hover:bg-stone-700 text-[10px] rounded dark:text-stone-300 transition-colors"
              >
                Right
              </button>
              <button
                type="button"
                onClick={() => downloadTestSweep('sub')}
                className="px-2 py-0.5 bg-stone-100 hover:bg-stone-200 text-stone-700 dark:bg-stone-800 dark:hover:bg-stone-700 text-[10px] rounded dark:text-stone-300 transition-colors"
              >
                Sub
              </button>
            </div>
          </div>

          {/* Room Temperature & Mic Orientation */}
          <div className="pt-2 border-t border-stone-200 dark:border-stone-800/80 space-y-2">
            <div className="flex items-center justify-between text-xs text-stone-600 dark:text-stone-300">
              <span className="flex items-center space-x-1">
                <Thermometer className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                <span>Room Temp</span>
              </span>
              <span className="font-mono text-amber-700 dark:text-amber-400 font-bold">{config.temperature_celsius ?? 20}°C</span>
            </div>
            <input
              type="range"
              min="10"
              max="35"
              step="1"
              value={config.temperature_celsius ?? 20}
              onChange={(e) => onChange({ ...config, temperature_celsius: parseFloat(e.target.value) })}
              className="w-full h-1.5 bg-stone-200 dark:bg-stone-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />

            <div className="flex items-center justify-between text-xs text-stone-600 dark:text-stone-300 pt-1">
              <span className="flex items-center space-x-1">
                <Compass className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
                <span>Mic Polar Angle</span>
              </span>
              <span className="font-mono text-amber-700 dark:text-amber-400 font-bold">
                {(config.mic_orientation_deg ?? 0) === 90 ? '90° (Ceiling)' : '0° (On-Axis)'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onChange({ ...config, mic_orientation_deg: 0.0 })}
                className={`py-1 rounded-lg text-xs font-medium border ${
                  (config.mic_orientation_deg ?? 0) === 0
                    ? 'bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-500/20 dark:border-amber-500 dark:text-amber-300 font-bold'
                    : 'bg-white border-stone-200 text-stone-600 dark:bg-stone-900 dark:border-stone-800 dark:text-stone-400'
                }`}
              >
                0° On-Axis
              </button>
              <button
                type="button"
                onClick={() => onChange({ ...config, mic_orientation_deg: 90.0 })}
                className={`py-1 rounded-lg text-xs font-medium border ${
                  (config.mic_orientation_deg ?? 0) === 90
                    ? 'bg-amber-50 border-amber-300 text-amber-900 dark:bg-amber-500/20 dark:border-amber-500 dark:text-amber-300 font-bold'
                    : 'bg-white border-stone-200 text-stone-600 dark:bg-stone-900 dark:border-stone-800 dark:text-stone-400'
                }`}
              >
                90° Diffuse
              </button>
            </div>

            {/* Relative Humidity Slider */}
            <div className="flex items-center justify-between text-xs text-stone-600 dark:text-stone-300 pt-1">
              <span>Relative Humidity</span>
              <span className="font-mono text-amber-700 dark:text-amber-400 font-bold">{config.relative_humidity_pct ?? 50}% RH</span>
            </div>
            <input
              type="range"
              min="20"
              max="90"
              step="5"
              value={config.relative_humidity_pct ?? 50}
              onChange={(e) => onChange({ ...config, relative_humidity_pct: parseFloat(e.target.value) })}
              className="w-full h-1.5 bg-stone-200 dark:bg-stone-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
          </div>
        </div>

        {/* Panel 2: Parametric Target Curve Tuning */}
        <div className="bg-stone-50/90 border border-stone-200 dark:bg-stone-950/60 dark:border-stone-800/80 rounded-lg p-4 space-y-4 transition-colors">
          <h4 className="text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider flex items-center space-x-2">
            <Sliders className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <span>Target House Curve Tuning</span>
          </h4>

          {/* Bass Boost */}
          <div>
            <div className="flex justify-between text-xs font-medium text-stone-700 dark:text-stone-300 mb-1">
              <span>Bass Shelf Boost</span>
              <span className="font-mono text-amber-700 dark:text-amber-400 font-bold">+{config.target.bass_boost_db.toFixed(1)} dB</span>
            </div>
            <input
              type="range"
              min="0"
              max="12"
              step="0.5"
              value={config.target.bass_boost_db}
              onChange={(e) => updateTarget({ bass_boost_db: parseFloat(e.target.value) })}
              className="w-full h-1.5 bg-stone-200 dark:bg-stone-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
          </div>

          {/* Bass Cutoff */}
          <div>
            <div className="flex justify-between text-xs font-medium text-stone-700 dark:text-stone-300 mb-1">
              <span>Bass Shelf Cutoff</span>
              <span className="font-mono text-amber-700 dark:text-amber-400 font-bold">{config.target.bass_cutoff_hz.toFixed(0)} Hz</span>
            </div>
            <input
              type="range"
              min="40"
              max="160"
              step="5"
              value={config.target.bass_cutoff_hz}
              onChange={(e) => updateTarget({ bass_cutoff_hz: parseFloat(e.target.value) })}
              className="w-full h-1.5 bg-stone-200 dark:bg-stone-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
          </div>

          {/* Treble Roll-Off */}
          <div>
            <div className="flex justify-between text-xs font-medium text-stone-700 dark:text-stone-300 mb-1">
              <span>Treble Roll-off Slope</span>
              <span className="font-mono text-amber-700 dark:text-amber-400 font-bold">{config.target.hf_slope_db_per_oct.toFixed(2)} dB/oct</span>
            </div>
            <input
              type="range"
              min="-2.0"
              max="0.0"
              step="0.1"
              value={config.target.hf_slope_db_per_oct}
              onChange={(e) => updateTarget({ hf_slope_db_per_oct: parseFloat(e.target.value) })}
              className="w-full h-1.5 bg-stone-200 dark:bg-stone-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
          </div>
        </div>

        {/* Panel 3: Acoustic Filter & DSP Parameters */}
        <div className="bg-stone-50/90 border border-stone-200 dark:bg-stone-950/60 dark:border-stone-800/80 rounded-lg p-4 space-y-4 flex flex-col justify-between transition-colors">
          <div>
            <h4 className="text-xs font-bold text-stone-700 dark:text-stone-300 uppercase tracking-wider flex items-center space-x-2 mb-3">
              <Music className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <span>Acoustic Crossover & Tap Sizes</span>
            </h4>

            {/* Speaker Crossover */}
            <div className="mb-3">
              <div className="flex justify-between text-xs font-medium text-stone-700 dark:text-stone-300 mb-1">
                <span>Loudspeaker Crossover Freq</span>
                <span className="font-mono text-amber-700 dark:text-amber-400 font-bold">{config.crossover_freq_hz} Hz</span>
              </div>
              <input
                type="range"
                min="800"
                max="4500"
                step="50"
                value={config.crossover_freq_hz}
                onChange={(e) => onChange({ ...config, crossover_freq_hz: parseFloat(e.target.value) })}
                className="w-full h-1.5 bg-stone-200 dark:bg-stone-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
            </div>

            {/* Sub Crossover */}
            <div className="mb-3">
              <div className="flex justify-between text-xs font-medium text-stone-700 dark:text-stone-300 mb-1">
                <span>Subwoofer Crossover Freq</span>
                <span className="font-mono text-amber-700 dark:text-amber-400 font-bold">{config.sub_crossover_freq_hz} Hz</span>
              </div>
              <input
                type="range"
                min="40"
                max="160"
                step="5"
                value={config.sub_crossover_freq_hz}
                onChange={(e) => onChange({ ...config, sub_crossover_freq_hz: parseFloat(e.target.value) })}
                className="w-full h-1.5 bg-stone-200 dark:bg-stone-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
              />
            </div>

            {/* FIR Tap Length */}
            <div>
              <label className="text-xs font-medium text-stone-700 dark:text-stone-300 block mb-1">FIR Tap Length</label>
              <select
                value={config.target_taps}
                onChange={(e) => onChange({ ...config, target_taps: parseInt(e.target.value) })}
                className="w-full bg-white border border-stone-200 dark:bg-stone-900 dark:border-stone-800 rounded-xl px-3 py-2 text-xs font-mono text-amber-700 dark:text-amber-400 font-semibold shadow-sm"
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
            <span>{isRunning ? 'CALCULATING FILTERS...' : 'EXECUTE CALIBRATION'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
