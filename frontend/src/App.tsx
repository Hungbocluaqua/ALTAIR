import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { EditorialView } from './components/EditorialView';
import { ConsoleLog, ConsoleLogEntry } from './components/ConsoleLog';
import { SetupWizardModal } from './components/SetupWizardModal';
import { RewLauncherModal } from './components/RewLauncherModal';
import { StatusResponse, OptimizationRequest, OptimizationResponse, ProgressEvent } from './types';
import { fetchStatus, runOptimizationStreamed, startRew } from './api/client';
import { Terminal, X, Activity, Play, Zap } from 'lucide-react';

export const App: React.FC = () => {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [mode, setMode] = useState<'wizard' | 'expert'>('wizard');
  const [inputSource, setInputSource] = useState<'demo' | 'rew' | 'upload'>('demo');
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<OptimizationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showConsole, setShowConsole] = useState<boolean>(false);
  const [showSetupWizard, setShowSetupWizard] = useState<boolean>(false);
  const [showRewModal, setShowRewModal] = useState<boolean>(false);
  const [showRewPrompt, setShowRewPrompt] = useState<boolean>(true);
  const [isStartingRew, setIsStartingRew] = useState<boolean>(false);
  const [progress, setProgress] = useState<ProgressEvent | null>(null);
  const lastLoggedStageRef = useRef<string | null>(null);
  
  // Theme state: dark (Midnight Charcoal) or light (Warm Washi Paper)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const saved = localStorage.getItem('altair-theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch (_) {}
    return 'dark';
  });

  useEffect(() => {
    try {
      localStorage.setItem('altair-theme', theme);
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      } else {
        document.documentElement.classList.add('light');
        document.documentElement.classList.remove('dark');
      }
    } catch (_) {}
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Live Acoustic Console Terminal Logs
  const [logs, setLogs] = useState<ConsoleLogEntry[]>([
    {
      id: 'init-1',
      timestamp: new Date().toLocaleTimeString(),
      level: 'info',
      tag: 'SYS',
      message: 'ALTAIR Editorial Acoustic Engine initialized.',
    },
    {
      id: 'init-2',
      timestamp: new Date().toLocaleTimeString(),
      level: 'info',
      tag: 'ENV',
      message: 'Physical parameters: 20°C, 50% RH, c = 343.2 m/s, air absorption 0.18 dB/m.',
    },
    {
      id: 'init-3',
      timestamp: new Date().toLocaleTimeString(),
      level: 'info',
      tag: 'MON',
      message: 'Reference monitors: Edifier MR3 + Edifier T5s Subwoofer.',
    },
  ]);

  const addLog = (
    message: string,
    level: 'info' | 'success' | 'warn' | 'error' | 'dsp' | 'geom' = 'info',
    tag: string = 'ALTAIR'
  ) => {
    const newEntry: ConsoleLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      timestamp: new Date().toLocaleTimeString(),
      level,
      tag,
      message,
    };
    setLogs((prev) => [...prev.slice(-199), newEntry]);
  };

  // Optimization Configuration (Edifier MR3 + T5s Subwoofer defaults)
  const [config, setConfig] = useState<OptimizationRequest>({
    target: {
      name: 'harman',
      bass_boost_db: 6.0,
      bass_cutoff_hz: 80.0,
      hf_slope_db_per_oct: -0.8,
      hf_start_hz: 200.0,
    },
    crossover_freq_hz: 2500.0,
    crossover_order: 4,
    sub_crossover_freq_hz: 80.0,
    target_taps: 65536,
    use_demo_measurements: true,
  });

  const initialRunRef = useRef(false);

  const checkStatus = async () => {
    try {
      const s = await fetchStatus();
      setStatus(s);
      addLog(
        `Engine online. REW connected: ${s.rew_connected ? 'YES (Port 4735)' : 'NO (Standalone)'}`,
        s.rew_connected ? 'success' : 'info',
        'STATUS'
      );
    } catch (e: any) {
      addLog(`Status poll failed: ${e.message}`, 'warn', 'STATUS');
    }
  };

  const handleStartRew = async (autoStart?: boolean) => {
    setIsStartingRew(true);
    addLog('Launching Room EQ Wizard with -api flag...', 'info', 'REW');
    try {
      const res = await startRew(undefined, autoStart);
      if (res.connected) {
        addLog(`Room EQ Wizard connected on port 4735 (${res.elapsed_s ?? 3}s)`, 'success', 'REW');
        setShowRewPrompt(false);
        await checkStatus();
      } else if (res.success) {
        addLog(res.message || 'REW process running, awaiting API server...', 'info', 'REW');
        await checkStatus();
      } else {
        addLog(`REW launch notice: ${res.error || res.message}`, 'warn', 'REW');
      }
    } catch (err: any) {
      addLog(`Failed to start REW: ${err.message}`, 'error', 'REW');
    } finally {
      setIsStartingRew(false);
    }
  };

  const handleResult = (res: OptimizationResponse) => {
    setResult(res);
    
    const intel = res.acoustic_intelligence;
    if (intel) {
      addLog(`Schroeder transition detected: ${intel.detected_schroeder_hz} Hz`, 'dsp', 'SCHROEDER');
      addLog(`First reflection arrival: ${intel.detected_reflection_gap_ms} ms (Auto-FDW: ${intel.recommended_fdw_cycles} cycles)`, 'geom', 'FDW');
      const micGeom = intel.microphone_geometry;
      if (micGeom) {
        addLog(`Lateral microphone offset: ${micGeom.mic_off_center_mm} mm (${micGeom.delay_offset_ms.toFixed(2)} ms)`, 'geom', 'MIC');
      }
      addLog(`Speed of sound calibrated: ${intel.speed_of_sound_mps} m/s`, 'info', 'TEMP');
      if (intel.mic_calibration) {
        addLog(`Microphone .cal applied: ${intel.mic_calibration.points} points${intel.mic_calibration.has_phase ? ' (mag+phase)' : ''}`, 'success', 'CAL');
      }
      if (intel.sbir_neutral_mask_frequencies && intel.sbir_neutral_mask_frequencies.length > 0) {
        addLog(`SBIR hard-clamp: no correction at ${intel.sbir_neutral_mask_frequencies.map((f) => `${f.toFixed(0)} Hz`).join(', ')}`, 'warn', 'SBIR');
      }
      if (typeof intel.target_air_adaptation_db_10k === 'number') {
        addLog(`Air absorption target adaptation: ${intel.target_air_adaptation_db_10k.toFixed(2)} dB @10kHz`, 'info', 'ISO9613');
      }
      if (intel.spatial_variance_weighting && intel.spatial_variance_weighting.seats > 0) {
        addLog(`Spatial variance weighting active (${intel.spatial_variance_weighting.seats} seats)`, 'dsp', 'SPATIAL');
      }
    }
    
    const sub = res.sub_alignment;
    if (sub) {
      addLog(`Subwoofer alignment: ${sub.optimal_delay_ms} ms (${sub.optimal_polarity}), +${sub.gain_improvement_db} dB summation boost`, 'success', 'SUB');
    }
    const mso = res.multi_sub_alignment;
    if (mso) {
      addLog(`Multi-Sub Matrix Optimization: ${mso.sub_count} subwoofers aligned at ${mso.crossover_freq_hz} Hz`, 'success', 'MSO');
    }
    
    const sdL = res.safeguard_decision_left;
    const sdR = res.safeguard_decision_right;
    if (sdL && sdR) {
      const attempts = res.safeguard_loop?.attempts ?? 1;
      const attenuated = res.safeguard_loop?.auto_attenuated ?? false;
      addLog(
        `Safeguards: L ${sdL.pre_ringing_passed ? 'PASS' : 'ringing'} / R ${sdR.pre_ringing_passed ? 'PASS' : 'ringing'} — Zwicker gate ${sdL.zwicker_masked && sdR.zwicker_masked ? 'masked' : 'audible'}${attenuated ? ` (auto-attenuated ${attempts}x)` : ''}`,
        sdL.audible_pre_echo || sdR.audible_pre_echo ? 'warn' : 'success',
        'GUARD'
      );
    }
    
    const tpL = res.true_peak_left_dbfs !== undefined ? `${res.true_peak_left_dbfs.toFixed(2)} dBTP` : 'N/A';
    const tpR = res.true_peak_right_dbfs !== undefined ? `${res.true_peak_right_dbfs.toFixed(2)} dBTP` : 'N/A';
    addLog(`True-Peak 4x oversampled: Left: ${tpL} | Right: ${tpR}`, 'dsp', 'TP');
    addLog(`Export package ready: EqAPO, CamillaDSP, miniDSP & WAV (${res.global_preamp_db} dB preamp)${res.wfir_taps ? ` + WFIR ${res.wfir_taps} taps` : ''}`, 'success', 'EXPORT');
  };

  const handleRun = async () => {
    setIsRunning(true);
    setError(null);
    setProgress(null);
    lastLoggedStageRef.current = null;
    addLog(`Initiating acoustic calibration with ${config.target.name.toUpperCase()} target curve...`, 'info', 'START');
    addLog(`Physical constraints: FDW 1-cycle crossover, VBA modal mitigation: ON`, 'info', 'DSP');
    
    try {
      const runConfig = {
        ...config,
        use_demo_measurements: inputSource === 'demo',
      };
      
      let resultHandled = false;
      const res = await runOptimizationStreamed(runConfig, {
        onProgress: (evt) => {
          setProgress(evt);
          if (evt.step !== lastLoggedStageRef.current) {
            lastLoggedStageRef.current = evt.step;
            addLog(`[${evt.pct}%] ${evt.step}${evt.detail ? ` — ${evt.detail}` : ''}`, 'dsp', 'STAGE');
          }
        },
        onResult: (r) => {
          resultHandled = true;
          handleResult(r);
        },
        onError: (message) => {
          setError(message);
          addLog(`Optimization error: ${message}`, 'error', 'ERR');
        },
      });
      
      // Fallback path (non-streamed) returns the result here
      if (res && !resultHandled) handleResult(res);
    } catch (e: any) {
      setError(e.message || 'Optimization failed');
      addLog(`Optimization error: ${e.message || 'Unknown error'}`, 'error', 'ERR');
    } finally {
      setIsRunning(false);
      setProgress(null);
    }
  };

  // Initial load
  useEffect(() => {
    checkStatus();
    if (!initialRunRef.current) {
      initialRunRef.current = true;
      handleRun();
    }
  }, []);

  return (
    <div className="min-h-screen bg-[#F9F8F6] text-stone-900 dark:bg-[#121316] dark:text-stone-100 flex flex-col font-sans transition-colors duration-200">
      {/* Top Sticky Header */}
      <Header
        status={status}
        mode={mode}
        onModeChange={(m) => {
          setMode(m);
          addLog(`Switched view to ${m === 'wizard' ? 'Editorial Monograph' : 'Expert Studio'}`, 'info', 'UI');
        }}
        onRefreshStatus={checkStatus}
        showConsole={showConsole}
        onToggleConsole={() => setShowConsole(!showConsole)}
        consoleCount={logs.length}
        theme={theme}
        onToggleTheme={toggleTheme}
        onOpenSetupWizard={() => setShowSetupWizard(true)}
        onOpenRewModal={() => setShowRewModal(true)}
      />

      {/* Main Full-Width Content Canvas */}
      <main className="flex-1 max-w-[1720px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Interactive REW Launch & Auto-Start Prompt Banner */}
        {!status?.rew_connected && status?.rew_installed && showRewPrompt && (
          <div className="mb-6 p-4 rounded-xl border border-amber-300 dark:border-amber-500/40 bg-amber-50/90 dark:bg-amber-950/20 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 animate-fadeIn">
            <div className="flex items-start sm:items-center space-x-3.5">
              <div className="p-2.5 rounded-lg bg-amber-600/15 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300 shrink-0">
                <Activity className="h-5 w-5" />
              </div>
              <div>
                <div className="font-serif font-bold text-sm text-stone-900 dark:text-stone-100 flex items-center space-x-2 flex-wrap gap-1">
                  <span>Room EQ Wizard is not running</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-200/70 dark:bg-amber-900/60 text-amber-900 dark:text-amber-200 font-bold border border-amber-300/60 dark:border-amber-700/60">
                    {status?.rew_name || 'REW'} • {status?.rew_dir || 'C:\\Program Files\\REW'}
                  </span>
                </div>
                <p className="text-xs text-stone-600 dark:text-stone-300 font-sans mt-1">
                  Would you like to start Room EQ Wizard now with REST API (:4735) enabled, or configure it to start automatically?
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-2.5 shrink-0">
              <button
                type="button"
                disabled={isStartingRew}
                onClick={() => handleStartRew(false)}
                className="px-3.5 py-2 rounded-lg bg-amber-700 hover:bg-amber-800 text-white dark:bg-amber-500 dark:text-stone-950 dark:hover:bg-amber-400 text-xs font-sans font-bold flex items-center space-x-1.5 shadow-sm transition-all active:scale-[0.98] disabled:opacity-50"
              >
                <Play className="h-3.5 w-3.5 fill-current" />
                <span>{isStartingRew ? 'Starting REW...' : 'Start REW'}</span>
              </button>
              <button
                type="button"
                disabled={isStartingRew}
                onClick={() => handleStartRew(true)}
                className="px-3.5 py-2 rounded-lg bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:text-stone-950 dark:hover:bg-stone-200 text-xs font-sans font-bold flex items-center space-x-1.5 shadow-sm transition-all active:scale-[0.98] disabled:opacity-50"
              >
                <Zap className="h-3.5 w-3.5 text-amber-500 fill-current" />
                <span>Start Automatically</span>
              </button>
              <button
                type="button"
                onClick={() => setShowRewPrompt(false)}
                className="p-2 rounded-lg hover:bg-amber-200/50 dark:hover:bg-stone-800 text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 transition-colors"
                title="Dismiss"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {/* Error Banner */}
        {error && (
          <div className="mb-6 p-4 rounded-lg border border-red-300 bg-red-50 text-red-800 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300 text-xs font-sans font-semibold flex items-center justify-between">
            <span>⚠️ {error}</span>
            <button onClick={() => setError(null)} className="underline ml-4 hover:opacity-80">
              Dismiss
            </button>
          </div>
        )}

        {/* Unified Master Editorial Monograph */}
        <EditorialView
          config={config}
          onChangeConfig={setConfig}
          result={result}
          isRunning={isRunning}
          onRun={handleRun}
          status={status}
          theme={theme}
          onLog={addLog}
          progress={progress}
          onOpenSetupWizard={() => setShowSetupWizard(true)}
        />
      </main>

      {/* Room EQ Wizard Manager Modal */}
      <RewLauncherModal
        isOpen={showRewModal}
        onClose={() => setShowRewModal(false)}
        onRefreshStatus={checkStatus}
        onLog={addLog}
      />

      {/* Setup Wizard Modal */}
      <SetupWizardModal
        isOpen={showSetupWizard}
        onClose={() => setShowSetupWizard(false)}
        config={config}
        onChangeConfig={setConfig}
        status={status}
        onLog={addLog}
      />

      {/* Slide-Over Drawer for Acoustic Terminal Console */}
      {showConsole && (
        <div className="fixed inset-0 z-50 overflow-hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
            onClick={() => setShowConsole(false)}
          />
          <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
            <div className="w-screen max-w-md xl:max-w-lg bg-white dark:bg-[#121316] border-l border-stone-200 dark:border-stone-800 shadow-2xl flex flex-col h-full animate-slideInRight">
              <div className="p-3.5 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between bg-stone-50 dark:bg-[#0E0F12]">
                <div className="flex items-center space-x-2">
                  <Terminal className="h-4 w-4 text-amber-700 dark:text-amber-500" />
                  <span className="font-serif font-bold text-xs text-stone-900 dark:text-stone-100">
                    Acoustic Ledger & Diagnostic Stream
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowConsole(false)}
                  className="p-1 rounded hover:bg-stone-200 dark:hover:bg-stone-800 text-stone-500"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <ConsoleLog
                  logs={logs}
                  onClear={() => setLogs([])}
                  isRunning={isRunning}
                  onToggleCollapse={() => setShowConsole(false)}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Action Pill for Console (when closed) */}
      {!showConsole && (
        <button
          type="button"
          onClick={() => setShowConsole(true)}
          className="fixed bottom-6 right-6 z-40 bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-950 px-3.5 py-2 rounded-full shadow-lg border border-stone-700 dark:border-stone-300 text-xs font-sans font-semibold flex items-center space-x-2 hover:scale-105 transition-all"
        >
          <Terminal className="h-3.5 w-3.5" />
          <span>Ledger</span>
          {logs.length > 0 && (
            <span className="px-1.5 py-0.2 text-[10px] rounded-full bg-amber-500 text-stone-950 font-mono font-bold">
              {logs.length}
            </span>
          )}
        </button>
      )}

      {/* Editorial Monograph Footer */}
      <footer className="border-t border-stone-200 bg-white dark:border-stone-800 dark:bg-[#121316] py-7 text-center text-xs text-stone-500 font-sans transition-colors">
        <p className="tracking-wide">ALTAIR 1.0 • AUTOMATED LINEAR-PHASE TUNING & ACOUSTIC INVERSION ROUTINE</p>
        <p className="text-[11px] text-stone-400 dark:text-stone-600 mt-1 font-mono">
          Virtual Bass Array (VBA) • Tikhonov Regularized Deconvolution • 1-Cycle FDW Crossover Linearization
        </p>
      </footer>
    </div>
  );
};
