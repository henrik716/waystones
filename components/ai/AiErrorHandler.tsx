import React from 'react';
import { AlertCircle, RefreshCw, X, HelpCircle } from 'lucide-react';
import { AiError } from '../../hooks/useAiContext';

interface AiErrorHandlerProps {
  error: AiError;
  onRetry?: () => void;
  onConfigure?: () => void;
  onDismiss?: () => void;
  className?: string;
  t?: any;
}

const AiErrorHandler: React.FC<AiErrorHandlerProps> = ({
  error,
  onRetry,
  onConfigure,
  onDismiss,
  className = '',
  t
}) => {
  const getErrorColor = () => {
    switch (error.type) {
      case 'auth':
      case 'invalid_key':
        return 'text-amber-600 bg-amber-50 border-amber-200';
      case 'rate_limit':
        return 'text-orange-600 bg-orange-50 border-orange-200';
      case 'network':
        return 'text-blue-600 bg-blue-50 border-blue-200';
      default:
        return 'text-rose-600 bg-rose-50 border-rose-200';
    }
  };

  const getErrorIcon = () => {
    switch (error.type) {
      case 'rate_limit':
        return <div className="w-4 h-4 bg-orange-500 rounded-full animate-pulse" />;
      case 'network':
        return <div className="w-4 h-4 bg-blue-500 rounded-full animate-pulse" />;
      default:
        return <AlertCircle size={16} />;
    }
  };

  const getActionButtons = () => {
    if (error.type === 'auth' || error.type === 'invalid_key') {
      return (
        <button
          onClick={onConfigure}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-black bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
        >
          {t?.ai?.configureApiKeyAction || 'Configure API Key'}
        </button>
      );
    }

    if (error.retryable) {
      return (
        <button
          onClick={onRetry}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-black bg-slate-600 text-white rounded-lg hover:bg-slate-700 transition-colors"
        >
          <RefreshCw size={12} />
          {t?.ai?.retry || 'Retry'}
        </button>
      );
    }

    return null;
  };

  const getRetryMessage = () => {
    if (error.type === 'rate_limit' && error.retryAfter) {
      return `Retry available in ${error.retryAfter} seconds`;
    }
    return null;
  };

  return (
    <div className={`flex items-start gap-3 p-3 rounded-lg border ${getErrorColor()} ${className}`}>
      <div className="flex-shrink-0 mt-0.5">
        {getErrorIcon()}
      </div>
      
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium leading-relaxed">
          {error.message}
        </p>
        
        {getRetryMessage() && (
          <p className="text-xs opacity-75 mt-1">
            {getRetryMessage()}
          </p>
        )}
        
        <div className="flex items-center gap-3 mt-2">
          {getActionButtons()}
          
          {error.helpLink && (
            <a
              href={error.helpLink}
              className="flex items-center gap-1 text-xs underline hover:no-underline transition-colors"
            >
              <HelpCircle size={12} />
              {t?.ai?.help || 'Help'}
            </a>
          )}
        </div>
      </div>
      
      {onDismiss && (
        <button
          onClick={onDismiss}
          className="flex-shrink-0 p-1 rounded hover:bg-black/5 transition-colors"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
};

export default AiErrorHandler;
