import React, { useRef, useState } from 'react';
import { TargetCurveConfig, OptimizationRequest } from '../types';
import { Sliders, Upload, Music, Settings2, RefreshCw, Thermometer, Compass, Layers, PlayCircle, Download, Zap, Radio, CheckCircle2, AlertCircle } from 'lucide-react';
import { uploadMeasurementFile, uploadRepeatedMeasurementFiles, uploadMultiSeatMeasurementFiles, triggerAutoRepeatedSweep } from '../api/client';

interface ExpertStudioProps {
  config: OptimizationRequest;
  onChange: (config: OptimizationRequest) => void;
  onRun: () => void;
  isRunning: boolean;
  rewConnected?: boolean;
}

export const ExpertStudio: React.FC<ExpertStudioProps> = ({
  config,
  onChange,
  onRun,
  isRunning,
  rewConnected = false,
}) => {
  const fileLeftRef = useRef<HTMLInputElement>(null);
  const fileRightRef = useRef<HTMLInputElement>(null);
  const fileSubRef = useRef<HTMLInputElement>(null);
  const [measurementMode, setMeasurementMode] = useState<'single' | 'repeated' | 'multi_seat'>('repeated');
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);

  // Automated Repeated Sweep State
  const [autoRepetitions, setAutoRepetitions] = useState<number>(4);
  const [isMeasuringAuto, setIsMeasuringAuto] = useState<boolean>(false);
  const [autoProgressText, setAutoProgressText] = useState<string | null>(null);

  const handleAutoMeasure = async (channel: string) => {
    setIsMeasuringAuto(true);
    const chLabel = channel === 'all' ? 'FULL 2.1 SYSTEM (L + R + Sub)' : channel.toUpperCase();
    setAutoProgressText(`⏳ Triggering automated ${autoRepetitions}x repeated sweeps for ${chLabel}... Please remain quiet.`);
    
    try {
      const res = await triggerAutoRepeatedSweep(channel, autoRepetitions, 48000, !rewConnected);
      setAutoProgressText(`✅ ${res.message || `Captured & coherently stacked ${autoRepetitions}x sweeps (+${res.snr_improvement_db} dB SNR boost)!`}`);
      onChange({ ...config, use_demo_measurements: false });
    } catch (err: any) {
      setAutoProgressText(`❌ Automated sweep failed: ${err.message}`);
    } finally {
      setIsMeasuringAuto(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, channel: string) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const files = e.target.files;
    
    try {
      if (files.length > 1 && measurementMode === 'repeated') {
        setUploadStatus(`Stacking ${files.length} repeated sweeps for ${channel.toUpperCase()}...`);
        const res = await uploadRepeatedMeasurementFiles(files, channel);
        setUploadStatus(`✅ ${channel.toUpperCase()}: Coherently stacked ${res.repetitions}x sweeps (+${res.snr_improvement_db} dB SNR gain)!`);
      } else if (files.length > 1 && measurementMode === 'multi_seat') {
        setUploadStatus(`Spatially averaging ${files.length} seat positions for ${channel.toUpperCase()}...`);
        const res = await uploadMultiSeatMeasurementFiles(files, channel);
        setUploadStatus(`✅ ${channel.toUpperCase()}: Hybrid spatial average computed across ${res.seat_count} seats!`);
      } else {
        const file = files[0];
        setUploadStatus(`Uploading ${file.name}...`);
        await uploadMeasurementFile(file, channel);
        setUploadStatus(`✅ ${channel.toUpperCase()}: ${file.name} uploaded successfully!`);
      }
      onChange({ ...config, use_demo_measurements: false });
    } catch (err: any) {
      setUploadStatus(`❌ Upload error: ${err.message}`);
    }
  };

  const downloadTestSweep = (channel: string) => {
    window.open(`/api/measurements/auto-sweep?channel=${channel}&duration_s=10.0&repetitions=2`, '_blank');
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
      <div className="flex items-center justify-between pb-4 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <Settings2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-extrabold text-white tracking-tight">Expert Acoustic Studio</h2>
            <p className="text-xs text-slate-400">Automated Repeated Sweeps, Noise Floor Stacking & Custom Target Tuning</p>
          </div>
        </div>

        <div className="flex items-center space-x-2 text-xs">
          <span className={`h-2.5 w-2.5 rounded-full ${rewConnected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
          <span className="text-slate-300 font-medium">
            {rewConnected ? 'REW Direct Active' : 'Standalone Mode (Simulation Ready)'}
          </span>
        </div>
      </div>

      {/* DEDICATED SECTION: 1-Click Automated Repeated Sweep Studio */}
      <div className="bg-gradient-to-r from-cyan-950/50 via-slate-950 to-indigo-950/40 border border-cyan-500/30 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
              <Zap className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-extrabold text-sm text-white tracking-wide uppercase flex items-center space-x-2">
                <span>Automated Repeated Sweep Studio</span>
                <span className="text-[10px] normal-case font-semibold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                  AcoustiX +9dB Noise Filter
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Sequentially fires sweeps through REW, aligns impulse peaks to sub-sample precision, and stacks time-domain waveforms.
              </p>
            </div>
          </div>

          {/* Repetition Selector */}
          <div className="flex items-center space-x-1.5 bg-slate-900/90 p-1 rounded-xl border border-slate-800">
            <span className="text-[11px] text-slate-400 font-semibold px-2">Stack:</span>
            {[
              { count: 2, snr: '+3.0 dB' },
              { count: 4, snr: '+6.0 dB' },
              { count: 8, snr: '+9.0 dB' },
            ].map((r) => (
              <button
                key={r.count}
                type="button"
                onClick={() => setAutoRepetitions(r.count)}
                className={`px-2.5 py-1 text-xs rounded-lg font-bold transition-all ${
                  autoRepetitions === r.count
                    ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/25'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {r.count}x <span className="text-[10px] font-mono opacity-80">({r.snr})</span>
              </button>
            ))}
          </div>
        </div>

        {/* Step-by-Step Instructions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1 text-xs text-slate-300">
          <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-start space-x-2">
            <span className="h-5 w-5 rounded-full bg-cyan-500/20 text-cyan-400 font-bold flex items-center justify-center shrink-0 text-[11px]">1</span>
            <span>Position mic at ear level in your primary listening seat.</span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-start space-x-2">
            <span className="h-5 w-5 rounded-full bg-cyan-500/20 text-cyan-400 font-bold flex items-center justify-center shrink-0 text-[11px]">2</span>
            <span>{rewConnected ? 'REW API is connected and ready to receive commands.' : 'Start REW with Preferences → API → Start Server (or use Standalone).'}</span>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-start space-x-2">
            <span className="h-5 w-5 rounded-full bg-cyan-500/20 text-cyan-400 font-bold flex items-center justify-center shrink-0 text-[11px]">3</span>
            <span>Click any channel below to run automated coherent sweep stacking.</span>
          </div>
        </div>

        {/* Automated Action Buttons */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          <button
            type="button"
            disabled={isMeasuringAuto}
            onClick={() => handleAutoMeasure('left')}
            className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center space-x-2 border border-slate-700 shadow-md transition-all hover:scale-[1.02]"
          >
            <PlayCircle className="h-4 w-4 text-cyan-400" />
            <span>Auto Left ({autoRepetitions}x)</span>
          </button>

          <button
            type="button"
            disabled={isMeasuringAuto}
            onClick={() => handleAutoMeasure('right')}
            className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center space-x-2 border border-slate-700 shadow-md transition-all hover:scale-[1.02]"
          >
            <PlayCircle className="h-4 w-4 text-cyan-400" />
            <span>Auto Right ({autoRepetitions}x)</span>
          </button>

          <button
            type="button"
            disabled={isMeasuringAuto}
            onClick={() => handleAutoMeasure('sub')}
            className="py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white font-bold text-xs flex items-center justify-center space-x-2 border border-slate-700 shadow-md transition-all hover:scale-[1.02]"
          >
            <PlayCircle className="h-4 w-4 text-amber-400" />
            <span>Auto Sub ({autoRepetitions}x)</span>
          </button>

          <button
            type="button"
            disabled={isMeasuringAuto}
            onClick={() => handleAutoMeasure('all')}
            className="py-2.5 px-3 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 disabled:opacity-50 text-slate-950 font-extrabold text-xs flex items-center justify-center space-x-1.5 shadow-lg shadow-cyan-500/20 transition-all hover:scale-[1.02]"
          >
            <Zap className="h-4 w-4 fill-slate-950" />
            <span>1-Click Full 2.1</span>
          </button>
        </div>

        {/* Live Auto-Sweep Status Feedback */}
        {autoProgressText && (
          <div className="p-3 rounded-xl bg-slate-900 border border-cyan-500/30 text-xs text-cyan-200 flex items-center justify-between animate-fadeIn">
            <span className="font-mono">{autoProgressText}</span>
            {isMeasuringAuto && <RefreshCw className="h-4 w-4 text-cyan-400 animate-spin ml-2 shrink-0" />}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Panel 1: File Uploader & Measurement Ingestion Mode */}
        <div className="bg-slate-950/60 border border-slate-800/80 rounded-2xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center space-x-2">
              <Upload className="h-4 w-4 text-cyan-400" />
              <span>Measurement Ingestion</span>
            </h4>
            <div className="flex bg-slate-900 p-0.5 rounded-lg border border-slate-800">
              <button
                type="button"
                onClick={() => setMeasurementMode('single')}
                className={`px-2 py-0.5 text-[10px] font-semibold rounded ${measurementMode === 'single' ? 'bg-cyan-500 text-black' : 'text-slate-400'}`}
              >
                1x
              </button>
              <button
                type="button"
                onClick={() => setMeasurementMode('repeated')}
                className={`px-2 py-0.5 text-[10px] font-semibold rounded ${measurementMode === 'repeated' ? 'bg-cyan-500 text-black' : 'text-slate-400'}`}
                title="Repeated Sweeps (+6dB to +9dB SNR boost)"
              >
                Repeats (SNR+)
              </button>
              <button
                type="button"
                onClick={() => setMeasurementMode('multi_seat')}
                className={`px-2 py-0.5 text-[10px] font-semibold rounded ${measurementMode === 'multi_seat' ? 'bg-cyan-500 text-black' : 'text-slate-400'}`}
                title="Multi-Seat Positions (Spatial Hybrid Averaging)"
              >
                Multi-Seat
              </button>
            </div>
          </div>

          {uploadStatus && (
            <div className="p-2 rounded-lg bg-cyan-950/40 border border-cyan-500/30 text-[11px] text-cyan-200">
              {uploadStatus}
            </div>
          )}

          {/* Left Speaker */}
          <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold text-slate-200">Left Speaker (Mains)</div>
              <div className="text-[10px] text-slate-400">
                {measurementMode === 'repeated' ? 'Select 2x - 8x sweeps (Auto +SNR)' : measurementMode === 'multi_seat' ? 'Select all seat positions' : 'REW .txt / .frd or .wav IR'}
              </div>
            </div>
            <input
              type="file"
              ref={fileLeftRef}
              multiple={measurementMode !== 'single'}
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
              <div className="text-[10px] text-slate-400">
                {measurementMode === 'repeated' ? 'Select 2x - 8x sweeps (Auto +SNR)' : measurementMode === 'multi_seat' ? 'Select all seat positions' : 'REW .txt / .frd or .wav IR'}
              </div>
            </div>
            <input
              type="file"
              ref={fileRightRef}
              multiple={measurementMode !== 'single'}
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
              multiple={measurementMode !== 'single'}
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

          {/* Automated Test Signal Generator */}
          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-300">
            <span className="flex items-center space-x-1.5">
              <Download className="h-3.5 w-3.5 text-cyan-400" />
              <span>Test Sweeps (24-bit)</span>
            </span>
            <div className="flex space-x-1">
              <button
                type="button"
                onClick={() => downloadTestSweep('left')}
                className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-[10px] rounded text-slate-300"
              >
                Left
              </button>
              <button
                type="button"
                onClick={() => downloadTestSweep('right')}
                className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-[10px] rounded text-slate-300"
              >
                Right
              </button>
              <button
                type="button"
                onClick={() => downloadTestSweep('sub')}
                className="px-2 py-0.5 bg-slate-800 hover:bg-slate-700 text-[10px] rounded text-slate-300"
              >
                Sub
              </button>
            </div>
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
