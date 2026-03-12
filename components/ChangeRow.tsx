import React from 'react';
import { PlusCircle, MinusCircle, Edit2, ArrowRight } from 'lucide-react';
import { ModelChange } from '../utils/diffUtils';

interface ChangeRowProps {
  change: ModelChange;
  isProperty?: boolean;
  t: any;
}

export const ChangeRow: React.FC<ChangeRowProps> = ({ change, isProperty, t }) => {
  const ActionIcon = change.type === 'added' ? PlusCircle : change.type === 'deleted' ? MinusCircle : Edit2;
  const actionColor = change.type === 'added' ? 'text-emerald-500' : change.type === 'deleted' ? 'text-rose-500' : 'text-amber-500';

  return (
    <div className="flex gap-4 group/row">
      <div className="w-8 flex flex-col items-center pt-1">
        <div className={`w-6 h-6 rounded-full flex items-center justify-center ${change.type === 'added' ? 'bg-emerald-500/10' : change.type === 'deleted' ? 'bg-rose-500/10' : 'bg-amber-500/10'}`}>
          <ActionIcon size={14} className={actionColor} />
        </div>
        <div className="w-px flex-1 bg-slate-800 my-1 group-last/row:hidden" />
      </div>
      <div className="flex-1 pb-4">
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-xs font-bold ${change.type === 'deleted' ? 'text-rose-400 line-through' : 'text-slate-200'}`}>
            {change.itemName}
          </span>
          <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest px-1.5 py-0.5 rounded bg-slate-800/50">
            {isProperty ? t.review.field : change.itemType === 'model_meta' ? t.review.setting : t.review.layer}
          </span>
        </div>

        {change.modifiedFields && change.modifiedFields.length > 0 && (
          <div className="space-y-2 mt-3">
            {change.modifiedFields.map((field, fIdx) => (
              <div key={fIdx} className="flex items-center gap-2 flex-wrap">
                <span className="bg-slate-800 text-slate-400 text-[9px] font-black uppercase px-2 py-1 rounded-md tracking-wider border border-slate-700/50">
                  {field.field}
                </span>
                <div className="flex items-center gap-2 bg-slate-800/30 p-1 rounded-lg border border-slate-800">
                  <span className="bg-rose-500/10 text-rose-400 border border-rose-500/20 px-2 py-0.5 rounded-md text-[11px] font-mono line-through">
                    {String(field.oldValue)}
                  </span>
                  <ArrowRight size={12} className="text-slate-600" />
                  <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-md text-[11px] font-mono font-bold">
                    {String(field.newValue)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
        
        {change.details && !change.modifiedFields && (
          <p className="text-[11px] text-slate-500 font-medium italic">{change.details}</p>
        )}
      </div>
    </div>
  );
};
