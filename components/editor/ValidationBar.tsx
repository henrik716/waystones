import React, { useMemo } from 'react';
import { ChevronUp, ChevronDown, AlertCircle, AlertTriangle, Lightbulb, Layers } from 'lucide-react';
import type { ModelValidationIssue } from '../../utils/validationUtils';
import type { DataModel, Field } from '../../types';

interface ValidationBarProps {
  validationIssues: ModelValidationIssue[];
  model: DataModel;
  isExpanded: boolean;
  onToggle: () => void;
  lang: string;
  showHints?: boolean;
  onToggleHints?: () => void;
}

const ValidationBar: React.FC<ValidationBarProps> = ({
  validationIssues,
  model,
  isExpanded,
  onToggle,
  lang,
  showHints = false,
  onToggleHints = () => {},
}) => {
  if (validationIssues.length === 0) {
    return null;
  }

  // Compute counts internally
  const errorCount = useMemo(() => validationIssues.filter((i) => i.severity === 'error').length, [validationIssues]);
  const warningCount = useMemo(() => validationIssues.filter((i) => i.severity === 'warning').length, [validationIssues]);
  const hintCount = useMemo(() => validationIssues.filter((i) => i.severity === 'hint').length, [validationIssues]);

  // Build lookup maps for layer and shared type names
  const layerMap = useMemo(() => new Map(model.layers.map((l) => [l.id, l])), [model.layers]);
  const sharedTypeMap = useMemo(() => new Map((model.sharedTypes ?? []).map((st) => [st.id, st])), [model.sharedTypes]);

  // Helper to resolve context (layer/field name) from issue
  const resolveContext = (issue: ModelValidationIssue): string | null => {
    if (!issue.layerId) return null;

    let contextName = '';
    let fields: Field[] = [];

    if (issue.layerId.startsWith('sharedtype:')) {
      const stId = issue.layerId.replace('sharedtype:', '');
      const st = sharedTypeMap.get(stId);
      if (st) {
        contextName = `SharedType: ${st.name}`;
        fields = st.properties || [];
      }
    } else {
      const layer = layerMap.get(issue.layerId);
      if (layer) {
        contextName = layer.name;
        fields = layer.properties || [];
      }
    }

    if (!contextName) return null;

    // Append field name if fieldId is present
    if (issue.fieldId && fields.length > 0) {
      const field = fields.find((f) => f.id === issue.fieldId);
      if (field) {
        contextName += ` / ${field.name}`;
      }
    }

    return contextName;
  };

  // Partition issues by severity
  const errors = useMemo(() => validationIssues.filter((i) => i.severity === 'error'), [validationIssues]);
  const warnings = useMemo(() => validationIssues.filter((i) => i.severity === 'warning'), [validationIssues]);
  const hints = useMemo(() => validationIssues.filter((i) => i.severity === 'hint'), [validationIssues]);

  const getSeverityIcon = (severity: 'error' | 'warning' | 'hint') => {
    switch (severity) {
      case 'error':
        return <AlertCircle size={13} className="text-rose-500" />;
      case 'warning':
        return <AlertTriangle size={13} className="text-amber-500" />;
      case 'hint':
        return <Lightbulb size={13} className="text-sky-500" />;
    }
  };

  const getSeverityHeaderIcon = (severity: 'error' | 'warning' | 'hint') => {
    switch (severity) {
      case 'error':
        return <AlertCircle size={11} className="text-rose-600" />;
      case 'warning':
        return <AlertTriangle size={11} className="text-amber-600" />;
      case 'hint':
        return <Lightbulb size={11} className="text-sky-600" />;
    }
  };

  const getSeverityColor = (severity: 'error' | 'warning' | 'hint') => {
    switch (severity) {
      case 'error':
        return 'bg-rose-50/50 border-rose-100 text-rose-800';
      case 'warning':
        return 'bg-amber-50/50 border-amber-100 text-amber-800';
      case 'hint':
        return 'bg-sky-50/50 border-sky-100 text-sky-800';
    }
  };

  const renderIssueGroup = (severityIssues: ModelValidationIssue[], severity: 'error' | 'warning' | 'hint') => {
    if (severityIssues.length === 0) return null;
    if (severity === 'hint' && !showHints) return null;

    const severityLabels = {
      en: { error: 'Errors', warning: 'Warnings', hint: 'Hints' },
      no: { error: 'Feil', warning: 'Advarsler', hint: 'Tips' },
    };
    const label = severityLabels[lang === 'no' ? 'no' : 'en'][severity];

    return (
      <div key={severity} className="space-y-1.5">
        <div className="flex items-center gap-1.5 px-1 pt-2">
          {getSeverityHeaderIcon(severity)}
          <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-400">
            {label} ({severityIssues.length})
          </h5>
        </div>
        {severityIssues.map((issue, idx) => (
          <div key={idx} className={`flex items-start gap-2.5 p-2.5 rounded-xl border text-[11px] leading-relaxed transition-all ${getSeverityColor(issue.severity)}`}>
            {getSeverityIcon(issue.severity)}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-baseline gap-1.5">
                <span className="font-black uppercase text-[9px] opacity-50 tracking-tighter shrink-0">[{issue.code}]</span>
                <span>{lang === 'no' ? issue.messageNo : issue.message}</span>
              </div>
              {resolveContext(issue) && (
                <div className="mt-1 inline-flex items-center gap-1 bg-white/60 border border-current/10 rounded-md px-1.5 py-0.5 text-[9px] font-black opacity-60 truncate max-w-full">
                  <Layers size={9} />
                  {resolveContext(issue)}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="mb-4 bg-white border border-slate-200 rounded-[22px] overflow-hidden shadow-sm transition-all">
      <div className="w-full hover:bg-slate-50 transition-colors">
        <div className="flex items-center w-full px-4 py-3 gap-2">
          {/* Badge container — errors and warnings */}
          <div className="flex flex-wrap gap-2">
            {errorCount > 0 && (
              <div className="flex items-center gap-1.5 bg-rose-50 border border-rose-100 text-rose-700 rounded-lg px-2.5 py-1 text-[10px] font-black">
                <AlertCircle size={11} className="text-rose-600 shrink-0" />
                {errorCount}{' '}
                {lang === 'no'
                  ? errorCount === 1
                    ? 'feil'
                    : 'feil'
                  : errorCount === 1
                    ? 'error'
                    : 'errors'}
              </div>
            )}
            {warningCount > 0 && (
              <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-100 text-amber-700 rounded-lg px-2.5 py-1 text-[10px] font-black">
                <AlertTriangle size={11} className="text-amber-600 shrink-0" />
                {warningCount}{' '}
                {lang === 'no'
                  ? warningCount === 1
                    ? 'advarsel'
                    : 'advarsler'
                  : warningCount === 1
                    ? 'warning'
                    : 'warnings'}
              </div>
            )}
            <span className="text-[10px] text-slate-400 font-bold self-center ml-1">
              {lang === 'no' ? 'Validering av modellen' : 'Model validation'}
            </span>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Hints toggle — expands panel AND toggles hints visibility */}
          {hintCount > 0 && (
            <button
              onClick={() => {
                if (!isExpanded) onToggle();
                onToggleHints();
              }}
              aria-pressed={showHints}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10px] font-black transition-all ${
                showHints
                  ? 'bg-sky-100 border border-sky-200 text-sky-700'
                  : 'bg-sky-50 border border-sky-100 text-sky-600'
              }`}
            >
              <Lightbulb size={11} className="shrink-0" />
              {hintCount}{' '}
              {lang === 'no'
                ? hintCount === 1
                  ? 'tips'
                  : 'tips'
                : hintCount === 1
                  ? 'hint'
                  : 'hints'}
            </button>
          )}

          {/* Expand/collapse chevron and label — clickable to toggle expand */}
          <button
            onClick={onToggle}
            aria-expanded={isExpanded}
            aria-controls="validation-issue-list"
            className="ml-2 flex items-center gap-1.5 text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
            title={isExpanded ? 'Collapse' : 'Expand'}
          >
            {isExpanded ? (
              <ChevronUp size={18} className="shrink-0" />
            ) : (
              <ChevronDown size={18} className="shrink-0" />
            )}
          </button>
        </div>
      </div>

      {isExpanded && (
        <div id="validation-issue-list" className="px-4 pb-4 space-y-2.5 border-t border-slate-100 bg-slate-50/30 animate-in slide-in-from-top-1 duration-200">
          <div className="pt-2 flex items-center justify-between mb-1 px-1">
            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              {lang === 'no' ? 'Detaljer' : 'Details'}
            </h4>
            <span className="text-[9px] text-slate-400 font-bold italic">
              {lang === 'no'
                ? '— blokkerer ikke lagring eller eksport'
                : '— does not block saving or export'}
            </span>
          </div>
          <div className="max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
            {renderIssueGroup(errors, 'error')}
            {renderIssueGroup(warnings, 'warning')}
            {renderIssueGroup(hints, 'hint')}
          </div>
        </div>
      )}
    </div>
  );
};

export default ValidationBar;
