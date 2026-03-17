import React from 'react';
import { Box, ChevronUp, ChevronDown } from 'lucide-react';
import type { Layer } from '../../types';

interface LayerInheritanceSectionProps {
  layer: Layer;
  allLayers: Layer[];
  onUpdateLayer: (updates: Partial<Layer>) => void;
  isOpen: boolean;
  onToggle: () => void;
  lang: string;
}

const LayerInheritanceSection: React.FC<LayerInheritanceSectionProps> = ({
  layer,
  allLayers,
  onUpdateLayer,
  isOpen,
  onToggle,
  lang,
}) => {
  return (
    <div className="mt-4 border border-slate-200 rounded-[20px] md:rounded-[24px] overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-slate-50 transition-all"
      >
        <span className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 flex items-center gap-2">
          <Box size={13} />
          {lang === 'no' ? 'Avansert / Arv' : 'Advanced / Inheritance'}
          {(layer.extends || layer.isAbstract) && (
            <span className="bg-violet-100 text-violet-600 text-[9px] font-black px-2 py-0.5 rounded-full">
              {lang === 'no' ? 'Aktiv' : 'Active'}
            </span>
          )}
        </span>
        {isOpen ? (
          <ChevronUp size={14} className="text-slate-400" />
        ) : (
          <ChevronDown size={14} className="text-slate-400" />
        )}
      </button>

      {isOpen && (
        <div className="px-5 pb-5 pt-2 space-y-4 animate-in slide-in-from-top-2 duration-200 border-t border-slate-100">
          {/* Extends dropdown */}
          <div>
            <label className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 block mb-2">
              {lang === 'no' ? 'Arver fra' : 'Extends'}
            </label>
            <select
              value={layer.extends ?? ''}
              onChange={(e) =>
                onUpdateLayer({ extends: e.target.value || undefined })
              }
              className="w-full bg-white border border-slate-200 rounded-[14px] px-4 py-2.5 text-xs font-mono text-slate-700 outline-none focus:ring-4 focus:ring-violet-500/10 focus:border-violet-400 transition-all"
            >
              <option value="">
                {lang === 'no' ? '— Ingen arv —' : '— No parent —'}
              </option>
              {allLayers
                .filter((l) => l.id !== layer.id && l.extends !== layer.id)
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
            </select>
            {layer.extends && (
              <p className="text-[9px] text-violet-500 font-bold mt-1.5 flex items-center gap-1">
                ↑ {lang === 'no' ? 'Egenskaper arves fra' : 'Properties inherited from'}{' '}
                <span className="font-black">
                  {allLayers.find((l) => l.id === layer.extends)?.name}
                </span>
              </p>
            )}
          </div>

          {/* Abstract toggle */}
          <div>
            <label className="flex items-center gap-3 cursor-pointer select-none">
              <div
                onClick={() =>
                  onUpdateLayer({ isAbstract: !layer.isAbstract })
                }
                className={`w-10 h-5 rounded-full transition-all relative shrink-0 ${
                  layer.isAbstract ? 'bg-violet-500' : 'bg-slate-200'
                }`}
              >
                <div
                  className={`w-4 h-4 rounded-full bg-white shadow absolute top-0.5 transition-all ${
                    layer.isAbstract ? 'left-5' : 'left-0.5'
                  }`}
                />
              </div>
              <div>
                <span className="text-xs font-black text-slate-700">
                  {lang === 'no' ? 'Abstrakt lag' : 'Abstract layer'}
                </span>
                <p className="text-[9px] text-slate-400 mt-0.5">
                  {lang === 'no'
                    ? 'Abstrakte lag eksporteres ikke som tabeller — de fungerer kun som maler.'
                    : 'Abstract layers are not exported as tables — they serve as templates only.'}
                </p>
              </div>
            </label>
          </div>
        </div>
      )}
    </div>
  );
};

export default LayerInheritanceSection;
