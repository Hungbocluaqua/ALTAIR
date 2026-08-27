import React from 'react';
import { Activity, Wifi, WifiOff, Sliders, Sparkles, RefreshCw, Terminal } from 'lucide-react';
import { StatusResponse } from '../types';

interface HeaderProps {
  status: StatusResponse | null;
  mode: 'wizard' | 'expert';
  onModeChange: (mode: 'wizard' | 'expert') => void;
  onRefreshStatus: () => void;
  showConsole?: boolean;
  onToggleConsole?: () => void;
  consoleCount?: number;
}

export const Header: React.FC<HeaderProps> = ({
  status,
  mode,
  onModeChange,
  onRefreshStatus,
  showConsole,
  onToggleConsole,
  consoleCount,
}) => {
  return (
    <header className="border-b border-slate-800/80 bg-[#0b0f19]/90 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center space-x-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Activity className="h-5 w-5 text-white stroke-[2.5]" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xl font-extrabold tracking-tight bg-gradient-to-r from-cyan-400 via-teal-300 to-emerald-400 bg-clip-text text-transparent">
                ALTAIR
              </span>
              <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                v1.0
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              Automated Linear-phase Tuning & Acoustic Inversion Routine
            </p>
          </div>
        </div>

        {/* REW Status Badge & Controls */}
        <div className="flex items-center space-x-4">
          {/* REW API Status */}
          <div className="flex items-center space-x-2 bg-slate-900/90 border border-slate-800 px-3 py-1.5 rounded-lg text-xs">
            {status?.rew_connected ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <Wifi className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-emerald-400 font-medium">REW API Active</span>
                <span className="text-slate-500 font-mono text-[10px]">(localhost:4735)</span>
              </>
            ) : (
              <>
                <span className="h-2 w-2 rounded-full bg-cyan-500"></span>
                <WifiOff className="h-3.5 w-3.5 text-cyan-400" />
                <span className="text-cyan-300 font-medium">Native DSP Engine</span>
                <span className="text-slate-500 font-mono text-[10px]">(Offline Mode)</span>
              </>
            )}
            <button
              onClick={onRefreshStatus}
              title="Refresh REW Connection"
              className="ml-1 text-slate-400 hover:text-white transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          </div>

          {/* Mode Switcher */}
          <div className="flex bg-slate-900/90 p-1 rounded-lg border border-slate-800">
            <button
              onClick={() => onModeChange('wizard')}
              className={`flex items-center space-x-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                mode === 'wizard'
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/25'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>1-Click Wizard</span>
            </button>
            <button
              onClick={() => onModeChange('expert')}
              className={`flex items-center space-x-1.5 px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                mode === 'expert'
                  ? 'bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/25'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sliders className="h-3.5 w-3.5" />
              <span>Expert Studio</span>
            </button>
          </div>

          {/* Console Log Toggle */}
          {onToggleConsole && (
            <button
              onClick={onToggleConsole}
              title={showConsole ? 'Hide Console' : 'Show Console'}
              className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-mono font-bold rounded-lg border transition-all ${
                showConsole
                  ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-md shadow-cyan-500/10'
                  : 'bg-slate-900/90 text-slate-400 border-slate-800 hover:text-white'
              }`}
            >
              <Terminal className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Console</span>
              {consoleCount !== undefined && (
                <span className="text-[10px] px-1 rounded bg-slate-800 text-slate-300">
                  {consoleCount}
                </span>
              )}
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
