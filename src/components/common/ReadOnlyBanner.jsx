import React from 'react';
import { Eye } from 'lucide-react';
import { useReadOnly } from '../../hooks/useReadOnly';

export const ReadOnlyBanner = ({ message = "You are currently in read-only mode. Creating, modifying, and deleting records is restricted." }) => {
  const { isReadOnly } = useReadOnly();

  if (!isReadOnly) return null;

  return (
    <div className="bg-amber-50 border border-amber-200 p-3 mb-4 rounded-xl shadow-xs flex items-center justify-between">
      <div className="flex items-center gap-2 text-amber-800 text-xs font-semibold">
        <Eye size={16} className="text-amber-600 shrink-0" />
        <span>{message}</span>
      </div>
      <span className="text-[10px] uppercase font-bold tracking-wider bg-amber-200/80 text-amber-900 px-2 py-0.5 rounded-md">
        Read-Only Mode
      </span>
    </div>
  );
};

export default ReadOnlyBanner;
