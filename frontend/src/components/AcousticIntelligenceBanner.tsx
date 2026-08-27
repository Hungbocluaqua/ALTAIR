import React from 'react';
import { AcousticIntelligence } from '../types';
import { Sparkles, Thermometer, Wind, ShieldCheck } from 'lucide-react';

interface AcousticIntelligenceBannerProps {
  intel?: AcousticIntelligence;
  truePeakDb?: number;
  isZwickerMasked?: boolean;
}

export const AcousticIntelligenceBanner: React.FC<AcousticIntelligenceBannerProps> = ({ intel, truePeakDb, isZwickerMasked }) => {
  if (!intel) return null;

  return (
    <div className="bg-white border border-stone-200 text-stone-800 dark:bg-[#121316] dark:border-stone-800 dark:text-stone-100 rounded-lg p-4 transition-colors shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 pb-2.5 border-b border-stone-100 dark:border-stone-800/80">
        <div className="flex items-center space-x-2 text-xs font-mono font-bold text-amber-700 dark:text-amber-500 uppercase tracking-wider">
          <Sparkles className="h-4 w-4" />
          <span>Acoustic Room Intelligence (Auto-Diagnosed)</span>
        </div>
        <div className="flex items-center space-x-3 text-[11px] text-stone-500 dark:text-stone-400 font-mono">
          {intel.speed_of_sound_mps && (
            <div className="flex items-center space-x-1.5">
              <Thermometer className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
              <span>{intel.temperature_celsius ?? 20}°C • c = {intel.speed_of_sound_mps} m/s</span>
            </div>
          )}
          {intel.relative_humidity_pct !== undefined && (
            <div className="flex items-center space-x-1.5">
              <Wind className="h-3.5 w-3.5 text-stone-500" />
              <span>{intel.relative_humidity_pct}% RH • ISO 9613-1</span>
            </div>
          )}
          {isZwickerMasked && (
            <div className="flex items-center space-x-1 text-emerald-800 bg-emerald-50 border border-emerald-300 dark:text-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-500/30 px-2 py-0.5 rounded">
              <ShieldCheck className="h-3 w-3" />
              <span>Zwicker Masked</span>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Metric 1: Schroeder Transition */}
        <div className="p-3 rounded bg-stone-50 border border-stone-200 dark:bg-[#0E0F12] dark:border-stone-800 flex flex-col justify-between transition-colors">
          <div className="text-[11px] font-mono text-stone-500 dark:text-stone-400">Schroeder Transition</div>
          <div className="text-lg font-bold text-stone-900 dark:text-stone-100 font-mono mt-0.5">
            {intel.detected_schroeder_hz}
            <span className="text-xs text-stone-400 font-normal ml-1">Hz</span>
          </div>
          <div className="text-[10px] font-mono text-amber-700 dark:text-amber-500 mt-1 font-semibold">Modal / Diffuse boundary</div>
        </div>

        {/* Metric 2: Reflection Gap */}
        <div className="p-3 rounded bg-stone-50 border border-stone-200 dark:bg-[#0E0F12] dark:border-stone-800 flex flex-col justify-between transition-colors">
          <div className="text-[11px] font-mono text-stone-500 dark:text-stone-400">1st Reflection Arrival</div>
          <div className="text-lg font-bold text-stone-900 dark:text-stone-100 font-mono mt-0.5">
            {intel.detected_reflection_gap_ms}
            <span className="text-xs text-stone-400 font-normal ml-1">ms</span>
          </div>
          <div className="text-[10px] font-mono text-stone-500 mt-1">Room boundary offset</div>
        </div>

        {/* Metric 3: Recommended FDW */}
        <div className="p-3 rounded bg-stone-50 border border-stone-200 dark:bg-[#0E0F12] dark:border-stone-800 flex flex-col justify-between transition-colors">
          <div className="text-[11px] font-mono text-stone-500 dark:text-stone-400">Adaptive FDW Window</div>
          <div className="text-lg font-bold text-stone-900 dark:text-stone-100 font-mono mt-0.5">
            {intel.recommended_fdw_cycles}
            <span className="text-xs text-stone-400 font-normal ml-1">cycles</span>
          </div>
          <div className="text-[10px] font-mono text-stone-500 mt-1">Direct sound window</div>
        </div>

        {/* Metric 4: True-Peak */}
        <div className="p-3 rounded bg-stone-50 border border-stone-200 dark:bg-[#0E0F12] dark:border-stone-800 flex flex-col justify-between transition-colors">
          <div className="text-[11px] font-mono text-stone-500 dark:text-stone-400">True-Peak Headroom</div>
          <div className="text-lg font-bold text-stone-900 dark:text-stone-100 font-mono mt-0.5">
            {truePeakDb !== undefined ? `${truePeakDb.toFixed(2)}` : '-0.80'}
            <span className="text-xs text-stone-400 font-normal ml-1">dBTP</span>
          </div>
          <div className="text-[10px] font-mono text-stone-500 mt-1">ITU-R BS.1770 4x Oversampled</div>
        </div>
      </div>
    </div>
  );
};
