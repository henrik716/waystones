import React, { useState } from 'react';
import type { Translations } from '../../i18n/index';
import type { DataModel } from '../../types';
import { X, Loader2, Check } from 'lucide-react';
import { processSupabaseSchemaToModel } from '../../utils/supabaseSchemaService';
import { processPostgisSchemaToModel } from '../../utils/postgisSchemaService';

interface DatabaseImportDialogProps {
  t: Translations;
  onClose: () => void;
  onImport: (model: DataModel) => void;
}

type SourceType = 'supabase' | 'postgis';

const DatabaseImportDialog: React.FC<DatabaseImportDialogProps> = ({ t, onClose, onImport }) => {
  const [sourceType, setSourceType] = useState<SourceType>('supabase');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Supabase form
  const [supabaseUrl, setSupabaseUrl] = useState('');
  const [supabaseAnonKey, setSupabaseAnonKey] = useState('');
  const [supabaseSchema, setSupabaseSchema] = useState('public');

  // PostGIS form
  const [postgisConnectionString, setPostgisConnectionString] = useState('');
  const [postgisSchema, setPostgisSchema] = useState('public');

  // Step control
  const [step, setStep] = useState<'credentials' | 'selectTables'>('credentials');
  const [fetchedModel, setFetchedModel] = useState<DataModel | null>(null);
  const [selectedLayerIds, setSelectedLayerIds] = useState<Set<string>>(new Set());

  const labels = t.importDatabase || {};

  const handleConnect = async () => {
    try {
      setError(null);
      setLoading(true);

      let model: DataModel;

      if (sourceType === 'supabase') {
        if (!supabaseUrl || !supabaseAnonKey) {
          throw new Error('Project URL and Anon Key are required');
        }
        model = await processSupabaseSchemaToModel(supabaseUrl, supabaseAnonKey, supabaseSchema);
      } else {
        if (!postgisConnectionString) {
          throw new Error('Connection string is required');
        }
        model = await processPostgisSchemaToModel(postgisConnectionString, undefined, postgisSchema);
      }

      setFetchedModel(model);
      setSelectedLayerIds(new Set(model.layers.map(l => l.id)));
      setStep('selectTables');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = () => {
    if (!fetchedModel) return;
    const filteredLayers = fetchedModel.layers.filter(l => selectedLayerIds.has(l.id));
    onImport({ ...fetchedModel, layers: filteredLayers });
  };

  const handleBack = () => {
    setStep('credentials');
    setError(null);
    setFetchedModel(null);
    setSelectedLayerIds(new Set());
  };

  const toggleLayer = (id: string) => {
    setSelectedLayerIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleSelectAll = () => {
    setSelectedLayerIds(new Set(fetchedModel!.layers.map(l => l.id)));
  };

  const handleDeselectAll = () => {
    setSelectedLayerIds(new Set());
  };


  return (
    <div className="fixed inset-0 z-[300] bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="text-lg font-black text-slate-900">{labels.title || 'Import from database'}</h2>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        {step === 'credentials' && (
          <div className="p-6 space-y-6">
            {/* Source Type Toggle */}
            <div className="flex gap-2 bg-slate-100 p-1 rounded-lg">
              <button
                onClick={() => setSourceType('supabase')}
                className={`flex-1 px-4 py-2 rounded-md font-semibold text-sm transition-all ${
                  sourceType === 'supabase'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {labels.sourceSupabase || 'Supabase'}
              </button>
              <button
                onClick={() => setSourceType('postgis')}
                className={`flex-1 px-4 py-2 rounded-md font-semibold text-sm transition-all ${
                  sourceType === 'postgis'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {labels.sourcePostgis || 'PostGIS'}
              </button>
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Supabase Form */}
            {sourceType === 'supabase' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-2">
                    {labels.supabaseUrlLabel || 'Project URL'}
                  </label>
                  <input
                    type="text"
                    value={supabaseUrl}
                    onChange={e => setSupabaseUrl(e.target.value)}
                    placeholder={labels.supabaseUrlPlaceholder || 'https://yourproject.supabase.co'}
                    disabled={loading}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-2">
                    {labels.supabaseAnonKeyLabel || 'Anon Key'}
                  </label>
                  <input
                    type="password"
                    value={supabaseAnonKey}
                    onChange={e => setSupabaseAnonKey(e.target.value)}
                    placeholder={labels.supabaseAnonKeyPlaceholder || 'eyJhbGci...'}
                    disabled={loading}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-2">
                    {labels.schemaLabel || 'Schema'} <span className="text-slate-400 font-normal">(default: public)</span>
                  </label>
                  <input
                    type="text"
                    value={supabaseSchema}
                    onChange={e => setSupabaseSchema(e.target.value)}
                    placeholder="public"
                    disabled={loading}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:bg-slate-50"
                  />
                </div>

              </div>
            )}

            {/* PostGIS Form */}
            {sourceType === 'postgis' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-2">
                    {labels.postgisConnectionLabel || 'Connection string'}
                  </label>
                  <input
                    type="password"
                    value={postgisConnectionString}
                    onChange={e => setPostgisConnectionString(e.target.value)}
                    placeholder={labels.postgisConnectionPlaceholder || 'postgresql://user:pass@host:5432/db'}
                    disabled={loading}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:bg-slate-50 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-2">
                    {labels.schemaLabel || 'Schema'} <span className="text-slate-400 font-normal">(default: public)</span>
                  </label>
                  <input
                    type="text"
                    value={postgisSchema}
                    onChange={e => setPostgisSchema(e.target.value)}
                    placeholder="public"
                    disabled={loading}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 disabled:bg-slate-50"
                  />
                </div>

                {/* Info */}
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-xs text-slate-600 space-y-1">
                  <p>
                    <strong>Tip:</strong> Your connection string will be used only to read schema information and is not stored.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {step === 'selectTables' && fetchedModel && (
          <div className="p-6 space-y-4">
            {/* Summary */}
            <p className="text-sm text-slate-600">
              {selectedLayerIds.size} / {fetchedModel.layers.length} tables selected
            </p>

            {/* Select All / Deselect All */}
            <div className="flex gap-2">
              <button
                onClick={handleSelectAll}
                className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
              >
                {labels.selectAll || 'Select all'}
              </button>
              <span className="text-slate-300">|</span>
              <button
                onClick={handleDeselectAll}
                className="text-xs font-semibold text-slate-500 hover:text-slate-700"
              >
                {labels.deselectAll || 'Deselect all'}
              </button>
            </div>

            {/* Scrollable layer list */}
            <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
              {fetchedModel.layers.length === 0 ? (
                <div className="px-4 py-3 text-sm text-slate-500 text-center">
                  No tables found in this schema
                </div>
              ) : (
                fetchedModel.layers.map(layer => (
                  <label
                    key={layer.id}
                    className="flex items-center gap-3 px-4 py-2.5 hover:bg-slate-50 cursor-pointer"
                  >
                    <div
                      onClick={() => toggleLayer(layer.id)}
                      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                        selectedLayerIds.has(layer.id)
                          ? 'bg-emerald-500 border-emerald-500'
                          : 'border-slate-300 bg-white'
                      }`}
                    >
                      {selectedLayerIds.has(layer.id) && <Check size={10} className="text-white" />}
                    </div>
                    <span className="text-sm font-medium text-slate-800 truncate">
                      {layer.name}
                    </span>
                    {layer.tableName && layer.tableName !== layer.name && (
                      <span className="text-xs text-slate-400 font-mono ml-auto shrink-0">
                        {layer.tableName}
                      </span>
                    )}
                  </label>
                ))
              )}
            </div>

            {/* Error */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
                {error}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex gap-3 p-6 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
          {step === 'credentials' && (
            <>
              <button
                onClick={onClose}
                disabled={loading}
                className="flex-1 px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-sm font-semibold text-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {labels.cancel || 'Cancel'}
              </button>
              <button
                onClick={handleConnect}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-sm font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading && <Loader2 size={16} className="animate-spin" />}
                {loading ? (labels.connecting || 'Connecting...') : labels.connect || 'Connect'}
              </button>
            </>
          )}

          {step === 'selectTables' && (
            <>
              <button
                onClick={handleBack}
                disabled={loading}
                className="flex-1 px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-sm font-semibold text-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {labels.back || 'Back'}
              </button>
              <button
                onClick={handleImport}
                disabled={selectedLayerIds.size === 0}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-sm font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {labels.import || 'Import'}
                {selectedLayerIds.size > 0 && (
                  <span className="bg-emerald-600 rounded-full px-1.5 py-0.5 text-xs">
                    {selectedLayerIds.size}
                  </span>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default DatabaseImportDialog;
