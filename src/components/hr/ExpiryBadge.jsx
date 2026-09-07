import React from "react";
import { AlertTriangle, Clock, CheckCircle2 } from "lucide-react";

export const ExpiryBadge = ({ expiryDate }) => {
  if (!expiryDate) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-gray-500 bg-gray-50 px-2.5 py-0.5 rounded-full border border-gray-200">
        No Expiry
      </span>
    );
  }

  const now = new Date();
  const exp = new Date(expiryDate);
  const diffDays = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200/80">
        <AlertTriangle className="w-3 h-3 text-rose-600" /> Expired ({Math.abs(diffDays)}d ago)
      </span>
    );
  }

  if (diffDays <= 15) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2.5 py-0.5 rounded-full border border-rose-200/80 animate-pulse">
        <AlertTriangle className="w-3 h-3 text-rose-600" /> Expiring in {diffDays}d
      </span>
    );
  }

  if (diffDays <= 30) {
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2.5 py-0.5 rounded-full border border-amber-200/80">
        <Clock className="w-3 h-3 text-amber-600" /> Expiring in {diffDays}d
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200/80">
      <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Valid ({diffDays}d left)
    </span>
  );
};

export default ExpiryBadge;
