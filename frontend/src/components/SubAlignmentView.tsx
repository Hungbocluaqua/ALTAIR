import React, { useState, useRef, useEffect } from 'react';
import { SubAlignmentResult } from '../types';
import { simulateSubDelay } from '../api/client';
import { Volume2, ArrowRightLeft, Sparkles } from 'lucide-react';

interface SubAlignmentViewProps {
  subAlignment: SubAlignmentResult | null;
  onUpdateSummation?: (splSum: number[]) => void;
}

export const SubAlignmentView: React.FC<SubAlignmentViewProps> = ({
  subAlignment,
  onUpdateSummation,
}) => {
  const [currentDelay, setCurrentDelay] = useState(subAlignment?.optimal_delay_ms ?? 0);
  const [currentPolarity, setCurrentPolarity] = useState(subAlignment?.polarity_multiplier ?? 1.0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (subAlignment) {
      setCurrentDelay(subAlignment.optimal_delay_ms);
      setCurrentPolarity(subAlignment.polarity_multiplier);
    }
  }, [subAlignment?.optimal_delay_ms, subAlignment?.polarity_multiplier]);

  if (!subAlignment) return null;

  const runSimulation = async (val: number, pol: number) => {
    try {
      const res = await simulateSubDelay(val, pol, subAlignment.crossover_freq_hz);
      if (onUpdateSummation && res.spl_sum_db) {
        onUpdateSummation(res.spl_sum_db);
      }
    } catch (e) {
      console.error('Subwoofer simulation error:', e);
    }
  };

  const handleSliderChange = (val: number) => {
    setCurrentDelay(val);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      runSimulation(val, currentPolarity);
    }, 40);
  };

  const togglePolarity = () => {
    const nextPol = currentPolarity > 0 ? -1.0 : 1.0;
    setCurrentPolarity(nextPol);
    runSimulation(currentDelay, nextPol);
  };

  const resetToOptimal = () => {
    setCurrentDelay(subAlignment.optimal_delay_ms);
    setCurrentPolarity(subAlignment.polarity_multiplier);
    runSimulation(subAlignment.optimal_delay_ms, subAlignment.polarity_multiplier);
  };

  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  return (
    <div className="bg-white border border-stone-200 text-stone-800 dark:bg-[#121316] dark:border-stone-800 dark:text-stone-100 rounded-lg p-5 transition-colors shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-stone-200 dark:border-stone-800 transition-colors">
        <div className="flex items-center space-x-2">
          <Volume2 className="h-5 w-5 text-amber-700 dark:text-amber-500" />
          <h3 className="font-serif font-bold text-stone-900 dark:text-stone-100 text-sm tracking-tight">Subwoofer + Mains Phase Integration</h3>
        </div>

        <button
          onClick={resetToOptimal}
          className="flex items-center space-x-1.5 px-3 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-800 border border-amber-300 dark:text-amber-300 dark:border-amber-500/40 rounded text-xs font-mono font-semibold transition-all active:scale-[0.98]"
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span>Apply Optimal ({subAlignment.optimal_delay_ms > 0 ? `+${subAlignment.optimal_delay_ms.toFixed(2)}` : subAlignment.optimal_delay_ms.toFixed(2)} ms)</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
        {/* Metric 1: Optimal Delay */}
        <div className="bg-stone-50 border border-stone-200 dark:bg-[#0E0F12] dark:border-stone-800 rounded p-3.5 flex flex-col justify-between transition-colors">
          <div className="text-[11px] font-mono text-stone-500 dark:text-stone-400">Optimal Acoustic Delay</div>
          <div className="text-2xl font-extrabold text-stone-900 dark:text-stone-100 font-mono mt-1">
            {subAlignment.optimal_delay_ms > 0 ? `+${subAlignment.optimal_delay_ms.toFixed(2)}` : subAlignment.optimal_delay_ms.toFixed(2)}
            <span className="text-xs text-stone-400 font-normal ml-1">ms</span>
          </div>
          <div className="text-[11px] font-mono text-stone-400 mt-1">
            {subAlignment.optimal_delay_samples} samples at 48 kHz
          </div>
        </div>

        {/* Metric 2: Polarity */}
        <div className="bg-stone-50 border border-stone-200 dark:bg-[#0E0F12] dark:border-stone-800 rounded p-3.5 flex flex-col justify-between transition-colors">
          <div className="text-[11px] font-mono text-stone-500 dark:text-stone-400">Acoustic Polarity</div>
          <div className="text-lg font-bold text-stone-900 dark:text-stone-100 font-mono mt-1 flex items-center justify-between">
            <span>{currentPolarity > 0 ? 'Normal (+)' : 'Inverted (-)'}</span>
            <button
              onClick={togglePolarity}
              className="px-2 py-1 rounded border border-stone-300 dark:border-stone-700 bg-stone-200 hover:bg-stone-300 text-stone-700 dark:bg-stone-800 dark:hover:bg-stone-700 dark:text-stone-300 text-xs font-mono font-bold flex items-center space-x-1 transition-all active:scale-[0.98]"
            >
              <ArrowRightLeft className="h-3 w-3" />
              <span>Flip</span>
            </button>
          </div>
          <div className="text-[11px] font-mono text-stone-400 mt-1">
            Reverses electrical phase at crossover
          </div>
        </div>

        {/* Metric 3: Summation Gain */}
        <div className="bg-stone-50 border border-stone-200 dark:bg-[#0E0F12] dark:border-stone-800 rounded p-3.5 flex flex-col justify-between transition-colors">
          <div className="text-[11px] font-mono text-stone-500 dark:text-stone-400">Summation Gain Improvement</div>
          <div className="text-2xl font-extrabold text-amber-700 dark:text-amber-500 font-mono mt-1">
            +{subAlignment.gain_improvement_db.toFixed(1)}
            <span className="text-xs text-stone-400 font-normal ml-1">dB SPL</span>
          </div>
          <div className="text-[11px] font-mono text-stone-400 mt-1">
            Evaluated in {subAlignment.crossover_freq_hz / 2} - {subAlignment.crossover_freq_hz * 2} Hz band
          </div>
        </div>
      </div>

      {/* Interactive Delay Fine-Tuning Slider */}
      <div className="mt-5 p-4 rounded bg-stone-50 border border-stone-200 dark:bg-[#0E0F12] dark:border-stone-800 space-y-2">
        <div className="flex justify-between items-center text-xs font-mono">
          <span className="text-stone-600 dark:text-stone-400">Micro-Delay Scrubber (Real-time simulation)</span>
          <span className="text-amber-700 dark:text-amber-400 font-bold">{currentDelay.toFixed(2)} ms</span>
        </div>
        <input
          type="range"
          min="-20"
          max="20"
          step="0.1"
          value={currentDelay}
          onChange={(e) => handleSliderChange(parseFloat(e.target.value))}
          className="w-full h-1 bg-stone-300 dark:bg-stone-800 appearance-none cursor-pointer accent-amber-700 dark:accent-amber-500"
        />
        <div className="flex justify-between text-[10px] font-mono text-stone-400">
          <span>-20.0 ms (Delay Mains)</span>
          <span>0.0 ms</span>
          <span>+20.0 ms (Delay Sub)</span>
        </div>
      </div>
    </div>
  );
};
