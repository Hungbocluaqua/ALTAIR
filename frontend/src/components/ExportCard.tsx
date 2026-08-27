import React from 'react';
import { Download, Check, FileCode } from 'lucide-react';
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
      files: 'ALTAIR_Stereo_FIR_32bit.wav',
      desc: 'Bit-perfect audiophile convolution',
      badge: 'Audiophile Convolver',
    },
    {
      name: 'rePhase',
      files: 'ALTAIR_Project.rephase',
      desc: 'Full XML project for curve inspection',
      badge: 'XML Project',
    },
  ];

  return (
    <div className="bg-white border border-stone-200 text-stone-800 dark:bg-[#121316] dark:border-stone-800 dark:text-stone-100 rounded-lg p-5 transition-colors shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-stone-200 dark:border-stone-800 transition-colors">
        <div>
          <div className="flex items-center space-x-2">
            <FileCode className="h-5 w-5 text-amber-700 dark:text-amber-500" />
            <h3 className="font-serif font-bold text-stone-900 dark:text-stone-100 text-base">Multi-Platform Convolver Deployment</h3>
          </div>
          <p className="text-xs font-mono text-stone-500 dark:text-stone-400 mt-1">
            Sample Rate: <span className="text-stone-800 dark:text-stone-200 font-bold">{sampleRate} Hz</span> • FIR Taps:{' '}
            <span className="text-stone-800 dark:text-stone-200 font-bold">{taps.toLocaleString()}</span> • Headroom Preamp:{' '}
            <span className="text-amber-700 dark:text-amber-400 font-bold">{preampDb} dB</span>
          </p>
        </div>

        {/* Download Button */}
        <button
          onClick={handleDownload}
          className="py-2.5 px-6 rounded font-mono font-bold text-xs tracking-widest uppercase bg-stone-900 hover:bg-stone-800 text-stone-50 dark:bg-stone-100 dark:text-stone-950 dark:hover:bg-stone-200 flex items-center justify-center space-x-2 shadow-sm transition-all active:scale-[0.98]"
        >
          <Download className="h-4 w-4" />
          <span>DOWNLOAD CONVOLVER BUNDLE (.ZIP)</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mt-4">
        {platforms.map((p) => (
          <div
            key={p.name}
            className="p-3.5 rounded border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-[#0E0F12] flex flex-col justify-between transition-colors"
          >
            <div>
              <div className="flex items-center justify-between">
                <span className="font-serif font-bold text-xs text-stone-900 dark:text-stone-100">{p.name}</span>
                <span className="text-[9px] font-mono px-1.5 py-0.2 rounded border border-stone-300 dark:border-stone-700 text-stone-600 dark:text-stone-400">
                  {p.badge}
                </span>
              </div>
              <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-1">{p.desc}</p>
            </div>
            <div className="mt-3 pt-2 border-t border-stone-200/60 dark:border-stone-800/60 flex items-center text-[10px] font-mono text-amber-800 dark:text-amber-400">
              <Check className="h-3 w-3 mr-1 text-emerald-600 dark:text-emerald-400" />
              <span>{p.files}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
