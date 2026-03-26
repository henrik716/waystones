import React from 'react';
import type { Translations } from '../../i18n/index';
import { GitCommit, PlusCircle, Edit2, MinusCircle, Package, Layers } from 'lucide-react';
import { ModelChange, StructuredChanges } from '../../utils/diffUtils';
import { ChangeRow } from '../ChangeRow';

interface ChangeReviewBarProps {
  changes: ModelChange[];
  structuredChanges: StructuredChanges;
  stats: { added: number; modified: number; deleted: number; total: number };
  t: Translations;
}

const ChangeReviewBar: React.FC<ChangeReviewBarProps> = ({ changes, structuredChanges, stats, t }) => {
  return (
        <div className="mb-8 bg-white rounded-[32px] overflow-hidden border border-amber-200 shadow-lg shadow-amber-100/50 animate-in slide-in-from-top-4 duration-500">
           <div className="px-8 py-6 border-b border-amber-100 flex flex-col gap-6 bg-amber-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                   <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600 border border-amber-200">
                     <GitCommit size={20} />
                   </div>
                   <div>
                     <h4 className="text-sm font-black text-amber-900 uppercase tracking-widest">{t.review.reviewingChanges}</h4>
                     <p className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">{stats.total} {t.review.totalOperations}</p>
                   </div>
                </div>
                <div className="flex items-center gap-4">
                   <div className="flex items-center gap-3 text-[10px] font-black uppercase tracking-widest">
                      <span className="flex items-center gap-1.5 text-emerald-600"><PlusCircle size={12}/> {stats.added}</span>
                      <span className="flex items-center gap-1.5 text-amber-600"><Edit2 size={12}/> {stats.modified}</span>
                      <span className="flex items-center gap-1.5 text-rose-600"><MinusCircle size={12}/> {stats.deleted}</span>
                   </div>
                </div>
              </div>

              {/* Stat Bar */}
              <div className="h-2 w-full bg-amber-100 rounded-full overflow-hidden flex">
                <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${(stats.added / stats.total) * 100}%` }} />
                <div className="h-full bg-amber-500 transition-all duration-500" style={{ width: `${(stats.modified / stats.total) * 100}%` }} />
                <div className="h-full bg-rose-500 transition-all duration-500" style={{ width: `${(stats.deleted / stats.total) * 100}%` }} />
              </div>
           </div>

           <div className="p-8 space-y-8">
              {/* Model Metadata Section */}
              {structuredChanges.modelMeta.length > 0 && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 text-[10px] font-black text-amber-700 uppercase tracking-[0.2em]">
                    <Package size={14} /> {t.review.modelMetadata}
                  </div>
                  <div className="space-y-2">
                    {structuredChanges.modelMeta.map((change, idx) => (
                      <ChangeRow key={`meta-${idx}`} change={change} t={t} />
                    ))}
                  </div>
                </div>
              )}

              {/* Layers Sections */}
              {structuredChanges.layers.map((layerGroup) => (
                <div key={layerGroup.layerId} className="space-y-4">
                  <div className="flex items-center gap-2 text-[10px] font-black text-amber-700 uppercase tracking-[0.2em]">
                    <Layers size={14} /> {t.review.layer}: {layerGroup.layerName}
                  </div>
                  <div className="space-y-2">
                    {layerGroup.layerChanges.map((change, idx) => (
                      <ChangeRow key={`layer-${layerGroup.layerId}-${idx}`} change={change} t={t} />
                    ))}
                    {layerGroup.propertyChanges.map((change, idx) => (
                      <ChangeRow key={`prop-${layerGroup.layerId}-${idx}`} change={change} isProperty t={t} />
                    ))}
                  </div>
                </div>
              ))}
           </div>
        </div>
  );
};

export default ChangeReviewBar;
