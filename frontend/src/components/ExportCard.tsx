import React from 'react';
import { Download, Check, FileCode, Layers, ShieldCheck } from 'lucide-react';
import { getExportBundleUrl } from '../api/client';

interface ExportCardProps {
  preampDb: number;
  sampleRate: number;
  taps: number;
}

export const ExportCard: React.FC<ExportCardProps> = ({ preampDb, sampleRate, taps }) => {
  const handleDownload = () => {
    window.location.href = getExportBundleUrl();
  };

  const platforms = [
    {
      name: 'Equalizer APO',
      files: 'config.txt + Stereo WAV FIR',
      desc: 'System-wide PC correction (Windows)',
      badge: 'Windows PC',
    },
    {
      name: 'CamillaDSP',
      files: 'camilladsp.yml + WAV FIR',
      desc: 'Raspberry Pi, Linux & Streamer DSP',
      badge: 'Linux / Pi',
    },
    {
      name: 'miniDSP Flex / SHD',
      files: 'fir_coeffs_left.txt, fir_coeffs_right.txt',
      desc: 'Hardware DSP coefficients (4096 taps)',
      badge: 'Hardware DSP',
    },
    {
      name: 'Roon / HQPlayer',
      files: 'AutoRoomEQ_Stereo_FIR_32bit.wav',
      desc: 'Bit-perfect audiophile convolution',
      badge: 'Audiophile Convolver',
    },
    {
      name: 'rePhase',
      files: 'AutoRoomEQ_Project.rephase',
      desc: 'Full XML project for manual curve inspection',
      badge: 'XML Project',
    },
  ];

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-xl">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-2">
            <FileCode className="h-5 w-5 text-cyan-400" />
            <h3 className="font-bold text-slate-100 text-sm tracking-wide uppercase">Multi-Platform Filter Exports</h3>
          </div>
          <p className="text-xs text-slate-400 mt-0.5">
            Sample Rate: <span className="text-slate-200 font-mono font-bold">{sampleRate} Hz</span> • FIR Taps:{' '}
            <span className="text-slate-200 font-mono font-bold">{taps.toLocaleString()}</span> • Headroom Preamp:{' '}
            <span className="text-cyan-400 font-mono font-bold">{preampDb} dB</span>
          </p>
        </div>

        {/* Big Download Button */}
        <button
          onClick={handleDownload}
          className="py-3 px-6 rounded-xl font-extrabold text-sm tracking-wide bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-slate-950 flex items-center justify-center space-x-2 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/35 transition-all hover:scale-[1.02]"
        >
          <Download className="h-4 w-4 stroke-[2.5]" />
          <span>📦 DOWNLOAD 1-CLICK PACKAGE (.ZIP)</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
        {platforms.map((p) => (
          <div
            key={p.name}
            className="p-3.5 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 transition-all flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs text-slate-100">{p.name}</span>
                <span className="text-[9px] font-semibold px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                  {p.badge}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 mt-1">{p.desc}</div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center text-[10px] text-cyan-400 font-mono">
              <Check className="h-3 w-3 mr-1 shrink-0 text-emerald-400" />
              <span className="truncate">{p.files}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
