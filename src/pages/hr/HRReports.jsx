import React, { useState, useEffect } from "react";
import PageHeader from "../../components/common/PageHeader";
import { getEmployees, getRiderHRProfiles } from "../../services/workforceService";
import { getPhysicalFiles, getCompanyAssets, getExitRequests } from "../../services/hrExtendedService";
import { getDocumentsByOwner } from "../../services/documentService";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../firebase/config";
import {
  TrendingUp,
  Download,
  FileSpreadsheet,
  Calendar,
  Filter,
  Users,
  Truck,
  ShieldCheck,
  AlertTriangle,
  Archive,
  Laptop,
  LogOut,
  CheckCircle2,
  Printer
} from "lucide-react";

const reportCategories = [
  { id: "COMPLIANCE", title: "Document Compliance & Completeness Audit", icon: ShieldCheck, desc: "Status of mandatory documents across staff & riders" },
  { id: "EXPIRY_FORECAST", title: "Document Expiry & Renewal Forecast", icon: AlertTriangle, desc: "Forecast of licenses and IDs expiring in next 90 days" },
  { id: "EMPLOYEE_DIRECTORY", title: "Employee Master Directory", icon: Users, desc: "Complete active staff directory with department details" },
  { id: "RIDER_FLEET", title: "Rider Fleet HR & Verification Status", icon: Truck, desc: "Rider onboarding status, DL numbers, and verification" },
  { id: "ASSETS_CUSTODY", title: "Company Assets Custody Register", icon: Laptop, desc: "Hardware and tools assigned to personnel" },
  { id: "EXIT_ATTRITION", title: "Exit, Resignation & Attrition Register", icon: LogOut, desc: "Offboarding history, settlement status, and reasons" },
];

const HRReports = () => {
  const [activeReport, setActiveReport] = useState("COMPLIANCE");
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState([]);

  const generateReport = async (type) => {
    setLoading(true);
    try {
      if (type === "COMPLIANCE") {
        const [emps, riders, docsSnap] = await Promise.all([
          getEmployees(),
          getRiderHRProfiles(),
          getDocs(query(collection(db, "workforce_documents"), where("isCurrentVersion", "==", true))),
        ]);
        const docs = docsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const rows = [
          ...emps.map(e => {
            const userDocs = docs.filter(d => d.ownerId === e.id || d.ownerId === e.employeeId);
            const verified = userDocs.filter(d => d.verificationStatus === "VERIFIED").length;
            return {
              id: e.employeeId || e.id,
              name: `${e.firstName || ""} ${e.lastName || ""}`.trim() || e.name,
              type: "Employee",
              deptOrHub: e.department || e.departmentId || "Operations",
              totalDocsUploaded: userDocs.length,
              verifiedDocs: verified,
              complianceStatus: verified >= 3 ? "COMPLIANT" : "INCOMPLETE",
            };
          }),
          ...riders.map(r => {
            const userDocs = docs.filter(d => d.ownerId === r.id || d.ownerId === r.hrRiderId);
            const verified = userDocs.filter(d => d.verificationStatus === "VERIFIED").length;
            return {
              id: r.hrRiderId || r.id,
              name: `${r.firstName || ""} ${r.lastName || ""}`.trim() || r.name,
              type: "Rider",
              deptOrHub: r.hubId || "Purnea Hub",
              totalDocsUploaded: userDocs.length,
              verifiedDocs: verified,
              complianceStatus: verified >= 3 ? "COMPLIANT" : "INCOMPLETE",
            };
          }),
        ];
        setReportData(rows);
      } else if (type === "EXPIRY_FORECAST") {
        const docsSnap = await getDocs(query(collection(db, "workforce_documents"), where("isCurrentVersion", "==", true)));
        const docs = docsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const now = new Date();

        const expiring = docs
          .filter(d => Boolean(d.expiryDate))
          .map(d => {
            const exp = new Date(d.expiryDate);
            const diffDays = Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            return {
              documentId: d.documentId || d.id,
              documentName: d.documentName || d.documentType,
              ownerId: d.ownerId,
              ownerType: d.ownerType,
              expiryDate: d.expiryDate,
              daysRemaining: diffDays,
              urgency: diffDays < 0 ? "EXPIRED" : diffDays <= 15 ? "CRITICAL" : diffDays <= 30 ? "HIGH" : "NORMAL",
            };
          })
          .sort((a, b) => a.daysRemaining - b.daysRemaining);

        setReportData(expiring);
      } else if (type === "EMPLOYEE_DIRECTORY") {
        const emps = await getEmployees();
        setReportData(
          emps.map(e => ({
            employeeId: e.employeeId || e.id,
            fullName: `${e.firstName || ""} ${e.lastName || ""}`.trim() || e.name,
            email: e.email || "N/A",
            phone: e.phone || "N/A",
            department: e.department || e.departmentId || "Operations",
            designation: e.designation || "Staff",
            joiningDate: e.joiningDate || "N/A",
            status: e.status || "Active",
          }))
        );
      } else if (type === "RIDER_FLEET") {
        const riders = await getRiderHRProfiles();
        setReportData(
          riders.map(r => ({
            riderId: r.hrRiderId || r.id,
            fullName: `${r.firstName || ""} ${r.lastName || ""}`.trim() || r.name,
            phone: r.phone || "N/A",
            assignedHub: r.hubId || "Purnea Hub",
            vehicleType: r.vehicleType || "Bike",
            drivingLicenseNumber: r.drivingLicenseNumber || "N/A",
            status: r.status || "Active",
          }))
        );
      } else if (type === "ASSETS_CUSTODY") {
        const assets = await getCompanyAssets();
        setReportData(
          assets.map(a => ({
            assetTag: a.assetTag || a.assetId || a.id,
            assetName: a.name,
            category: a.category,
            serialNumber: a.serialNumber || "N/A",
            status: a.status,
            assignedTo: a.assignedToName || "In Stock",
            assignedType: a.assignedToType || "N/A",
          }))
        );
      } else if (type === "EXIT_ATTRITION") {
        const exits = await getExitRequests();
        setReportData(
          exits.map(x => ({
            exitId: x.exitId || x.id,
            employeeName: x.employeeName,
            department: x.department || "Operations",
            exitType: x.exitType,
            lastWorkingDay: x.lastWorkingDay || "N/A",
            status: x.status,
            settlementStatus: x.settlementStatus,
          }))
        );
      }
    } catch (error) {
      console.error("Error generating report:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    generateReport(activeReport);
  }, [activeReport]);

  const exportCSV = () => {
    if (!reportData || reportData.length === 0) return;
    const headers = Object.keys(reportData[0]);
    const csvRows = [];
    csvRows.push(headers.join(","));

    for (const row of reportData) {
      const values = headers.map(header => {
        const val = row[header];
        const escaped = ("" + (val ?? "")).replace(/"/g, '\\"');
        return `"${escaped}"`;
      });
      csvRows.push(values.join(","));
    }

    const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.setAttribute("href", url);
    a.setAttribute("download", `KrishiVishal_HR_Report_${activeReport}_${new Date().toISOString().split("T")[0]}.csv`);
    a.click();
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <PageHeader
          title="Executive HR & Workforce Reports"
          subtitle="Generate, preview, and export compliance audits, expiry forecasts, and workforce analytics"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors shadow-sm"
          >
            <Printer className="w-4 h-4" />
            Print View
          </button>
          <button
            onClick={exportCSV}
            disabled={reportData.length === 0 || loading}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Export CSV ({reportData.length} records)
          </button>
        </div>
      </div>

      {/* Report Selector Pills */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {reportCategories.map((cat) => {
          const Icon = cat.icon;
          const isSelected = activeReport === cat.id;

          return (
            <button
              key={cat.id}
              onClick={() => setActiveReport(cat.id)}
              className={`p-4 rounded-2xl border text-left transition-all ${
                isSelected
                  ? "bg-emerald-50/60 border-emerald-500 ring-2 ring-emerald-500/20 shadow-sm"
                  : "bg-white border-gray-100 hover:border-gray-200 shadow-sm"
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    isSelected ? "bg-emerald-600 text-white" : "bg-gray-50 text-gray-600"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-gray-900 text-xs">{cat.title}</h4>
                  <p className="text-[11px] text-gray-400 line-clamp-1">{cat.desc}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>

      {/* Report Live Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-900 text-sm">
              {reportCategories.find((c) => c.id === activeReport)?.title}
            </h3>
            <p className="text-xs text-gray-400">Total Entries: {reportData.length}</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        ) : reportData.length === 0 ? (
          <div className="text-center py-12 px-4">
            <FileSpreadsheet className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-600 font-medium">No records found for this report criteria</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/75 border-b border-gray-100 text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                  {Object.keys(reportData[0]).map((key) => (
                    <th key={key} className="px-4 py-3">
                      {key.replace(/([A-Z])/g, " $1")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-xs">
                {reportData.map((row, idx) => (
                  <tr key={idx} className="hover:bg-gray-50/60 transition-colors">
                    {Object.entries(row).map(([key, val], cellIdx) => (
                      <td key={cellIdx} className="px-4 py-3 font-medium text-gray-800">
                        {val === "COMPLIANT" || val === "CLEAR" || val === "Active" ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md font-semibold">
                            {String(val)}
                          </span>
                        ) : val === "INCOMPLETE" || val === "EXPIRED" || val === "CRITICAL" ? (
                          <span className="inline-flex items-center gap-1 text-[11px] text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md font-semibold">
                            {String(val)}
                          </span>
                        ) : (
                          String(val ?? "—")
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default HRReports;
