import React from 'react';
import { Activity, Wifi, WifiOff, Sliders, BookOpen, RefreshCw, Terminal, Sun, Moon } from 'lucide-react';
import { StatusResponse } from '../types';

interface HeaderProps {
  status: StatusResponse | null;
  mode: 'wizard' | 'expert';
  onModeChange: (mode: 'wizard' | 'expert') => void;
  onRefreshStatus: () => void;
  showConsole?: boolean;
  onToggleConsole?: () => void;
  consoleCount?: number;
  theme?: 'dark' | 'light';
  onToggleTheme?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  status,
  mode,
  onModeChange,
  onRefreshStatus,
  showConsole,
  onToggleConsole,
  consoleCount,
  theme = 'dark',
  onToggleTheme,
}) => {
  return (
    <header className="border-b border-stone-200/90 bg-white/95 text-stone-800 dark:border-stone-800/90 dark:bg-[#121316]/95 dark:text-stone-100 backdrop-blur sticky top-0 z-50 transition-colors duration-200">
      <div className="max-w-[1720px] mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Editorial Brand */}
        <div className="flex items-center space-x-3.5">
          <div className="h-9 w-9 rounded border border-stone-300 dark:border-stone-700 bg-stone-100 dark:bg-stone-900 flex items-center justify-center shadow-sm">
            <Activity className="h-4 w-4 text-amber-700 dark:text-amber-500 stroke-[2.2]" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xl font-serif font-bold tracking-tight text-stone-900 dark:text-stone-100">
                ALTAIR
              </span>
              <span className="px-1.5 py-0.2 text-[9px] font-mono font-bold rounded border border-stone-300 dark:border-stone-700 text-stone-600 dark:text-stone-400 uppercase tracking-widest">
                EDITORIAL
              </span>
            </div>
            <p className="text-[10px] font-mono text-stone-500 hidden sm:block">
              Automated Linear-phase Tuning & Acoustic Inversion Routine
            </p>
          </div>
        </div>

        {/* Controls & Badges */}
        <div className="flex items-center space-x-3">
          {/* REW API Status */}
          <div className="hidden sm:flex items-center space-x-2 bg-stone-50 border border-stone-200 text-stone-700 dark:bg-[#0E0F12] dark:border-stone-800 dark:text-stone-300 px-3 py-1.5 rounded text-xs font-mono transition-colors">
            {status?.rew_connected ? (
              <>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span className="font-semibold text-emerald-700 dark:text-emerald-400">REW Online</span>
                <span className="text-[10px] text-stone-400">(:4735)</span>
              </>
            ) : (
              <>
                <span className="h-2 w-2 rounded-full bg-stone-400 dark:bg-stone-600"></span>
                <span className="text-stone-500">Standalone</span>
              </>
            )}
            <button
              onClick={onRefreshStatus}
              title="Refresh REW Connection"
              className="ml-1 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200 transition-colors"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          </div>

          {/* Mode Switcher */}
          <div className="flex bg-stone-100 p-0.5 rounded border border-stone-200 dark:bg-[#0E0F12] dark:border-stone-800 transition-colors text-xs font-mono">
            <button
              onClick={() => onModeChange('wizard')}
              className={`flex items-center space-x-1.5 px-3 py-1 font-semibold rounded transition-all ${
                mode === 'wizard'
                  ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-950 shadow-sm'
                  : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white'
              }`}
            >
              <BookOpen className="h-3.5 w-3.5 text-amber-600 dark:text-amber-500" />
              <span>Editorial Monograph</span>
            </button>
            <button
              onClick={() => onModeChange('expert')}
              className={`flex items-center space-x-1.5 px-3 py-1 font-semibold rounded transition-all ${
                mode === 'expert'
                  ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-950 shadow-sm'
                  : 'text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white'
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
              className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-mono font-bold rounded border transition-all ${
                showConsole
                  ? 'bg-amber-500/10 text-amber-800 border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/40'
                  : 'bg-stone-100 text-stone-600 border-stone-200 hover:text-stone-900 dark:bg-[#0E0F12] dark:text-stone-400 dark:border-stone-800 dark:hover:text-white'
              }`}
            >
              <Terminal className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Console</span>
              {consoleCount !== undefined && consoleCount > 0 && (
                <span className="px-1.5 py-0.2 text-[10px] rounded bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
                  {consoleCount}
                </span>
              )}
            </button>
          )}

          {/* Theme Bright / Dark Toggle Button */}
          {onToggleTheme && (
            <button
              onClick={onToggleTheme}
              title={theme === 'dark' ? 'Switch to Bright UI (Daylight Washi)' : 'Switch to Dark UI (Midnight Charcoal)'}
              className="p-1.5 rounded border border-stone-200 bg-stone-100 text-stone-700 hover:text-stone-900 dark:border-stone-800 dark:bg-[#0E0F12] dark:text-stone-300 dark:hover:text-white transition-all active:scale-[0.96]"
            >
              {theme === 'dark' ? (
                <Sun className="h-4 w-4 text-amber-400" />
              ) : (
                <Moon className="h-4 w-4 text-stone-700" />
              )}
            </button>
          )}
        </div>
      </div>
    </header>
  );
};
