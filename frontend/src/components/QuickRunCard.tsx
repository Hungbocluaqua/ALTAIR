import React from 'react';
import { TargetCurveConfig } from '../types';
import { Sparkles, Play, Music, Sliders, Volume2, ShieldCheck, CheckCircle2 } from 'lucide-react';

interface QuickRunCardProps {
  target: TargetCurveConfig;
  onTargetChange: (target: TargetCurveConfig) => void;
  inputSource: 'demo' | 'rew' | 'upload';
  onInputSourceChange: (source: 'demo' | 'rew' | 'upload') => void;
  isRunning: boolean;
  onRun: () => void;
  rewConnected: boolean;
}

export const QuickRunCard: React.FC<QuickRunCardProps> = ({
  target,
  onTargetChange,
  inputSource,
  onInputSourceChange,
  isRunning,
  onRun,
  rewConnected,
}) => {
  const presets: Array<{ id: TargetCurveConfig['name']; label: string; desc: string; bass: number }> = [
    {
      id: 'harman',
      label: 'Harman Curve (Recommended)',
      desc: '+6 dB bass rise (20-80Hz), smooth -0.8 dB/oct roll-off',
      bass: 6.0,
    },
    {
      id: 'oca',
      label: 'OCA Audiophile Target',
      desc: '+5.5 dB dynamic bass lift, natural decline',
      bass: 5.5,
    },
    {
      id: 'bk1974',
      label: 'B&K 1974 Classic Warm',
      desc: '+3 dB low bass, classic warm presentation',
      bass: 3.0,
    },
    {
      id: 'flat',
      label: 'Studio Reference Flat',
      desc: '0 dB neutral flat target for studio monitoring',
      bass: 0.0,
    },
  ];

  return (
    <div className="bg-white border border-stone-200 text-stone-800 shadow-xl shadow-stone-200/50 dark:bg-gradient-to-b dark:from-stone-900 dark:via-stone-900/90 dark:to-stone-950 dark:border-stone-800 dark:text-stone-100 dark:shadow-2xl rounded-lg p-6 relative overflow-hidden transition-colors">
      {/* Glow highlight */}
      <div className="absolute -top-24 -right-24 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none"></div>

      {/* Title */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 dark:bg-amber-500/10 dark:border-amber-500/20 dark:text-amber-400">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-stone-900 dark:text-white tracking-tight">1-Click Room Correction Wizard</h2>
            <p className="text-xs text-stone-500 dark:text-stone-400">Automated VBA, Tikhonov Inversion, Crossover Phase & Sub Alignment</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Step 1: Input Measurement Source */}
        <div className="bg-stone-50/90 border border-stone-200 dark:bg-stone-950/60 dark:border-stone-800/80 rounded-lg p-4 flex flex-col justify-between transition-colors">
          <div>
            <div className="flex items-center space-x-2 text-xs font-bold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-3">
              <span className="h-5 w-5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-400 flex items-center justify-center text-[10px]">1</span>
              <span>Measurement Source</span>
            </div>

            <div className="space-y-2">
              <label
                onClick={() => onInputSourceChange('demo')}
                className={`flex items-start space-x-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  inputSource === 'demo'
                    ? 'border-amber-500 bg-amber-50/80 text-amber-950 dark:bg-amber-500/10 dark:text-white shadow-sm'
                    : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300 dark:border-stone-800 dark:bg-stone-900/40 dark:text-stone-400 dark:hover:border-stone-700'
                }`}
              >
                <input
                  type="radio"
                  name="inputSource"
                  checked={inputSource === 'demo'}
                  onChange={() => onInputSourceChange('demo')}
                  className="mt-0.5 text-amber-500 focus:ring-0"
                />
                <div>
                  <div className="font-semibold text-xs text-stone-800 dark:text-stone-200">Demo Audiophile Room</div>
                  <div className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">Stereo Mains + Subwoofer with room modes</div>
                </div>
              </label>

              <label
                onClick={() => rewConnected && onInputSourceChange('rew')}
                className={`flex items-start space-x-3 p-3 rounded-xl border transition-all ${
                  !rewConnected
                    ? 'opacity-40 cursor-not-allowed border-stone-200 bg-stone-100 text-stone-400 dark:border-stone-800 dark:bg-stone-900/20 dark:text-stone-500'
                    : inputSource === 'rew'
                    ? 'border-amber-500 bg-amber-50/80 text-amber-950 dark:bg-amber-500/10 dark:text-white cursor-pointer shadow-sm'
                    : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300 dark:border-stone-800 dark:bg-stone-900/40 dark:text-stone-400 dark:hover:border-stone-700 cursor-pointer'
                }`}
              >
                <input
                  type="radio"
                  name="inputSource"
                  checked={inputSource === 'rew'}
                  disabled={!rewConnected}
                  onChange={() => onInputSourceChange('rew')}
                  className="mt-0.5 text-amber-500 focus:ring-0"
                />
                <div>
                  <div className="font-semibold text-xs text-stone-800 dark:text-stone-200">Pull from REW API</div>
                  <div className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
                    {rewConnected ? 'Ready (localhost:4735)' : 'Start REW with -api to enable'}
                  </div>
                </div>
              </label>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-stone-200 dark:border-stone-800/60 flex items-center text-[11px] text-stone-500 dark:text-stone-400">
            <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 mr-1.5 shrink-0" />
            <span>Harmonic modal scan (±10% tol)</span>
          </div>
        </div>

        {/* Step 2: House Target Curve */}
        <div className="bg-stone-50/90 border border-stone-200 dark:bg-stone-950/60 dark:border-stone-800/80 rounded-lg p-4 transition-colors">
          <div className="flex items-center space-x-2 text-xs font-bold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-3">
            <span className="h-5 w-5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-400 flex items-center justify-center text-[10px]">2</span>
            <span>Target House Curve</span>
          </div>

          <div className="space-y-2">
            {presets.map((p) => {
              const isSelected = target.name === p.id;
              return (
                <div
                  key={p.id}
                  onClick={() =>
                    onTargetChange({
                      ...target,
                      name: p.id,
                      bass_boost_db: p.bass,
                    })
                  }
                  className={`p-2.5 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                    isSelected
                      ? 'border-amber-500 bg-amber-50/80 text-amber-950 dark:border-amber-500 dark:bg-amber-500/10 dark:text-white shadow-sm'
                      : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300 dark:border-stone-800 dark:bg-stone-900/40 dark:text-stone-400 dark:hover:border-stone-700'
                  }`}
                >
                  <div>
                    <div className="font-semibold text-xs text-stone-800 dark:text-stone-200">{p.label}</div>
                    <div className="text-[10px] text-stone-500 dark:text-stone-400">{p.desc}</div>
                  </div>
                  {isSelected && <CheckCircle2 className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0 ml-2" />}
                </div>
              );
            })}
          </div>
        </div>

        {/* Step 3: Hardware Profile & Run Button */}
        <div className="bg-stone-50/90 border border-stone-200 dark:bg-stone-950/60 dark:border-stone-800/80 rounded-lg p-4 flex flex-col justify-between transition-colors">
          <div>
            <div className="flex items-center space-x-2 text-xs font-bold text-stone-500 dark:text-stone-400 uppercase tracking-wider mb-3">
              <span className="h-5 w-5 rounded-full bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-400 flex items-center justify-center text-[10px]">3</span>
              <span>Convolver & Hardware Targets</span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] font-medium text-stone-700 dark:text-stone-300">
              <div className="p-2 rounded-lg bg-white border border-stone-200 dark:bg-stone-900/60 dark:border-stone-800 flex items-center space-x-2">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                <span>Equalizer APO</span>
              </div>
              <div className="p-2 rounded-lg bg-white border border-stone-200 dark:bg-stone-900/60 dark:border-stone-800 flex items-center space-x-2">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                <span>CamillaDSP</span>
              </div>
              <div className="p-2 rounded-lg bg-white border border-stone-200 dark:bg-stone-900/60 dark:border-stone-800 flex items-center space-x-2">
                <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>
                <span>miniDSP Flex</span>
              </div>
              <div className="p-2 rounded-lg bg-white border border-stone-200 dark:bg-stone-900/60 dark:border-stone-800 flex items-center space-x-2">
                <span className="h-1.5 w-1.5 rounded-full bg-stone-500"></span>
                <span>Roon / WAV FIR</span>
              </div>
            </div>

            <div className="mt-3 text-[11px] text-stone-500 dark:text-stone-400">
              Tap length: <span className="font-mono text-amber-700 dark:text-amber-400 font-bold">65,536 Taps</span> (32-bit Float)
            </div>
          </div>

          {/* Big RUN Button */}
          <button
            onClick={onRun}
            disabled={isRunning}
            className={`w-full mt-4 py-3.5 px-4 rounded-xl font-extrabold text-sm tracking-wide flex items-center justify-center space-x-2 transition-all shadow-lg ${
              isRunning
                ? 'bg-stone-200 text-stone-500 dark:bg-stone-800 dark:text-stone-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-amber-500 via-amber-400 to-emerald-500 hover:from-amber-400 hover:to-emerald-400 text-stone-950 shadow-amber-500/25 hover:shadow-amber-500/40 hover:scale-[1.01] active:scale-[0.99]'
            }`}
          >
            {isRunning ? (
              <>
                <div className="h-4 w-4 border-2 border-stone-500 border-t-transparent rounded-full animate-spin"></div>
                <span>Optimizing Acoustic Filters...</span>
              </>
            ) : (
              <>
                <Play className="h-4 w-4 fill-current" />
                <span>🚀 RUN 1-CLICK OPTIMIZATION</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
