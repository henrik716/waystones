import React, { useState, useRef } from 'react';
import type { Translations } from '../i18n/index';
import {
  Upload, Table, Check, Play,
  RefreshCw,
  X, ArrowRightLeft,
  Layers, CheckCircle2, ChevronDown,
  Globe, BookOpen
} from 'lucide-react';
import { DataModel } from '../types';
import { processAnyFile } from '../utils/importUtils';
import FieldMappingTable from './mapper/FieldMappingTable';
import ValueMappingModal from './mapper/ValueMappingModal';
import TransformPanel from './mapper/TransformPanel';

declare var initSqlJs: any;

interface LayerMapping {
  sourceLayer: string;
  fieldMappings: Record<string, string>; // modelPropId -> sourceFieldName
  valueMappings: Record<string, Record<string, string>>; // modelPropId -> { sourceVal: targetVal }
}

interface DataMapperProps {
  model: DataModel;
  t: Translations;
  onTransformedData?: (blob: Blob, filename: string) => void;
}

const DataMapper: React.FC<DataMapperProps> = ({ model, t, onTransformedData }) => {
  const [sourceLayers, setSourceLayers] = useState<string[]>([]);
  const [allFields, setAllFields] = useState<Record<string, string[]>>({}); // layerName -> fieldNames
  const [sourceGeomColumns, setSourceGeomColumns] = useState<Record<string, string>>({}); // layerName -> geometry column name
  const [uniqueValues, setUniqueValues] = useState<Record<string, Record<string, string[]>>>({}); // layerName -> fieldName -> uniqueValues
  const [mappings, setMappings] = useState<Record<string, LayerMapping>>({}); // modelLayerId -> mapping
  const [activeModelLayerId, setActiveModelLayerId] = useState<string>(model.layers[0]?.id || '');
  const [sourceFilename, setSourceFilename] = useState<string>('');
  const [sourceUrl, setSourceUrl] = useState<string>('');
  const [sourceFiles, setSourceFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [openValueMapId, setOpenValueMapId] = useState<string | null>(null);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeLayer = model.layers.find(l => l.id === activeModelLayerId) || model.layers[0];
  const activeMapping = mappings[activeModelLayerId] || { sourceLayer: '', fieldMappings: {}, valueMappings: {} };

  // Calculate current progress for stepper
  const getStep = () => {
    if (!sourceFilename) return 1;
    if (!activeMapping.sourceLayer) return 2;
    const mappedLayerCount = Object.keys(mappings).filter(id => mappings[id].sourceLayer).length;
    if (mappedLayerCount > 0) return 3; // On step 3 currently
    return 2;
  };
  const currentStep = getStep();

  const processGeoJsonDataWithGdal = async (json: any, filename: string) => {
    try {
      const jsonBlob = new Blob([JSON.stringify(json)], { type: 'application/json' });
      const tempFile = new File([jsonBlob], filename, { type: 'application/json' });
      setSourceFiles([tempFile]);
      
      const { model: sourceModel } = await processAnyFile(tempFile);

      const layers: string[] = [];
      const fieldsMap: Record<string, string[]> = {};
      const valuesMap: Record<string, Record<string, string[]>> = {};
      const geomColMap: Record<string, string> = {};

      sourceModel.layers.forEach(layer => {
        layers.push(layer.name);
        fieldsMap[layer.name] = layer.properties.map(p => p.name);
        valuesMap[layer.name] = {};
        geomColMap[layer.name] = layer.geometryColumnName || 'geometry';
      });

      const features = json.features || (Array.isArray(json) ? json : []);
      if (features.length > 0 && layers.length > 0) {
        for (const layerName of layers) {
          const fields = fieldsMap[layerName] || [];
          const valSets: Record<string, Set<string>> = {};
          fields.forEach(f => valSets[f] = new Set());

          features.slice(0, 100).forEach((f: any) => {
            const p = f.properties || f;
            fields.forEach(field => {
              if (p[field] !== undefined && p[field] !== null) {
                valSets[field].add(String(p[field]));
              }
            });
          });
          
          Object.keys(valSets).forEach(k => {
            valuesMap[layerName][k] = Array.from(valSets[k]);
          });
        }
      }

      setSourceLayers(layers);
      setAllFields(fieldsMap);
      setSourceGeomColumns(geomColMap);
      setUniqueValues(valuesMap);
      setMappings({});

    } catch (err) {
      console.warn('GDAL processing failed for URL GeoJSON, falling back to simple processing:', err);
      
      let fields: string[] = [];
      let values: Record<string, Set<string>> = {};
      
      const features = json.features || (Array.isArray(json) ? json : []);
      if (features.length > 0) {
        const first = (features[0].properties || features[0]);
        fields = Object.keys(first);
        
        features.slice(0, 100).forEach((f: any) => {
           const p = f.properties || f;
           fields.forEach(field => {
              if (!values[field]) values[field] = new Set();
              if (p[field] !== undefined && p[field] !== null) values[field].add(String(p[field]));
           });
        });
      }
      
      const jsonBlob = new Blob([JSON.stringify(json)], { type: 'application/json' });
      const tempFile = new File([jsonBlob], filename, { type: 'application/json' });
      setSourceFiles([tempFile]);
      
      setSourceLayers(['default']);
      setAllFields({ 'default': fields });
      setSourceGeomColumns({ 'default': 'geometry' });
      setUniqueValues({ 'default': Object.fromEntries(Object.entries(values).map(([k, v]) => [k, Array.from(v)])) });
      setMappings({});
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const allFiles = Array.from(e.target.files || []);
    setSourceFilename(file.name);
    setSourceUrl('');
    setSourceFiles(allFiles);
    setIsLoading(true);

    try {
      // Extract structure (tables and columns) — supports GML, XML, Shapefiles etc.
      const { model: sourceModel } = await processAnyFile(file);

      const layers: string[] = [];
      const fieldsMap: Record<string, string[]> = {};
      const valuesMap: Record<string, Record<string, string[]>> = {};
      const geomColMap: Record<string, string> = {};

      sourceModel.layers.forEach(layer => {
        layers.push(layer.name);
        fieldsMap[layer.name] = layer.properties.map(p => p.name);
        valuesMap[layer.name] = {};
        geomColMap[layer.name] = layer.geometryColumnName || 'geometry';
      });

      // 2. Forsøk å hente ut unike data-verdier for tryllestav-verktøyet (hvis formatet støttes direkte)
      try {
        if (file.name.endsWith('.gpkg') || file.name.endsWith('.sqlite')) {
          const SQL = await initSqlJs({ locateFile: () => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.12.0/sql-wasm.wasm` });
          const arrayBuffer = await file.arrayBuffer();
          const db = new SQL.Database(new Uint8Array(arrayBuffer));

          for (const layerName of layers) {
            const fields = fieldsMap[layerName] || [];
            for (const field of fields) {
              try {
                const distinctRes = db.exec(`SELECT DISTINCT "${field}" FROM "${layerName}" LIMIT 50`);
                if (distinctRes.length > 0) {
                  valuesMap[layerName][field] = distinctRes[0].values.map(v => String(v[0])).filter(v => v !== 'null' && v !== '');
                }
              } catch (e) { /* Ignorer feil på enkeltkolonner */ }
            }
          }
        } else if (file.name.endsWith('.json') || file.name.endsWith('.geojson')) {
          const text = await file.text();
          const json = JSON.parse(text);
          const features = json.features || (Array.isArray(json) ? json : []);
          
          if (features.length > 0 && layers.length > 0) {
            const layerName = layers[0]; 
            const fields = fieldsMap[layerName] || [];
            const valSets: Record<string, Set<string>> = {};
            fields.forEach(f => valSets[f] = new Set());

            features.slice(0, 100).forEach((f: any) => {
              const p = f.properties || f;
              fields.forEach(field => {
                if (p[field] !== undefined && p[field] !== null) {
                  valSets[field].add(String(p[field]));
                }
              });
            });
            
            Object.keys(valSets).forEach(k => {
              valuesMap[layerName][k] = Array.from(valSets[k]);
            });
          }
        }
      } catch (valueErr) {
        console.warn("Kunne ikke hente unike verdier for mapping, men strukturen ble lastet OK.", valueErr);
      }

      // 3. Oppdater state i komponenten
      setSourceLayers(layers);
      setAllFields(fieldsMap);
      setSourceGeomColumns(geomColMap);
      setUniqueValues(valuesMap);
      setMappings({});

    } catch (err) {
      alert(t.importGisError || "Kunne ikke lese filen");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUrlFetch = async () => {
    if (!sourceUrl) return;
    setIsLoading(true);
    try {
      const response = await fetch(sourceUrl);
      if (!response.ok) throw new Error("Fetch failed");
      const json = await response.json();
      const filename = sourceUrl.split('/').pop()?.split('?')[0] || "API Data";
      setSourceFilename(filename);
      await processGeoJsonDataWithGdal(json, filename);
      setShowUrlInput(false);
    } catch (err) {
      alert(t.fetchError);
    } finally {
      setIsLoading(false);
    }
  };

  const updateLayerMapping = (sourceLayer: string) => {
    setMappings(prev => ({
      ...prev,
      [activeModelLayerId]: { sourceLayer, fieldMappings: {}, valueMappings: {} }
    }));
  };

  const updateFieldMapping = (propId: string, sourceField: string) => {
    setMappings(prev => {
      const current = prev[activeModelLayerId] || { sourceLayer: '', fieldMappings: {}, valueMappings: {} };
      const newValueMappings = { ...current.fieldMappings };
      delete newValueMappings[propId];

      return {
        ...prev,
        [activeModelLayerId]: {
          ...current,
          fieldMappings: { ...current.fieldMappings, [propId]: sourceField },
          valueMappings: { ...current.valueMappings }
        }
      };
    });
  };

  const updateValueMapping = (propId: string, sourceVal: string, targetVal: string) => {
    setMappings(prev => {
      const current = prev[activeModelLayerId] || { sourceLayer: '', fieldMappings: {}, valueMappings: {} };
      const currentPropValueMap = current.valueMappings[propId] || {};
      
      return {
        ...prev,
        [activeModelLayerId]: {
          ...current,
          valueMappings: {
            ...current.valueMappings,
            [propId]: { ...currentPropValueMap, [sourceVal]: targetVal }
          }
        }
      };
    });
  };

  const handleAutoMap = () => {
    if (!activeLayer || !activeMapping.sourceLayer) return;
    const availableFields = allFields[activeMapping.sourceLayer] || [];
    const newFieldMappings = { ...activeMapping.fieldMappings };
    
    activeLayer.properties.forEach(prop => {
      const match = availableFields.find(sf => 
        sf.toLowerCase() === prop.name.toLowerCase() || 
        sf.toLowerCase() === prop.title.toLowerCase()
      );
      if (match) newFieldMappings[prop.id] = match;
    });

    setMappings(prev => ({
      ...prev,
      [activeModelLayerId]: { ...activeMapping, fieldMappings: newFieldMappings }
    }));
  };

  const mappedLayerCount = Object.keys(mappings).filter(id => mappings[id].sourceLayer).length;

  return (
    <div className="max-w-6xl mx-auto space-y-8 md:space-y-12 pb-40 px-2 md:px-4 animate-in fade-in duration-700">
      
      {/* 0. GDAL INFO SECTION */}
      <section className="bg-white p-6 md:p-10 rounded-[32px] border-l-8 border-l-blue-600 border border-slate-200 shadow-sm flex flex-col md:flex-row gap-8 items-start">
         <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 border border-blue-100 shrink-0">
            <BookOpen size={32} />
         </div>
         <div className="space-y-3">
            <h2 className="text-xl md:text-2xl font-black text-slate-800 tracking-tight">{t.mapper.aboutGdal.title}</h2>
            <p className="text-sm md:text-base text-slate-500 font-medium leading-relaxed">
              {t.mapper.aboutGdal.desc}
            </p>
         </div>
      </section>

      {/* 1. PROGRESS STEPPER */}
      <div className="flex items-center justify-between px-4 sm:px-12 py-8 bg-white border border-slate-200 rounded-[32px] shadow-sm overflow-hidden">
        {[
          { id: 1, label: t.mapper.step1.split('. ')[1] || 'Source', icon: Upload },
          { id: 2, label: t.mapper.step2.split('. ')[1] || 'Target', icon: Table },
          { id: 3, label: t.mapper.step3.split('. ')[1] || 'Map', icon: ArrowRightLeft },
          { id: 4, label: t.mapper?.step4?.split('. ')[1] || 'Transform', icon: Play },
        ].map((step, idx, arr) => (
          <React.Fragment key={step.id}>
            <div className="flex flex-col items-center gap-2 relative z-10">
               <div className={`w-10 h-10 md:w-12 md:h-12 rounded-2xl flex items-center justify-center transition-all duration-500 shadow-lg ${currentStep >= step.id ? 'bg-indigo-600 text-white shadow-indigo-200' : 'bg-slate-50 text-slate-300'}`}>
                  {currentStep > step.id ? <Check size={20} strokeWidth={3} /> : <step.icon size={18} />}
               </div>
               <span className={`text-[8px] md:text-[10px] font-black uppercase tracking-widest hidden sm:block ${currentStep >= step.id ? 'text-indigo-900' : 'text-slate-400'}`}>
                  {step.label}
               </span>
            </div>
            {idx < arr.length - 1 && (
              <div className="flex-1 h-1 mx-2 md:mx-4 rounded-full bg-slate-100 overflow-hidden relative">
                 <div className={`absolute inset-0 bg-indigo-600 transition-all duration-700 ${currentStep > step.id ? 'w-full' : 'w-0'}`} />
              </div>
            )}
          </React.Fragment>
        ))}
      </div>

      {/* STEP 1: SOURCE SELECTION */}
      <section className="bg-white p-6 md:p-10 rounded-[32px] border border-slate-200 shadow-sm space-y-6 md:space-y-10">
           <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex items-center gap-6">
                 <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center text-amber-600 border border-amber-100 shrink-0">
                   <Upload size={28} />
                 </div>
                 <div>
                    <h3 className="text-lg md:text-xl font-black text-slate-800 tracking-tight leading-none mb-1">{t.mapper.step1}</h3>
                    <p className="text-xs text-slate-500 font-medium">{t.mapper.uploadHint}</p>
                 </div>
              </div>
              <div className="flex flex-wrap gap-3">
                <button 
                  onClick={() => { setShowUrlInput(false); fileInputRef.current?.click(); }}
                  className={`flex-1 sm:flex-none flex items-center justify-center gap-3 px-6 py-4 rounded-2xl border-2 transition-all font-black text-[10px] uppercase tracking-widest active:scale-95 ${sourceFilename && !sourceUrl ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-indigo-300'}`}
                >
                  {isLoading && !sourceUrl ? <RefreshCw className="animate-spin" size={16} /> : <Upload size={16} />}
                  {t.mapper.uploadSource}
                </button>
                <button 
                  onClick={() => setShowUrlInput(!showUrlInput)}
                  className={`flex-1 sm:flex-none flex items-center justify-center gap-3 px-6 py-4 rounded-2xl border-2 transition-all font-black text-[10px] uppercase tracking-widest active:scale-95 ${sourceUrl ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-slate-50 border-slate-200 text-slate-500 hover:border-blue-300'}`}
                >
                  <Globe size={16} />
                  {t.mapper.uploadUrl}
                </button>
              </div>
           </div>

           {showUrlInput && (
              <div className="p-4 bg-slate-50 rounded-2xl border-2 border-blue-100 flex flex-col sm:flex-row gap-3 animate-in slide-in-from-top-2">
                 <input 
                   type="text" 
                   value={sourceUrl} 
                   onChange={e => setSourceUrl(e.target.value)} 
                   placeholder={t.urlPlaceholder} 
                   className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-bold outline-none focus:border-blue-500" 
                 />
                 <button onClick={handleUrlFetch} disabled={isLoading || !sourceUrl} className="px-6 py-3.5 bg-blue-600 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-blue-200 hover:bg-blue-700 disabled:opacity-50">
                    {t.fetchUrl}
                 </button>
              </div>
           )}

           {sourceFilename && (
              <div className="flex items-center gap-3 bg-emerald-50 text-emerald-700 px-6 py-3 rounded-2xl border border-emerald-100 w-fit animate-in zoom-in-95">
                 <CheckCircle2 size={16} />
                 <span className="text-[10px] font-black uppercase tracking-widest truncate max-w-[200px] sm:max-w-[300px]">{sourceFilename}</span>
                 <button onClick={() => { setSourceFilename(''); setSourceUrl(''); setSourceFiles([]); setSourceGeomColumns({}); setMappings({}); }} className="ml-2 hover:text-rose-600 transition-colors"><X size={16}/></button>
              </div>
           )}
           <input type="file" ref={fileInputRef} className="hidden" accept=".geojson,.json,.gpkg,.sqlite,.gml,.xml,.kml,.kmz,.shp,.shx,.dbf,.prj,.cpg,.fgb,.tab,.mif,.csv,.gpx,.dxf" multiple onChange={handleFileUpload} />
      </section>

      {/* STEP 2: LAYER MATCHING */}
      <section className={`transition-all duration-500 ${!sourceFilename ? 'opacity-30 grayscale pointer-events-none' : 'opacity-100'}`}>
         <div className="bg-white p-6 md:p-10 rounded-[32px] border border-slate-200 shadow-sm space-y-8">
            <div className="flex items-center gap-6">
               <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center text-blue-600 border border-blue-100 shrink-0">
                 <Table size={28} />
               </div>
               <div>
                  <h3 className="text-lg md:text-xl font-black text-slate-800 tracking-tight leading-none mb-1">{t.mapper.step2}</h3>
                  <p className="text-xs text-slate-500 font-medium">{t.mapper.multiLayerHint}</p>
               </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
               <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">{t.mapper.selectTargetLayer}</label>
                  <div className="flex flex-wrap gap-2">
                     {model.layers.map(l => {
                        const isMapped = !!mappings[l.id]?.sourceLayer;
                        return (
                          <button 
                            key={l.id} 
                            onClick={() => setActiveModelLayerId(l.id)}
                            className={`px-4 py-3 rounded-xl border transition-all text-[10px] font-black uppercase tracking-widest flex items-center gap-3 ${activeModelLayerId === l.id ? 'bg-slate-900 border-slate-900 text-white shadow-xl' : 'bg-white border-slate-200 text-slate-500 hover:border-blue-300'}`}
                          >
                            <Layers size={14} />
                            {l.name}
                            {isMapped && <CheckCircle2 size={12} className="text-emerald-400" />}
                          </button>
                        );
                     })}
                  </div>
               </div>

               <div className="space-y-4 p-6 bg-slate-50 rounded-[24px] border border-slate-100">
                  <label className="text-[10px] font-black uppercase tracking-widest text-blue-500">{t.mapper.selectSourceLayer}</label>
                  <div className="relative">
                    <select 
                      value={activeMapping.sourceLayer} 
                      onChange={e => updateLayerMapping(e.target.value)} 
                      className="w-full bg-white border border-slate-200 rounded-xl px-5 py-4 text-xs font-black text-slate-800 outline-none focus:ring-4 focus:ring-blue-500/10 transition-all appearance-none cursor-pointer"
                    >
                       <option value="">-- {t.mapper.selectSourceLayer} --</option>
                       {sourceLayers.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400"><ChevronDown size={18} /></div>
                  </div>
               </div>
            </div>
         </div>
      </section>

      {/* STEP 3: FIELD MAPPING TABLE */}
      <FieldMappingTable
        activeLayer={activeLayer}
        activeMapping={activeMapping}
        allFields={allFields}
        t={t}
        onAutoMap={handleAutoMap}
        onUpdateFieldMapping={updateFieldMapping}
        onOpenValueMap={(propId) => setOpenValueMapId(propId)}
      />

      {/* FIXED OVERLAY MODAL FOR VALUE MAPPING */}
      {openValueMapId && (
        <ValueMappingModal
          openValueMapId={openValueMapId}
          activeLayer={activeLayer}
          activeMapping={activeMapping}
          uniqueValues={uniqueValues}
          t={t}
          onClose={() => setOpenValueMapId(null)}
          onUpdateValueMapping={updateValueMapping}
        />
      )}

      {/* STEP 4: TRANSFORM & EXPORT */}
      <TransformPanel
        model={model}
        mappings={mappings}
        mappedLayerCount={mappedLayerCount}
        sourceFiles={sourceFiles}
        sourceGeomColumns={sourceGeomColumns}
        sourceUrl={sourceUrl}
        sourceFilename={sourceFilename}
        onTransformedData={onTransformedData}
        t={t}
      />
    </div>
  );
};

export default DataMapper;