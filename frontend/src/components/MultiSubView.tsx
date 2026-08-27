import React from 'react';
import { Boxes } from 'lucide-react';
import { MultiSubAlignment } from '../types';

interface MultiSubViewProps {
  multiSubAlignment: MultiSubAlignment;
}

export const MultiSubView: React.FC<MultiSubViewProps> = ({ multiSubAlignment }) => {
  const alignments = multiSubAlignment.alignments || [];
  return (
    <section className="rounded-xl border border-stone-200 bg-white text-stone-800 shadow-sm dark:border-stone-800 dark:bg-[#0E0F12] dark:text-stone-100 transition-colors">
      <div className="px-4 py-3 border-b border-stone-200 dark:border-stone-800 flex items-center justify-between">
        <h3 className="font-serif font-bold text-sm tracking-tight flex items-center space-x-2 text-stone-900 dark:text-stone-100">
          <Boxes className="h-4 w-4 text-amber-700 dark:text-amber-500" />
          <span>Multi-Sub Matrix Optimization (MSO)</span>
        </h3>
        <span className="text-xs font-mono text-stone-500 dark:text-stone-400">
          {multiSubAlignment.sub_count} subwoofers · {multiSubAlignment.crossover_freq_hz} Hz crossover
        </span>
      </div>

      <div className="p-4 overflow-x-auto">
        <table className="w-full text-left text-xs font-mono">
          <thead>
            <tr className="text-stone-500 dark:text-stone-400 border-b border-stone-200 dark:border-stone-800">
              <th className="py-2 pr-3 font-semibold">Sub</th>
              <th className="py-2 pr-3 font-semibold">Name</th>
              <th className="py-2 pr-3 font-semibold">Delay</th>
              <th className="py-2 pr-3 font-semibold">Delay (samples)</th>
              <th className="py-2 pr-3 font-semibold">Gain</th>
              <th className="py-2 font-semibold">Polarity</th>
            </tr>
          </thead>
          <tbody>
            {alignments.map((a) => (
              <tr key={a.sub_index} className="border-b border-stone-100 dark:border-stone-800/60 last:border-0">
                <td className="py-2 pr-3 font-mono font-bold text-amber-700 dark:text-amber-500">
                  #{a.sub_index + 1}
                </td>
                <td className="py-2 pr-3 font-medium max-w-[220px] truncate">{a.name}</td>
                <td className="py-2 pr-3 font-mono">{a.delay_ms.toFixed(2)} ms</td>
                <td className="py-2 pr-3 font-mono">{a.delay_samples}</td>
                <td className="py-2 pr-3 font-mono">{a.gain_db.toFixed(1)} dB</td>
                <td className="py-2 font-mono">
                  <span
                    className={`px-1.5 py-0.5 rounded border text-[10px] font-bold ${
                      a.polarity < 0
                        ? 'text-amber-700 border-amber-300 bg-amber-100/60 dark:text-amber-400 dark:border-amber-500/40 dark:bg-amber-950/40'
                        : 'text-stone-800 border-stone-300 bg-stone-100 dark:text-stone-200 dark:border-stone-700 dark:bg-stone-800'
                    }`}
                  >
                    {a.polarity < 0 ? 'INVERTED' : 'NORMAL'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-[11px] text-stone-500 dark:text-stone-400 font-mono">
          Sub #1 is the timing/gain reference (0 ms, 0 dB). Load these values into your DSP's per-sub delay,
          gain and polarity controls; the full export also contains
          <span className="text-amber-700 dark:text-amber-400 font-semibold"> miniDSP/multi_sub_alignment.json</span>.
        </p>
      </div>
    </section>
  );
};
