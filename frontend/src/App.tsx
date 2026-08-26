import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { QuickRunCard } from './components/QuickRunCard';
import { StepProgress } from './components/StepProgress';
import { AcousticIntelligenceBanner } from './components/AcousticIntelligenceBanner';
import { AudioPlot } from './components/AudioPlot';
import { SubAlignmentView } from './components/SubAlignmentView';
import { ExportCard } from './components/ExportCard';
import { ExpertStudio } from './components/ExpertStudio';
import { StatusResponse, OptimizationRequest, OptimizationResponse } from './types';
import { fetchStatus, runOptimization } from './api/client';

export const App: React.FC = () => {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [mode, setMode] = useState<'wizard' | 'expert'>('wizard');
  const [inputSource, setInputSource] = useState<'demo' | 'rew' | 'upload'>('demo');
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<OptimizationResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

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
        setConfig((prev) => ({ ...prev, use_demo_measurements: false }));
        setInputSource('rew');
      }
    } catch (e) {
      console.warn('Backend status check failed, will retry.');
    }
  };

  const handleRun = async () => {
    setIsRunning(true);
    setError(null);
    try {
      const res = await runOptimization({
        ...config,
        use_demo_measurements: inputSource === 'demo',
      });
      setResult(res);
    } catch (e: any) {
      setError(e.message || 'Optimization failed');
    } finally {
      setIsRunning(false);
    }
  };

  // Initial load: check status and auto-run demo optimization for instant UI gratification!
  useEffect(() => {
    checkStatus();
    handleRun();
  }, []);

  return (
    <div className="min-h-screen bg-[#080c14] text-slate-100 flex flex-col font-['Plus_Jakarta_Sans',sans-serif]">
      {/* Top Navigation */}
      <Header
        status={status}
        mode={mode}
        onModeChange={setMode}
        onRefreshStatus={checkStatus}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        {/* Error Banner */}
        {error && (
          <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-semibold flex items-center justify-between">
            <span>⚠️ {error}</span>
            <button onClick={() => setError(null)} className="underline ml-4">
              Dismiss
            </button>
          </div>
        )}

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
          />
        )}

        {/* Live Step Progress */}
        <StepProgress isRunning={isRunning} result={result} />

        {/* Acoustic Intelligence Metrics */}
        {result?.acoustic_intelligence && (
          <AcousticIntelligenceBanner intel={result.acoustic_intelligence} />
        )}

        {/* Interactive Audio Plots */}
        <AudioPlot
          plots={result?.plots || null}
          subAlignment={result?.sub_alignment}
        />

        {/* Subwoofer Alignment Interactive Tuning */}
        {result?.sub_alignment && (
          <SubAlignmentView
            subAlignment={result.sub_alignment}
            onUpdateSummation={(newSum) => {
              if (result && result.plots) {
                // update live plot if needed
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
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/60 bg-[#080c14] py-6 text-center text-xs text-slate-500">
        <p>ALTAIR 1.0 • Automated Linear-phase Tuning & Acoustic Inversion Routine</p>
        <p className="text-[11px] text-slate-600 mt-1">
          Virtual Bass Array (VBA) • Tikhonov Regularized Deconvolution • 1-Cycle FDW Crossover Linearization
        </p>
      </footer>
    </div>
  );
};
