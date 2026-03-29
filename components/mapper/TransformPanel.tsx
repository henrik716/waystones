import React, { useState } from 'react';
import type { Translations } from '../../i18n/index';
import {
  Play, Check, RefreshCw, Download, ArrowRight, AlertTriangle,
  Terminal, Database, Server, Copy, ChevronDown,
  Settings2, Shield, Globe, ExternalLink, Package
} from 'lucide-react';
import { DataModel } from '../../types';
import { toTableName } from '../../utils/nameSanitizer';

interface LayerMapping {
  sourceLayer: string;
  fieldMappings: Record<string, string>;
  valueMappings: Record<string, Record<string, string>>;
}

interface TransformPanelProps {
  model: DataModel;
  mappings: Record<string, LayerMapping>;
  mappedLayerCount: number;
  sourceFiles: File[];
  sourceGeomColumns: Record<string, string>;
  sourceUrl: string;
  sourceFilename: string;
  onTransformedData?: (blob: Blob, filename: string, bbox?: { west: number; south: number; east: number; north: number }) => void;
  t: Translations;
}

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const TransformPanel: React.FC<TransformPanelProps> = ({
  model, mappings, mappedLayerCount, sourceFiles, sourceGeomColumns,
  sourceUrl, sourceFilename, onTransformedData, t
}) => {
  const [transformStatus, setTransformStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [transformedBlob, setTransformedBlob] = useState<Blob | null>(null);
  const [transformError, setTransformError] = useState<string>('');
  const [targetType, setTargetType] = useState<'gpkg' | 'postgis'>('gpkg');
  const [pgConfig, setPgConfig] = useState({
    host: 'localhost',
    port: '5432',
    dbname: '',
    user: 'postgres',
    password: '',
    schema: 'public'
  });
  const [showScript, setShowScript] = useState(false);
  const [copied, setCopied] = useState(false);
  const [outputBbox, setOutputBbox] = useState<{ west: number; south: number; east: number; north: number } | null>(null);

  const generateOgrCommand = () => {
    const lines: string[] = [];

    const targetOutput = targetType === 'gpkg'
      ? `"${model.name.replace(/\s/g, '_')}.gpkg"`
      : `PG:"host=${pgConfig.host} port=${pgConfig.port} dbname=${pgConfig.dbname || 'database'} user=${pgConfig.user} password=${pgConfig.password || 'password'}"`;

    const formatFlag = targetType === 'gpkg' ? '-f GPKG' : '-f PostgreSQL';
    const sourceString = sourceUrl ? `"${sourceUrl}"` : `"${sourceFilename}"`;

    Object.entries(mappings).forEach(([layerId, m]) => {
      const mapping = m as LayerMapping;
      if (!mapping.sourceLayer) return;
      const modelLayer = model.layers.find(l => l.id === layerId);
      if (!modelLayer) return;

      const targetLayerName = toTableName(modelLayer.name);

      const selectFields = modelLayer.properties
        .filter(p => mapping.fieldMappings[p.id])
        .map(p => {
          const sourceF = mapping.fieldMappings[p.id];
          const vMap = mapping.valueMappings[p.id];

          if (vMap && Object.keys(vMap).length > 0) {
             let caseSql = `CASE `;
             Object.entries(vMap).forEach(([src, trg]) => {
                const trgVal = trg ? `'${trg}'` : 'NULL';
                caseSql += `WHEN "${sourceF}" = '${src}' THEN ${trgVal} `;
             });
             caseSql += `ELSE "${sourceF}" END`;
             return `${caseSql} AS "${p.name}"`;
          }

          return `"${sourceF}" AS "${p.name}"`;
        });

      const geomCol = modelLayer.geometryColumnName || 'geometri';
      const sourceGeomCol = sourceGeomColumns[mapping.sourceLayer] || 'geometry';
      const sql = `SELECT ${selectFields.length > 0 ? selectFields.join(', ') + ', ' : ''}"${sourceGeomCol}" FROM "${mapping.sourceLayer}"`;

      lines.push(`ogr2ogr ${formatFlag} ${targetOutput} ${sourceString} \\
  -nln "${targetLayerName}" \\
  -nlt ${modelLayer.geometryType.toUpperCase()} \\${model.crs ? `\n  -t_srs ${model.crs} \\` : ''}
  -sql '${sql}' \\
  ${targetType === 'postgis' ? `-lco SCHEMA=${pgConfig.schema} ` : ''}-update -append \\
  -lco GEOMETRY_NAME=${geomCol}`);
    });

    return lines.join('\n\n');
  };

  const handleTransform = async () => {
    if (sourceFiles.length === 0 || mappedLayerCount === 0) return;
    setTransformStatus('running');
    setTransformError('');
    setTransformedBlob(null);

    try {
      const { getGdal } = await import('../../utils/gdalService');
      const Gdal = await getGdal();

      const openResult = await Gdal.open(sourceFiles);
      if (!openResult.datasets || openResult.datasets.length === 0) {
        throw new Error(t.importGisError || 'Could not open the source file');
      }

      // gdal3.js API: ogr2ogr(dataset, opts) returns the output path automatically.
      // Do NOT push the output path into opts for the first call — let the API manage it.
      // For append calls, push the captured path so GDAL knows which file to update.
      let outputPath: string | null = null;
      let processedCount = 0;

      for (const [layerId, m] of Object.entries(mappings)) {
        const mapping = m as LayerMapping;
        if (!mapping.sourceLayer) continue;
        const modelLayer = model.layers.find(l => l.id === layerId);
        if (!modelLayer) continue;

        const dataset = openResult.datasets[0];

        const targetLayerName = toTableName(modelLayer.name);
        const selectFields = modelLayer.properties
          .filter(p => mapping.fieldMappings[p.id])
          .map(p => {
            const sourceF = mapping.fieldMappings[p.id];
            const vMap = mapping.valueMappings[p.id];
            if (vMap && Object.keys(vMap).length > 0) {
              let caseSql = `CASE `;
              Object.entries(vMap).forEach(([src, trg]) => {
                caseSql += `WHEN "${sourceF}" = '${src}' THEN ${trg ? `'${trg}'` : 'NULL'} `;
              });
              caseSql += `ELSE "${sourceF}" END`;
              return `${caseSql} AS "${p.name}"`;
            }
            return `"${sourceF}" AS "${p.name}"`;
          });

        const geomCol = modelLayer.geometryColumnName || 'geometry';
        const sourceGeomCol = sourceGeomColumns[mapping.sourceLayer] || 'geometry';
        const sql = selectFields.length > 0
          ? `SELECT ${selectFields.join(', ')}, "${sourceGeomCol}" FROM "${mapping.sourceLayer}"`
          : `SELECT * FROM "${mapping.sourceLayer}"`;

        const opts: string[] = [
          '-f', 'GPKG',
          '-nln', targetLayerName,
          '-nlt', modelLayer.geometryType.toUpperCase(),
          '-sql', sql,
          ...(model.crs ? ['-t_srs', model.crs] : []),
        ];

        if (outputPath !== null) {
          // Append to existing output — -lco only valid on layer creation, not append
          opts.push('-update', '-append', outputPath);
        } else {
          // First layer: -lco only applies to new layer creation
          opts.push('-lco', `GEOMETRY_NAME=${geomCol}`);
        }

        const result = await Gdal.ogr2ogr(dataset, opts);
        if (outputPath === null) outputPath = result as string;
        processedCount++;
      }

      for (const ds of openResult.datasets) {
        try { Gdal.close(ds); } catch (e) { /* ignore */ }
      }

      if (processedCount > 0 && outputPath !== null) {
        const bytes = await Gdal.getFileBytes(outputPath);
        const finalBlob = new Blob([bytes], { type: 'application/geopackage+sqlite3' });
        setTransformedBlob(finalBlob);

        // Extract bbox from output GeoPackage
        let extractedBbox: { west: number; south: number; east: number; north: number } | null = null;
        try {
          const outputFile = new File([bytes], 'output.gpkg', { type: 'application/geopackage+sqlite3' });
          const { processAnyFile } = await import('../../utils/importUtils');
          const { summary: outSummary } = await processAnyFile(outputFile);
          if (outSummary.bbox) extractedBbox = outSummary.bbox;
        } catch { /* ignore */ }
        setOutputBbox(extractedBbox);

        setTransformStatus('done');
      } else {
        throw new Error('No layers were transformed');
      }
    } catch (err: any) {
      console.error('Transform failed:', err);
      setTransformError(err.message || 'Transform failed');
      setTransformStatus('error');
    }
  };

  const handleDownloadGpkg = () => {
    if (!transformedBlob) return;
    const url = URL.createObjectURL(transformedBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${model.name.replace(/\s/g, '_')}.gpkg`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSendToPublish = () => {
    if (!transformedBlob || !onTransformedData) return;
    onTransformedData(transformedBlob, `${model.name.replace(/\s/g, '_')}.gpkg`, outputBbox ?? undefined);
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generateOgrCommand());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
      <section className={`transition-all duration-500 ${mappedLayerCount === 0 ? 'opacity-30 grayscale pointer-events-none' : 'opacity-100'}`}>
         <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2 space-y-6">

               {/* Primary: Transform in browser */}
               <div className="bg-white rounded-[40px] shadow-sm overflow-hidden border border-slate-200">
                  <div className="p-8 md:p-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
                     <div className="flex items-center gap-6">
                        <div className={`w-16 h-16 rounded-[24px] flex items-center justify-center shadow-2xl transition-all shrink-0 ${transformStatus === 'done' ? 'bg-emerald-500 text-white shadow-emerald-200' : transformStatus === 'error' ? 'bg-rose-500 text-white shadow-rose-200' : 'bg-indigo-600 text-white shadow-indigo-200'}`}>
                           {transformStatus === 'done' ? <Check size={32} /> : transformStatus === 'running' ? <RefreshCw size={32} className="animate-spin" /> : <Play size={28} />}
                        </div>
                        <div>
                           <h3 className="text-lg md:text-xl font-black text-slate-800 tracking-tight leading-none mb-1">{t.mapper?.step4 || '4. Transform'}</h3>
                           <p className="text-xs text-slate-500 font-medium">
                              {transformStatus === 'done'
                                ? `${t.mapper?.transformDone || 'GeoPackage ready'} — ${formatFileSize(transformedBlob?.size || 0)}`
                                : transformStatus === 'running' ? (t.mapper?.transformRunning || 'Transforming with GDAL...')
                                : transformStatus === 'error' ? transformError
                                : sourceFiles.length > 0 ? (t.mapper?.transformIdle || 'Run ogr2ogr in the browser via WebAssembly') : (t.mapper?.uploadHint || 'Upload a source file first')
                              }
                           </p>
                        </div>
                     </div>

                     {transformStatus !== 'done' && (
                       <button
                         onClick={handleTransform}
                         disabled={transformStatus === 'running' || sourceFiles.length === 0 || mappedLayerCount === 0}
                         className="w-full sm:w-auto px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.15em] flex items-center justify-center gap-3 shadow-2xl shadow-indigo-200 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 transition-all"
                       >
                         {transformStatus === 'running' ? <RefreshCw size={18} className="animate-spin" /> : <Play size={18} />}
                         {transformStatus === 'running' ? (t.mapper?.transformRunning || 'Transforming...') : (t.mapper?.transformBtn || 'Transform')}
                       </button>
                     )}
                  </div>

                  {/* Transform result actions */}
                  {transformStatus === 'done' && transformedBlob && (
                    <div className="px-8 md:px-10 pb-8 md:pb-10 flex flex-col sm:flex-row gap-4">
                       <button
                         onClick={handleDownloadGpkg}
                         className="flex-1 flex items-center justify-center gap-3 px-6 py-4 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.15em] shadow-xl shadow-emerald-200 hover:bg-emerald-700 active:scale-95 transition-all"
                       >
                         <Download size={18} /> {t.mapper?.downloadGpkg || 'Download GeoPackage'}
                       </button>
                       {onTransformedData && (
                         <button
                           onClick={handleSendToPublish}
                           className="flex-1 flex items-center justify-center gap-3 px-6 py-4 bg-blue-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-[0.15em] shadow-xl shadow-blue-200 hover:bg-blue-700 active:scale-95 transition-all"
                         >
                           <ArrowRight size={18} /> {t.mapper?.sendToPublish || 'Send to QuickPublish'}
                         </button>
                       )}
                       <button
                         onClick={() => { setTransformStatus('idle'); setTransformedBlob(null); }}
                         className="px-6 py-4 bg-slate-100 text-slate-600 rounded-2xl font-black text-[10px] uppercase tracking-[0.15em] hover:bg-slate-200 active:scale-95 transition-all flex items-center gap-2"
                         title={t.mapper?.resetTransform || 'Reset'}
                       >
                         <RefreshCw size={18} />
                       </button>
                    </div>
                  )}

                  {/* Transform error retry */}
                  {transformStatus === 'error' && (
                    <div className="px-8 md:px-10 pb-8 md:pb-10">
                       <div className="flex items-center gap-3 bg-rose-50 text-rose-700 px-6 py-3 rounded-2xl border border-rose-100 text-xs font-bold">
                         <AlertTriangle size={16} /> {transformError || 'Transformasjon feilet'}
                       </div>
                    </div>
                  )}
               </div>

               {/* Secondary: ogr2ogr script (collapsible) */}
               <div className="bg-slate-900 rounded-[40px] shadow-2xl overflow-hidden border border-slate-800">
                  <button
                    onClick={() => setShowScript(!showScript)}
                    className="w-full px-8 py-6 flex items-center justify-between text-left hover:bg-slate-800/60 transition-colors"
                  >
                     <div className="flex items-center gap-4">
                        <Terminal size={20} className="text-slate-500" />
                        <div>
                           <span className="text-xs font-black text-slate-400 uppercase tracking-widest">{t.mapper?.copyScript || 'ogr2ogr script'}</span>
                           <p className="text-[10px] text-slate-600 font-medium mt-0.5">{t.mapper?.terminalScriptHint || 'For use in a terminal or CI/CD pipeline'}</p>
                        </div>
                     </div>
                     <ChevronDown size={18} className={`text-slate-500 transition-transform ${showScript ? 'rotate-180' : ''}`} />
                  </button>

                  {showScript && (
                    <>
                      <div className="px-8 py-4 border-t border-slate-800 bg-slate-800/80 flex flex-col sm:flex-row gap-4">
                         <div className="flex flex-col sm:flex-row gap-4 flex-1">
                            <button
                              onClick={() => setTargetType('gpkg')}
                              className={`flex-1 flex items-center justify-center gap-3 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${targetType === 'gpkg' ? 'bg-indigo-600 text-white shadow-xl' : 'bg-slate-900 text-slate-500 hover:text-slate-300'}`}
                            >
                              <Package size={16}/> GeoPackage
                            </button>
                            <button
                              onClick={() => setTargetType('postgis')}
                              className={`flex-1 flex items-center justify-center gap-3 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${targetType === 'postgis' ? 'bg-blue-600 text-white shadow-xl' : 'bg-slate-900 text-slate-500 hover:text-slate-300'}`}
                            >
                              <Database size={16}/> PostGIS
                            </button>
                         </div>
                         <button
                           onClick={copyToClipboard}
                           className={`px-6 py-3 rounded-2xl transition-all font-black text-[10px] uppercase tracking-[0.15em] flex items-center justify-center gap-3 active:scale-95 ${copied ? 'bg-emerald-600 text-white' : 'bg-slate-700 text-slate-300 hover:text-white'}`}
                         >
                           {copied ? <Check size={16} /> : <Copy size={16} />}
                           {copied ? t.copied : t.mapper?.copyScript || 'Kopier'}
                         </button>
                      </div>

                      {targetType === 'postgis' && (
                        <div className="px-8 py-4 bg-slate-800/60 border-t border-slate-800 grid grid-cols-2 sm:grid-cols-3 gap-4">
                           {[
                             { label: 'Host', key: 'host' },
                             { label: 'Port', key: 'port' },
                             { label: 'Database', key: 'dbname' },
                             { label: 'User', key: 'user' },
                             { label: 'Password', key: 'password', type: 'password' },
                             { label: 'Schema', key: 'schema' }
                           ].map(f => (
                             <div key={f.key} className="space-y-1.5">
                                <label className="text-[8px] font-black text-slate-500 uppercase tracking-widest">{f.label}</label>
                                <input
                                  type={f.type || "text"}
                                  value={(pgConfig as any)[f.key]}
                                  onChange={e => setPgConfig({...pgConfig, [f.key]: e.target.value})}
                                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-2 text-[11px] text-white outline-none focus:border-blue-500"
                                />
                             </div>
                           ))}
                        </div>
                      )}

                      <div className="p-8 md:p-10 font-mono text-[10px] md:text-xs text-indigo-100 leading-relaxed whitespace-pre-wrap break-all bg-black/40 overflow-y-auto max-h-[400px] custom-scrollbar select-all selection:bg-rose-500/30 border-t border-slate-800">
                         {mappedLayerCount > 0 ? generateOgrCommand() : <p className="opacity-20 italic text-center py-20 uppercase font-black tracking-widest">{t.mapper?.mapOneHint || 'Map minst ett lag først'}</p>}
                      </div>

                      <div className="p-8 bg-slate-800/40 border-t border-slate-700 grid grid-cols-1 sm:grid-cols-2 gap-8">
                         <div className="space-y-4">
                            <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-500">{t.mapper?.explanation?.title || 'Forklaring'}</h5>
                            <div className="space-y-1.5">
                               <p className="text-[11px] font-medium text-slate-500"><span className="text-rose-400 font-black">-f:</span> {t.mapper?.explanation?.f || 'Output format'}</p>
                               <p className="text-[11px] font-medium text-slate-500"><span className="text-rose-400 font-black">-nln:</span> {t.mapper?.explanation?.nln || 'New layer name'}</p>
                               <p className="text-[11px] font-medium text-slate-500"><span className="text-rose-400 font-black">-sql:</span> {t.mapper?.explanation?.sql || 'SQL query for field mapping'}</p>
                            </div>
                         </div>
                         <div className="space-y-4">
                            <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-500">{t.mapper?.howToRun || 'Slik kjører du'}</h5>
                            <p className="text-[11px] font-medium text-slate-500 leading-relaxed">{t.mapper?.howToRunDesc || 'Install GDAL and run the command in your terminal.'}</p>
                         </div>
                      </div>
                    </>
                  )}
               </div>
            </div>

            <div className="bg-white p-8 rounded-[40px] border border-slate-200 shadow-sm space-y-8 h-fit sticky top-8">
               <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center text-indigo-600 border border-indigo-100 shrink-0"><Settings2 size={24}/></div>
                  <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest">ETL Engine</h4>
               </div>

               <div className="space-y-6">
                  <div className="space-y-2">
                     <div className="flex items-center gap-2 text-indigo-700">
                        <Shield size={16} />
                        <h5 className="text-[10px] font-black uppercase tracking-widest">{targetType === 'postgis' ? (t.mapper?.dbMigration || 'Database-migrering') : (t.mapper?.simpleFileMig || 'Filkonvertering')}</h5>
                     </div>
                     <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                        {targetType === 'postgis' ? (t.mapper?.postgisAdvantage || 'Direkte til PostGIS') : (t.mapper?.gpkgAdvantage || 'Alt kjøres i nettleseren via GDAL WebAssembly — ingen installasjon nødvendig.')}
                     </p>
                  </div>

                  <div className="space-y-2">
                     <div className="flex items-center gap-2 text-emerald-700">
                        <Globe size={16} />
                        <h5 className="text-[10px] font-black uppercase tracking-widest">Støttede formater</h5>
                     </div>
                     <p className="text-[10px] text-slate-500 font-medium leading-relaxed">
                        GeoPackage, Shapefile, GeoJSON, GML, KML, FlatGeobuf, CSV, GPX, MapInfo TAB, DXF, og mange flere via GDAL.
                     </p>
                  </div>
               </div>

               <div className="pt-4 border-t border-slate-100">
                  <a href="https://gdal.org/programs/ogr2ogr.html" target="_blank" rel="noopener noreferrer" className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-amber-600 hover:text-amber-700 transition-colors group">
                    Official OGR Documentation
                    <ExternalLink size={14} className="group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                  </a>
               </div>
            </div>
         </div>
      </section>
  );
};

export default TransformPanel;
