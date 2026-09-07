import React from "react";
import { FileText, Eye, CheckCircle2, Clock, AlertTriangle, ShieldCheck, Download } from "lucide-react";
import ExpiryBadge from "./ExpiryBadge";
import MaskedField from "./MaskedField";

export const DocumentCard = ({ document, onPreview, onVerify }) => {
  const isVerified = document.verificationStatus === "VERIFIED";
  const isRejected = document.verificationStatus === "REJECTED";
  const isUnderReview = !isVerified && !isRejected;

  return (
    <div className="bg-white rounded-2xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            isVerified ? "bg-emerald-50 text-emerald-600" : isRejected ? "bg-rose-50 text-rose-600" : "bg-amber-50 text-amber-600"
          }`}>
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-gray-900 text-sm">{document.documentName || document.documentType}</h4>
            <p className="text-xs text-gray-400 capitalize">{document.documentCategory || "General"}</p>
          </div>
        </div>

        {isVerified ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
            <CheckCircle2 className="w-3 h-3" /> Verified
          </span>
        ) : isRejected ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
            <AlertTriangle className="w-3 h-3" /> Rejected
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
            <Clock className="w-3 h-3" /> Review
          </span>
        )}
      </div>

      {document.documentNumber && (
        <div className="bg-gray-50 p-2 rounded-xl text-xs flex items-center justify-between">
          <span className="text-gray-500 font-medium">Doc Number:</span>
          <MaskedField value={document.documentNumber} />
        </div>
      )}

      <div className="flex items-center justify-between text-xs pt-1 border-t border-gray-100">
        <ExpiryBadge expiryDate={document.expiryDate} />

        <div className="flex items-center gap-2">
          {onPreview && (
            <button
              onClick={() => onPreview(document)}
              className="p-1.5 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
              title="Preview document"
            >
              <Eye className="w-4 h-4" />
            </button>
          )}
          {document.downloadURL && (
            <a
              href={document.downloadURL}
              target="_blank"
              rel="noreferrer"
              download
              className="p-1.5 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
              title="Download original file"
            >
              <Download className="w-4 h-4" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
};

export default DocumentCard;
