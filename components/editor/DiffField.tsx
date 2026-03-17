import React from 'react';

interface DiffFieldProps {
  label: string | React.ReactNode;
  currentValue: any;
  baselineValue: any;
  reviewMode: boolean;
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}

const DiffField: React.FC<DiffFieldProps> = ({
  label,
  currentValue,
  baselineValue,
  reviewMode,
  children,
  className,
  action,
}) => {
  const isChanged =
    reviewMode &&
    baselineValue !== undefined &&
    baselineValue !== null &&
    currentValue !== baselineValue;

  return (
    <div className={className}>
      <div className="flex items-center justify-between mb-2">
        <label className="text-[10px] md:text-[11px] font-black uppercase tracking-[0.15em] text-slate-400 block">
          {label}
        </label>
        <div className="flex items-center gap-2">
          {isChanged && (
            <span className="text-[10px] text-rose-500 line-through font-bold animate-in fade-in slide-in-from-right-2">
              {String(baselineValue)}
            </span>
          )}
          {action}
        </div>
      </div>
      <div
        className={`transition-all duration-300 ${
          isChanged
            ? 'ring-2 ring-amber-400 bg-amber-50 rounded-[20px] overflow-hidden'
            : ''
        }`}
      >
        {children}
      </div>
    </div>
  );
};

export default DiffField;
