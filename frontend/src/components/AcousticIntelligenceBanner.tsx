import React from 'react';
import { AcousticIntelligence } from '../types';
import { Cpu, Waves, Gauge, Sparkles, Volume2, ShieldCheck } from 'lucide-react';

interface AcousticIntelligenceBannerProps {
  intel?: AcousticIntelligence;
}

export const AcousticIntelligenceBanner: React.FC<AcousticIntelligenceBannerProps> = ({ intel }) => {
  if (!intel) return null;

  return (
    <div className="bg-gradient-to-r from-slate-900 via-slate-900/90 to-cyan-950/40 border border-cyan-500/20 rounded-2xl p-4 shadow-xl">
      <div className="flex items-center space-x-2 text-xs font-bold text-cyan-400 uppercase tracking-wider mb-3">
        <Sparkles className="h-4 w-4 text-cyan-400" />
        <span>Acoustic Room Intelligence (Auto-Detected)</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Metric 1: Schroeder Transition */}
        <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col justify-between">
          <div className="text-[11px] text-slate-400 font-medium">Schroeder Transition</div>
          <div className="text-lg font-extrabold text-white font-mono mt-0.5">
            {intel.detected_schroeder_hz}
            <span className="text-xs text-slate-500 font-normal ml-1">Hz</span>
          </div>
          <div className="text-[10px] text-cyan-400 mt-1">Modal / Diffuse boundary</div>
        </div>

        {/* Metric 2: Reflection Gap */}
        <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col justify-between">
          <div className="text-[11px] text-slate-400 font-medium">1st Reflection Arrival</div>
          <div className="text-lg font-extrabold text-white font-mono mt-0.5">
            {intel.detected_reflection_gap_ms}
            <span className="text-xs text-slate-500 font-normal ml-1">ms</span>
          </div>
          <div className="text-[10px] text-emerald-400 mt-1">
            Auto FDW: {intel.recommended_fdw_cycles} cycles
          </div>
        </div>

        {/* Metric 3: Speaker Rolloff */}
        <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col justify-between">
          <div className="text-[11px] text-slate-400 font-medium">Speaker -6dB Rolloff</div>
          <div className="text-lg font-extrabold text-white font-mono mt-0.5">
            {intel.speaker_low_rolloff_hz}
            <span className="text-xs text-slate-500 font-normal ml-1">Hz</span>
          </div>
          <div className="text-[10px] text-slate-400 mt-1">Acoustic box limit</div>
        </div>

        {/* Metric 4: Recommended Sub Crossover */}
        <div className="p-3 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col justify-between">
          <div className="text-[11px] text-slate-400 font-medium">Ideal Sub Crossover</div>
          <div className="text-lg font-extrabold text-cyan-400 font-mono mt-0.5">
            {intel.recommended_sub_crossover_hz}
            <span className="text-xs text-slate-500 font-normal ml-1">Hz</span>
          </div>
          <div className="text-[10px] text-emerald-400 font-medium mt-1">Optimized for mains</div>
        </div>
      </div>
    </div>
  );
};
