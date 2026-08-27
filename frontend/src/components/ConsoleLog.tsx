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
    if (filter === 'geom') return l.tag === 'GEOM' || l.tag === 'ALIGN' || l.tag === 'DIST';
    if (filter === 'dsp') return l.level === 'dsp' || l.tag === 'XO' || l.tag === 'VBA' || l.tag === 'SUB';
    if (filter === 'err') return l.level === 'error' || l.level === 'warn';
    return true;
  });

  const getTagColor = (tag?: string, level?: string) => {
    switch (tag) {
      case 'REW':
      case 'SWEEP':
      case 'STACK':
        return 'text-cyan-400 bg-cyan-950/60 border-cyan-500/30';
      case 'GEOM':
      case 'ALIGN':
      case 'DIST':
        return 'text-amber-400 bg-amber-950/60 border-amber-500/30';
      case 'XO':
        return 'text-purple-400 bg-purple-950/60 border-purple-500/30';
      case 'SUB':
        return 'text-teal-400 bg-teal-950/60 border-teal-500/30';
      case 'VBA':
      case 'DSP':
      case 'GAIN':
      case 'TP':
        return 'text-emerald-400 bg-emerald-950/60 border-emerald-500/30';
      default:
        if (level === 'error') return 'text-red-400 bg-red-950/60 border-red-500/30';
        if (level === 'warn') return 'text-yellow-400 bg-yellow-950/60 border-yellow-500/30';
        if (level === 'success') return 'text-emerald-400 bg-emerald-950/60 border-emerald-500/30';
        return 'text-slate-400 bg-slate-900 border-slate-700';
    }
  };

  const getTextColor = (level: string) => {
    switch (level) {
      case 'error':
        return 'text-red-300';
      case 'warn':
        return 'text-yellow-300';
      case 'success':
        return 'text-emerald-300';
      case 'geom':
        return 'text-amber-200';
      case 'dsp':
        return 'text-cyan-200';
      default:
        return 'text-slate-300';
    }
  };

  if (isCollapsed) {
    return (
      <div className="bg-[#050811] border border-slate-800 rounded-2xl p-3 shadow-xl flex items-center justify-between">
        <div className="flex items-center space-x-2 text-xs font-mono text-cyan-400">
          <Terminal className="h-4 w-4" />
          <span>ALTAIR CONSOLE ({logs.length})</span>
        </div>
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="px-2 py-1 text-[11px] font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 rounded-lg hover:bg-cyan-500/20"
          >
            Expand Terminal
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="bg-[#050811] border border-slate-800/90 rounded-2xl shadow-2xl flex flex-col h-full overflow-hidden">
      {/* Terminal Titlebar */}
      <div className="bg-[#080d1a] px-3.5 py-2.5 border-b border-slate-800/80 flex items-center justify-between select-none">
        <div className="flex items-center space-x-2.5">
          {/* Traffic light dots */}
          <div className="flex space-x-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-500/80 inline-block"></span>
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500/80 inline-block"></span>
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80 inline-block"></span>
          </div>

          <div className="flex items-center space-x-1.5 text-xs font-mono font-bold text-slate-200">
            <Terminal className="h-3.5 w-3.5 text-cyan-400" />
            <span className="tracking-tight">ALTAIR CONSOLE</span>
          </div>

          {/* Running status indicator */}
          {isRunning ? (
            <span className="flex items-center space-x-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-500/30 animate-pulse">
              <Zap className="h-3 w-3" />
              <span>LIVE</span>
            </span>
          ) : (
            <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-slate-900 text-slate-400 border border-slate-800">
              READY
            </span>
          )}
        </div>

        {/* Console Action Buttons */}
        <div className="flex items-center space-x-1 text-slate-400">
          <button
            type="button"
            onClick={() => setAutoScroll(!autoScroll)}
            title={autoScroll ? 'Pause auto-scroll' : 'Resume auto-scroll'}
            className={`p-1.5 rounded-md hover:text-white transition-colors ${
              autoScroll ? 'text-cyan-400 bg-cyan-500/10' : 'text-slate-500'
            }`}
          >
            {autoScroll ? <ArrowDownCircle className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
          </button>

          <button
            type="button"
            onClick={copyLogs}
            title="Copy logs to clipboard"
            className="p-1.5 rounded-md hover:text-white transition-colors"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          </button>

          <button
            type="button"
            onClick={onClear}
            title="Clear console"
            className="p-1.5 rounded-md hover:text-red-400 transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>

          {onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              title="Collapse console"
              className="p-1.5 rounded-md hover:text-white transition-colors text-xs font-mono ml-1"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Quick Filters */}
      <div className="px-3 py-1.5 bg-[#060a14] border-b border-slate-800/60 flex items-center justify-between text-[11px] font-mono">
        <div className="flex items-center space-x-1">
          <Filter className="h-3 w-3 text-slate-500 mr-1" />
          {(['all', 'geom', 'dsp', 'err'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2 py-0.5 rounded capitalize transition-colors ${
                filter === f
                  ? 'bg-slate-800 text-cyan-300 font-bold border border-slate-700'
                  : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        <span className="text-slate-500 text-[10px]">
          {filteredLogs.length} events
        </span>
      </div>

      {/* Scrollable Terminal Output */}
      <div
        ref={scrollRef}
        className="flex-1 p-3 overflow-y-auto space-y-1.5 font-mono text-[11.5px] leading-relaxed select-text"
        style={{ scrollbarWidth: 'thin' }}
      >
        {filteredLogs.length === 0 ? (
          <div className="text-slate-600 italic py-4 text-center">No logs matching filter.</div>
        ) : (
          filteredLogs.map((log) => (
            <div key={log.id} className="flex items-start space-x-2 group hover:bg-slate-900/40 p-0.5 rounded transition-colors">
              {/* Timestamp */}
              <span className="text-slate-600 text-[10.5px] shrink-0 select-none">
                {log.timestamp}
              </span>

              {/* Tag Badge */}
              <span
                className={`text-[9.5px] font-bold px-1.5 py-0.2 rounded border shrink-0 uppercase ${getTagColor(
                  log.tag,
                  log.level
                )}`}
              >
                {log.tag || log.level}
              </span>

              {/* Message */}
              <div className="flex-1 break-words">
                <span className={getTextColor(log.level)}>{log.message}</span>
                {log.detail && (
                  <span className="text-slate-500 block text-[10.5px] mt-0.5 pl-2 border-l border-slate-800">
                    {log.detail}
                  </span>
                )}
              </div>
            </div>
          ))
        )}

        {/* Terminal Blinking Prompt */}
        <div className="flex items-center space-x-2 pt-2 text-slate-500 text-xs select-none">
          <span className="text-emerald-500 font-bold">altair@engine:~$</span>
          {isRunning ? (
            <span className="text-cyan-400 animate-pulse">processing acoustic pipeline...</span>
          ) : (
            <span className="inline-block w-2 h-3.5 bg-cyan-400/80 animate-pulse"></span>
          )}
        </div>
      </div>
    </div>
  );
};
