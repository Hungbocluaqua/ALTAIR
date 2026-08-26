import React, { useRef } from 'react';
import { TargetCurveConfig, OptimizationRequest } from '../types';
import { Sliders, Upload, Music, Settings2, RefreshCw, Thermometer, Compass } from 'lucide-react';
import { uploadMeasurementFile } from '../api/client';

interface ExpertStudioProps {
  config: OptimizationRequest;
  onChange: (config: OptimizationRequest) => void;
  onRun: () => void;
  isRunning: boolean;
}

export const ExpertStudio: React.FC<ExpertStudioProps> = ({
  config,
  onChange,
  onRun,
  isRunning,
}) => {
  const fileLeftRef = useRef<HTMLInputElement>(null);
  const fileRightRef = useRef<HTMLInputElement>(null);
  const fileSubRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, channel: string) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];
    try {
      await uploadMeasurementFile(file, channel);
      alert(`Uploaded ${file.name} for ${channel.toUpperCase()} channel successfully!`);
      onChange({ ...config, use_demo_measurements: false });
    } catch (err: any) {
      alert(`Upload error: ${err.message}`);
    }
  };

  const updateTarget = (partial: Partial<TargetCurveConfig>) => {
    onChange({
      ...config,
      target: {
        ...config.target,
        name: 'custom',
        ...partial,
      },
    });
  };

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-6">
      <div className="flex items-center space-x-3 pb-4 border-b border-slate-800">
        <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
          <Settings2 className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-extrabold text-white tracking-tight">Expert Acoustic Studio</h2>
          <p className="text-xs text-slate-400">Custom Target Synthesis, Crossover Linearization & File Management</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Panel 1: File Uploader & Environmental Physics */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 space-y-3">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-2">
            <Upload className="h-4 w-4 text-cyan-400" />
            <span>Custom Measurement Ingestion</span>
          </h4>

          {/* Left Speaker */}
          <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-200">Left Speaker (Mains)</div>
              <div className="text-[10px] text-slate-400">REW .txt / .frd or .wav IR</div>
            </div>
            <input
              type="file"
              ref={fileLeftRef}
              onChange={(e) => handleFileUpload(e, 'left')}
              className="hidden"
              accept=".txt,.frd,.csv,.wav"
            />
            <button
              onClick={() => fileLeftRef.current?.click()}
              className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium"
            >
              Browse
            </button>
          </div>

          {/* Right Speaker */}
          <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-200">Right Speaker</div>
              <div className="text-[10px] text-slate-400">REW .txt / .frd or .wav IR</div>
            </div>
            <input
              type="file"
              ref={fileRightRef}
              onChange={(e) => handleFileUpload(e, 'right')}
              className="hidden"
              accept=".txt,.frd,.csv,.wav"
            />
            <button
              onClick={() => fileRightRef.current?.click()}
              className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium"
            >
              Browse
            </button>
          </div>

          {/* Subwoofer */}
          <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-200">Subwoofer (Optional)</div>
              <div className="text-[10px] text-slate-400">REW .txt / .frd or .wav IR</div>
            </div>
            <input
              type="file"
              ref={fileSubRef}
              onChange={(e) => handleFileUpload(e, 'sub')}
              className="hidden"
              accept=".txt,.frd,.csv,.wav"
            />
            <button
              onClick={() => fileSubRef.current?.click()}
              className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium"
            >
              Browse
            </button>
          </div>

          {/* Room Temperature & Mic Orientation */}
          <div className="pt-2 border-t border-slate-800/80 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span className="flex items-center space-x-1">
                <Thermometer className="h-3.5 w-3.5 text-amber-400" />
                <span>Room Temp</span>
              </span>
              <span className="font-mono text-cyan-400 font-bold">{config.temperature_celsius ?? 20}°C</span>
            </div>
            <input
              type="range"
              min="10"
              max="35"
              step="1"
              value={config.temperature_celsius ?? 20}
              onChange={(e) => onChange({ ...config, temperature_celsius: parseFloat(e.target.value) })}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />

            <div className="flex items-center justify-between text-xs text-slate-300 pt-1">
              <span className="flex items-center space-x-1">
                <Compass className="h-3.5 w-3.5 text-cyan-400" />
                <span>Mic Polar Angle</span>
              </span>
              <span className="font-mono text-cyan-400 font-bold">
                {(config.mic_orientation_deg ?? 0) === 90 ? '90° (Ceiling)' : '0° (On-Axis)'}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onChange({ ...config, mic_orientation_deg: 0.0 })}
                className={`py-1 rounded-lg text-xs font-medium border ${
                  (config.mic_orientation_deg ?? 0) === 0
                    ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300 font-bold'
                    : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
              >
                0° On-Axis
              </button>
              <button
                type="button"
                onClick={() => onChange({ ...config, mic_orientation_deg: 90.0 })}
                className={`py-1 rounded-lg text-xs font-medium border ${
                  (config.mic_orientation_deg ?? 0) === 90
                    ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300 font-bold'
                    : 'bg-slate-900 border-slate-800 text-slate-400'
                }`}
              >
                90° Diffuse
              </button>
            </div>

            {/* Relative Humidity Slider */}
            <div className="flex items-center justify-between text-xs text-slate-300 pt-1">
              <span>Relative Humidity</span>
              <span className="font-mono text-cyan-400 font-bold">{config.relative_humidity_pct ?? 50}% RH</span>
            </div>
            <input
              type="range"
              min="20"
              max="90"
              step="5"
              value={config.relative_humidity_pct ?? 50}
              onChange={(e) => onChange({ ...config, relative_humidity_pct: parseFloat(e.target.value) })}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
          </div>
        </div>

        {/* Panel 2: Parametric Target Curve Tuning */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 space-y-4">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-2">
            <Sliders className="h-4 w-4 text-cyan-400" />
            <span>Target House Curve Tuning</span>
          </h4>

          {/* Bass Boost */}
          <div>
            <div className="flex justify-between text-xs font-medium text-slate-300 mb-1">
              <span>Bass Shelf Boost</span>
              <span className="font-mono text-cyan-400 font-bold">+{config.target.bass_boost_db.toFixed(1)} dB</span>
            </div>
            <input
              type="range"
              min="0"
              max="12"
              step="0.5"
              value={config.target.bass_boost_db}
              onChange={(e) => updateTarget({ bass_boost_db: parseFloat(e.target.value) })}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
          </div>

          {/* Bass Cutoff */}
          <div>
            <div className="flex justify-between text-xs font-medium text-slate-300 mb-1">
              <span>Bass Shelf Cutoff</span>
              <span className="font-mono text-cyan-400 font-bold">{config.target.bass_cutoff_hz.toFixed(0)} Hz</span>
            </div>
            <input
              type="range"
              min="40"
              max="160"
              step="5"
              value={config.target.bass_cutoff_hz}
              onChange={(e) => updateTarget({ bass_cutoff_hz: parseFloat(e.target.value) })}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
          </div>

          {/* Treble Roll-Off */}
          <div>
            <div className="flex justify-between text-xs font-medium text-slate-300 mb-1">
              <span>Treble Roll-off Slope</span>
              <span className="font-mono text-cyan-400 font-bold">{config.target.hf_slope_db_per_oct.toFixed(2)} dB/oct</span>
            </div>
            <input
              type="range"
              min="-2.0"
              max="0.0"
              step="0.1"
              value={config.target.hf_slope_db_per_oct}
              onChange={(e) => updateTarget({ hf_slope_db_per_oct: parseFloat(e.target.value) })}
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
            />
          </div>
        </div>

        {/* Panel 3: Acoustic Filter & DSP Parameters */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 space-y-4 flex flex-col justify-between">
          <div>
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-2 mb-3">
              <Music className="h-4 w-4 text-cyan-400" />
              <span>Acoustic Crossover & Tap Sizes</span>
            </h4>

            {/* Speaker Crossover */}
            <div className="mb-3">
              <div className="flex justify-between text-xs font-medium text-slate-300 mb-1">
                <span>Loudspeaker Crossover Freq</span>
                <span className="font-mono text-cyan-400 font-bold">{config.crossover_freq_hz} Hz</span>
              </div>
              <input
                type="range"
                min="800"
                max="4500"
                step="50"
                value={config.crossover_freq_hz}
                onChange={(e) => onChange({ ...config, crossover_freq_hz: parseFloat(e.target.value) })}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
            </div>

            {/* Sub Crossover */}
            <div className="mb-3">
              <div className="flex justify-between text-xs font-medium text-slate-300 mb-1">
                <span>Subwoofer Crossover Freq</span>
                <span className="font-mono text-cyan-400 font-bold">{config.sub_crossover_freq_hz} Hz</span>
              </div>
              <input
                type="range"
                min="40"
                max="160"
                step="5"
                value={config.sub_crossover_freq_hz}
                onChange={(e) => onChange({ ...config, sub_crossover_freq_hz: parseFloat(e.target.value) })}
                className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-cyan-500"
              />
            </div>

            {/* FIR Tap Length */}
            <div>
              <label className="text-xs font-medium text-slate-300 block mb-1">FIR Tap Length</label>
              <select
                value={config.target_taps}
                onChange={(e) => onChange({ ...config, target_taps: parseInt(e.target.value) })}
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono text-cyan-400 font-semibold"
              >
                <option value="4096">4,096 Taps (miniDSP Flex / Low Latency)</option>
                <option value="16384">16,384 Taps (Medium Hardware)</option>
                <option value="65536">65,536 Taps (Recommended / PC / CamillaDSP)</option>
                <option value="131072">131,072 Taps (Ultimate Audiophile / Roon)</option>
              </select>
            </div>
          </div>

          <button
            onClick={onRun}
            disabled={isRunning}
            className="w-full py-3 px-4 rounded-xl font-extrabold text-xs tracking-wide bg-gradient-to-r from-cyan-500 to-emerald-500 text-slate-950 flex items-center justify-center space-x-2 hover:scale-[1.01] transition-all shadow-md shadow-cyan-500/20"
          >
            <RefreshCw className={`h-4 w-4 ${isRunning ? 'animate-spin' : ''}`} />
            <span>RE-CALCULATE OPTIMIZED FILTERS</span>
          </button>
        </div>
      </div>
    </div>
  );
};
