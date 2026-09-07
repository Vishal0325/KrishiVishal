import React from "react";
import { X, ExternalLink, Download, ShieldCheck, AlertCircle } from "lucide-react";
import ExpiryBadge from "./ExpiryBadge";
import MaskedField from "./MaskedField";

export const DocumentPreview = ({ document, onClose, onVerify, onReject }) => {
  if (!document) return null;

  const isPDF = document.fileType === "application/pdf" || (document.fileName && document.fileName.endsWith(".pdf"));
  const isImage = document.fileType && document.fileType.startsWith("image/");

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl border border-gray-100 overflow-hidden animate-in zoom-in-95">
        {/* Header */}
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div>
              <h3 className="font-bold text-gray-900 text-base">{document.documentName || document.documentType}</h3>
              <p className="text-xs text-gray-400">Category: {document.documentCategory} • Owner: {document.ownerId}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {document.downloadURL && (
              <a
                href={document.downloadURL}
                target="_blank"
                rel="noreferrer"
                className="p-2 text-gray-500 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors"
                title="Open in new tab"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Preview */}
        <div className="flex-1 bg-gray-50 p-4 overflow-y-auto flex items-center justify-center min-h-[350px]">
          {isImage ? (
            <img
              src={document.downloadURL}
              alt={document.documentName}
              className="max-h-[500px] object-contain rounded-lg shadow-sm"
            />
          ) : isPDF ? (
            <iframe
              src={document.downloadURL}
              title={document.documentName}
              className="w-full h-[500px] rounded-lg border border-gray-200"
            />
          ) : (
            <div className="text-center p-8">
              <p className="text-sm text-gray-600 font-medium">Document binary viewer</p>
              <a
                href={document.downloadURL}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 bg-emerald-600 text-white rounded-xl text-xs font-semibold shadow-sm"
              >
                <Download className="w-4 h-4" /> Download File ({document.fileName})
              </a>
            </div>
          )}
        </div>

        {/* Footer Meta & Actions */}
        <div className="p-4 border-t border-gray-100 bg-white flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-4 text-xs">
            {document.documentNumber && (
              <div>
                <span className="text-gray-400">Doc Number: </span>
                <MaskedField value={document.documentNumber} />
              </div>
            )}
            <ExpiryBadge expiryDate={document.expiryDate} />
          </div>

          <div className="flex items-center gap-2">
            {onReject && (
              <button
                onClick={() => onReject(document)}
                className="px-3 py-1.5 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-xl hover:bg-rose-100 transition-colors"
              >
                Reject Document
              </button>
            )}
            {onVerify && (
              <button
                onClick={() => onVerify(document)}
                className="px-4 py-1.5 text-xs font-medium text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors shadow-sm"
              >
                Verify & Approve
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DocumentPreview;
