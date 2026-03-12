import React, { useState } from 'react';
import { X, ArrowRight, Sparkles } from 'lucide-react';
import { DataModel, ModelMetadata } from '../../types';
import { InferredDataSummary } from '../../utils/importUtils';
import {
  generateModelAbstract, suggestTheme, suggestKeywords, hasApiKey,
} from '../../utils/aiService';
import { useAiContext } from '../../hooks/useAiContext';

interface MetadataStepProps {
  model: DataModel;
  summary: InferredDataSummary;
  onUpdateModel: (model: DataModel) => void;
  onBack: () => void;
  onNext: () => void;
  t: any;
  lang?: string;
}

type QpFeature = 'description' | 'theme' | 'keywords';

const MetadataStep: React.FC<MetadataStepProps> = ({ model, summary, onUpdateModel, onBack, onNext, t, lang = 'en' }) => {
  const q = t.quickPublish || {};
  const md = t.metadata || {};
  const aiContext = useAiContext();

  const meta: ModelMetadata = model.metadata || {
    contactName: '', contactEmail: '', contactOrganization: '',
    keywords: [], theme: '', license: 'CC-BY-4.0', accessRights: 'public',
    purpose: '', accrualPeriodicity: 'unknown',
    spatialExtent: {
      westBoundLongitude: summary.bbox?.west?.toString() || '',
      eastBoundLongitude: summary.bbox?.east?.toString() || '',
      southBoundLatitude: summary.bbox?.south?.toString() || '',
      northBoundLatitude: summary.bbox?.north?.toString() || '',
    },
    temporalExtentFrom: '', temporalExtentTo: '',
  };

  const updateMeta = (partial: Partial<ModelMetadata>) => {
    onUpdateModel({ ...model, metadata: { ...meta, ...partial } });
  };

  const [kwInput, setKwInput] = useState('');
  const addKeyword = () => {
    const kw = kwInput.trim();
    if (kw && !meta.keywords.includes(kw)) {
      updateMeta({ keywords: [...meta.keywords, kw] });
    }
    setKwInput('');
  };

  const getLayers = () => model.layers.map(l => ({
    name: l.name,
    properties: (l.properties || []).map(p => ({ name: p.name, type: p.type })),
  }));

  const handleGenerateDesc = () => {
    if (!hasApiKey()) {
      window.dispatchEvent(new CustomEvent('ai-configure-required', {
        detail: { operation: 'description' }
      }));
      return;
    }
    
    aiContext.setLoading('description', 'Generating description…');
    generateModelAbstract({ modelName: model.name, layers: getLayers(), lang }).then(result => {
      onUpdateModel({ ...model, description: result });
      aiContext.setSuccess();
    }).catch(error => {
      aiContext.setError(error, 'description');
    });
  };

  const handleSuggestTheme = () => {
    if (!hasApiKey()) {
      window.dispatchEvent(new CustomEvent('ai-configure-required', {
        detail: { operation: 'theme' }
      }));
      return;
    }
    
    aiContext.setLoading('theme', 'Suggesting theme…');
    suggestTheme({ modelName: model.name, layers: getLayers(), lang, validThemes: md.themes || {} }).then(result => {
      updateMeta({ theme: result.trim() });
      aiContext.setSuccess();
    }).catch(error => {
      aiContext.setError(error, 'theme');
    });
  };

  const handleSuggestKeywords = () => {
    if (!hasApiKey()) {
      window.dispatchEvent(new CustomEvent('ai-configure-required', {
        detail: { operation: 'keywords' }
      }));
      return;
    }
    
    aiContext.setLoading('keywords', 'Generating keywords…');
    suggestKeywords({ modelName: model.name, layers: getLayers(), lang }).then(keywords => {
      updateMeta({ keywords: [...new Set([...(meta.keywords || []), ...keywords])] });
      aiContext.setSuccess();
    }).catch(error => {
      aiContext.setError(error, 'keywords');
    });
  };

  const AiBtn: React.FC<{ feature: QpFeature; label: string; onClick: () => void }> = ({ feature, label, onClick }) => (
    <button
      type="button"
      onClick={onClick}
      disabled={aiContext.isLoading}
      className={`flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-2 py-1 rounded-lg transition-all ${
        aiContext.error ? 'text-rose-400 bg-rose-50' : 'text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50'
      } ${aiContext.isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
    >
      <Sparkles size={10} className={aiContext.currentOperation === feature ? 'animate-pulse' : ''} />
      {aiContext.currentOperation === feature ? (t.ai?.generating || 'Generating…') : label}
    </button>
  );

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-400">
      <div className="space-y-2">
        <h2 className="text-2xl font-black tracking-tight text-slate-900">{q.step2Title}</h2>
        <p className="text-sm text-slate-400 font-medium">{q.step2Desc}</p>
      </div>

      {/* Dataset name */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t.modelName}</label>
        <input
          value={model.name}
          onChange={e => onUpdateModel({ ...model, name: e.target.value })}
          className="w-full bg-white border-2 border-slate-200 rounded-2xl px-5 py-3.5 text-sm font-bold outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 transition-all"
        />
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t.descriptionPlaceholder?.split('...')[0] || 'Description'}</label>
          <AiBtn feature="description" label={t.ai?.generateAbstract || 'Generate description'} onClick={handleGenerateDesc} />
        </div>
        <textarea
          value={model.description}
          onChange={e => onUpdateModel({ ...model, description: e.target.value })}
          placeholder={t.descriptionPlaceholder}
          rows={2}
          className="w-full bg-white border-2 border-slate-200 rounded-2xl px-5 py-3.5 text-sm font-medium outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 transition-all resize-none"
        />
      </div>

      {/* Contact */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{md.contactName}</label>
          <input value={meta.contactName} onChange={e => updateMeta({ contactName: e.target.value })} placeholder={md.contactNamePlaceholder} className="w-full bg-white border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-medium outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 transition-all" />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{md.contactEmail}</label>
          <input value={meta.contactEmail} onChange={e => updateMeta({ contactEmail: e.target.value })} placeholder={md.contactEmailPlaceholder} className="w-full bg-white border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-medium outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 transition-all" />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{md.contactOrganization}</label>
          <input value={meta.contactOrganization} onChange={e => updateMeta({ contactOrganization: e.target.value })} placeholder={md.contactOrganizationPlaceholder} className="w-full bg-white border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-medium outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 transition-all" />
        </div>
      </div>

      {/* Dataset URLs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{md.datasetUrl}</label>
          <input
            type="url"
            value={meta.url || ''}
            onChange={e => updateMeta({ url: e.target.value })}
            placeholder={md.datasetUrlPlaceholder}
            className="w-full bg-white border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-medium outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 transition-all"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{md.termsOfService}</label>
          <input
            type="url"
            value={meta.termsOfService || ''}
            onChange={e => updateMeta({ termsOfService: e.target.value })}
            placeholder={md.termsOfServicePlaceholder}
            className="w-full bg-white border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-medium outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 transition-all"
          />
        </div>
      </div>

      {/* Theme + License */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{md.theme}</label>
            <AiBtn feature="theme" label={t.ai?.suggestTheme || 'Suggest theme'} onClick={handleSuggestTheme} />
          </div>
          <select value={meta.theme} onChange={e => updateMeta({ theme: e.target.value })} className="w-full bg-white border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold appearance-none outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 transition-all cursor-pointer">
            <option value="">—</option>
            {Object.entries(md.themes || {}).map(([k, v]) => <option key={k} value={k}>{String(v)}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{md.license}</label>
          <select value={meta.license} onChange={e => updateMeta({ license: e.target.value })} className="w-full bg-white border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold appearance-none outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 transition-all cursor-pointer">
            {Object.entries(md.licenses || {}).map(([k, v]) => <option key={k} value={k}>{String(v)}</option>)}
          </select>
        </div>
      </div>

      {/* Keywords */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{md.keywords}</label>
          <AiBtn feature="keywords" label={t.ai?.suggestKeywords || 'Suggest keywords'} onClick={handleSuggestKeywords} />
        </div>
        <div className="flex flex-wrap gap-2 min-h-[40px]">
          {meta.keywords.map((kw, i) => (
            <span key={i} className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-700 rounded-xl text-xs font-bold">
              {kw}
              <button onClick={() => updateMeta({ keywords: meta.keywords.filter((_, j) => j !== i) })} className="hover:text-red-500 transition-colors"><X size={12} /></button>
            </span>
          ))}
          <input
            value={kwInput}
            onChange={e => setKwInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addKeyword(); } }}
            placeholder={md.keywordsPlaceholder}
            className="flex-1 min-w-[160px] bg-transparent text-sm font-medium outline-none placeholder:text-slate-300"
          />
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-4">
        <button onClick={onBack} className="px-6 py-3 rounded-2xl border-2 border-slate-200 text-slate-500 font-black text-xs uppercase tracking-widest hover:bg-slate-50 active:scale-95 transition-all">
          {q.back}
        </button>
        <button onClick={onNext} className="px-8 py-3.5 rounded-2xl bg-slate-900 text-white font-black text-xs uppercase tracking-[0.15em] hover:bg-slate-800 active:scale-95 transition-all shadow-lg flex items-center gap-2">
          {q.next} <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
};

export default MetadataStep;
