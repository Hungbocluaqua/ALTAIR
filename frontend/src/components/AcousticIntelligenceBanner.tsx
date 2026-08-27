import React from 'react';
import { AcousticIntelligence } from '../types';
import { Sparkles, Thermometer, GitFork, Wind, ShieldCheck } from 'lucide-react';

interface AcousticIntelligenceBannerProps {
  intel?: AcousticIntelligence;
  truePeakDb?: number;
  isZwickerMasked?: boolean;
}

export const AcousticIntelligenceBanner: React.FC<AcousticIntelligenceBannerProps> = ({ intel, truePeakDb, isZwickerMasked }) => {
  if (!intel) return null;

  return (
    <div className="bg-gradient-to-r from-cyan-50/70 via-slate-50 to-indigo-50/50 border border-cyan-200/80 text-slate-800 shadow-md shadow-slate-200/50 dark:from-slate-900 dark:via-slate-900/90 dark:to-cyan-950/40 dark:border-cyan-500/20 dark:text-slate-100 dark:shadow-xl rounded-2xl p-4 transition-colors">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2 text-xs font-bold text-cyan-700 dark:text-cyan-400 uppercase tracking-wider">
          <Sparkles className="h-4 w-4 text-cyan-600 dark:text-cyan-400" />
          <span>Acoustic Room Intelligence (Auto-Diagnosed)</span>
        </div>
        <div className="flex items-center space-x-3 text-[11px] text-slate-500 dark:text-slate-400 font-mono">
          {intel.speed_of_sound_mps && (
            <div className="flex items-center space-x-1.5">
              <Thermometer className="h-3.5 w-3.5 text-amber-500 dark:text-amber-400" />
              <span>{intel.temperature_celsius ?? 20}°C • c = {intel.speed_of_sound_mps} m/s</span>
            </div>
          )}
          {intel.relative_humidity_pct !== undefined && (
            <div className="flex items-center space-x-1.5">
              <Wind className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
              <span>{intel.relative_humidity_pct}% RH • ISO 9613-1</span>
            </div>
          )}
          {isZwickerMasked && (
            <div className="flex items-center space-x-1 text-emerald-700 bg-emerald-100/80 border border-emerald-300 dark:text-emerald-400 dark:bg-emerald-950/60 dark:border-emerald-500/30 px-2 py-0.5 rounded-md">
              <ShieldCheck className="h-3 w-3" />
              <span>Zwicker Masked</span>
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Metric 1: Schroeder Transition */}
        <div className="p-3 rounded-xl bg-white border border-slate-200 text-slate-800 shadow-sm dark:bg-slate-950/60 dark:border-slate-800 dark:text-white flex flex-col justify-between transition-colors">
          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Schroeder Transition</div>
          <div className="text-lg font-extrabold text-slate-900 dark:text-white font-mono mt-0.5">
            {intel.detected_schroeder_hz}
            <span className="text-xs text-slate-400 dark:text-slate-500 font-normal ml-1">Hz</span>
          </div>
          <div className="text-[10px] text-cyan-700 dark:text-cyan-400 mt-1 font-semibold">Modal / Diffuse boundary</div>
        </div>

        {/* Metric 2: Reflection Gap */}
        <div className="p-3 rounded-xl bg-white border border-slate-200 text-slate-800 shadow-sm dark:bg-slate-950/60 dark:border-slate-800 dark:text-white flex flex-col justify-between transition-colors">
          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">1st Reflection Arrival</div>
          <div className="text-lg font-extrabold text-slate-900 dark:text-white font-mono mt-0.5">
            {intel.detected_reflection_gap_ms}
            <span className="text-xs text-slate-400 dark:text-slate-500 font-normal ml-1">ms</span>
          </div>
          <div className="text-[10px] text-emerald-700 dark:text-emerald-400 mt-1 font-semibold">
            Auto FDW: {intel.recommended_fdw_cycles} cycles
          </div>
        </div>

        {/* Metric 3: Speaker Rolloff */}
        <div className="p-3 rounded-xl bg-white border border-slate-200 text-slate-800 shadow-sm dark:bg-slate-950/60 dark:border-slate-800 dark:text-white flex flex-col justify-between transition-colors">
          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Speaker -6dB Rolloff</div>
          <div className="text-lg font-extrabold text-slate-900 dark:text-white font-mono mt-0.5">
            {intel.speaker_low_rolloff_hz}
            <span className="text-xs text-slate-400 dark:text-slate-500 font-normal ml-1">Hz</span>
          </div>
          <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 font-medium">Acoustic box limit</div>
        </div>

        {/* Metric 4: Recommended Sub Crossover */}
        <div className="p-3 rounded-xl bg-white border border-slate-200 text-slate-800 shadow-sm dark:bg-slate-950/60 dark:border-slate-800 dark:text-white flex flex-col justify-between transition-colors">
          <div className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">Ideal Sub Crossover</div>
          <div className="text-lg font-extrabold text-cyan-700 dark:text-cyan-400 font-mono mt-0.5">
            {intel.recommended_sub_crossover_hz}
            <span className="text-xs text-slate-400 dark:text-slate-500 font-normal ml-1">Hz</span>
          </div>
          <div className="text-[10px] text-emerald-700 dark:text-emerald-400 font-semibold mt-1">Optimized for mains</div>
        </div>
      </div>

      {/* AcoustiCX Physical Geometry, Distances & Hardware Crossover Section */}
      {intel.microphone_geometry && (
        <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800/80 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs transition-colors">
          {/* Column 1: Microphone Off-Center & Distances */}
          <div className="p-2.5 rounded-lg bg-white/90 border border-slate-200 dark:bg-slate-950/40 dark:border-slate-800/60 shadow-sm">
            <div className="flex items-center justify-between text-slate-800 dark:text-slate-300 font-semibold mb-1.5">
              <span className="flex items-center space-x-1.5 text-cyan-700 dark:text-cyan-400">
                <span>📍 Physical Geometry & Distances</span>
              </span>
              {intel.microphone_geometry.impulse_response_correlation !== undefined && (
                <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
                  IR Correlation: <span className="text-emerald-700 dark:text-emerald-400 font-bold">{(intel.microphone_geometry.impulse_response_correlation * 100).toFixed(1)}%</span>
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-700 dark:text-slate-300 font-medium mb-1">
              {intel.microphone_geometry.geometry_summary}
            </p>
            <div className="flex items-center space-x-3 text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-1.5">
              <span>L: <span className="text-slate-900 dark:text-white font-bold">{intel.microphone_geometry.distances.front_left.meters}m ({intel.microphone_geometry.distances.front_left.feet}ft)</span></span>
              <span>R: <span className="text-slate-900 dark:text-white font-bold">{intel.microphone_geometry.distances.front_right.meters}m ({intel.microphone_geometry.distances.front_right.feet}ft)</span></span>
              {intel.microphone_geometry.distances.subwoofer && (
                <span>Sub: <span className="text-cyan-700 dark:text-cyan-300 font-bold">{intel.microphone_geometry.distances.subwoofer.meters}m ({intel.microphone_geometry.distances.subwoofer.feet}ft)</span></span>
              )}
            </div>
          </div>

          {/* Column 2: Hardware Crossover Snapping & Split Gain Staging */}
          <div className="p-2.5 rounded-lg bg-white/90 border border-slate-200 dark:bg-slate-950/40 dark:border-slate-800/60 shadow-sm flex flex-col justify-between">
            {intel.crossover_hardware_snapping && (
              <div>
                <div className="flex items-center justify-between text-slate-800 dark:text-slate-300 font-semibold mb-1">
                  <span className="text-amber-700 dark:text-amber-400 font-bold">🎛️ Snapped Hardware Crossover</span>
                  <span className="text-[11px] font-mono text-emerald-700 bg-emerald-100/80 px-1.5 py-0.5 rounded border border-emerald-300 dark:text-emerald-400 dark:bg-emerald-950/60 dark:border-emerald-500/20">
                    Snap: {intel.crossover_hardware_snapping.snapped_hardware_crossover_hz} Hz
                  </span>
                </div>
                <p className="text-[10.5px] text-slate-600 dark:text-slate-400">
                  {intel.crossover_hardware_snapping.summary}
                </p>
              </div>
            )}
            {intel.split_gain_staging && (
              <div className="mt-2 pt-2 border-t border-slate-200 dark:border-slate-800/40 flex items-center justify-between text-[11px] font-mono">
                <span className="text-slate-500 dark:text-slate-400">Dynamic Range Split:</span>
                <span className="text-slate-700 dark:text-slate-200">
                  Hardware: <span className="text-amber-700 dark:text-amber-400 font-semibold">{intel.split_gain_staging.recommended_hardware_db} dB</span> • DSP: <span className="text-cyan-700 dark:text-cyan-400 font-semibold">{intel.split_gain_staging.dsp_fine_trim_db > 0 ? `+${intel.split_gain_staging.dsp_fine_trim_db}` : intel.split_gain_staging.dsp_fine_trim_db} dB</span>
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Extra Row: Group Delay Crossovers & SBIR Diagnostic */}
      <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs transition-colors">
        {intel.detected_crossovers && intel.detected_crossovers.length > 0 && (
          <div className="flex items-center space-x-2 text-slate-500 dark:text-slate-400">
            <GitFork className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-400" />
            <span>Auto Group-Delay Crossovers:</span>
            <span className="font-mono text-slate-800 dark:text-slate-200 font-semibold">
              {intel.detected_crossovers.map((c) => `${c.frequency_hz} Hz (${c.group_delay_peak_ms} ms)`).join(', ')}
            </span>
          </div>
        )}
        {intel.sbir_diagnostics && intel.sbir_diagnostics.length > 0 && (
          <div className="flex items-center space-x-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <span className="text-amber-700 dark:text-amber-400 font-semibold">SBIR Boundary Dips:</span>
            <span className="font-mono text-slate-700 dark:text-slate-300">
              {intel.sbir_diagnostics.filter(s => s.is_sbir_null).map(s => `${s.frequency_hz} Hz (${s.estimated_boundary_distance_m}m)`).join(', ') || 'None detected'}
            </span>
          </div>
        )}
        {truePeakDb !== undefined && (
          <div className="text-[11px] font-mono text-slate-500 dark:text-slate-400">
            True-Peak: <span className="text-emerald-700 dark:text-emerald-400 font-bold">{truePeakDb.toFixed(1)} dBTP</span>
          </div>
        )}
      </div>
    </div>
  );
};
