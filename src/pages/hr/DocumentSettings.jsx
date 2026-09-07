import React, { useState, useEffect } from "react";
import PageHeader from "../../components/common/PageHeader";
import {
  getDocumentSettings,
  saveDocumentSettings,
} from "../../services/hrExtendedService";
import { getDocumentRequirements } from "../../services/documentRequirementService";
import {
  Settings,
  Shield,
  Clock,
  FileCheck,
  Save,
  CheckCircle2,
  AlertCircle,
  Lock,
  Archive,
  Layers
} from "lucide-react";

const DocumentSettings = () => {
  const [settings, setSettings] = useState({
    expiryWarningDays: [90, 60, 30, 15, 7],
    defaultRetentionYears: 5,
    enableAutoArchive: true,
    requirePhysicalCopyForGovtDocs: true,
    enforceStrictMasking: true,
    allowedFileTypes: ["application/pdf", "image/jpeg", "image/png"],
    maxFileSizeMB: 15,
  });

  const [requirements, setRequirements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true);
        const [settingsData, reqsData] = await Promise.all([
          getDocumentSettings(),
          getDocumentRequirements(),
        ]);
        if (settingsData) setSettings(settingsData);
        setRequirements(reqsData || []);
      } catch (error) {
        console.error("Failed to load document settings:", error);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, []);

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    try {
      setSaving(true);
      await saveDocumentSettings(settings);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error("Error saving document settings:", error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <PageHeader
          title="Document & Compliance Governance Settings"
          subtitle="Configure retention schedules, expiry warning intervals, PII masking rules, and mandatory requirements"
        />
        <button
          onClick={handleSaveSettings}
          disabled={saving}
          className="flex items-center gap-2 px-5 py-2 text-sm font-medium text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50 self-start md:self-auto"
        >
          {saving ? (
            <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
          ) : (
            <Save className="w-4 h-4" />
          )}
          {saving ? "Saving..." : "Save System Policies"}
        </button>
      </div>

      {saveSuccess && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 px-4 py-3 rounded-2xl flex items-center gap-2 text-sm animate-in fade-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          Governance rules and document settings successfully updated in Firestore.
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center p-12">
          <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Expiry & Retention Policy Card */}
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-5">
            <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
              <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-base">Expiry & Retention Policies</h3>
                <p className="text-xs text-gray-400">Automated CRON thresholds and archive schedules</p>
              </div>
            </div>

            <div className="space-y-4 text-sm">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Default Document Retention Period (Years)
                </label>
                <input
                  type="number"
                  min="1"
                  max="50"
                  value={settings.defaultRetentionYears || 5}
                  onChange={(e) => setSettings({ ...settings, defaultRetentionYears: Number(e.target.value) })}
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Documents are preserved in active vaults before transition to long-term cold storage.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  Expiry Notification Windows (Days in Advance)
                </label>
                <div className="flex gap-2">
                  {[90, 60, 30, 15, 7].map((days) => (
                    <span key={days} className="px-3 py-1.5 bg-amber-50 text-amber-800 rounded-xl text-xs font-semibold border border-amber-200/60">
                      {days}d
                    </span>
                  ))}
                </div>
              </div>

              <div className="pt-2 border-t border-gray-100 space-y-3">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={settings.enableAutoArchive !== false}
                    onChange={(e) => setSettings({ ...settings, enableAutoArchive: e.target.checked })}
                    className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                  />
                  <div>
                    <p className="text-xs font-semibold text-gray-800">Auto-Archive on Workforce Exit</p>
                    <p className="text-[11px] text-gray-400">Move employee documents to Archived state after F&F settlement closure</p>
                  </div>
                </label>
              </div>
            </div>
          </div>

          {/* Security & Masking Card */}
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-5">
            <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
              <div className="w-10 h-10 bg-indigo-50 text-indigo-600 rounded-xl flex items-center justify-center">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-base">Security, PII & Vault Controls</h3>
                <p className="text-xs text-gray-400">Data masking, uploads limits and physical file mandates</p>
              </div>
            </div>

            <div className="space-y-4 text-sm">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.enforceStrictMasking !== false}
                  onChange={(e) => setSettings({ ...settings, enforceStrictMasking: e.target.checked })}
                  className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                />
                <div>
                  <p className="text-xs font-semibold text-gray-800">Enforce Strict PII Masking</p>
                  <p className="text-[11px] text-gray-400">Mask Aadhaar, PAN, and Bank Account numbers showing only last 4 digits in UI</p>
                </div>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.requirePhysicalCopyForGovtDocs !== false}
                  onChange={(e) => setSettings({ ...settings, requirePhysicalCopyForGovtDocs: e.target.checked })}
                  className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                />
                <div>
                  <p className="text-xs font-semibold text-gray-800">Mandate Physical File Vault Entry</p>
                  <p className="text-[11px] text-gray-400">Require physical folder tracking for original contracts and verified IDs</p>
                </div>
              </label>

              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-100">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Max Upload File Size (MB)</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={settings.maxFileSizeMB || 15}
                    onChange={(e) => setSettings({ ...settings, maxFileSizeMB: Number(e.target.value) })}
                    className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Allowed MIME Formats</label>
                  <input
                    type="text"
                    disabled
                    value="PDF, JPEG, PNG, DOCX"
                    className="w-full px-3.5 py-2.5 bg-gray-100 border border-gray-200 rounded-xl text-sm text-gray-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Mandatory Requirements Summary */}
          <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
            <div className="flex items-center gap-3 pb-3 border-b border-gray-100">
              <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-gray-900 text-base">Configured Mandatory Document Schemas</h3>
                <p className="text-xs text-gray-400">Core required documents across employees and rider fleet</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl border border-gray-100 bg-gray-50/50">
                <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider mb-2">
                  Employee Checklist
                </h4>
                <ul className="text-xs text-gray-600 space-y-1.5 list-disc list-inside">
                  <li>Aadhaar Card (Masked UID)</li>
                  <li>PAN Card</li>
                  <li>Highest Educational Degree / Certificate</li>
                  <li>Signed Employment Agreement & Offer Letter</li>
                  <li>Bank Passbook / Cancelled Cheque</li>
                </ul>
              </div>

              <div className="p-4 rounded-xl border border-gray-100 bg-gray-50/50">
                <h4 className="text-xs font-bold text-gray-800 uppercase tracking-wider mb-2">
                  Delivery Rider Checklist
                </h4>
                <ul className="text-xs text-gray-600 space-y-1.5 list-disc list-inside">
                  <li>Valid Driving License (With Expiry Tracking)</li>
                  <li>Vehicle Registration Certificate (RC)</li>
                  <li>Vehicle Comprehensive Insurance Policy</li>
                  <li>Pollution Under Control (PUC) Certificate</li>
                  <li>Aadhaar Card & Bank Details</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentSettings;
