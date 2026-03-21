import React, { useState } from 'react';
import type { Translations } from '../../i18n/index';
import type { DataModel } from '../../types';
import { X, Loader2 } from 'lucide-react';
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

  const labels = t.importDatabase || {};

  const handleImport = async () => {
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

      onImport(model);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setLoading(false);
    }
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

        {/* Footer */}
        <div className="flex gap-3 p-6 border-t border-slate-200 bg-slate-50 rounded-b-2xl">
          <button
            onClick={onClose}
            disabled={loading}
            className="flex-1 px-4 py-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-sm font-semibold text-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {labels.cancel || 'Cancel'}
          </button>
          <button
            onClick={handleImport}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-sm font-semibold text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading && <Loader2 size={16} className="animate-spin" />}
            {loading ? (labels.importing || 'Importing...') : labels.import || 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DatabaseImportDialog;
