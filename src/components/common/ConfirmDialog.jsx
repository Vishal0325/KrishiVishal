import React from 'react';
import { AlertCircle, X } from 'lucide-react';

const ConfirmDialog = ({ isOpen, title, message, onConfirm, onCancel, type = 'danger' }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-[2rem] shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in duration-300 border border-gray-100">
        <div className="p-8 text-center space-y-4">
          <div className={`mx-auto h-16 w-16 rounded-2xl flex items-center justify-center mb-6 ${type === 'danger' ? 'bg-red-50 text-red-500' : 'bg-orange-50 text-orange-500'}`}>
            <AlertCircle size={32} />
          </div>
          <h2 className="text-xl font-black text-gray-900 tracking-tight">{title}</h2>
          <p className="text-sm text-gray-500 font-medium leading-relaxed px-2">
            {message}
          </p>
        </div>
        <div className="flex p-6 gap-3 bg-gray-50/50 border-t border-gray-50">
          <button
            onClick={onCancel}
            className="flex-1 px-6 py-3.5 rounded-xl font-black text-xs uppercase tracking-widest text-gray-400 hover:bg-gray-100 transition-all"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 px-6 py-3.5 rounded-xl font-black text-xs uppercase tracking-widest text-white shadow-lg transition-all active:scale-95 ${type === 'danger' ? 'bg-red-500 hover:bg-red-600 shadow-red-100' : 'bg-orange-500 hover:bg-orange-600 shadow-orange-100'}`}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
