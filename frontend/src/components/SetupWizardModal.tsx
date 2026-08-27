import React, { useState, useRef } from 'react';
import {
  X,
  Sliders,
  Mic,
  Waves,
  FolderOpen,
  CheckCircle2,
  PlayCircle,
  Zap,
  Layers,
  Thermometer,
  Wind,
  Compass,
  ArrowRight,
  ArrowLeft,
  Upload,
} from 'lucide-react';
import { OptimizationRequest, StatusResponse } from '../types';
import {
  uploadMeasurementFile,
  uploadCalFile,
  uploadMultiSubMeasurementFiles,
  uploadRepeatedMeasurementFiles,
  uploadMultiSeatMeasurementFiles,
  runRepeatedSweeps,
} from '../api/client';

interface SetupWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  config: OptimizationRequest;
  onChangeConfig: (newConfig: OptimizationRequest) => void;
  status: StatusResponse | null;
  onLog: (message: string, level?: 'info' | 'success' | 'warn' | 'error' | 'dsp' | 'geom', tag?: string) => void;
}

export const SetupWizardModal: React.FC<SetupWizardModalProps> = ({
  isOpen,
  onClose,
  config,
  onChangeConfig,
  status,
  onLog,
}) => {
  if (!isOpen) return null;

  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4>(1);

  // File Upload Refs
  const leftFileRef = useRef<HTMLInputElement>(null);
  const rightFileRef = useRef<HTMLInputElement>(null);
  const subFileRef = useRef<HTMLInputElement>(null);
  const calFileRef = useRef<HTMLInputElement>(null);
  const multiSubRef = useRef<HTMLInputElement>(null);

  // Local state
  const [measurementMode, setMeasurementMode] = useState<'single' | 'repeated' | 'multi_seat'>('single');
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [calStatus, setCalStatus] = useState<string | null>(null);
  const [multiSubStatus, setMultiSubStatus] = useState<string | null>(null);
  const [isMeasuringAuto, setIsMeasuringAuto] = useState<boolean>(false);
  const [autoRepetitions, setAutoRepetitions] = useState<number>(4);
  const [autoSweepResult, setAutoSweepResult] = useState<any>(null);

  // Speed of sound preview
  const speedOfSound = (331.3 * Math.sqrt(Math.max(0.1, 1.0 + (config.temperature_celsius ?? 20.0) / 273.15))).toFixed(1);

  // Upload Handlers
  const handleSingleUpload = async (e: React.ChangeEvent<HTMLInputElement>, channel: 'left' | 'right' | 'sub') => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setUploadStatus(`Uploading ${file.name} for ${channel}...`);
      await uploadMeasurementFile(file, channel, 'ir');
      setUploadStatus(`${channel.toUpperCase()} loaded: ${file.name}`);
      onLog(`Ingested ${channel.toUpperCase()} measurement: ${file.name}`, 'success', 'INGEST');
    } catch (err: any) {
      setUploadStatus(`Error: ${err.message}`);
      onLog(`Upload failed for ${channel}: ${err.message}`, 'error', 'ERR');
    }
  };

  const handleCalUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      setCalStatus(`Uploading calibration: ${file.name}...`);
      await uploadCalFile(file);
      setCalStatus(`Calibrated: ${file.name}`);
      onLog(`Loaded microphone calibration file: ${file.name}`, 'success', 'CAL');
    } catch (err: any) {
      setCalStatus(`Cal error: ${err.message}`);
      onLog(`Calibration upload failed: ${err.message}`, 'error', 'ERR');
    }
  };

  const handleMultiSubUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    try {
      setMultiSubStatus(`Uploading ${files.length} subwoofers...`);
      await uploadMultiSubMeasurementFiles(files);
      setMultiSubStatus(`${files.length} subs loaded`);
      onLog(`Multi-Sub matrix loaded with ${files.length} subwoofer channels`, 'success', 'MSO');
    } catch (err: any) {
      setMultiSubStatus(`Error: ${err.message}`);
      onLog(`Multi-Sub upload failed: ${err.message}`, 'error', 'ERR');
    }
  };

  const handleAutoMeasure = async (channel: 'left' | 'right' | 'sub' | 'all') => {
    setIsMeasuringAuto(true);
    setUploadStatus(`Sweeping ${channel.toUpperCase()} (${autoRepetitions}x coherent stacking)...`);
    onLog(`Triggered automated repeated sweep (${channel.toUpperCase()}, ${autoRepetitions}x)...`, 'dsp', 'SWEEP');

    try {
      const res = await runRepeatedSweeps({
        channel,
        repetitions: autoRepetitions,
        outlier_rejection: true,
      });

      setAutoSweepResult(res);
      const snrTxt = typeof res.estimated_snr_db === 'number' ? ` (+${res.estimated_snr_db.toFixed(1)} dB SNR gain)` : '';
      setUploadStatus(`${channel.toUpperCase()} stacked: ${res.valid_sweeps} sweeps${snrTxt}`);
      onLog(
        `Coherent stacking complete for ${channel.toUpperCase()}: ${res.valid_sweeps} sweeps accepted${snrTxt}`,
        'success',
        'SWEEP'
      );
    } catch (err: any) {
      // Graceful fallback to internal simulation if REW is not available
      try {
        const res = await runRepeatedSweeps({
          channel,
          repetitions: autoRepetitions,
          outlier_rejection: true,
          use_simulation: true,
        });
        setAutoSweepResult(res);
        setUploadStatus(`${channel.toUpperCase()} synthesized (Simulated reference)`);
        onLog(`Generated laboratory simulation for ${channel.toUpperCase()} (${autoRepetitions}x stack)`, 'info', 'SWEEP');
      } catch (simErr: any) {
        setUploadStatus(`Sweep failed: ${err.message}`);
        onLog(`Automated sweep error: ${err.message}`, 'error', 'ERR');
      }
    } finally {
      setIsMeasuringAuto(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm animate-fadeIn">
      <div className="bg-white dark:bg-[#121316] text-stone-900 dark:text-stone-100 border border-stone-200 dark:border-stone-800 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Modal Top Header */}
        <div className="p-5 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between bg-stone-50/70 dark:bg-[#0E0F12]/70">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-amber-700/10 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
              <Sliders className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[10px] font-mono font-bold tracking-widest text-amber-700 dark:text-amber-500 uppercase">
                ALTAIR ACOUSTIC LABORATORY
              </div>
              <h2 className="text-lg font-serif font-bold text-stone-900 dark:text-stone-100 tracking-tight">
                Measurement & Ingestion Wizard
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-stone-200 dark:hover:bg-stone-800 text-stone-500 dark:text-stone-400 hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Linear Stepper Nav */}
        <div className="border-b border-stone-200 dark:border-stone-800 px-6 py-3 bg-stone-100/40 dark:bg-[#0A0B0D] flex items-center justify-between text-xs font-sans">
          {[
            { num: 1, label: 'Environment & Mic', icon: Thermometer },
            { num: 2, label: 'Sweep & Capture', icon: Waves },
            { num: 3, label: 'Multi-Sub & Spatial', icon: Layers },
            { num: 4, label: 'Verification', icon: CheckCircle2 },
          ].map((s) => {
            const Icon = s.icon;
            const isActive = currentStep === s.num;
            const isDone = currentStep > s.num;
            return (
              <button
                key={s.num}
                type="button"
                onClick={() => setCurrentStep(s.num as any)}
                className={`flex items-center space-x-2 transition-colors py-1 px-2 rounded ${
                  isActive
                    ? 'font-bold text-amber-800 dark:text-amber-400'
                    : isDone
                      ? 'text-stone-700 dark:text-stone-300 font-medium'
                      : 'text-stone-400 dark:text-stone-600'
                }`}
              >
                <div
                  className={`h-5 w-5 rounded-full flex items-center justify-center text-[10px] font-mono font-bold ${
                    isActive
                      ? 'bg-amber-700 text-white dark:bg-amber-500 dark:text-stone-950'
                      : isDone
                        ? 'bg-stone-300 text-stone-800 dark:bg-stone-800 dark:text-stone-200'
                        : 'bg-stone-200 text-stone-500 dark:bg-stone-900 dark:text-stone-500'
                  }`}
                >
                  {isDone ? '✓' : s.num}
                </div>
                <span className="hidden sm:inline">{s.label}</span>
              </button>
            );
          })}
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* STEP 1: ENVIRONMENT & MICROPHONE */}
          {currentStep === 1 && (
            <div className="space-y-6 animate-fadeIn">
              <div>
                <h3 className="text-base font-serif font-bold text-stone-900 dark:text-stone-100">
                  Microphone Calibration & Room Atmospheric Physics
                </h3>
                <p className="text-xs text-stone-600 dark:text-stone-300 font-sans mt-1">
                  Accurate speed of sound and ISO 9613-1 air absorption calculations require room temperature and humidity calibration.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Environmental Physics Panel */}
                <div className="p-4 rounded-lg bg-stone-50 dark:bg-[#0E0F12] border border-stone-200 dark:border-stone-800 space-y-4">
                  <div className="flex items-center space-x-2 font-serif font-semibold text-stone-900 dark:text-stone-100 text-sm">
                    <Thermometer className="h-4 w-4 text-amber-700 dark:text-amber-500" />
                    <span>Atmospheric Conditions</span>
                  </div>

                  {/* Temperature */}
                  <div>
                    <div className="flex justify-between items-center text-xs mb-1 font-sans">
                      <span className="text-stone-700 dark:text-stone-300">Room Temperature (°C):</span>
                      <input
                        type="number"
                        step="0.5"
                        min="-10"
                        max="50"
                        value={config.temperature_celsius ?? 20.0}
                        onChange={(e) => onChangeConfig({ ...config, temperature_celsius: parseFloat(e.target.value) || 20.0 })}
                        className="w-20 px-2 py-0.5 text-right font-mono text-xs rounded bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 text-stone-900 dark:text-stone-100 font-bold"
                      />
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="35"
                      step="0.5"
                      value={config.temperature_celsius ?? 20.0}
                      onChange={(e) => onChangeConfig({ ...config, temperature_celsius: parseFloat(e.target.value) })}
                      className="w-full h-1 bg-stone-300 dark:bg-stone-700 appearance-none cursor-pointer accent-amber-700 dark:accent-amber-500"
                    />
                  </div>

                  {/* Relative Humidity */}
                  <div>
                    <div className="flex justify-between items-center text-xs mb-1 font-sans">
                      <span className="text-stone-700 dark:text-stone-300">Relative Humidity (%):</span>
                      <input
                        type="number"
                        step="1"
                        min="10"
                        max="95"
                        value={config.relative_humidity_pct ?? 50.0}
                        onChange={(e) => onChangeConfig({ ...config, relative_humidity_pct: parseFloat(e.target.value) || 50.0 })}
                        className="w-20 px-2 py-0.5 text-right font-mono text-xs rounded bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 text-stone-900 dark:text-stone-100 font-bold"
                      />
                    </div>
                    <input
                      type="range"
                      min="20"
                      max="90"
                      step="1"
                      value={config.relative_humidity_pct ?? 50.0}
                      onChange={(e) => onChangeConfig({ ...config, relative_humidity_pct: parseFloat(e.target.value) })}
                      className="w-full h-1 bg-stone-300 dark:bg-stone-700 appearance-none cursor-pointer accent-amber-700 dark:accent-amber-500"
                    />
                  </div>

                  {/* Speed of Sound Readout */}
                  <div className="pt-2 border-t border-stone-200 dark:border-stone-800 flex justify-between items-center text-xs">
                    <span className="text-stone-500 dark:text-stone-400">Calculated Velocity c(T):</span>
                    <strong className="font-mono text-stone-900 dark:text-stone-100 font-bold">
                      {speedOfSound} m/s
                    </strong>
                  </div>
                </div>

                {/* Microphone Setup Panel */}
                <div className="p-4 rounded-lg bg-stone-50 dark:bg-[#0E0F12] border border-stone-200 dark:border-stone-800 space-y-4">
                  <div className="flex items-center space-x-2 font-serif font-semibold text-stone-900 dark:text-stone-100 text-sm">
                    <Mic className="h-4 w-4 text-amber-700 dark:text-amber-500" />
                    <span>Microphone Calibration & Angle</span>
                  </div>

                  {/* Mic File Upload */}
                  <div>
                    <span className="text-xs text-stone-700 dark:text-stone-300 font-sans block mb-1">
                      Microphone Calibration File (.cal / .txt):
                    </span>
                    <div className="flex items-center space-x-2">
                      <input type="file" ref={calFileRef} onChange={handleCalUpload} className="hidden" accept=".cal,.txt" />
                      <button
                        type="button"
                        onClick={() => calFileRef.current?.click()}
                        className="px-3 py-1.5 rounded bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 text-xs font-sans font-semibold hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors flex items-center space-x-1.5"
                      >
                        <Upload className="h-3.5 w-3.5" />
                        <span>Upload .cal</span>
                      </button>
                      <span className="text-xs font-mono text-stone-600 dark:text-stone-300 truncate">
                        {calStatus ?? 'No calibration curve loaded'}
                      </span>
                    </div>
                  </div>

                  {/* Orientation Selector */}
                  <div>
                    <span className="text-xs text-stone-700 dark:text-stone-300 font-sans block mb-1">
                      Measurement Angle:
                    </span>
                    <div className="grid grid-cols-2 gap-2 text-xs font-sans">
                      <button
                        type="button"
                        onClick={() => onChangeConfig({ ...config, mic_orientation_deg: 0.0 })}
                        className={`p-2.5 rounded border text-left transition-all ${
                          (config.mic_orientation_deg ?? 0.0) === 0.0
                            ? 'border-amber-700 bg-amber-500/10 text-amber-900 dark:text-amber-300 font-bold'
                            : 'border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-400'
                        }`}
                      >
                        <div className="font-semibold">0° On-Axis</div>
                        <div className="text-[10px] text-stone-500 dark:text-stone-400 mt-0.5">Pointed at speakers</div>
                      </button>
                      <button
                        type="button"
                        onClick={() => onChangeConfig({ ...config, mic_orientation_deg: 90.0 })}
                        className={`p-2.5 rounded border text-left transition-all ${
                          config.mic_orientation_deg === 90.0
                            ? 'border-amber-700 bg-amber-500/10 text-amber-900 dark:text-amber-300 font-bold'
                            : 'border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-400'
                        }`}
                      >
                        <div className="font-semibold">90° Diffuse</div>
                        <div className="text-[10px] text-stone-500 dark:text-stone-400 mt-0.5">Pointed at ceiling</div>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: SWEEP CAPTURE & INGESTION */}
          {currentStep === 2 && (
            <div className="space-y-6 animate-fadeIn">
              <div>
                <h3 className="text-base font-serif font-bold text-stone-900 dark:text-stone-100">
                  Impulse Response Capture & Automated Sweeps
                </h3>
                <p className="text-xs text-stone-600 dark:text-stone-300 font-sans mt-1">
                  Execute automated repeated sweep stacking for +6.0 dB SNR noise rejection, or ingest existing measurement files.
                </p>
              </div>

              {/* Ingestion Mode Selector */}
              <div className="flex items-center space-x-2 border-b border-stone-200 dark:border-stone-800 pb-3">
                <span className="text-xs font-sans font-semibold text-stone-700 dark:text-stone-300">Capture Mode:</span>
                <div className="flex bg-stone-100 dark:bg-stone-900 p-0.5 rounded border border-stone-200 dark:border-stone-800 text-xs font-sans">
                  <button
                    type="button"
                    onClick={() => setMeasurementMode('single')}
                    className={`px-3 py-1 rounded font-medium transition-all ${
                      measurementMode === 'single'
                        ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 font-bold shadow-sm'
                        : 'text-stone-600 dark:text-stone-400'
                    }`}
                  >
                    Automated Sweeps (Live)
                  </button>
                  <button
                    type="button"
                    onClick={() => setMeasurementMode('repeated')}
                    className={`px-3 py-1 rounded font-medium transition-all ${
                      measurementMode === 'repeated'
                        ? 'bg-white dark:bg-stone-800 text-stone-900 dark:text-stone-100 font-bold shadow-sm'
                        : 'text-stone-600 dark:text-stone-400'
                    }`}
                  >
                    Manual File Ingest (.wav/.txt/.mdat)
                  </button>
                </div>
              </div>

              {/* Mode A: Automated Sweeps */}
              {measurementMode === 'single' && (
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-lg bg-stone-50 dark:bg-[#0E0F12] border border-stone-200 dark:border-stone-800 text-xs">
                    <div className="flex items-center space-x-2">
                      <span className="font-semibold text-stone-800 dark:text-stone-200">Stacking Repetitions:</span>
                      <div className="flex space-x-1 font-mono">
                        {[1, 2, 4, 8].map((n) => (
                          <button
                            key={n}
                            type="button"
                            onClick={() => setAutoRepetitions(n)}
                            className={`px-2.5 py-1 rounded font-bold border transition-colors ${
                              autoRepetitions === n
                                ? 'bg-amber-700 text-white border-amber-800 dark:bg-amber-500 dark:text-stone-950'
                                : 'bg-white dark:bg-stone-900 text-stone-700 dark:text-stone-300 border-stone-300 dark:border-stone-700'
                            }`}
                          >
                            {n}x {n === 4 ? '(Recommended)' : ''}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="text-[11px] font-mono text-stone-500 dark:text-stone-400">
                      REW Status: <strong className="text-amber-700 dark:text-amber-400 font-bold">{status?.rew_connected ? 'CONNECTED (:4735)' : 'STANDALONE (Internal Chirp)'}</strong>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <button
                      type="button"
                      disabled={isMeasuringAuto}
                      onClick={() => handleAutoMeasure('left')}
                      className="py-3 px-3 rounded-lg bg-stone-100 dark:bg-stone-900 border border-stone-300 dark:border-stone-700 hover:border-amber-600 text-stone-900 dark:text-stone-100 font-sans font-bold text-xs flex items-center justify-center space-x-2 transition-all active:scale-[0.98] disabled:opacity-50"
                    >
                      <PlayCircle className="h-4 w-4 text-amber-700 dark:text-amber-500" />
                      <span>Sweep Left</span>
                    </button>
                    <button
                      type="button"
                      disabled={isMeasuringAuto}
                      onClick={() => handleAutoMeasure('right')}
                      className="py-3 px-3 rounded-lg bg-stone-100 dark:bg-stone-900 border border-stone-300 dark:border-stone-700 hover:border-amber-600 text-stone-900 dark:text-stone-100 font-sans font-bold text-xs flex items-center justify-center space-x-2 transition-all active:scale-[0.98] disabled:opacity-50"
                    >
                      <PlayCircle className="h-4 w-4 text-amber-700 dark:text-amber-500" />
                      <span>Sweep Right</span>
                    </button>
                    <button
                      type="button"
                      disabled={isMeasuringAuto}
                      onClick={() => handleAutoMeasure('sub')}
                      className="py-3 px-3 rounded-lg bg-stone-100 dark:bg-stone-900 border border-stone-300 dark:border-stone-700 hover:border-amber-600 text-stone-900 dark:text-stone-100 font-sans font-bold text-xs flex items-center justify-center space-x-2 transition-all active:scale-[0.98] disabled:opacity-50"
                    >
                      <PlayCircle className="h-4 w-4 text-amber-700 dark:text-amber-500" />
                      <span>Sweep Sub</span>
                    </button>
                    <button
                      type="button"
                      disabled={isMeasuringAuto}
                      onClick={() => handleAutoMeasure('all')}
                      className="py-3 px-3 rounded-lg bg-amber-700 hover:bg-amber-800 text-white dark:bg-amber-500 dark:text-stone-950 dark:hover:bg-amber-400 font-sans font-bold text-xs flex items-center justify-center space-x-2 shadow-sm transition-all active:scale-[0.98] disabled:opacity-50"
                    >
                      <Zap className="h-4 w-4" />
                      <span>Sweep 2.1 All</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Mode B: Manual File Ingestion */}
              {measurementMode === 'repeated' && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-4 rounded-lg bg-stone-50 dark:bg-[#0E0F12] border border-stone-200 dark:border-stone-800 space-y-2 text-xs">
                    <span className="font-bold text-stone-800 dark:text-stone-200">Left Channel</span>
                    <input type="file" ref={leftFileRef} onChange={(e) => handleSingleUpload(e, 'left')} className="hidden" accept=".wav,.txt,.frd,.csv,.mdat" />
                    <button
                      type="button"
                      onClick={() => leftFileRef.current?.click()}
                      className="w-full py-2 px-3 rounded bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 font-sans font-semibold hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors flex items-center justify-center space-x-1.5"
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                      <span>Select Left File</span>
                    </button>
                  </div>

                  <div className="p-4 rounded-lg bg-stone-50 dark:bg-[#0E0F12] border border-stone-200 dark:border-stone-800 space-y-2 text-xs">
                    <span className="font-bold text-stone-800 dark:text-stone-200">Right Channel</span>
                    <input type="file" ref={rightFileRef} onChange={(e) => handleSingleUpload(e, 'right')} className="hidden" accept=".wav,.txt,.frd,.csv,.mdat" />
                    <button
                      type="button"
                      onClick={() => rightFileRef.current?.click()}
                      className="w-full py-2 px-3 rounded bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 font-sans font-semibold hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors flex items-center justify-center space-x-1.5"
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                      <span>Select Right File</span>
                    </button>
                  </div>

                  <div className="p-4 rounded-lg bg-stone-50 dark:bg-[#0E0F12] border border-stone-200 dark:border-stone-800 space-y-2 text-xs">
                    <span className="font-bold text-stone-800 dark:text-stone-200">Subwoofer (Optional)</span>
                    <input type="file" ref={subFileRef} onChange={(e) => handleSingleUpload(e, 'sub')} className="hidden" accept=".wav,.txt,.frd,.csv,.mdat" />
                    <button
                      type="button"
                      onClick={() => subFileRef.current?.click()}
                      className="w-full py-2 px-3 rounded bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 font-sans font-semibold hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors flex items-center justify-center space-x-1.5"
                    >
                      <FolderOpen className="h-3.5 w-3.5" />
                      <span>Select Sub File</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Live Upload Status Notification */}
              {uploadStatus && (
                <div className="p-3 rounded bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 text-amber-900 dark:text-amber-300 text-xs font-mono">
                  {uploadStatus}
                </div>
              )}
            </div>
          )}

          {/* STEP 3: MULTI-SUB & SPATIAL MATRIX */}
          {currentStep === 3 && (
            <div className="space-y-6 animate-fadeIn">
              <div>
                <h3 className="text-base font-serif font-bold text-stone-900 dark:text-stone-100">
                  Multi-Sub Optimization (MSO) & Spatial Gating
                </h3>
                <p className="text-xs text-stone-600 dark:text-stone-300 font-sans mt-1">
                  Configure multiple subwoofers for matrix delay/gain co-optimization, or enable Warped FIR (WFIR) for hardware DSP.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {/* Multi-Sub MSO */}
                <div className="p-4 rounded-lg bg-stone-50 dark:bg-[#0E0F12] border border-stone-200 dark:border-stone-800 space-y-3">
                  <div className="flex items-center space-x-2 font-serif font-semibold text-stone-900 dark:text-stone-100 text-sm">
                    <Layers className="h-4 w-4 text-amber-700 dark:text-amber-500" />
                    <span>Multi-Sub Matrix (2–4 Subs)</span>
                  </div>
                  <p className="text-xs text-stone-600 dark:text-stone-300 font-sans">
                    Ingest individual impulse responses for up to 4 subwoofers. ALTAIR co-optimizes delay and gain matrices to eliminate seat-to-seat bass variation.
                  </p>
                  <input type="file" ref={multiSubRef} multiple onChange={handleMultiSubUpload} className="hidden" accept=".txt,.frd,.csv,.wav" />
                  <button
                    type="button"
                    onClick={() => multiSubRef.current?.click()}
                    className="px-3.5 py-2 rounded bg-white dark:bg-stone-900 border border-stone-300 dark:border-stone-700 text-xs font-sans font-semibold hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors flex items-center space-x-2"
                  >
                    <Upload className="h-3.5 w-3.5" />
                    <span>Upload Multiple Sub Files</span>
                  </button>
                  <span className="text-xs font-mono text-stone-500 dark:text-stone-400 block">
                    {multiSubStatus ?? 'No multi-sub array loaded'}
                  </span>
                </div>

                {/* Warped FIR (WFIR) */}
                <div className="p-4 rounded-lg bg-stone-50 dark:bg-[#0E0F12] border border-stone-200 dark:border-stone-800 space-y-3">
                  <div className="flex items-center space-x-2 font-serif font-semibold text-stone-900 dark:text-stone-100 text-sm">
                    <Sliders className="h-4 w-4 text-amber-700 dark:text-amber-500" />
                    <span>Warped FIR Conformal Filter</span>
                  </div>
                  <p className="text-xs text-stone-600 dark:text-stone-300 font-sans">
                    Uses bilinear all-pass conformal mapping to concentrate tap resolution into sub-bass frequencies on hardware with limited tap memory (e.g. miniDSP).
                  </p>
                  <div className="flex items-center space-x-3 pt-1">
                    <button
                      type="button"
                      onClick={() => onChangeConfig({ ...config, wfir_taps: config.wfir_taps ? null : 4096 })}
                      className={`px-3 py-1.5 rounded text-xs font-sans font-bold border transition-colors ${
                        config.wfir_taps
                          ? 'border-amber-700 bg-amber-500/10 text-amber-900 dark:text-amber-300'
                          : 'border-stone-300 dark:border-stone-700 text-stone-500'
                      }`}
                    >
                      {config.wfir_taps ? '✓ Warped FIR Enabled' : 'Enable Warped FIR'}
                    </button>
                    {config.wfir_taps && (
                      <span className="text-xs font-mono font-bold text-amber-800 dark:text-amber-400">
                        Target: {config.wfir_taps} taps
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: VERIFICATION & SUMMARY */}
          {currentStep === 4 && (
            <div className="space-y-6 animate-fadeIn">
              <div>
                <h3 className="text-base font-serif font-bold text-stone-900 dark:text-stone-100">
                  Ready for Inversion & Calibration
                </h3>
                <p className="text-xs text-stone-600 dark:text-stone-300 font-sans mt-1">
                  Review calibrated parameters before executing laboratory digital room equalization.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-sans">
                <div className="p-4 rounded-lg bg-stone-50 dark:bg-[#0E0F12] border border-stone-200 dark:border-stone-800 space-y-2">
                  <div className="font-bold text-stone-900 dark:text-stone-100">Atmospheric & Geometry</div>
                  <div className="flex justify-between text-stone-600 dark:text-stone-400">
                    <span>Speed of sound:</span>
                    <strong className="font-mono text-stone-800 dark:text-stone-200">{speedOfSound} m/s</strong>
                  </div>
                  <div className="flex justify-between text-stone-600 dark:text-stone-400">
                    <span>Temperature / Humidity:</span>
                    <strong className="font-mono text-stone-800 dark:text-stone-200">
                      {config.temperature_celsius ?? 20}°C / {config.relative_humidity_pct ?? 50}%
                    </strong>
                  </div>
                  <div className="flex justify-between text-stone-600 dark:text-stone-400">
                    <span>Mic Orientation:</span>
                    <strong className="font-mono text-stone-800 dark:text-stone-200">{config.mic_orientation_deg ?? 0}°</strong>
                  </div>
                </div>

                <div className="p-4 rounded-lg bg-stone-50 dark:bg-[#0E0F12] border border-stone-200 dark:border-stone-800 space-y-2">
                  <div className="font-bold text-stone-900 dark:text-stone-100">Acoustic Pipeline Options</div>
                  <div className="flex justify-between text-stone-600 dark:text-stone-400">
                    <span>Target Curve:</span>
                    <strong className="font-mono text-stone-800 dark:text-stone-200 uppercase">{config.target.name}</strong>
                  </div>
                  <div className="flex justify-between text-stone-600 dark:text-stone-400">
                    <span>FIR Length:</span>
                    <strong className="font-mono text-stone-800 dark:text-stone-200">{config.target_taps.toLocaleString()} taps</strong>
                  </div>
                  <div className="flex justify-between text-stone-600 dark:text-stone-400">
                    <span>Warped FIR:</span>
                    <strong className="font-mono text-stone-800 dark:text-stone-200">{config.wfir_taps ? `${config.wfir_taps} taps` : 'Disabled'}</strong>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Bottom Footer / Next & Back */}
        <div className="p-4 border-t border-stone-200 dark:border-stone-800 bg-stone-50/70 dark:bg-[#0E0F12]/70 flex items-center justify-between">
          <div>
            {currentStep > 1 && (
              <button
                type="button"
                onClick={() => setCurrentStep((prev) => (prev - 1) as any)}
                className="px-3.5 py-2 rounded border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 text-stone-800 dark:text-stone-200 text-xs font-sans font-semibold flex items-center space-x-1.5 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                <span>Back</span>
              </button>
            )}
          </div>

          <div className="flex items-center space-x-2">
            {currentStep < 4 ? (
              <button
                type="button"
                onClick={() => setCurrentStep((prev) => (prev + 1) as any)}
                className="px-4 py-2 rounded bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:text-stone-950 dark:hover:bg-stone-200 text-xs font-sans font-bold flex items-center space-x-1.5 transition-colors"
              >
                <span>Continue</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2 rounded bg-amber-700 hover:bg-amber-800 text-white dark:bg-amber-500 dark:text-stone-950 dark:hover:bg-amber-400 text-xs font-sans font-bold flex items-center space-x-1.5 shadow-sm transition-colors"
              >
                <CheckCircle2 className="h-4 w-4" />
                <span>Apply & Return to Dashboard</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
