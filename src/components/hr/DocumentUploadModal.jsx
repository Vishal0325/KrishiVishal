import React, { useState } from "react";
import { X, Upload, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { uploadWorkforceDocument } from "../../services/documentService";

export const DocumentUploadModal = ({ ownerId, ownerType = "EMP", isOpen, onClose, onUploaded }) => {
  const [file, setFile] = useState(null);
  const [documentType, setDocumentType] = useState("Aadhaar Card");
  const [documentCategory, setDocumentCategory] = useState("Identity");
  const [documentName, setDocumentName] = useState("Aadhaar Card Front & Back");
  const [documentNumber, setDocumentNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleUpload = async (e) => {
    e.preventDefault();
    if (!file) {
      setError("Please select a file to upload.");
      return;
    }

    try {
      setUploading(true);
      setError(null);

      const metadata = {
        ownerId,
        ownerType,
        documentType,
        documentCategory,
        documentName,
        documentNumber,
        expiryDate: expiryDate || null,
        physicalCopyRequired: true,
      };

      await uploadWorkforceDocument(file, metadata, (p) => setProgress(Math.round(p)));
      if (onUploaded) onUploaded();
      onClose();
    } catch (err) {
      console.error("Upload error:", err);
      setError(err.message || "Failed to upload document");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 animate-in zoom-in-95">
        <div className="flex items-center justify-between pb-4 border-b border-gray-100">
          <div>
            <h3 className="font-bold text-gray-900 text-lg">Upload Workforce Document</h3>
            <p className="text-xs text-gray-400">Vault file for {ownerType} ({ownerId})</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && (
          <div className="mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleUpload} className="space-y-4 pt-4 text-sm">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Category</label>
              <select
                value={documentCategory}
                onChange={(e) => setDocumentCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
              >
                <option value="Identity">Identity</option>
                <option value="Education">Education</option>
                <option value="Legal">Legal & Contract</option>
                <option value="Financial">Financial / Bank</option>
                <option value="Vehicle">Vehicle / Driving</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Document Type</label>
              <input
                type="text"
                required
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1">Document Title / Display Name</label>
            <input
              type="text"
              required
              value={documentName}
              onChange={(e) => setDocumentName(e.target.value)}
              className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Doc Number (Optional)</label>
              <input
                type="text"
                placeholder="e.g. 5432 1098 7654"
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Expiry Date (If applicable)</label>
              <input
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* File Drag Drop Zone */}
          <div className="border-2 border-dashed border-gray-200 rounded-2xl p-6 text-center hover:border-emerald-500 transition-colors">
            <input
              type="file"
              id="file-upload-input"
              className="hidden"
              accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
              onChange={(e) => setFile(e.target.files[0])}
            />
            <label htmlFor="file-upload-input" className="cursor-pointer flex flex-col items-center">
              <Upload className="w-8 h-8 text-gray-400 mb-2" />
              {file ? (
                <div className="text-xs font-medium text-emerald-600">
                  Selected: <strong>{file.name}</strong> ({(file.size / 1024 / 1024).toFixed(2)} MB)
                </div>
              ) : (
                <>
                  <p className="text-xs font-medium text-gray-700">Click to choose PDF or Image</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">Maximum file size 20MB</p>
                </>
              )}
            </label>
          </div>

          {uploading && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-gray-500">
                <span>Uploading to Secure Vault...</span>
                <span>{progress}%</span>
              </div>
              <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }}
                ></div>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-200 rounded-xl text-gray-600 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={uploading || !file}
              className="px-5 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-medium disabled:opacity-50"
            >
              {uploading ? "Uploading..." : "Save to Vault"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default DocumentUploadModal;
