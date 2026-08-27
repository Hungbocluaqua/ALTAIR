import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { EditorialView } from './components/EditorialView';
import { ExpertStudio } from './components/ExpertStudio';
import { StepProgress } from './components/StepProgress';
import { AudioPlot } from './components/AudioPlot';
import { SubAlignmentView } from './components/SubAlignmentView';
import { MultiSubView } from './components/MultiSubView';
import { ExportCard } from './components/ExportCard';
import { ConsoleLog, ConsoleLogEntry } from './components/ConsoleLog';
import { StatusResponse, OptimizationRequest, OptimizationResponse, ProgressEvent } from './types';
import { fetchStatus, runOptimizationStreamed } from './api/client';

export const App: React.FC = () => {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [mode, setMode] = useState<'wizard' | 'expert'>('wizard');
  const [inputSource, setInputSource] = useState<'demo' | 'rew' | 'upload'>('demo');
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<OptimizationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showConsole, setShowConsole] = useState<boolean>(true);
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

  const handleResult = (res: OptimizationResponse) => {
    setResult(res);
    
    const intel = res.acoustic_intelligence;
    if (intel) {
      addLog(`Schroeder transition detected: ${intel.detected_schroeder_hz} Hz`, 'dsp', 'SCHROEDER');
      addLog(`First reflection arrival: ${intel.detected_reflection_gap_ms} ms (Auto-FDW: ${intel.recommended_fdw_cycles} cycles)`, 'geom', 'FDW');
      const micGeom = intel.microphone_geometry;
      if (micGeom) {
        addLog(`Lateral microphone offset: ${micGeom.mic_off_center_mm} mm (${micGeom.delay_offset_ms} ms)`, 'geom', 'MIC');
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
    <div className="min-h-screen bg-[#F9F8F6] text-stone-900 dark:bg-[#121316] dark:text-stone-100 flex flex-col font-['Plus_Jakarta_Sans',sans-serif] transition-colors duration-200">
      {/* Top Navigation */}
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
      />

      {/* Main Content Area with Console Log on Right Side */}
      <main className="flex-1 max-w-[1720px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col xl:flex-row gap-8 items-start">
        {/* Left / Center Work Area */}
        <div className="flex-1 min-w-0 w-full space-y-6">
          {/* Error Banner */}
          {error && (
            <div className="p-4 rounded border border-red-300 bg-red-50 text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-400 text-xs font-semibold flex items-center justify-between">
              <span>⚠️ {error}</span>
              <button onClick={() => setError(null)} className="underline ml-4">
                Dismiss
              </button>
            </div>
          )}

          {/* Primary View Switcher: Editorial Monograph vs Expert Studio */}
          {mode === 'wizard' ? (
            <EditorialView
              config={config}
              onChangeConfig={setConfig}
              result={result}
              isRunning={isRunning}
              onRun={handleRun}
              status={status}
              theme={theme}
              onLog={addLog}
            />
          ) : (
            <div className="space-y-6">
              <ExpertStudio
                config={config}
                onChange={setConfig}
                onRun={handleRun}
                isRunning={isRunning}
                rewConnected={status?.rew_connected || false}
                onLog={addLog}
              />

              {/* Live Step Progress */}
              <StepProgress isRunning={isRunning} result={result} progress={progress} />

              {/* Interactive Audio Plots */}
              <AudioPlot
                plots={result?.plots || null}
                subAlignment={result?.sub_alignment}
                theme={theme}
              />

              {/* Multi-Sub Matrix Optimization (MSO) Results */}
              {result?.multi_sub_alignment && (
                <MultiSubView multiSubAlignment={result.multi_sub_alignment} />
              )}

              {/* Subwoofer Alignment Interactive Tuning */}
              {result?.sub_alignment && (
                <SubAlignmentView
                  subAlignment={result.sub_alignment}
                  onUpdateSummation={(newSum) => {
                    if (result && result.sub_alignment) {
                      setResult({
                        ...result,
                        sub_alignment: {
                          ...result.sub_alignment,
                          spl_aligned_db: newSum,
                        },
                      });
                    }
                  }}
                />
              )}

              {/* 1-Click Multi-Platform Export Card */}
              {result && (
                <ExportCard
                  preampDb={result.global_preamp_db}
                  sampleRate={result.sample_rate}
                  taps={result.target_taps}
                />
              )}
            </div>
          )}
        </div>

        {/* Right Side: Live Acoustic Terminal / Console Log */}
        {showConsole && (
          <aside className="w-full xl:w-[420px] 2xl:w-[460px] xl:shrink-0 xl:sticky xl:top-20 h-[560px] xl:h-[calc(100vh-6.5rem)]">
            <ConsoleLog
              logs={logs}
              onClear={() => setLogs([])}
              isRunning={isRunning}
              onToggleCollapse={() => setShowConsole(false)}
            />
          </aside>
        )}
      </main>

      {/* Editorial Monograph Footer */}
      <footer className="border-t border-stone-200 bg-white dark:border-stone-800 dark:bg-[#121316] py-7 text-center text-xs text-stone-500 font-mono transition-colors">
        <p className="tracking-wide">ALTAIR 1.0 • AUTOMATED LINEAR-PHASE TUNING & ACOUSTIC INVERSION ROUTINE</p>
        <p className="text-[11px] text-stone-400 dark:text-stone-600 mt-1">
          Virtual Bass Array (VBA) • Tikhonov Regularized Deconvolution • 1-Cycle FDW Crossover Linearization
        </p>
      </footer>
    </div>
  );
};
