import React, { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { QuickRunCard } from './components/QuickRunCard';
import { StepProgress } from './components/StepProgress';
import { AcousticIntelligenceBanner } from './components/AcousticIntelligenceBanner';
import { AudioPlot } from './components/AudioPlot';
import { SubAlignmentView } from './components/SubAlignmentView';
import { ExportCard } from './components/ExportCard';
import { ExpertStudio } from './components/ExpertStudio';
import { ConsoleLog, ConsoleLogEntry } from './components/ConsoleLog';
import { EditorialArchitecturalView } from './components/EditorialArchitecturalView';
import { EditorialTokyoArchiveView } from './components/EditorialTokyoArchiveView';
import { EditorialResearchLedgerView } from './components/EditorialResearchLedgerView';
import { StatusResponse, OptimizationRequest, OptimizationResponse } from './types';
import { fetchStatus, runOptimization } from './api/client';

export const App: React.FC = () => {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [mode, setMode] = useState<'wizard' | 'expert'>('wizard');
  const [inputSource, setInputSource] = useState<'demo' | 'rew' | 'upload'>('demo');
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<OptimizationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showConsole, setShowConsole] = useState<boolean>(true);
  
  // Editorial Redesign Variations: 'architectural' (1), 'tokyo' (2), 'ledger' (3), 'classic' (Default)
  const [designStyle, setDesignStyle] = useState<'architectural' | 'tokyo' | 'ledger' | 'classic'>(() => {
    try {
      const saved = localStorage.getItem('altair-editorial-style');
      if (saved === 'architectural' || saved === 'tokyo' || saved === 'ledger' || saved === 'classic') return saved;
    } catch (_) {}
    return 'architectural';
  });

  useEffect(() => {
    try {
      localStorage.setItem('altair-editorial-style', designStyle);
    } catch (_) {}
  }, [designStyle]);
  
  // Theme state: dark (Audiophile Midnight) or light (Clean Precision Studio)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      const saved = localStorage.getItem('altair-theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch (_) {}
    return 'dark';
  });

  useEffect(() => {
    try {
      if (theme === 'dark') {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
      } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
      }
      localStorage.setItem('altair-theme', theme);
    } catch (_) {}
  }, [theme]);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    addLog(`Theme changed to ${next === 'dark' ? 'Audiophile Midnight (Dark)' : 'Clean Precision Studio (Bright)'}`, 'info', 'UI');
  };

  // Live Acoustic Terminal Console Logs
  const [logs, setLogs] = useState<ConsoleLogEntry[]>([
    {
      id: 'boot-1',
      timestamp: new Date().toLocaleTimeString(),
      level: 'info',
      tag: 'SYS',
      message: 'ALTAIR Sonic Precision Engine v2.4 initialized',
    },
    {
      id: 'boot-2',
      timestamp: new Date().toLocaleTimeString(),
      level: 'info',
      tag: 'ENV',
      message: 'Atmospheric calibration loaded: c = 343.2 m/s (20.0°C, 50% RH)',
    },
  ]);

  const addLog = (
    message: string,
    level: ConsoleLogEntry['level'] = 'info',
    tag = 'SYS',
    detail?: string
  ) => {
    const entry: ConsoleLogEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      timestamp: new Date().toLocaleTimeString(),
      level,
      tag,
      message,
      detail,
    };
    setLogs((prev) => [...prev.slice(-400), entry]);
  };

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

  const checkStatus = async () => {
    try {
      const s = await fetchStatus();
      setStatus(s);
      if (s.rew_connected) {
        addLog('REW REST API connected at localhost:4735', 'success', 'REW');
        setConfig((prev) => ({ ...prev, use_demo_measurements: false }));
        setInputSource('rew');
      } else {
        addLog('REW offline. Running in Standalone Digital Room Correction mode', 'info', 'SYS');
      }
    } catch (e) {
      addLog('Backend status check probe failed, will retry in background', 'warn', 'SYS');
    }
  };

  const initialRunRef = useRef(false);

  const handleRun = async () => {
    setIsRunning(true);
    setError(null);
    addLog(`Starting optimization: ${config.target.name.toUpperCase()} target, ${config.target_taps.toLocaleString()} taps...`, 'info', 'PIPE');
    
    try {
      const res = await runOptimization({
        ...config,
        use_demo_measurements: mode === 'expert' ? config.use_demo_measurements : inputSource === 'demo',
      });
      setResult(res);
      
      addLog(`Impulses loaded: ${res.sample_rate.toLocaleString()} Hz, ${res.target_taps.toLocaleString()} taps`, 'success', 'INGEST');
      
      if (res.acoustic_intelligence) {
        const intel = res.acoustic_intelligence;
        addLog(`Schroeder transition: ${intel.detected_schroeder_hz} Hz | Reflection gap: ${intel.detected_reflection_gap_ms} ms (auto FDW: ${intel.recommended_fdw_cycles} cyc)`, 'dsp', 'SCHROEDER');
        addLog(`Loudspeaker acoustic roll-off: L=${intel.speaker_low_rolloff_hz} Hz, R=${intel.speaker_high_rolloff_hz} Hz`, 'dsp', 'ROLLOFF');
        
        if (intel.microphone_geometry) {
          const geom = intel.microphone_geometry;
          addLog(geom.geometry_summary, 'geom', 'GEOM');
          addLog(`Acoustic distances: L: ${geom.distances.front_left.meters}m (${geom.distances.front_left.feet}ft) | R: ${geom.distances.front_right.meters}m (${geom.distances.front_right.feet}ft)${geom.distances.subwoofer ? ` | SW: ${geom.distances.subwoofer.meters}m (${geom.distances.subwoofer.feet}ft)` : ''}`, 'geom', 'DIST');
          if (geom.impulse_response_correlation !== undefined) {
            addLog(`Stereo IR Correlation: ${(geom.impulse_response_correlation * 100).toFixed(1)}%`, 'geom', 'ALIGN');
          }
        }
        
        if (intel.crossover_hardware_snapping) {
          addLog(intel.crossover_hardware_snapping.summary, 'dsp', 'XO');
        }
        
        if (intel.split_gain_staging) {
          addLog(intel.split_gain_staging.summary, 'dsp', 'GAIN');
        }
      }
      
      if (res.modal_info_left) {
        addLog(`Virtual Bass Array synthesized: Mode P1=${res.modal_info_left.f_1.toFixed(1)} Hz (reflection canceller active)`, 'dsp', 'VBA');
      }
      
      if (res.sub_alignment) {
        const sub = res.sub_alignment;
        addLog(`Subwoofer alignment: ${sub.optimal_delay_ms} ms (${sub.optimal_polarity}), +${sub.gain_improvement_db} dB summation boost`, 'success', 'SUB');
      }
      
      const tpL = res.true_peak_left_dbfs !== undefined ? `${res.true_peak_left_dbfs.toFixed(2)} dBTP` : 'N/A';
      const tpR = res.true_peak_right_dbfs !== undefined ? `${res.true_peak_right_dbfs.toFixed(2)} dBTP` : 'N/A';
      addLog(`True-Peak 4x oversampled: Left: ${tpL} | Right: ${tpR}`, 'dsp', 'TP');
      addLog(`Export package ready: EqAPO, CamillaDSP, miniDSP, rePhase & WAV (${res.global_preamp_db} dB preamp)`, 'success', 'EXPORT');
    } catch (e: any) {
      setError(e.message || 'Optimization failed');
      addLog(`Optimization error: ${e.message || 'Unknown error'}`, 'error', 'ERR');
    } finally {
      setIsRunning(false);
    }
  };

  // Initial load: check status and auto-run demo optimization for instant UI gratification!
  useEffect(() => {
    checkStatus();
    if (!initialRunRef.current) {
      initialRunRef.current = true;
      handleRun();
    }
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#080c14] dark:text-slate-100 flex flex-col font-['Plus_Jakarta_Sans',sans-serif] transition-colors">
      {/* Top Navigation */}
      <Header
        status={status}
        mode={mode}
        onModeChange={(m) => {
          setMode(m);
          addLog(`Switched view to ${m === 'wizard' ? '1-Click Wizard' : 'Expert Studio'}`, 'info', 'UI');
        }}
        onRefreshStatus={checkStatus}
        showConsole={showConsole}
        onToggleConsole={() => setShowConsole(!showConsole)}
        consoleCount={logs.length}
        theme={theme}
        onToggleTheme={toggleTheme}
        designStyle={designStyle}
        onChangeDesignStyle={(s) => {
          setDesignStyle(s);
          addLog(`Switched UI redesign style to ${s.toUpperCase()}`, 'info', 'UI');
        }}
      />

      {/* Main Content Area with Console Log on Right Side */}
      <main className="flex-1 max-w-[1720px] w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 flex flex-col xl:flex-row gap-6 items-start">
        {/* Left / Center Work Area */}
        <div className="flex-1 min-w-0 w-full space-y-6">
          {/* Error Banner */}
          {error && (
            <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-500 text-xs font-semibold flex items-center justify-between">
              <span>⚠️ {error}</span>
              <button onClick={() => setError(null)} className="underline ml-4">
                Dismiss
              </button>
            </div>
          )}

          {/* Conditional Editorial Redesign Views */}
          {designStyle === 'architectural' ? (
            <EditorialArchitecturalView
              config={config}
              onChangeConfig={setConfig}
              result={result}
              isRunning={isRunning}
              onRun={handleRun}
              status={status}
              theme={theme}
            />
          ) : designStyle === 'tokyo' ? (
            <EditorialTokyoArchiveView
              config={config}
              onChangeConfig={setConfig}
              result={result}
              isRunning={isRunning}
              onRun={handleRun}
              status={status}
              theme={theme}
            />
          ) : designStyle === 'ledger' ? (
            <EditorialResearchLedgerView
              config={config}
              onChangeConfig={setConfig}
              result={result}
              isRunning={isRunning}
              onRun={handleRun}
              status={status}
              theme={theme}
            />
          ) : (
            <>
              {/* Wizard or Expert Mode Switch */}
              {mode === 'wizard' ? (
                <QuickRunCard
                  target={config.target}
                  onTargetChange={(t) => setConfig({ ...config, target: t })}
                  inputSource={inputSource}
                  onInputSourceChange={setInputSource}
                  isRunning={isRunning}
                  onRun={handleRun}
                  rewConnected={status?.rew_connected || false}
                />
              ) : (
                <ExpertStudio
                  config={config}
                  onChange={setConfig}
                  onRun={handleRun}
                  isRunning={isRunning}
                  rewConnected={status?.rew_connected || false}
                  onLog={addLog}
                />
              )}

              {/* Live Step Progress */}
              <StepProgress isRunning={isRunning} result={result} />

              {/* Acoustic Intelligence Metrics */}
              {result?.acoustic_intelligence && (
                <AcousticIntelligenceBanner
                  intel={result.acoustic_intelligence}
                  truePeakDb={result.true_peak_left_dbfs}
                  isZwickerMasked={result.zwicker_masking_left?.is_masked}
                />
              )}

              {/* Interactive Audio Plots */}
              <AudioPlot
                plots={result?.plots || null}
                subAlignment={result?.sub_alignment}
                theme={theme}
              />

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
            </>
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

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white dark:border-slate-800/60 dark:bg-[#080c14] py-6 text-center text-xs text-slate-500 transition-colors">
        <p>ALTAIR 1.0 • Automated Linear-phase Tuning & Acoustic Inversion Routine</p>
        <p className="text-[11px] text-slate-400 dark:text-slate-600 mt-1">
          Virtual Bass Array (VBA) • Tikhonov Regularized Deconvolution • 1-Cycle FDW Crossover Linearization
        </p>
      </footer>
    </div>
  );
};
