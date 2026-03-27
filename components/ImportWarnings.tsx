import React from 'react';
import type { Translations } from '../i18n/index';
import { AlertTriangle, Info, X, Check, AlertCircle, Lightbulb, ShieldAlert } from 'lucide-react';
import { ImportWarning, ImportError, ImportValidationResult } from '../types';

interface ImportWarningsProps {
  validation: ImportValidationResult;
  onProceed?: () => void;
  onFixIssues?: () => void;
  t: Translations;
  lang: string;
}

const substitute = (template: string, vars: Record<string, string>) =>
  template.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);

const getWarningMessage = (warning: ImportWarning, d: Record<string, any>): string => {
  const vars = { layerName: warning.layerName || '', columnName: warning.columnName || '' };
  switch (warning.type) {
    case 'no_primary_key':   return d.noPrimaryKeyMessage   ? substitute(d.noPrimaryKeyMessage,   vars) : '';
    case 'non_integer_pk':   return d.nonIntegerPkMessage   ? substitute(d.nonIntegerPkMessage,   vars) : '';
    case 'null_pk':          return d.nullPkMessage         ? substitute(d.nullPkMessage,          vars) : '';
    case 'non_unique_pk':    return d.nonUniquePkMessage    ? substitute(d.nonUniquePkMessage,    vars) : '';
    default: return '';
  }
};

const getWarningSuggestion = (warning: ImportWarning, d: Record<string, any>): string => {
  switch (warning.type) {
    case 'no_primary_key':   return d.noPrimaryKeySuggestion   || '';
    case 'non_integer_pk':   return d.nonIntegerPkSuggestion   || '';
    case 'null_pk':          return d.nullPkSuggestion          || '';
    case 'non_unique_pk':    return d.nonUniquePkSuggestion    || '';
    default: return '';
  }
};

const ImportWarnings: React.FC<ImportWarningsProps> = ({
  validation,
  onProceed,
  onFixIssues,
  t,
  lang
}) => {
  const d = t.deploy || {};
  
  if (validation.warnings.length === 0 && validation.errors.length === 0) {
    return null;
  }

  const getIcon = (severity: 'warning' | 'error' | 'critical') => {
    switch (severity) {
      case 'error':
      case 'critical':
        return <ShieldAlert className="w-5 h-5 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-amber-500" />;
      default:
        return <Info className="w-5 h-5 text-blue-500" />;
    }
  };

  const getSeverityStyles = (severity: 'warning' | 'error' | 'critical') => {
    switch (severity) {
      case 'error':
      case 'critical':
        return {
          border: 'border-l-4 border-red-500 bg-red-50/80',
          icon: 'text-red-600',
          title: 'text-red-900',
          description: 'text-red-700',
          suggestion: 'border-red-200 bg-red-100/50 text-red-800'
        };
      case 'warning':
        return {
          border: 'border-l-4 border-amber-500 bg-amber-50/80',
          icon: 'text-amber-600',
          title: 'text-amber-900',
          description: 'text-amber-700',
          suggestion: 'border-amber-200 bg-amber-100/50 text-amber-800'
        };
      default:
        return {
          border: 'border-l-4 border-blue-500 bg-blue-50/80',
          icon: 'text-blue-600',
          title: 'text-blue-900',
          description: 'text-blue-700',
          suggestion: 'border-blue-200 bg-blue-100/50 text-blue-800'
        };
    }
  };

  const hasErrors = validation.errors.length > 0 || validation.warnings.some(w => w.severity === 'error');
  const canProceed = validation.canProceed;
  const totalIssues = validation.warnings.length + validation.errors.length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl border border-amber-200/60 bg-gradient-to-r from-amber-50 to-orange-50 p-6 shadow-sm">
        <div className="absolute top-0 right-0 -mt-2 -mr-2 h-16 w-16 rounded-full bg-amber-100/30 blur-2xl"></div>
        <div className="relative flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 shadow-sm">
            <AlertTriangle className="w-6 h-6 text-amber-600" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-amber-900">{d.validationWarnings || 'Validation Warnings'}</h3>
            <p className="text-sm text-amber-700 mt-1 leading-relaxed">
              {hasErrors 
                ? d.criticalErrors || 'Critical errors found that must be resolved'
                : `Found ${totalIssues} issue${totalIssues === 1 ? '' : 's'} that may affect deployment`
              }
            </p>
          </div>
        </div>
      </div>

      {/* Errors */}
      {validation.errors.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-red-600" />
            <h4 className="text-base font-semibold text-red-900">{d.criticalErrors || 'Critical Errors'}</h4>
          </div>
          <div className="space-y-3">
            {validation.errors.map((error, index) => (
              <div key={index} className="rounded-xl border border-red-200/60 bg-red-50/80 p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5">
                    <ShieldAlert className="w-5 h-5 text-red-500" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-red-900 leading-relaxed">{error.message}</p>
                    {error.details && (
                      <p className="text-sm text-red-700 mt-2 leading-relaxed">{error.details}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Warnings */}
      {validation.warnings.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <h4 className="text-base font-semibold text-amber-900">Issues Found</h4>
          </div>
          <div className="space-y-3">
            {validation.warnings.map((warning, index) => {
              const styles = getSeverityStyles(warning.severity);
              return (
                <div key={index} className={`rounded-xl border ${styles.border} p-4 shadow-sm transition-all hover:shadow-md`}>
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 ${styles.icon}`}>
                      {getIcon(warning.severity)}
                    </div>
                    <div className="flex-1">
                      <p className={`text-sm font-medium ${styles.title} leading-relaxed`}>
                        {getWarningMessage(warning, d) || warning.message}
                      </p>

                      {/* Layer info */}
                      {warning.layerName && (
                        <div className="mt-3 flex items-center gap-2 text-xs">
                          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-gray-600">
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
                            Layer: {warning.layerName}
                          </span>
                          {warning.columnName && warning.columnName !== 'none' && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-gray-600">
                              <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
                              Column: {warning.columnName}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Suggestion */}
                      {(getWarningSuggestion(warning, d) || warning.suggestion) && (
                        <div className={`mt-3 rounded-lg border ${styles.suggestion} p-3`}>
                          <div className="flex items-start gap-2">
                            <Lightbulb className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            <div>
                              <p className="text-xs font-medium">{d.suggestedFixes || 'Suggested Fix'}:</p>
                              <p className="text-xs mt-1 leading-relaxed opacity-90">
                                {getWarningSuggestion(warning, d) || warning.suggestion}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ImportWarnings;
