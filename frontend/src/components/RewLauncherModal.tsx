import React, { useState, useEffect } from 'react';
import {
  X,
  Activity,
  Play,
  Zap,
  FolderOpen,
  Search,
  CheckCircle2,
  RefreshCw,
  AlertCircle,
  Settings2,
  ShieldCheck,
} from 'lucide-react';
import { RewStatusInfo } from '../types';
import { fetchRewStatus, detectRew, startRew, updateRewSettings, applyRewDefaults } from '../api/client';

interface RewLauncherModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshStatus?: () => void;
  onLog?: (message: string, level?: 'info' | 'success' | 'warn' | 'error' | 'dsp' | 'geom', tag?: string) => void;
}

export const RewLauncherModal: React.FC<RewLauncherModalProps> = ({
  isOpen,
  onClose,
  onRefreshStatus,
  onLog,
}) => {
  if (!isOpen) return null;

  const [rewInfo, setRewInfo] = useState<RewStatusInfo | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isStarting, setIsStarting] = useState<boolean>(false);
  const [customPath, setCustomPath] = useState<string>('');
  const [showCustomInput, setShowCustomInput] = useState<boolean>(false);
  const [openAsWindow, setOpenAsWindow] = useState<boolean>(true);
  const [isApplyingDefaults, setIsApplyingDefaults] = useState<boolean>(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleApplyDefaults = async () => {
    setIsApplyingDefaults(true);
    setError(null);
    try {
      const res = await applyRewDefaults();
      if (res.success) {
        setMessage('✓ Pre-configured REW measurement defaults: -12.0 dBFS sweep level, 256k samples, 10Hz–20kHz, and :4735 REST API.');
        onLog?.('Acoustic defaults written to REW: -12 dBFS, 256k, 10Hz-20kHz, :4735', 'success', 'REW');
      } else {
        setError(res.error || res.message || 'Failed to apply defaults');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to apply REW defaults');
    } finally {
      setIsApplyingDefaults(false);
    }
  };

  const loadStatus = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchRewStatus();
      setRewInfo(data);
      if (data.executable_path) {
        setCustomPath(data.executable_path);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch REW status');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadStatus();
    }
  }, [isOpen]);

  const handleDetect = async () => {
    setIsLoading(true);
    setError(null);
    setMessage('Scanning Windows Registry and system directories for REW...');
    try {
      const data = await detectRew();
      setRewInfo(data);
      if (data.installed && data.directory) {
        setMessage(`Found Room EQ Wizard in ${data.directory}`);
        onLog?.(`Found Room EQ Wizard installation at ${data.directory}`, 'success', 'REW');
      } else {
        setMessage('Room EQ Wizard installation was not found automatically in standard locations.');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStart = async (autoStartPreference?: boolean) => {
    setIsStarting(true);
    setError(null);
    setMessage('Launching Room EQ Wizard with -api flag on port 4735...');
    onLog?.('Launching Room EQ Wizard with -api flag...', 'info', 'REW');

    try {
      const result = await startRew(customPath || undefined, autoStartPreference, openAsWindow);
      if (result.connected) {
        setMessage('✓ Room EQ Wizard started and connected successfully on port 4735!');
        onLog?.(`Room EQ Wizard connected on port 4735 (${result.elapsed_s ?? 3}s)`, 'success', 'REW');
        await loadStatus();
        onRefreshStatus?.();
      } else if (result.success) {
        setMessage(result.message || 'REW process is running. Waiting for API server...');
        await loadStatus();
        onRefreshStatus?.();
      } else {
        setError(result.error || result.message || 'Failed to launch REW');
        onLog?.(`REW launch warning: ${result.error || result.message}`, 'warn', 'REW');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to launch REW');
      onLog?.(`REW launch error: ${err.message}`, 'error', 'REW');
    } finally {
      setIsStarting(false);
    }
  };

  const handleToggleAutoStart = async (newVal: boolean) => {
    try {
      const updated = await updateRewSettings(newVal);
      setRewInfo(updated);
      onLog?.(
        newVal ? 'REW auto-launch on startup ENABLED' : 'REW auto-launch on startup DISABLED',
        'info',
        'SETTINGS'
      );
      onRefreshStatus?.();
    } catch (err: any) {
      setError(err.message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-sm animate-fadeIn select-text">
      <div className="bg-white dark:bg-[#121316] text-stone-900 dark:text-stone-100 border border-stone-200 dark:border-stone-800 rounded-xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
        {/* Modal Top Header */}
        <div className="p-4 sm:p-5 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between bg-stone-50/80 dark:bg-[#0E0F12]/80">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-amber-700/10 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
              <Activity className="h-5 w-5" />
            </div>
            <div>
              <div className="text-[10px] font-mono font-bold tracking-widest text-amber-700 dark:text-amber-500 uppercase">
                ALTAIR HARDWARE INTEGRATION
              </div>
              <h2 className="text-base font-serif font-bold text-stone-900 dark:text-stone-100 tracking-tight">
                Room EQ Wizard (REW) Manager
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-md hover:bg-stone-200 dark:hover:bg-stone-800 text-stone-500 hover:text-stone-900 dark:hover:text-stone-100 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 text-xs font-sans">
          {/* Status Badge Card */}
          <div className="p-3.5 rounded-lg bg-stone-50 dark:bg-[#0E0F12] border border-stone-200 dark:border-stone-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-bold text-stone-800 dark:text-stone-200">REST API Status:</span>
              {rewInfo?.api_connected ? (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-bold font-mono text-[11px] flex items-center space-x-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 inline-block" />
                  <span>CONNECTED (:4735)</span>
                </span>
              ) : rewInfo?.process_running ? (
                <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-700 dark:text-amber-400 font-bold font-mono text-[11px] flex items-center space-x-1">
                  <span className="h-2 w-2 rounded-full bg-amber-500 inline-block" />
                  <span>PROCESS RUNNING (API STARTING)</span>
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded-full bg-stone-200 dark:bg-stone-800 text-stone-500 font-bold font-mono text-[11px]">
                  NOT RUNNING
                </span>
              )}
            </div>

            {/* Installation Directory */}
            <div className="pt-2 border-t border-stone-200 dark:border-stone-800 space-y-1">
              <div className="flex justify-between text-stone-500 dark:text-stone-400">
                <span>Installation Directory:</span>
                <button
                  type="button"
                  onClick={handleDetect}
                  className="text-amber-700 dark:text-amber-400 hover:underline font-semibold flex items-center space-x-1"
                >
                  <Search className="h-3 w-3" />
                  <span>Find Directory</span>
                </button>
              </div>
              <div className="font-mono text-stone-900 dark:text-stone-100 font-bold bg-white dark:bg-stone-900 p-2 rounded border border-stone-300 dark:border-stone-700 truncate">
                {rewInfo?.directory ?? 'Searching system directories...'}
              </div>
              {rewInfo?.name && (
                <div className="text-[11px] text-stone-500">
                  Version: <strong className="text-stone-700 dark:text-stone-300">{rewInfo.name}</strong>
                </div>
              )}
            </div>
          </div>

          {/* Acoustic Accuracy Pre-Configuration Card */}
          <div className="p-3.5 rounded-lg bg-stone-50 dark:bg-[#0E0F12] border border-stone-200 dark:border-stone-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <ShieldCheck className="h-4 w-4 text-amber-700 dark:text-amber-500" />
                <span className="font-bold text-stone-900 dark:text-stone-100 text-xs">
                  Acoustic Accuracy Defaults
                </span>
              </div>
              <button
                type="button"
                disabled={isApplyingDefaults}
                onClick={handleApplyDefaults}
                className="px-2.5 py-1 rounded bg-stone-200 hover:bg-stone-300 dark:bg-stone-800 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 font-bold text-[11px] transition-colors flex items-center space-x-1"
              >
                <span>{isApplyingDefaults ? 'Applying...' : 'Apply to REW'}</span>
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[11px] text-stone-600 dark:text-stone-400 font-mono">
              <div className="p-1.5 rounded bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800">
                • Level: <strong className="text-stone-900 dark:text-stone-100">-12.0 dBFS</strong>
              </div>
              <div className="p-1.5 rounded bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800">
                • Length: <strong className="text-stone-900 dark:text-stone-100">256k (5.5s)</strong>
              </div>
              <div className="p-1.5 rounded bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800">
                • Range: <strong className="text-stone-900 dark:text-stone-100">10 Hz – 20 kHz</strong>
              </div>
              <div className="p-1.5 rounded bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800">
                • API Port: <strong className="text-stone-900 dark:text-stone-100">:4735</strong>
              </div>
            </div>
          </div>

          {/* Feedback messages */}
          {message && (
            <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-300 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 flex items-center space-x-2">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{message}</span>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-300 dark:border-red-800 text-red-800 dark:text-red-300 flex items-center space-x-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Prompt & Action Buttons */}
          {!rewInfo?.api_connected ? (
            <div className="space-y-3 pt-1">
              <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-300 dark:border-amber-500/30 text-stone-700 dark:text-stone-300 space-y-1">
                <div className="font-bold text-stone-900 dark:text-stone-100">
                  Would you like to start Room EQ Wizard now?
                </div>
                <p className="text-[11px] text-stone-600 dark:text-stone-400 leading-relaxed">
                  ALTAIR will automatically launch REW in the background with the <code className="font-mono text-amber-700 dark:text-amber-400 font-bold">-api</code> flag enabled on port 4735 for automated sweeps and measurement ingestion.
                </p>
              </div>

              {/* Window vs Headless Display Option */}
              <label className="flex items-center space-x-2.5 p-2 rounded hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={openAsWindow}
                  onChange={(e) => setOpenAsWindow(e.target.checked)}
                  className="rounded border-stone-300 text-amber-700 focus:ring-amber-500 h-4 w-4"
                />
                <div className="text-xs">
                  <span className="font-semibold text-stone-800 dark:text-stone-200">
                    Open REW as a visible desktop window
                  </span>
                  <span className="block text-[11px] text-stone-500 dark:text-stone-400">
                    Displays REW's graphical interface on your screen (uncheck for headless mode)
                  </span>
                </div>
              </label>

              {/* Auto-Start Preference Toggle */}
              <label className="flex items-center space-x-2.5 p-2 rounded hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rewInfo?.auto_start ?? false}
                  onChange={(e) => handleToggleAutoStart(e.target.checked)}
                  className="rounded border-stone-300 text-amber-700 focus:ring-amber-500 h-4 w-4"
                />
                <span className="font-medium text-stone-800 dark:text-stone-200 text-xs">
                  Always start Room EQ Wizard automatically when ALTAIR launches
                </span>
              </label>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <button
                  type="button"
                  disabled={isStarting || !rewInfo?.installed}
                  onClick={() => handleStart(false)}
                  className="flex-1 py-2.5 px-4 rounded-lg bg-amber-700 hover:bg-amber-800 text-white dark:bg-amber-500 dark:text-stone-950 dark:hover:bg-amber-400 font-bold text-xs flex items-center justify-center space-x-2 shadow-sm transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  <Play className="h-4 w-4 fill-current" />
                  <span>{isStarting ? 'Starting REW...' : 'Start REW Now'}</span>
                </button>
                <button
                  type="button"
                  disabled={isStarting || !rewInfo?.installed}
                  onClick={() => handleStart(true)}
                  className="flex-1 py-2.5 px-4 rounded-lg bg-stone-900 hover:bg-stone-800 text-white dark:bg-stone-100 dark:text-stone-950 dark:hover:bg-stone-200 font-bold text-xs flex items-center justify-center space-x-2 shadow-sm transition-all active:scale-[0.98] disabled:opacity-50"
                >
                  <Zap className="h-4 w-4 text-amber-500 fill-current" />
                  <span>Start Automatically</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 pt-1">
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-300 dark:border-emerald-500/30 text-emerald-900 dark:text-emerald-300 space-y-1">
                <div className="font-bold flex items-center space-x-1.5">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Room EQ Wizard is Active & Connected</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  Automated sweep triggers and impulse response streaming are ready on port 4735.
                </p>
              </div>

              {/* Auto-Start Toggle even when connected */}
              <label className="flex items-center space-x-2.5 p-2 rounded hover:bg-stone-100 dark:hover:bg-stone-800 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rewInfo?.auto_start ?? false}
                  onChange={(e) => handleToggleAutoStart(e.target.checked)}
                  className="rounded border-stone-300 text-amber-700 focus:ring-amber-500 h-4 w-4"
                />
                <span className="font-medium text-stone-800 dark:text-stone-200 text-xs">
                  Always start Room EQ Wizard automatically when ALTAIR launches
                </span>
              </label>
            </div>
          )}

          {/* Collapsible Custom Path Input */}
          <div className="pt-2 border-t border-stone-200 dark:border-stone-800">
            <button
              type="button"
              onClick={() => setShowCustomInput(!showCustomInput)}
              className="text-stone-500 hover:text-stone-800 dark:hover:text-stone-200 text-[11px] font-semibold flex items-center space-x-1"
            >
              <Settings2 className="h-3 w-3" />
              <span>{showCustomInput ? 'Hide Custom Path' : 'Configure Custom REW Path'}</span>
            </button>

            {showCustomInput && (
              <div className="mt-2 space-y-2 p-3 rounded bg-stone-100 dark:bg-stone-900 border border-stone-300 dark:border-stone-800 animate-fadeIn">
                <span className="text-[11px] text-stone-600 dark:text-stone-400 block">
                  Path to <code className="font-mono">roomeqwizard.exe</code>:
                </span>
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={customPath}
                    onChange={(e) => setCustomPath(e.target.value)}
                    placeholder="C:\Program Files\REW\roomeqwizard.exe"
                    className="flex-1 px-2.5 py-1 text-xs font-mono rounded bg-white dark:bg-stone-950 border border-stone-300 dark:border-stone-700 text-stone-900 dark:text-stone-100"
                  />
                  <button
                    type="button"
                    onClick={() => updateRewSettings(undefined, customPath).then(loadStatus)}
                    className="px-3 py-1 rounded bg-stone-800 text-white dark:bg-stone-200 dark:text-stone-950 font-bold text-xs"
                  >
                    Save
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="p-3.5 border-t border-stone-200 dark:border-stone-800 bg-stone-50/80 dark:bg-[#0E0F12]/80 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-stone-200 dark:bg-stone-800 hover:bg-stone-300 dark:hover:bg-stone-700 text-stone-800 dark:text-stone-200 font-bold text-xs transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
