import React from 'react';
import { Sparkles } from 'lucide-react';

interface AiTriggerProps {
  onClick: () => void;
  isLoading: boolean;
  isActive: boolean;
  hasError: boolean;
  label?: string;
  tooltip?: string;
  className?: string;
  t?: any;
}

const AiTrigger: React.FC<AiTriggerProps> = ({
  onClick,
  isLoading,
  isActive,
  hasError,
  label,
  tooltip,
  className = '',
  t,
}) => {
  const isIconOnly = !label;
  const sparklesSize = isIconOnly ? 14 : 10;
  const displayLabel = isActive ? (t?.ai?.generating || 'Generating…') : label;

  if (isIconOnly) {
    // Icon-only variant for PropertyEditor
    return (
      <button
        type="button"
        onClick={onClick}
        title={tooltip}
        disabled={isLoading}
        className={`flex items-center justify-center w-7 h-7 rounded-lg transition-all shrink-0
          ${hasError ? 'text-rose-400 hover:text-rose-600 bg-rose-50' : 'text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50'}
          ${isLoading ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
      >
        <Sparkles size={sparklesSize} className={isActive ? 'animate-pulse' : ''} />
      </button>
    );
  }

  // Text + icon variant for ModelEditor, MetadataStep, MetadataSection
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isLoading}
      className={`flex items-center gap-1 text-[9px] font-black uppercase
        tracking-widest px-2 py-1 rounded-lg transition-all
        ${hasError ? 'text-rose-400 bg-rose-50' : 'text-indigo-400 hover:text-indigo-600 hover:bg-indigo-50'}
        ${isLoading ? 'opacity-50 cursor-not-allowed' : ''} ${className}`}
    >
      <Sparkles size={sparklesSize} className={isActive ? 'animate-pulse' : ''} />
      {displayLabel}
    </button>
  );
};

export default AiTrigger;
