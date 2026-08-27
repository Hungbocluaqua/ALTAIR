import React, { useState, useEffect, useRef } from 'react';
import { Terminal, Copy, Check, Trash2, ArrowDownCircle, Filter, Zap, Pause } from 'lucide-react';

export interface ConsoleLogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'success' | 'warn' | 'error' | 'dsp' | 'geom';
  tag?: string;
  message: string;
  detail?: string;
}

interface ConsoleLogProps {
  logs: ConsoleLogEntry[];
  onClear: () => void;
  isRunning?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const ConsoleLog: React.FC<ConsoleLogProps> = ({
  logs,
  onClear,
  isRunning = false,
  isCollapsed = false,
  onToggleCollapse,
}) => {
  const [filter, setFilter] = useState<'all' | 'geom' | 'dsp' | 'err'>('all');
  const [autoScroll, setAutoScroll] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const copyLogs = () => {
    const text = logs
      .map(
        (l) =>
          `[${l.timestamp}] [${l.tag || l.level.toUpperCase()}] ${l.message}${
            l.detail ? ` | ${l.detail}` : ''
          }`
      )
      .join('\n');
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const filteredLogs = logs.filter((l) => {
    if (filter === 'geom') return l.tag === 'GEOM' || l.tag === 'ALIGN' || l.tag === 'DIST' || l.tag === 'MIC';
    if (filter === 'dsp') return l.level === 'dsp' || l.tag === 'XO' || l.tag === 'VBA' || l.tag === 'SUB' || l.tag === 'SCHROEDER';
    if (filter === 'err') return l.level === 'error' || l.level === 'warn';
    return true;
  });

  const getTagColor = (tag?: string, level?: string) => {
    switch (tag) {
      case 'REW':
      case 'SWEEP':
      case 'STACK':
        return 'text-amber-800 bg-amber-50 border-amber-300 dark:text-amber-400 dark:bg-amber-950/50 dark:border-amber-500/30';
      case 'GEOM':
      case 'ALIGN':
      case 'DIST':
      case 'MIC':
        return 'text-amber-900 bg-amber-100/70 border-amber-300 dark:text-amber-300 dark:bg-amber-900/30 dark:border-amber-600/40';
      case 'XO':
      case 'SUB':
      case 'VBA':
      case 'DSP':
      case 'SCHROEDER':
      case 'TP':
        return 'text-stone-800 bg-stone-100 border-stone-300 dark:text-stone-200 dark:bg-stone-800/80 dark:border-stone-700';
      default:
        if (level === 'error') return 'text-red-700 bg-red-50 border-red-300 dark:text-red-400 dark:bg-red-950/60 dark:border-red-500/30';
        if (level === 'warn') return 'text-amber-700 bg-amber-50 border-amber-300 dark:text-amber-400 dark:bg-amber-950/60 dark:border-amber-500/30';
        if (level === 'success') return 'text-emerald-700 bg-emerald-50 border-emerald-300 dark:text-emerald-400 dark:bg-emerald-950/60 dark:border-emerald-500/30';
        return 'text-stone-600 bg-stone-100 border-stone-200 dark:text-stone-400 dark:bg-stone-900 dark:border-stone-800';
    }
  };

  const getTextColor = (level: string) => {
    switch (level) {
      case 'error':
        return 'text-red-600 dark:text-red-300 font-medium';
      case 'warn':
        return 'text-amber-700 dark:text-amber-300 font-medium';
      case 'success':
        return 'text-emerald-700 dark:text-emerald-300 font-medium';
      case 'geom':
        return 'text-amber-800 dark:text-amber-300';
      case 'dsp':
        return 'text-stone-900 dark:text-stone-200';
      default:
        return 'text-stone-700 dark:text-stone-300';
    }
  };

  if (isCollapsed) {
    return (
      <div className="bg-white border border-stone-200 dark:bg-[#121316] dark:border-stone-800 rounded-lg p-3 shadow-sm flex items-center justify-between transition-colors">
        <div className="flex items-center space-x-2 text-xs font-mono text-amber-700 dark:text-amber-500">
          <Terminal className="h-4 w-4" />
          <span>ACOUSTIC LEDGER ({logs.length})</span>
        </div>
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="px-2.5 py-1 text-[11px] font-mono font-bold bg-stone-100 text-stone-700 border border-stone-300 dark:bg-stone-800 dark:text-stone-300 dark:border-stone-700 rounded hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"
          >
            Expand Terminal
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white border border-stone-200 dark:bg-[#121316] dark:border-stone-800 rounded-lg shadow-sm flex flex-col h-full overflow-hidden transition-colors">
      {/* Editorial Titlebar */}
      <div className="bg-stone-50 px-4 py-3 border-b border-stone-200 dark:bg-[#0E0F12] dark:border-stone-800 flex items-center justify-between select-none transition-colors">
        <div className="flex items-center space-x-2.5">
          <div className="flex items-center space-x-2">
            <span className="h-2 w-2 rounded-full bg-amber-600 dark:bg-amber-500 inline-block"></span>
            <span className="font-serif font-bold text-sm tracking-tight text-stone-900 dark:text-stone-100">
              Acoustic Ledger
            </span>
          </div>

          {/* Running status indicator */}
          {isRunning ? (
            <span className="flex items-center space-x-1 text-[10px] font-mono px-2 py-0.5 rounded bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-500/30 animate-pulse font-bold">
              <Zap className="h-3 w-3" />
              <span>LIVE</span>
            </span>
          ) : (
            <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-400">
              SYNC
            </span>
          )}
        </div>

        {/* Console Action Buttons */}
        <div className="flex items-center space-x-1 text-stone-500 dark:text-stone-400">
          <button
            type="button"
            onClick={() => setAutoScroll(!autoScroll)}
            title={autoScroll ? 'Pause auto-scroll' : 'Resume auto-scroll'}
            className={`p-1.5 rounded hover:text-stone-900 dark:hover:text-white transition-colors ${
              autoScroll ? 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/40' : 'text-stone-400 dark:text-stone-500'
            }`}
          >
            {autoScroll ? <ArrowDownCircle className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          </button>

          <button
            type="button"
            onClick={copyLogs}
            title="Copy logs to clipboard"
            className="p-1.5 rounded hover:text-stone-900 dark:hover:text-white transition-colors"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>

          <button
            type="button"
            onClick={onClear}
            title="Clear console"
            className="p-1.5 rounded hover:text-red-600 dark:hover:text-red-400 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>

          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              title="Collapse console"
              className="px-2 py-0.5 ml-1 text-[11px] font-mono rounded border border-stone-300 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
            >
              Hide
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="px-3 py-2 bg-stone-50/50 border-b border-stone-200/80 dark:bg-[#0E0F12]/60 dark:border-stone-800 flex items-center justify-between text-[11px] font-mono">
        <div className="flex items-center space-x-1">
          <Filter className="h-3 w-3 text-stone-400 mr-1" />
          {(['all', 'geom', 'dsp', 'err'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2 py-0.5 rounded transition-all font-semibold ${
                filter === f
                  ? 'bg-stone-900 text-white dark:bg-stone-100 dark:text-stone-950 shadow-sm'
                  : 'text-stone-500 hover:text-stone-900 dark:text-stone-400 dark:hover:text-white'
              }`}
            >
              {f === 'all' ? 'All' : f === 'geom' ? 'Geometry' : f === 'dsp' ? 'DSP' : 'Alerts'}
            </button>
          ))}
        </div>

        <span className="text-[10px] text-stone-400">
          {filteredLogs.length} entries
        </span>
      </div>

      {/* Log Feed */}
      <div
        ref={scrollRef}
        className="flex-1 p-3 overflow-y-auto font-mono text-[11px] leading-relaxed space-y-1.5 divide-y divide-stone-100 dark:divide-stone-900/60"
      >
        {filteredLogs.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-stone-400 text-center py-12">
            <Terminal className="h-6 w-6 mb-2 opacity-40 text-stone-500" />
            <p className="font-serif italic text-stone-500">No telemetry logged in this category</p>
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div key={log.id} className="pt-1.5 flex items-start space-x-2 select-text group">
              {/* Timestamp */}
              <span className="text-[10px] text-stone-400 shrink-0 select-none pt-0.5">
                {log.timestamp}
              </span>

              {/* Tag Badge */}
              <span
                className={`text-[9px] font-bold px-1.5 py-0.2 rounded border shrink-0 tracking-wider uppercase ${getTagColor(
                  log.tag,
                  log.level
                )}`}
              >
                {log.tag || log.level.toUpperCase()}
              </span>

              {/* Message */}
              <div className="flex-1 break-words">
                <span className={getTextColor(log.level)}>{log.message}</span>
                {log.detail && (
                  <span className="text-stone-400 text-[10px] ml-1.5">
                    ({log.detail})
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Editorial Footer Status */}
      <div className="px-3.5 py-2 border-t border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-[#0E0F12] text-[10px] font-mono text-stone-500 flex items-center justify-between">
        <span className="flex items-center space-x-1">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-600 dark:bg-amber-500"></span>
          <span>Acoustic Inversion Feed</span>
        </span>
        <span>Auto-Scroll: {autoScroll ? 'Active' : 'Paused'}</span>
      </div>
    </div>
  );
};
