import React from 'react';
import type { Translations } from '../../i18n/index';
import { Trash2 } from 'lucide-react';

const ConfirmDeleteDialog: React.FC<{
  t: Translations,
  onClose: () => void,
  onConfirm: () => void
}> = ({ t, onClose, onConfirm }) => {
  return (
    <div className="fixed inset-0 z-[400] bg-slate-900/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-300">
      <div className="bg-white rounded-[32px] w-full max-w-sm shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300 border border-slate-100">
        <div className="p-8 text-center space-y-6">
          <div className="w-16 h-16 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-500 mx-auto shadow-inner border border-rose-100">
            <Trash2 size={32} />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-black text-slate-800 tracking-tight">{t.confirmDeleteTitle}</h3>
            <p className="text-sm text-slate-500 font-medium leading-relaxed">{t.confirmDelete}</p>
          </div>
          <div className="flex flex-col gap-3 pt-2">
            <button onClick={onConfirm} className="w-full bg-rose-600 hover:bg-rose-700 text-white px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-rose-200">
              {t.confirmDeleteBtn}
            </button>
            <button onClick={onClose} className="w-full bg-slate-100 hover:bg-slate-200 text-slate-600 px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all">
              {t.cancel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDeleteDialog;
