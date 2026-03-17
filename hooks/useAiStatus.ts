import { useState, useEffect } from 'react';
import { getApiKey, getProvider, hasApiKey, getTrialUsesLeft } from '../utils/aiService';
import { AiOperationType, useAiContextState } from './useAiContext';

export interface AiStatusInfo {
  hasKey: boolean;
  provider: string;
  isActive: boolean;
  currentOperation: AiOperationType | null;
  operationCount: number;
  lastOperation: {
    type: AiOperationType;
    timestamp: number;
    success: boolean;
  } | null;
  trialUsesLeft: number;
  hasDefaultKey: boolean;
}

export const useAiStatus = () => {
  const aiContext = useAiContextState();
  const [operationCount, setOperationCount] = useState(0);
  const [lastOperation, setLastOperation] = useState<AiStatusInfo['lastOperation']>(null);

  // Track operation history
  useEffect(() => {
    if (aiContext.status === 'success' && aiContext.currentOperation) {
      setOperationCount(prev => prev + 1);
      setLastOperation({
        type: aiContext.currentOperation,
        timestamp: Date.now(),
        success: true
      });
    }
  }, [aiContext.status, aiContext.currentOperation]);

  const [hasKey, setHasKey] = useState(hasApiKey());
  const [provider, setProvider] = useState(getProvider());
  const [trialUsesLeft, setTrialUsesLeft] = useState(getTrialUsesLeft());
  const [hasDefaultKey] = useState(!!import.meta.env.VITE_DEFAULT_AI_KEY);

  useEffect(() => {
    const handleKeyChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ provider: string; hasKey: boolean }>;
      // Still need to re-check hasApiKey to include trial fallback logic
      setHasKey(hasApiKey());
      setProvider(customEvent.detail.provider);
    };

    const handleTrialUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail && typeof customEvent.detail.usesLeft !== 'undefined') {
        setTrialUsesLeft(customEvent.detail.usesLeft);
      } else {
        setTrialUsesLeft(getTrialUsesLeft());
      }
      setHasKey(hasApiKey());
    };

    window.addEventListener('ai-key-changed', handleKeyChange);
    window.addEventListener('ai-trial-updated', handleTrialUpdate);
    return () => {
      window.removeEventListener('ai-key-changed', handleKeyChange);
      window.removeEventListener('ai-trial-updated', handleTrialUpdate);
    };
  }, []);

  return {
    hasKey,
    provider,
    isActive: aiContext.isLoading,
    currentOperation: aiContext.currentOperation,
    operationCount,
    lastOperation,
    error: aiContext.error,
    configureApiKey: aiContext.configureApiKey,
    clearError: aiContext.clearError,
    trialUsesLeft,
    hasDefaultKey
  };
};
