import React from 'react';
import type { Translations } from '../../i18n/index';
import { Check, Table, Clock, ChevronDown, ChevronRight, ArrowRight, Info } from 'lucide-react';
import { Layer, SourceType, LayerSourceMapping } from '../../types';
import { Field } from './ConnectionForm';

interface LayerMappingCardProps {
  layer: Layer;
  mapping: LayerSourceMapping;
  isExpanded: boolean;
  sourceType: SourceType | null;
  onToggle: () => void;
  onUpdateMapping: (updates: Partial<LayerSourceMapping>) => void;
  onFieldChange: (propId: string, val: string) => void;
  t: Translations;
}

const LayerMappingCard: React.FC<LayerMappingCardProps> = ({
  layer, mapping, isExpanded, sourceType, onToggle, onUpdateMapping, onFieldChange, t
}) => {
  const d = t.deploy;
  const isMapped = !!mapping?.sourceTable;

  return (
    <div className={`bg-white rounded-[24px] border transition-all overflow-hidden ${isExpanded ? 'border-indigo-200 ring-4 ring-indigo-500/5' : 'border-slate-200 shadow-sm'}`}>
      <button onClick={onToggle} className="w-full flex items-center justify-between p-6 hover:bg-slate-50 transition-colors">
        <div className="flex items-center gap-4">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isMapped ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-50 text-slate-400'}`}>
            {isMapped ? <Check size={20} /> : <Table size={20} />}
          </div>
          <div className="text-left">
            <span className="text-sm font-black uppercase tracking-widest text-slate-800 block">{layer.name}</span>
            <span className="text-[10px] font-mono text-slate-400">{mapping?.sourceTable || d.notConnected}</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
           {mapping?.timestampColumn && (
              <span className="hidden sm:flex text-[9px] bg-indigo-100 text-indigo-700 px-2 py-1 rounded-lg font-black uppercase tracking-tighter items-center gap-1">
                <Clock size={10} /> delta
              </span>
           )}
           {isExpanded ? <ChevronDown size={20} className="text-slate-300" /> : <ChevronRight size={20} className="text-slate-300" />}
        </div>
      </button>

      {isExpanded && (
        <div className="px-6 pb-8 pt-6 bg-slate-50/50 border-t border-slate-100">

          {/* Database Configurations */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
            <Field
              label={d.sourceTable || 'Source Table'}
              value={mapping?.sourceTable || ''}
              onChange={v => onUpdateMapping({ sourceTable: v })}
              hint={sourceType === 'geopackage' ? 'Layer name inside GeoPackage' : (d.sourceTableHint || 'Table name in database')}
            />
            <Field
              label={d.primaryKeyColumn || 'Primary Key'}
              value={mapping?.primaryKeyColumn || 'fid'}
              onChange={v => onUpdateMapping({ primaryKeyColumn: v })}
              placeholder="fid"
              hint={d.primaryKeyHint || 'Unique identifier column (e.g. fid, id)'}
            />
          </div>

          {/* Timestamp Selection - Hidden for GeoPackage */}
          {sourceType !== 'geopackage' && (
            <div className="space-y-1.5 mb-8">
              <label className="text-[10px] font-black uppercase text-slate-400 px-1 flex items-center gap-2">
                  {d.timestampColumn || 'Timestamp Column'}
                  <div className="group relative">
                    <Info size={14} className="text-slate-300 cursor-help hover:text-indigo-500 transition-colors" />
                    <div className="absolute bottom-full left-0 md:left-1/2 md:-translate-x-1/2 mb-3 w-72 p-4 bg-slate-900 text-white text-[10px] rounded-2xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none z-50 shadow-2xl font-medium leading-relaxed border border-slate-700">
                        {d.timestampExplainer}
                    </div>
                  </div>
              </label>
              <div className="relative">
                <select
                  value={mapping?.timestampColumn || ''}
                  onChange={e => onUpdateMapping({ timestampColumn: e.target.value })}
                  className="w-full bg-white border border-slate-200 rounded-2xl px-5 py-4 text-xs font-bold outline-none appearance-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 transition-all cursor-pointer shadow-sm"
                >
                  <option value="">{d.noTimestamp}</option>
                  {layer.properties.map(p => <option key={p.id} value={p.name}>{p.name}</option>)}
                </select>
                <ChevronDown size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-300 pointer-events-none" />
              </div>
            </div>
          )}

          {/* Field Mapping Grid */}
          <div className="bg-white border border-slate-200 rounded-[28px] overflow-hidden shadow-sm">
            <div className="grid grid-cols-[1fr_auto_1fr] px-8 py-5 bg-slate-50 border-b border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
              <span>{d.fieldMapping || 'Property'}</span><span className="w-6"></span><span>{d.sourceTable || 'Source Field'}</span>
            </div>
            <div className="p-4 space-y-1 max-h-[350px] overflow-y-auto custom-scrollbar">
              {layer.properties.map(prop => (
                <div key={prop.id} className="grid grid-cols-[1fr_auto_1fr] gap-4 items-center px-4 py-3 hover:bg-slate-50 rounded-2xl transition-colors">
                  <span className="text-xs font-bold text-slate-700 truncate">{prop.name}</span>
                  <ArrowRight size={16} className="text-slate-200" />
                  <input
                    value={(mapping?.fieldMappings || {})[prop.id] || prop.name}
                    onChange={e => onFieldChange(prop.id, e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-xs font-mono outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 transition-all"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default LayerMappingCard;
