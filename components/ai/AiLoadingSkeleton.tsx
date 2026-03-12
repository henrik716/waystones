import React from 'react';

interface AiLoadingSkeletonProps {
  type: 'description' | 'keywords' | 'abstract' | 'constraints' | 'type';
  message?: string;
  className?: string;
}

const AiLoadingSkeleton: React.FC<AiLoadingSkeletonProps> = ({ 
  type, 
  message, 
  className = '' 
}) => {
  const renderSkeleton = () => {
    switch (type) {
      case 'description':
        return (
          <div className="space-y-2">
            <div className="h-3 bg-slate-200 rounded-full animate-pulse" />
            <div className="h-3 bg-slate-200 rounded-full animate-pulse w-4/5" />
            <div className="h-3 bg-slate-200 rounded-full animate-pulse w-3/5" />
          </div>
        );
      
      case 'keywords':
        return (
          <div className="flex flex-wrap gap-2">
            <div className="h-6 bg-slate-200 rounded-full animate-pulse w-16" />
            <div className="h-6 bg-slate-200 rounded-full animate-pulse w-20" />
            <div className="h-6 bg-slate-200 rounded-full animate-pulse w-24" />
            <div className="h-6 bg-slate-200 rounded-full animate-pulse w-18" />
            <div className="h-6 bg-slate-200 rounded-full animate-pulse w-14" />
          </div>
        );
      
      case 'abstract':
        return (
          <div className="space-y-3">
            <div className="h-3 bg-slate-200 rounded-full animate-pulse" />
            <div className="h-3 bg-slate-200 rounded-full animate-pulse w-full" />
            <div className="h-3 bg-slate-200 rounded-full animate-pulse w-5/6" />
            <div className="h-3 bg-slate-200 rounded-full animate-pulse w-4/5" />
            <div className="h-3 bg-slate-200 rounded-full animate-pulse w-11/12" />
          </div>
        );
      
      case 'constraints':
        return (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="h-4 bg-slate-200 rounded animate-pulse w-20" />
              <div className="h-8 bg-slate-200 rounded animate-pulse w-16" />
            </div>
            <div className="flex items-center gap-3">
              <div className="h-4 bg-slate-200 rounded animate-pulse w-16" />
              <div className="h-8 bg-slate-200 rounded animate-pulse w-20" />
            </div>
          </div>
        );
      
      case 'type':
        return (
          <div className="flex items-center gap-2">
            <div className="h-8 bg-slate-200 rounded-lg animate-pulse w-24" />
            <div className="h-4 bg-slate-200 rounded-full animate-pulse w-16" />
          </div>
        );
      
      default:
        return (
          <div className="h-3 bg-slate-200 rounded-full animate-pulse w-3/4" />
        );
    }
  };

  return (
    <div className={`space-y-3 ${className}`}>
      {message && (
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
          <span className="animate-pulse">{message}</span>
        </div>
      )}
      {renderSkeleton()}
    </div>
  );
};

export default AiLoadingSkeleton;
