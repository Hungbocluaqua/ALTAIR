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
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
        <div className="flex items-center space-x-2">
          <Volume2 className="h-5 w-5 text-cyan-400" />
          <h3 className="font-bold text-slate-100 text-xs tracking-wider uppercase">Subwoofer + Mains Phase Integration</h3>
        </div>

        <button
          onClick={resetToOptimal}
          className="flex items-center space-x-1.5 px-3 py-1 bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded-lg text-xs font-semibold transition-colors"
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span>Apply Optimal ({subAlignment.optimal_delay_ms} ms)</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
        {/* Metric 1: Optimal Delay */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 flex flex-col justify-between">
          <div className="text-[11px] text-slate-400 font-medium">Optimal Acoustic Delay</div>
          <div className="text-2xl font-extrabold text-white font-mono mt-1">
            {subAlignment.optimal_delay_ms > 0 ? `+${subAlignment.optimal_delay_ms}` : subAlignment.optimal_delay_ms}
            <span className="text-xs text-slate-500 font-normal ml-1">ms</span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            {subAlignment.optimal_delay_samples} samples at 48 kHz
          </div>
        </div>

        {/* Metric 2: Polarity */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 flex flex-col justify-between">
          <div className="text-[11px] text-slate-400 font-medium">Acoustic Polarity</div>
          <div className="text-xl font-bold text-emerald-400 font-mono mt-1 flex items-center justify-between">
            <span>{currentPolarity > 0 ? 'Normal (+)' : 'Inverted (-)'}</span>
            <button
              onClick={togglePolarity}
              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs flex items-center space-x-1"
            >
              <ArrowRightLeft className="h-3 w-3" />
              <span>Flip</span>
            </button>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">
            Crossover: {subAlignment.crossover_freq_hz} Hz Linkwitz-Riley
          </div>
        </div>

        {/* Metric 3: Acoustic Gain Improvement */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5 flex flex-col justify-between">
          <div className="text-[11px] text-slate-400 font-medium">Summation Improvement</div>
          <div className="text-2xl font-extrabold text-cyan-400 font-mono mt-1">
            +{subAlignment.gain_improvement_db}
            <span className="text-xs text-slate-500 font-normal ml-1">dB SPL</span>
          </div>
          <div className="text-[11px] text-emerald-400 font-medium mt-1">
            Eliminates crossover cancellation dip
          </div>
        </div>
      </div>

      {/* Interactive Delay Slider */}
      <div className="mt-5 p-4 rounded-xl bg-slate-950/80 border border-slate-800">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-300 mb-2">
          <span>Manual Acoustic Delay Adjustment</span>
          <span className="font-mono text-cyan-400 font-bold text-sm">
            {currentDelay.toFixed(2)} ms
          </span>
        </div>

        <input
          type="range"
          min="-30"
          max="30"
          step="0.1"
          value={currentDelay}
          onChange={(e) => handleSliderChange(parseFloat(e.target.value))}
          className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
        />

        <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1">
          <span>-30.0 ms</span>
          <span>0.0 ms (Default)</span>
          <span>+30.0 ms</span>
        </div>
      </div>
    </div>
  );
};
