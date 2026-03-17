import { useState, useCallback, useEffect } from 'react';
import { AiAuthError, AiKeyMissingError, getApiKey, getProvider, hasApiKey } from '../utils/aiService';

export type AiOperationType = 'description' | 'type' | 'constraints' | 'abstract' | 'theme' | 'keywords';

export interface AiError {
  type: 'network' | 'auth' | 'rate_limit' | 'invalid_key' | 'unknown';
  message: string;
  retryable: boolean;
  retryAfter?: number;
  helpLink?: string;
}

export interface AiContextType {
  isLoading: boolean;
  currentOperation: AiOperationType | null;
  currentMessage: string | null;
  error: AiError | null;
  status: 'idle' | 'loading' | 'error' | 'success';
  configureApiKey: () => void;
  retryOperation: () => void;
  clearError: () => void;
  setLoading: (operation: AiOperationType, message?: string) => void;
  setSuccess: () => void;
  setError: (error: Error | AiError, operation?: AiOperationType) => void;
  ensureApiKey: (operation: AiOperationType) => boolean;
}

const operationMessages: Record<AiOperationType, { start: string; success: string }> = {
  description: {
    start: 'Analyzing field context to generate description…',
    success: 'Description generated successfully'
  },
  type: {
    start: 'Analyzing field name and description to suggest type…',
    success: 'Type suggestion applied'
  },
  constraints: {
    start: 'Inferring constraints based on field properties…',
    success: 'Constraints inferred successfully'
  },
  abstract: {
    start: 'Generating comprehensive dataset abstract…',
    success: 'Abstract generated successfully'
  },
  theme: {
    start: 'Finding best theme for your data…',
    success: 'Theme suggested successfully'
  },
  keywords: {
    start: 'Extracting relevant keywords from your data…',
    success: 'Keywords suggested successfully'
  }
};

const createAiError = (error: Error, operation?: AiOperationType): AiError => {
  if (error instanceof AiKeyMissingError) {
    return {
      type: 'auth',
      message: 'AI key required — click to configure',
      retryable: false,
      helpLink: '#ai-setup'
    };
  }
  
  if (error instanceof AiAuthError) {
    return {
      type: 'invalid_key',
      message: 'Invalid API key — please check your credentials',
      retryable: false,
      helpLink: '#ai-keys'
    };
  }

  // Check for rate limit patterns in error messages
  if (error.message.includes('rate limit') || error.message.includes('too many requests')) {
    const match = error.message.match(/(\d+)\s*seconds?/);
    const retryAfter = match ? parseInt(match[1]) : 60;
    return {
      type: 'rate_limit',
      message: `Rate limit exceeded. Retry after ${retryAfter} seconds`,
      retryable: true,
      retryAfter,
      helpLink: '#ai-limits'
    };
  }

  // Network errors
  if (error.message.includes('network') || error.message.includes('fetch')) {
    return {
      type: 'network',
      message: 'Network error — please check your connection',
      retryable: true,
      helpLink: '#network-issues'
    };
  }

  return {
    type: 'unknown',
    message: 'AI error — click to retry',
    retryable: true,
    helpLink: '#ai-troubleshooting'
  };
};

export const useAiContextState = (): AiContextType => {
  const [isLoading, setIsLoading] = useState(false);
  const [currentOperation, setCurrentOperation] = useState<AiOperationType | null>(null);
  const [currentMessage, setCurrentMessage] = useState<string | null>(null);
  const [error, setErrorState] = useState<AiError | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error' | 'success'>('idle');

  const setLoading = useCallback((operation: AiOperationType, message?: string) => {
    setIsLoading(true);
    setCurrentOperation(operation);
    setCurrentMessage(message || operationMessages[operation].start);
    setErrorState(null);
    setStatus('loading');
  }, []);

  const setSuccess = useCallback(() => {
    setIsLoading(false);
    setCurrentOperation(null);
    setCurrentMessage(null);
    setErrorState(null);
    setStatus('success');
    
    // Reset to idle after a short delay
    setTimeout(() => setStatus('idle'), 2000);
  }, []);

  const setError = useCallback((error: Error | AiError, operation?: AiOperationType) => {
    const aiError = 'type' in error ? error : createAiError(error, operation);
    setIsLoading(false);
    setCurrentOperation(null);
    setCurrentMessage(null);
    setErrorState(aiError);
    setStatus('error');
  }, []);

  const clearError = useCallback(() => {
    setErrorState(null);
    setStatus('idle');
  }, []);

  const configureApiKey = useCallback(() => {
    // Dispatch custom event to show AI configuration modal
    window.dispatchEvent(new CustomEvent('ai-configure-required', {
      detail: { operation: currentOperation }
    }));
  }, [currentOperation]);

  const retryOperation = useCallback(() => {
    if (error?.retryable && currentOperation) {
      setErrorState(null);
      // Dispatch retry event
      window.dispatchEvent(new CustomEvent('ai-retry-operation', {
        detail: { operation: currentOperation }
      }));
    }
  }, [error, currentOperation]);

  // Listen for AI key changes to clear auth errors
  useEffect(() => {
    const handleAiKeyChange = () => {
      if (error?.type === 'auth' || error?.type === 'invalid_key') {
        clearError();
      }
    };

    window.addEventListener('ai-key-changed', handleAiKeyChange);
    return () => window.removeEventListener('ai-key-changed', handleAiKeyChange);
  }, [error, clearError]);

  const ensureApiKey = useCallback((operation: AiOperationType): boolean => {
    if (!hasApiKey()) {
      window.dispatchEvent(new CustomEvent('ai-configure-required', { detail: { operation } }));
      return false;
    }
    return true;
  }, []);

  return {
    isLoading,
    currentOperation,
    currentMessage,
    error,
    status,
    configureApiKey,
    retryOperation,
    clearError,
    setLoading,
    setSuccess,
    setError,
    ensureApiKey
  };
};
