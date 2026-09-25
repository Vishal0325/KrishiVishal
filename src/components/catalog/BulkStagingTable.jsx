import React, { useState, useEffect } from "react";
import { X, CheckCircle2, AlertTriangle, Download, UploadCloud, Edit2 } from "lucide-react";
import Papa from "papaparse";
import { validateRow } from "../../utils/bulkValidation";

export default function BulkStagingTable({ 
  initialRows, 
  onConfirmImport, 
  onCancel, 
  isImporting 
}) {
  const [rows, setRows] = useState([]);

  useEffect(() => {
    // Run initial validation
    const validated = initialRows.map(row => validateRow(row));
    setRows(validated);
  }, [initialRows]);

  const handleCellEdit = (index, field, value) => {
    const updated = [...rows];
    updated[index][field] = value;
    // Re-validate the row immediately
    updated[index] = validateRow(updated[index]);
    setRows(updated);
  };

  const validCount = rows.filter(r => r.isValid).length;
  const invalidCount = rows.length - validCount;
  const allValid = invalidCount === 0;

  const exportErrorRows = () => {
    const errorRows = rows.filter(r => !r.isValid).map(r => {
      const copy = { ...r };
      delete copy.isValid;
      copy.ValidationErrors = r.errors.join("; ");
      return copy;
    });

    if (errorRows.length === 0) return;

    const csv = Papa.unparse(errorRows);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "bulk_upload_errors.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleImport = () => {
    // Pass only valid rows to the importer
    const validRows = rows.filter(r => r.isValid);
    if (validRows.length === 0) return;
    onConfirmImport(validRows);
  };

  const displayColumns = [
    { key: "parentSlug", label: "Parent Slug" },
    { key: "name", label: "Product Name" },
    { key: "brand", label: "Brand" },
    { key: "category", label: "Category" },
    { key: "quantity", label: "Qty" },
    { key: "unit", label: "Unit" },
    { key: "mrp", label: "MRP (₹)" },
    { key: "price", label: "Price (₹)" },
    { key: "stock", label: "Stock" },
    { key: "gstRate", label: "GST (%)" },
    { key: "technicalName", label: "Technical" },
    { key: "formulation", label: "Formulation" }
  ];

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-50 animate-in fade-in duration-300">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between shrink-0 shadow-sm z-10">
        <div>
          <h2 className="text-xl font-black text-gray-900 flex items-center gap-2">
            <UploadCloud className="text-primary-dark" /> Staging & Verification
          </h2>
          <p className="text-xs text-gray-500 font-bold uppercase tracking-widest mt-1">
            Review parsed data before importing
          </p>
        </div>
        <button onClick={onCancel} className="p-2 text-gray-400 hover:text-gray-900 rounded-full hover:bg-gray-100">
          <X size={24} />
        </button>
      </div>

      {/* Summary Bar */}
      <div className="bg-white border-b border-gray-100 px-6 py-3 flex items-center gap-6 shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-sm">
            {rows.length}
          </div>
          <span className="text-sm font-bold text-gray-700">Total Rows</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-green-50 text-green-600 flex items-center justify-center font-bold text-sm">
            {validCount}
          </div>
          <span className="text-sm font-bold text-gray-700">Ready to Import</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-red-50 text-red-600 flex items-center justify-center font-bold text-sm animate-pulse">
            {invalidCount}
          </div>
          <span className="text-sm font-bold text-gray-700">With Errors</span>
        </div>

        <div className="ml-auto flex gap-3">
          {invalidCount > 0 && (
            <button 
              onClick={exportErrorRows}
              className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-700 rounded-lg text-sm font-bold hover:bg-red-100 transition-colors border border-red-200"
            >
              <Download size={16} /> Export Errors
            </button>
          )}
          <button
            onClick={handleImport}
            disabled={isImporting || validCount === 0}
            className="flex items-center gap-2 px-6 py-2 bg-[#1b5e20] text-white rounded-lg text-sm font-bold shadow-md shadow-green-900/20 hover:bg-[#2e7d32] transition-colors disabled:opacity-50 disabled:grayscale"
          >
            {isImporting ? "Importing..." : `Import ${validCount} Valid Rows`}
          </button>
        </div>
      </div>

      {/* Table Container */}
      <div className="flex-1 overflow-auto p-6">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-gray-50 border-b border-gray-200 sticky top-0 z-10">
              <tr>
                <th className="py-3 px-4 font-bold text-xs text-gray-500 uppercase tracking-wider">Status</th>
                {displayColumns.map(col => (
                  <th key={col.key} className="py-3 px-4 font-bold text-xs text-gray-500 uppercase tracking-wider">
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row, index) => (
                <tr key={index} className={`transition-colors ${row.isValid ? 'hover:bg-green-50/50' : 'bg-red-50/30'}`}>
                  <td className="py-2 px-4 align-top">
                    {row.isValid ? (
                      <div className="flex items-center gap-1 text-green-600 bg-green-50 px-2 py-1 rounded-md text-xs font-bold w-max">
                        <CheckCircle2 size={14} /> Valid
                      </div>
                    ) : (
                      <div className="flex flex-col gap-1 max-w-[200px]">
                        <div className="flex items-center gap-1 text-red-600 bg-red-50 px-2 py-1 rounded-md text-xs font-bold w-max">
                          <AlertTriangle size={14} /> Invalid
                        </div>
                        <ul className="text-[10px] text-red-500 font-medium list-disc pl-3 whitespace-normal">
                          {row.errors.map((err, i) => (
                            <li key={i}>{err}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </td>
                  {displayColumns.map(col => (
                    <td key={col.key} className="py-2 px-4 align-top">
                      <div className="relative group flex items-center">
                        <input
                          type="text"
                          value={row[col.key] || ""}
                          onChange={(e) => handleCellEdit(index, col.key, e.target.value)}
                          className={`w-full bg-transparent border-b border-transparent group-hover:border-gray-300 focus:border-primary-dark focus:bg-gray-50 px-1 py-1 outline-none transition-all ${
                            !row.isValid && row.errors.some(e => e.toLowerCase().includes(col.key.toLowerCase())) ? 'text-red-600 font-bold' : ''
                          }`}
                          placeholder="-"
                        />
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
