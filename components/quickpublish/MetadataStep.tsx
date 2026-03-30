import React, { useState, useRef, useEffect } from 'react';
import type { Translations } from '../../i18n/index';
import { X, ArrowRight, ChevronDown, ChevronUp, Layers, Tag, Square } from 'lucide-react';
import { DataModel, Layer, ModelMetadata } from '../../types';
import { InferredDataSummary } from '../../utils/importUtils';
import {
  generateModelAbstract, suggestTheme, suggestKeywords,
  suggestLayerKeywords, generateLayerDescription
} from '../../utils/aiService';
import { useAiContext } from '../../contexts/AiContext';
import AiTrigger from '../ai/AiTrigger';
import BboxEditor from '../shared/BboxEditor';

interface MetadataStepProps {
  model: DataModel;
  summary: InferredDataSummary;
  onUpdateModel: (model: DataModel) => void;
  onBack: () => void;
  onNext: () => void;
  t: Translations;
  lang?: string;
}

type QpFeature = 'description' | 'theme' | 'keywords';

const MetadataStep: React.FC<MetadataStepProps> = ({ model, summary, onUpdateModel, onBack, onNext, t, lang = 'en' }) => {
  const q = t.quickPublish || {};
  const md = t.metadata || {};
  const aiContext = useAiContext();
  const modelRef = useRef(model);
  useEffect(() => { modelRef.current = model; }, [model]);
  
  const round4 = (v: number) => Math.round(v * 10000) / 10000;

  const defaultSpatialExtent = {
    westBoundLongitude: summary.bbox?.west?.toString() || '',
    eastBoundLongitude: summary.bbox?.east?.toString() || '',
    southBoundLatitude: summary.bbox?.south?.toString() || '',
    northBoundLatitude: summary.bbox?.north?.toString() || '',
  };

  const defaultMetadata: ModelMetadata = {
    contactName: '', contactEmail: '', contactOrganization: '',
    keywords: [], theme: '', license: 'CC-BY-4.0', accessRights: 'public',
    purpose: '', accrualPeriodicity: 'unknown',
    spatialExtent: defaultSpatialExtent,
    temporalExtentFrom: '', temporalExtentTo: '',
  };

  const meta: ModelMetadata = {
    ...defaultMetadata,
    ...(model.metadata || {}),
    spatialExtent: {
      ...defaultMetadata.spatialExtent,
      ...(model.metadata?.spatialExtent || {})
    }
  };

  const updateMeta = (partial: Partial<ModelMetadata>) => {
    const m = modelRef.current;
    const currentMeta: ModelMetadata = {
      ...defaultMetadata,
      ...(m.metadata || {}),
      spatialExtent: {
        ...defaultMetadata.spatialExtent,
        ...(m.metadata?.spatialExtent || {})
      }
    };
    onUpdateModel({ ...m, metadata: { ...currentMeta, ...partial } });
  };

  const [kwInput, setKwInput] = useState('');
  const [expandedLayers, setExpandedLayers] = useState<Set<string>>(new Set());
  const [isBboxExpanded, setIsBboxExpanded] = useState(false);
  const [layerKwInputs, setLayerKwInputs] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState(false);

  // Local state for metadata fields to enable responsive typing
  const [nameInput, setNameInput] = useState(model.name);
  const [descInput, setDescInput] = useState(model.description);
  const [contactNameInput, setContactNameInput] = useState(meta.contactName);
  const [contactEmailInput, setContactEmailInput] = useState(meta.contactEmail);
  const [contactOrgInput, setContactOrgInput] = useState(meta.contactOrganization);
  const [urlInput, setUrlInput] = useState(meta.url || '');
  const [tosInput, setTosInput] = useState(meta.termsOfService || '');
  const [themeInput, setThemeInput] = useState(meta.theme);
  const [licenseInput, setLicenseInput] = useState(meta.license);

  // Sync local state with prop changes
  useEffect(() => { setNameInput(model.name); }, [model.name]);
  useEffect(() => { setDescInput(model.description); }, [model.description]);
  useEffect(() => { setContactNameInput(meta.contactName); }, [meta.contactName]);
  useEffect(() => { setContactEmailInput(meta.contactEmail); }, [meta.contactEmail]);
  useEffect(() => { setContactOrgInput(meta.contactOrganization); }, [meta.contactOrganization]);
  useEffect(() => { setUrlInput(meta.url || ''); }, [meta.url]);
  useEffect(() => { setTosInput(meta.termsOfService || ''); }, [meta.termsOfService]);
  useEffect(() => { setThemeInput(meta.theme); }, [meta.theme]);
  useEffect(() => { setLicenseInput(meta.license); }, [meta.license]);

  const toggleLayerExpansion = (layerId: string) => {
    const next = new Set(expandedLayers);
    if (next.has(layerId)) next.delete(layerId);
    else next.add(layerId);
    setExpandedLayers(next);
  };

  const updateLayer = (layerId: string, partial: Partial<Layer>) => {
    const m = modelRef.current;
    onUpdateModel({
      ...m,
      layers: m.layers.map(l => l.id === layerId ? { ...l, ...partial } : l)
    });
  };

  const addLayerKeyword = (layerId: string, kwInput: string) => {
    const kw = kwInput.trim();
    const layer = model.layers.find(l => l.id === layerId);
    if (kw && layer && !(layer.keywords || []).includes(kw)) {
      updateLayer(layerId, { keywords: [...(layer.keywords || []), kw] });
    }
  };

  const errors = {
    name: !model.name.trim(),
    contactName: !meta.contactName.trim(),
    contactEmail: !meta.contactEmail.trim(),
    contactOrganization: !meta.contactOrganization.trim(),
  };
  const hasErrors = Object.values(errors).some(Boolean);
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
    if (!aiContext.ensureApiKey('description')) return;

    aiContext.setLoading('description', 'Generating description…');
    generateModelAbstract({ modelName: modelRef.current.name, layers: getLayers(), lang }).then(result => {
      onUpdateModel({ ...modelRef.current, description: result });
      aiContext.setSuccess();
    }).catch(error => {
      aiContext.setError(error, 'description');
    });
  };

  const handleSuggestTheme = () => {
    if (!aiContext.ensureApiKey('theme')) return;
    
    aiContext.setLoading('theme', 'Suggesting theme…');
    suggestTheme({ modelName: model.name, layers: getLayers(), lang, validThemes: md.themes || {} }).then(result => {
      updateMeta({ theme: result.trim() });
      aiContext.setSuccess();
    }).catch(error => {
      aiContext.setError(error, 'theme');
    });
  };

  const handleSuggestKeywords = () => {
    if (!aiContext.ensureApiKey('keywords')) return;
    
    aiContext.setLoading('keywords', 'Generating keywords…');
    suggestKeywords({ modelName: model.name, layers: getLayers(), lang }).then(keywords => {
      updateMeta({ keywords: [...new Set([...(meta.keywords || []), ...keywords])] });
      aiContext.setSuccess();
    }).catch(error => {
      aiContext.setError(error, 'keywords');
    });
  };

  const handleSuggestLayerKeywords = (layer: Layer) => {
    if (!aiContext.ensureApiKey('layerKeywords')) return;
    aiContext.setLoading('layerKeywords', 'Extracting keywords…');
    const props = layer.properties.map(p => ({ name: p.name, type: p.fieldType.kind === 'primitive' ? p.fieldType.baseType : p.fieldType.kind }));
    suggestLayerKeywords({ layerName: layer.name, properties: props, lang }).then(keywords => {
      const existing = layer.keywords || [];
      updateLayer(layer.id, { keywords: [...new Set([...existing, ...keywords])] });
      aiContext.setSuccess();
    }).catch(error => aiContext.setError(error, 'layerKeywords'));
  };

  const handleGenerateLayerDesc = (layer: Layer) => {
    if (!aiContext.ensureApiKey('description')) return;
    aiContext.setLoading('description', 'Generating description…');
    const props = layer.properties.map(p => ({ name: p.name, type: p.fieldType.kind === 'primitive' ? p.fieldType.baseType : p.fieldType.kind }));
    generateLayerDescription({ 
      layerName: layer.name, 
      geometryType: layer.geometryType || 'None',
      properties: props, 
      lang 
    }).then(description => {
      updateLayer(layer.id, { description });
      aiContext.setSuccess();
    }).catch(error => aiContext.setError(error, 'description'));
  };


  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-400">
      <div className="space-y-1">
        <h2 className="text-2xl font-black tracking-tight text-slate-900">{lang === 'no' ? 'Metadata for tjenesten' : 'Service Metadata'}</h2>
        <p className="text-sm text-slate-400 font-medium">{lang === 'no' ? 'Beskriv datasettet og lagene for å gjøre dem søkbare og forståelige.' : 'Describe your dataset and layers to make them discoverable and easy to understand.'}</p>
      </div>

      {/* Dataset name */}
      <div className="space-y-1.5">
        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t.modelName}<span className="text-red-400 ml-0.5">*</span></label>
        <input
          value={nameInput}
          onChange={e => {
            setNameInput(e.target.value);
            onUpdateModel({ ...modelRef.current, name: e.target.value });
          }}
          className={`w-full bg-white border-2 rounded-2xl px-5 py-3.5 text-sm font-bold outline-none focus:ring-4 transition-all ${touched && errors.name ? 'border-red-400 focus:border-red-400 focus:ring-red-500/10' : 'border-slate-200 focus:border-indigo-400 focus:ring-indigo-500/10'}`}
        />
        {touched && errors.name && <p className="text-xs text-red-500 font-medium">Required</p>}
      </div>

      {/* Description */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{t.descriptionPlaceholder?.split('...')[0] || 'Description'}</label>
          <AiTrigger
            onClick={handleGenerateDesc}
            isLoading={aiContext.isLoading}
            isActive={aiContext.currentOperation === 'description'}
            hasError={!!aiContext.error}
            label={t.ai?.generateAbstract || 'Generate description'}
            t={t}
          />
        </div>
        <textarea
          value={descInput}
          onChange={e => {
            setDescInput(e.target.value);
            onUpdateModel({ ...modelRef.current, description: e.target.value });
          }}
          placeholder={t.descriptionPlaceholder}
          rows={2}
          className="w-full bg-white border-2 border-slate-200 rounded-2xl px-5 py-3.5 text-sm font-medium outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 transition-all resize-none"
        />
      </div>

      {/* Contact */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{md.contactName}<span className="text-red-400 ml-0.5">*</span></label>
          <input value={contactNameInput} onChange={e => { setContactNameInput(e.target.value); updateMeta({ contactName: e.target.value }); }} placeholder={md.contactNamePlaceholder} className={`w-full bg-white border-2 rounded-2xl px-4 py-3 text-sm font-medium outline-none focus:ring-4 transition-all ${touched && errors.contactName ? 'border-red-400 focus:border-red-400 focus:ring-red-500/10' : 'border-slate-200 focus:border-indigo-400 focus:ring-indigo-500/10'}`} />
          {touched && errors.contactName && <p className="text-xs text-red-500 font-medium">Required</p>}
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{md.contactEmail}<span className="text-red-400 ml-0.5">*</span></label>
          <input value={contactEmailInput} onChange={e => { setContactEmailInput(e.target.value); updateMeta({ contactEmail: e.target.value }); }} placeholder={md.contactEmailPlaceholder} className={`w-full bg-white border-2 rounded-2xl px-4 py-3 text-sm font-medium outline-none focus:ring-4 transition-all ${touched && errors.contactEmail ? 'border-red-400 focus:border-red-400 focus:ring-red-500/10' : 'border-slate-200 focus:border-indigo-400 focus:ring-indigo-500/10'}`} />
          {touched && errors.contactEmail && <p className="text-xs text-red-500 font-medium">Required</p>}
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{md.contactOrganization}<span className="text-red-400 ml-0.5">*</span></label>
          <input value={contactOrgInput} onChange={e => { setContactOrgInput(e.target.value); updateMeta({ contactOrganization: e.target.value }); }} placeholder={md.contactOrganizationPlaceholder} className={`w-full bg-white border-2 rounded-2xl px-4 py-3 text-sm font-medium outline-none focus:ring-4 transition-all ${touched && errors.contactOrganization ? 'border-red-400 focus:border-red-400 focus:ring-red-500/10' : 'border-slate-200 focus:border-indigo-400 focus:ring-indigo-500/10'}`} />
          {touched && errors.contactOrganization && <p className="text-xs text-red-500 font-medium">Required</p>}
        </div>
      </div>

      {/* Dataset URLs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{md.datasetUrl}</label>
          <input
            type="url"
            value={urlInput}
            onChange={e => { setUrlInput(e.target.value); updateMeta({ url: e.target.value }); }}
            placeholder={md.datasetUrlPlaceholder}
            className="w-full bg-white border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-medium outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 transition-all"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{md.termsOfService}</label>
          <input
            type="url"
            value={tosInput}
            onChange={e => { setTosInput(e.target.value); updateMeta({ termsOfService: e.target.value }); }}
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
            <AiTrigger
              onClick={handleSuggestTheme}
              isLoading={aiContext.isLoading}
              isActive={aiContext.currentOperation === 'theme'}
              hasError={!!aiContext.error}
              label={t.ai?.suggestTheme || 'Suggest theme'}
              t={t}
            />
          </div>
          <select value={themeInput} onChange={e => { setThemeInput(e.target.value); updateMeta({ theme: e.target.value }); }} className="w-full bg-white border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold appearance-none outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 transition-all cursor-pointer">
            <option value="">—</option>
            {Object.entries(md.themes || {}).map(([k, v]) => <option key={k} value={k}>{String(v)}</option>)}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{md.license}</label>
          <select value={licenseInput} onChange={e => { setLicenseInput(e.target.value); updateMeta({ license: e.target.value }); }} className="w-full bg-white border-2 border-slate-200 rounded-2xl px-4 py-3 text-sm font-bold appearance-none outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 transition-all cursor-pointer">
            {Object.entries(md.licenses || {}).map(([k, v]) => <option key={k} value={k}>{String(v)}</option>)}
          </select>
        </div>
      </div>

      {/* Keywords */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">{md.keywords}</label>
          <AiTrigger
            onClick={handleSuggestKeywords}
            isLoading={aiContext.isLoading}
            isActive={aiContext.currentOperation === 'keywords'}
            hasError={!!aiContext.error}
            label={t.ai?.suggestKeywords || 'Suggest keywords'}
            t={t}
          />
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

      {/* Spatial Extent */}
      <div className={`space-y-4 rounded-2xl border-2 transition-all ${isBboxExpanded ? 'border-indigo-200 ring-4 ring-indigo-500/5 shadow-sm p-5 bg-white' : 'border-slate-100 p-4 bg-slate-50/30'}`}>
        <button
          onClick={() => setIsBboxExpanded(!isBboxExpanded)}
          className="w-full flex items-center justify-between text-left group"
        >
          <div className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${isBboxExpanded ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-100 text-slate-400 group-hover:bg-slate-200'}`}>
              <Square size={16} />
            </div>
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 cursor-pointer block">
                {lang === 'no' ? 'Romlig utstrekning' : 'Spatial Extent'}
              </label>
              {!isBboxExpanded && meta.spatialExtent && (
                <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                  {round4(parseFloat(meta.spatialExtent.westBoundLongitude))}, {round4(parseFloat(meta.spatialExtent.southBoundLatitude))} to {round4(parseFloat(meta.spatialExtent.eastBoundLongitude))}, {round4(parseFloat(meta.spatialExtent.northBoundLatitude))}
                </p>
              )}
            </div>
          </div>
          {isBboxExpanded ? <ChevronUp size={18} className="text-indigo-400" /> : <ChevronDown size={18} className="text-slate-300 group-hover:text-slate-400 transition-colors" />}
        </button>

        {isBboxExpanded && (
          <div className="animate-in fade-in slide-in-from-top-1 duration-200">
            <BboxEditor
              spatialExtent={meta.spatialExtent}
              onChange={(extent) => updateMeta({ spatialExtent: extent })}
              modelCrs={model.crs}
              lang={lang}
            />
          </div>
        )}
      </div>

      {/* Layer Metadata (Optional) */}
      <div className="pt-10 space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-600 border border-amber-100">
            <Layers size={16} />
          </div>
          <div>
            <h3 className="text-sm font-black text-slate-900 tracking-tight">{lang === 'no' ? 'Metadata for lag (valgfritt)' : 'Layer-level Metadata (Optional)'}</h3>
            <p className="text-[10px] text-slate-400 font-medium">{lang === 'no' ? 'Tilpass tittel, beskrivelse og nøkkelord for hvert lag' : 'Customize title, description, and keywords for each layer'}</p>
          </div>
        </div>

        <div className="space-y-3">
          {model.layers.map(layer => {
            const isExpanded = expandedLayers.has(layer.id);
            return (
              <div key={layer.id} className={`bg-white rounded-2xl border-2 transition-all ${isExpanded ? 'border-indigo-200 ring-4 ring-indigo-500/5 shadow-sm' : 'border-slate-100'}`}>
                <button
                  onClick={() => toggleLayerExpansion(layer.id)}
                  className="w-full flex items-center justify-between p-4 text-left"
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${isExpanded ? 'bg-indigo-100 text-indigo-600' : 'bg-slate-50 text-slate-400'}`}>
                      {layer.name[0].toUpperCase()}
                    </div>
                    <div>
                      <span className={`text-xs font-black ${isExpanded ? 'text-indigo-900' : 'text-slate-700'}`}>{layer.title || layer.name}</span>
                      {!isExpanded && layer.description && <p className="text-[10px] text-slate-400 line-clamp-1 max-w-[200px]">{layer.description}</p>}
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp size={16} className="text-indigo-400" /> : <ChevronDown size={16} className="text-slate-300" />}
                </button>

                {isExpanded && (
                  <div className="p-4 pt-0 space-y-4 border-t border-slate-50 animate-in fade-in slide-in-from-top-1 duration-200">
                    <div className="grid grid-cols-1 gap-4">
                      {/* Layer Title */}
                      <div className="space-y-1.5">
                        <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">{t.propTitle}</label>
                        <input
                          value={layer.title || ''}
                          onChange={e => updateLayer(layer.id, { title: e.target.value })}
                          placeholder={layer.name}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 transition-all font-bold"
                        />
                      </div>

                      {/* Layer Description */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">{lang === 'no' ? 'Beskrivelse' : 'Description'}</label>
                          <AiTrigger
                            onClick={() => handleGenerateLayerDesc(layer)}
                            isLoading={aiContext.isLoading}
                            isActive={aiContext.currentOperation === 'description'}
                            hasError={!!aiContext.error}
                            label={t.ai?.generateDescription || 'Generate description'}
                            t={t}
                          />
                        </div>
                        <textarea
                          value={layer.description || ''}
                          onChange={e => updateLayer(layer.id, { description: e.target.value })}
                          rows={2}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium outline-none focus:ring-4 focus:ring-indigo-500/10 focus:border-indigo-400 transition-all resize-none"
                        />
                      </div>

                      {/* Layer Keywords */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">{lang === 'no' ? 'Nøkkelord' : 'Discovery Keywords'}</label>
                          <AiTrigger
                            onClick={() => handleSuggestLayerKeywords(layer)}
                            isLoading={aiContext.isLoading}
                            isActive={aiContext.currentOperation === 'layerKeywords'}
                            hasError={!!aiContext.error}
                            label={t.ai?.suggestKeywords || 'Suggest keywords'}
                            t={t}
                          />
                        </div>
                        <div className="flex flex-wrap gap-1.5 mb-1.5">
                          {(layer.keywords || []).map((kw, i) => (
                            <span key={i} className="flex items-center gap-1.5 px-2 py-1 bg-amber-50 text-amber-700 rounded-lg text-[10px] font-bold border border-amber-100">
                              {kw}
                              <button onClick={() => updateLayer(layer.id, { keywords: (layer.keywords || []).filter((_, j) => j !== i) })} className="hover:text-red-500 transition-colors"><X size={10} /></button>
                            </span>
                          ))}
                        </div>
                        <input
                          value={layerKwInputs[layer.id] || ''}
                          onChange={e => setLayerKwInputs(prev => ({ ...prev, [layer.id]: e.target.value }))}
                          onKeyDown={e => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              addLayerKeyword(layer.id, layerKwInputs[layer.id] || '');
                              setLayerKwInputs(prev => ({ ...prev, [layer.id]: '' }));
                            }
                          }}
                          placeholder={md.keywordsPlaceholder}
                          className="w-full bg-transparent text-xs font-medium outline-none placeholder:text-slate-300 border-b border-slate-100 focus:border-indigo-200 pb-1"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between pt-4">
        <button onClick={onBack} className="px-6 py-3 rounded-2xl border-2 border-slate-200 text-slate-500 font-black text-xs uppercase tracking-widest hover:bg-slate-50 active:scale-95 transition-all">
          {q.back}
        </button>
        <button onClick={() => { setTouched(true); if (!hasErrors) onNext(); }} className="px-8 py-3.5 rounded-2xl bg-indigo-600 text-white font-black text-xs uppercase tracking-[0.15em] hover:bg-indigo-700 active:scale-95 transition-all shadow-lg flex items-center gap-2">
          {q.next} <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
};

export default MetadataStep;
