import React, { useState } from 'react';
import type { Translations } from '../../i18n/index';
import { FileText, ChevronDown, ChevronUp, X } from 'lucide-react';
import { DataModel, ModelMetadata } from '../../types';
import {
  generateModelAbstract, suggestTheme, suggestKeywords,
} from '../../utils/aiService';
import { useAiContext } from '../../contexts/AiContext';
import AiTrigger from '../ai/AiTrigger';

interface MetadataSectionProps {
  model: DataModel;
  onUpdate: (model: DataModel) => void;
  isOpen: boolean;
  onToggle: () => void;
  t: Translations;
  lang: string;
}

type MetaFeature = 'abstract' | 'theme' | 'keywords';

const defaultMeta: ModelMetadata = {
  contactName: '', contactEmail: '', contactOrganization: '',
  keywords: [], theme: '', license: 'CC-BY-4.0',
  accessRights: 'public', purpose: '', accrualPeriodicity: 'unknown',
  spatialExtent: { westBoundLongitude: '', eastBoundLongitude: '', southBoundLatitude: '', northBoundLatitude: '' },
  temporalExtentFrom: '', temporalExtentTo: '',
};

const MetadataSection: React.FC<MetadataSectionProps> = ({ model, onUpdate, isOpen, onToggle, t, lang }) => {
  const aiContext = useAiContext();

  const getLayers = () => model.layers.map(l => ({
    name: l.name,
    properties: (l.properties || []).map(p => ({ name: p.name, type: p.type })),
  }));

  const handleGenerateAbstract = () => {
    aiContext.setLoading('abstract', 'Generating model abstract…');
    generateModelAbstract({
      modelName: model.name,
      layers: getLayers(),
      lang,
    }).then(abstract => {
      onUpdate({ ...model, metadata: { ...model.metadata, purpose: abstract } });
      aiContext.setSuccess();
    }).catch(error => {
      aiContext.setError(error, 'abstract');
    });
  };

  const handleSuggestTheme = () => {
    aiContext.setLoading('theme', 'Suggesting theme…');
    suggestTheme({
      modelName: model.name,
      layers: getLayers(),
      lang,
      validThemes: t.metadata?.themes || {},
    }).then(theme => {
      onUpdate({ ...model, metadata: { ...model.metadata, theme: theme.trim() } });
      aiContext.setSuccess();
    }).catch(error => {
      aiContext.setError(error, 'theme');
    });
  };

  const handleSuggestKeywords = () => {
    aiContext.setLoading('keywords', 'Generating keywords…');
    suggestKeywords({
      modelName: model.name,
      layers: getLayers(),
      lang,
    }).then(keywords => {
      const cur = model.metadata || defaultMeta;
      onUpdate({ ...model, metadata: { ...cur, keywords: [...new Set([...(cur.keywords || []), ...keywords])] } });
      aiContext.setSuccess();
    }).catch(error => {
      aiContext.setError(error, 'keywords');
    });
  };

  return (
          <section className="bg-white rounded-[24px] md:rounded-[32px] border border-slate-200 shadow-sm mb-6 md:mb-10 overflow-hidden transition-all">
            <button
              onClick={onToggle}
              className="w-full flex items-center justify-between p-5 md:p-8 hover:bg-slate-50 transition-colors"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center text-teal-600 border border-teal-100 shrink-0">
                  <FileText size={20} />
                </div>
                <div className="text-left">
                  <span className="text-sm font-black text-slate-800 block">{t.metadata?.sectionTitle || 'Publishing metadata'}</span>
                  <span className="text-[10px] text-slate-400 font-medium">{t.metadata?.sectionHint || ''}</span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {model.metadata?.contactOrganization && (
                  <span className="hidden sm:block text-[9px] bg-teal-100 text-teal-700 px-2 py-1 rounded-lg font-black uppercase tracking-tighter">
                    {model.metadata.contactOrganization}
                  </span>
                )}
                {isOpen ? <ChevronUp size={20} className="text-slate-300" /> : <ChevronDown size={20} className="text-slate-300" />}
              </div>
            </button>

            {isOpen && (() => {
              const md = t.metadata || {};
              const meta: ModelMetadata = model.metadata || {
                contactName: '', contactEmail: '', contactOrganization: '',
                keywords: [], theme: '', license: 'CC-BY-4.0',
                accessRights: 'public', purpose: '', accrualPeriodicity: 'unknown',
                spatialExtent: { westBoundLongitude: '', eastBoundLongitude: '', southBoundLatitude: '', northBoundLatitude: '' },
                temporalExtentFrom: '', temporalExtentTo: '',
              };
              const updateMeta = (patch: Partial<ModelMetadata>) => {
                onUpdate({ ...model, metadata: { ...meta, ...patch } });
              };
              const keywordInput = React.createRef<HTMLInputElement>();

              return (
                <div className="px-5 md:px-8 pb-6 md:pb-8 space-y-6 border-t border-slate-100 animate-in fade-in slide-in-from-top-2 duration-300">

                  {/* Contact */}
                  <div className="pt-6 space-y-4">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">{lang === 'no' ? 'Kontaktinformasjon' : 'Contact information'}</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 mb-2 block">{md.contactName}</label>
                        <input type="text" value={meta.contactName} onChange={e => updateMeta({ contactName: e.target.value })} placeholder={md.contactNamePlaceholder} className="w-full bg-slate-50 border border-slate-200 rounded-[18px] px-4 py-3 text-sm font-bold focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 outline-none transition-all" />
                      </div>
                      <div>
                        <label className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 mb-2 block">{md.contactEmail}</label>
                        <input type="email" value={meta.contactEmail} onChange={e => updateMeta({ contactEmail: e.target.value })} placeholder={md.contactEmailPlaceholder} className="w-full bg-slate-50 border border-slate-200 rounded-[18px] px-4 py-3 text-sm font-bold focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 outline-none transition-all" />
                      </div>
                      <div>
                        <label className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 mb-2 block">{md.contactOrganization}</label>
                        <input type="text" value={meta.contactOrganization} onChange={e => updateMeta({ contactOrganization: e.target.value })} placeholder={md.contactOrganizationPlaceholder} className="w-full bg-slate-50 border border-slate-200 rounded-[18px] px-4 py-3 text-sm font-bold focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 outline-none transition-all" />
                      </div>
                    </div>
                  </div>

                  {/* Dataset URLs */}
                  <div className="pt-6 space-y-4">
                    <h4 className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">{lang === 'no' ? 'Dataset-informasjon' : 'Dataset Information'}</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 mb-2 block">{md.datasetUrl}</label>
                        <input
                          type="url"
                          value={meta.url || ''}
                          onChange={e => updateMeta({ url: e.target.value })}
                          placeholder={md.datasetUrlPlaceholder}
                          className="w-full bg-slate-50 border border-slate-200 rounded-[18px] px-4 py-3 text-sm font-bold focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 outline-none transition-all"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 mb-2 block">{md.termsOfService}</label>
                        <input
                          type="url"
                          value={meta.termsOfService || ''}
                          onChange={e => updateMeta({ termsOfService: e.target.value })}
                          placeholder={md.termsOfServicePlaceholder}
                          className="w-full bg-slate-50 border border-slate-200 rounded-[18px] px-4 py-3 text-sm font-bold focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 outline-none transition-all"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Keywords */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">{md.keywords}</label>
                      <AiTrigger
                        onClick={handleSuggestKeywords}
                        isLoading={aiContext.isLoading}
                        isActive={aiContext.currentOperation === 'keywords'}
                        hasError={!!aiContext.error}
                        label={t.ai?.suggestKeywords || 'Suggest keywords'}
                        t={t}
                      />
                    </div>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {(meta.keywords || []).map((kw, i) => (
                        <span key={i} className="inline-flex items-center gap-1.5 bg-teal-50 text-teal-700 border border-teal-200 px-3 py-1.5 rounded-xl text-xs font-bold">
                          {kw}
                          <button onClick={() => updateMeta({ keywords: meta.keywords.filter((_, idx) => idx !== i) })} className="text-teal-400 hover:text-teal-700 transition-colors"><X size={14} /></button>
                        </span>
                      ))}
                    </div>
                    <input
                      ref={keywordInput}
                      type="text"
                      placeholder={md.keywordsPlaceholder}
                      className="w-full bg-slate-50 border border-slate-200 rounded-[18px] px-4 py-3 text-sm font-bold focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 outline-none transition-all"
                      onKeyDown={e => {
                        if (e.key === 'Enter' && (e.target as HTMLInputElement).value.trim()) {
                          e.preventDefault();
                          const val = (e.target as HTMLInputElement).value.trim();
                          if (!meta.keywords.includes(val)) {
                            updateMeta({ keywords: [...(meta.keywords || []), val] });
                          }
                          (e.target as HTMLInputElement).value = '';
                        }
                      }}
                    />
                  </div>

                  {/* Classification row */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">{md.theme}</label>
                        <AiTrigger
                          onClick={handleSuggestTheme}
                          isLoading={aiContext.isLoading}
                          isActive={aiContext.currentOperation === 'theme'}
                          hasError={!!aiContext.error}
                          label={t.ai?.suggestTheme || 'Suggest theme'}
                          t={t}
                        />
                      </div>
                      <select value={meta.theme} onChange={e => updateMeta({ theme: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-[18px] px-4 py-3 text-sm font-bold appearance-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 outline-none transition-all cursor-pointer">
                        <option value="">—</option>
                        {Object.entries(md.themes || {}).map(([key, label]) => (
                          <option key={key} value={key}>{label as string}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 mb-2 block">{md.license}</label>
                      <select value={meta.license} onChange={e => updateMeta({ license: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-[18px] px-4 py-3 text-sm font-bold appearance-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 outline-none transition-all cursor-pointer">
                        {Object.entries(md.licenses || {}).map(([key, label]) => (
                          <option key={key} value={key}>{label as string}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 mb-2 block">{md.accessRights}</label>
                      <select value={meta.accessRights} onChange={e => updateMeta({ accessRights: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-[18px] px-4 py-3 text-sm font-bold appearance-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 outline-none transition-all cursor-pointer">
                        {Object.entries(md.accessRightsOptions || {}).map(([key, label]) => (
                          <option key={key} value={key}>{label as string}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Purpose */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 block">{md.purpose}</label>
                      <AiTrigger
                        onClick={handleGenerateAbstract}
                        isLoading={aiContext.isLoading}
                        isActive={aiContext.currentOperation === 'abstract'}
                        hasError={!!aiContext.error}
                        label={t.ai?.generateAbstract || 'Generate abstract'}
                        t={t}
                      />
                    </div>
                    <textarea value={meta.purpose} onChange={e => updateMeta({ purpose: e.target.value })} placeholder={md.purposePlaceholder} className="w-full bg-slate-50 border border-slate-200 rounded-[18px] px-4 py-3 text-xs md:text-sm min-h-[60px] focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 outline-none transition-all resize-none leading-relaxed" />
                  </div>

                  {/* Frequency */}
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 mb-2 block">{md.accrualPeriodicity}</label>
                    <select value={meta.accrualPeriodicity} onChange={e => updateMeta({ accrualPeriodicity: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-[18px] px-4 py-3 text-sm font-bold appearance-none focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 outline-none transition-all cursor-pointer">
                      {Object.entries(md.frequencies || {}).map(([key, label]) => (
                        <option key={key} value={key}>{label as string}</option>
                      ))}
                    </select>
                  </div>

                  {/* Spatial extent (bbox) */}
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400">{md.spatialExtent}</label>
                    <div className="grid grid-cols-4 gap-3">
                      {[
                        { key: 'westBoundLongitude', label: md.west },
                        { key: 'southBoundLatitude', label: md.south },
                        { key: 'eastBoundLongitude', label: md.east },
                        { key: 'northBoundLatitude', label: md.north },
                      ].map(({ key, label }) => (
                        <div key={key}>
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1 block">{label}</span>
                          <input
                            type="text"
                            value={(meta.spatialExtent as any)?.[key] || ''}
                            onChange={e => updateMeta({ spatialExtent: { ...meta.spatialExtent, [key]: e.target.value } })}
                            placeholder="0.0"
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-mono font-bold focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 outline-none transition-all"
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Temporal extent */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 mb-2 block">{md.temporalFrom}</label>
                      <input type="date" value={meta.temporalExtentFrom} onChange={e => updateMeta({ temporalExtentFrom: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-[18px] px-4 py-3 text-sm font-bold focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 outline-none transition-all" />
                    </div>
                    <div>
                      <label className="text-[10px] font-black uppercase tracking-[0.15em] text-slate-400 mb-2 block">{md.temporalTo}</label>
                      <input type="date" value={meta.temporalExtentTo} onChange={e => updateMeta({ temporalExtentTo: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-[18px] px-4 py-3 text-sm font-bold focus:ring-4 focus:ring-teal-500/10 focus:border-teal-500 outline-none transition-all" />
                    </div>
                  </div>

                </div>
              );
            })()}
          </section>
  );
};

export default MetadataSection;
