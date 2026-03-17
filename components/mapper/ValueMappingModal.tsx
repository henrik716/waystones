import React from 'react';
import type { Translations } from '../../i18n/index';
import { X, ChevronDown } from 'lucide-react';
import { Layer } from '../../types';

interface LayerMapping {
  sourceLayer: string;
  fieldMappings: Record<string, string>;
  valueMappings: Record<string, Record<string, string>>;
}

interface ValueMappingModalProps {
  openValueMapId: string;
  activeLayer: Layer | undefined;
  activeMapping: LayerMapping;
  uniqueValues: Record<string, Record<string, string[]>>;
  t: Translations;
  onClose: () => void;
  onUpdateValueMapping: (propId: string, sourceVal: string, targetVal: string) => void;
}

const ValueMappingModal: React.FC<ValueMappingModalProps> = ({
  openValueMapId,
  activeLayer,
  activeMapping,
  uniqueValues,
  t,
  onClose,
  onUpdateValueMapping,
}) => {
  return (
    <div className="fixed inset-0 z-[500] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="bg-white rounded-[40px] w-full max-w-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-400">
         {/* Modal Header */}
         <div className="p-8 bg-amber-50 border-b border-amber-100 flex items-center justify-between">
            <div>
               <h3 className="text-xl font-black text-slate-800 uppercase tracking-tight">{t.mapper.mapValues}</h3>
               <p className="text-xs text-amber-600 font-bold uppercase tracking-widest mt-1">
                  {activeLayer?.properties.find(p => p.id === openValueMapId)?.name}
               </p>
            </div>
            <button onClick={onClose} className="p-3 bg-white hover:bg-rose-50 hover:text-rose-600 rounded-2xl transition-all shadow-sm">
               <X size={24}/>
            </button>
         </div>

         {/* Modal Content */}
         <div className="flex-1 overflow-y-auto p-8 custom-scrollbar space-y-6">
            <div className="grid grid-cols-2 gap-8 px-4 text-[10px] font-black uppercase text-slate-400 tracking-widest">
               <span>Source Unique Value</span>
               <span>Map to Target</span>
            </div>
            <div className="space-y-3">
               {(uniqueValues[activeMapping.sourceLayer]?.[activeMapping.fieldMappings[openValueMapId]] || []).map(srcVal => {
                  const prop = activeLayer?.properties.find(p => p.id === openValueMapId)!;
                  const currentTarget = activeMapping.valueMappings[openValueMapId]?.[srcVal] || '';
                  const allowedValues = prop.fieldType.kind === 'codelist' && prop.fieldType.mode === 'inline'
                     ? prop.fieldType.values
                     : (prop.constraints?.enumeration?.map(v => ({ code: v, label: v, id: v })) || []);

                  return (
                    <div key={srcVal} className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center p-4 bg-slate-50 border border-slate-100 rounded-3xl group/val hover:bg-slate-100/50 transition-colors">
                       <div className="text-xs font-black mono text-slate-700 truncate bg-white px-4 py-2.5 rounded-2xl border border-slate-200 shadow-sm">{srcVal}</div>
                       <div className="relative">
                          <select
                            value={currentTarget}
                            onChange={e => onUpdateValueMapping(openValueMapId, srcVal, e.target.value)}
                            className={`w-full py-3 px-5 pr-10 rounded-2xl text-xs font-black border transition-all appearance-none cursor-pointer ${currentTarget ? 'bg-amber-50 border-amber-400 text-amber-700' : 'bg-white border-slate-200 text-slate-400 focus:border-amber-400'}`}
                          >
                            <option value="">{t.mapper.keepValue}</option>
                            {allowedValues.map(av => <option key={av.code} value={av.code}>{av.label || av.code}</option>)}
                          </select>
                          <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-300 group-hover/val:text-amber-500 transition-colors"><ChevronDown size={16}/></div>
                       </div>
                    </div>
                  );
               })}
            </div>
         </div>

         {/* Modal Footer */}
         <div className="p-8 border-t border-slate-100 bg-slate-50/50 flex justify-end">
            <button onClick={onClose} className="w-full sm:w-auto px-10 py-4 bg-slate-900 text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-black active:scale-95 transition-all">
               {t.save}
            </button>
         </div>
      </div>
    </div>
  );
};

export default ValueMappingModal;
