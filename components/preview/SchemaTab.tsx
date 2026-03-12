import React, { useState } from 'react';
import { DataModel } from '../../types';
import { Check, Copy } from 'lucide-react';
import { generateGeoJSONSchema, generateJSONFGSchema } from '../../utils/exportUtils';

type SchemaFormat = 'geojson' | 'json-fg';

interface SchemaTabProps {
  model: DataModel;
  t: any;
}

const SchemaTab: React.FC<SchemaTabProps> = ({ model, t }) => {
  const [copied, setCopied] = useState(false);
  const [format, setFormat] = useState<SchemaFormat>('json-fg');

  const schema = format === 'json-fg'
    ? generateJSONFGSchema(model)
    : generateGeoJSONSchema(model);

  const handleCopy = () => {
    navigator.clipboard.writeText(JSON.stringify(schema, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300 min-w-0 min-h-[400px]">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <span className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em]">{t.schemaPreview}</span>
          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{model.namespace} v{model.version}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-xl border border-slate-200 overflow-hidden text-[10px] font-black uppercase tracking-widest">
            <button
              onClick={() => setFormat('json-fg')}
              className={`px-3 py-2 transition-colors ${format === 'json-fg' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
            >
              JSON-FG
            </button>
            <button
              onClick={() => setFormat('geojson')}
              className={`px-3 py-2 transition-colors ${format === 'geojson' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
            >
              GeoJSON
            </button>
          </div>
          <button
            onClick={handleCopy}
            className="text-indigo-600 text-[10px] md:text-[11px] font-black flex items-center justify-center gap-2 bg-indigo-50 px-4 py-3 rounded-xl border border-indigo-100 hover:bg-indigo-100 transition-all shadow-sm"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? t.copied : t.copySchema}
          </button>
        </div>
      </div>
      <div className="relative group/pre">
         <div className="absolute top-4 right-4 flex items-center gap-2 opacity-0 group-hover/pre:opacity-100 transition-opacity">
            <div className="px-2 py-1 bg-slate-800/50 backdrop-blur-md rounded text-[8px] font-black text-indigo-300 uppercase tracking-widest border border-slate-700">
              {format === 'json-fg' ? 'JSON-FG' : 'GeoJSON'}
            </div>
         </div>
         <pre className="bg-slate-900 text-indigo-200 p-5 md:p-8 rounded-[20px] md:rounded-3xl text-[10px] md:text-xs font-mono overflow-x-auto shadow-2xl leading-relaxed border border-slate-800 min-w-0 scroll-smooth custom-scrollbar">
            {JSON.stringify(schema, null, 2)}
         </pre>
      </div>
    </div>
  );
};

export default SchemaTab;
