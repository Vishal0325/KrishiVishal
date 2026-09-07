import React from "react";
import { Clock, ShieldCheck, UserCheck, AlertCircle, FileText } from "lucide-react";

export const AuditTimeline = ({ logs = [] }) => {
  if (!logs || logs.length === 0) {
    return (
      <div className="text-center py-6 text-xs text-gray-400">
        No recent audit activities recorded.
      </div>
    );
  }

  return (
    <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-gray-100">
      {logs.map((log, idx) => (
        <div key={idx} className="relative group">
          <div className="absolute -left-6 top-1 w-5 h-5 rounded-full bg-emerald-50 border-2 border-emerald-500 flex items-center justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-600"></div>
          </div>
          <div className="text-xs">
            <p className="font-semibold text-gray-900">{log.action?.replace(/_/g, " ") || "Activity"}</p>
            <p className="text-gray-500 text-[11px] mt-0.5">
              by <span className="font-medium text-gray-700">{log.user || "System"}</span> • {log.timestamp ? new Date(log.timestamp.seconds ? log.timestamp.seconds * 1000 : log.timestamp).toLocaleString("en-IN") : "Just now"}
            </p>
            {log.details && (
              <p className="text-gray-400 text-[10px] mt-1 font-mono bg-gray-50 p-1.5 rounded-md">
                {JSON.stringify(log.details)}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};

export default AuditTimeline;
