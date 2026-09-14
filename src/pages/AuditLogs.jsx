import React, { useState, useEffect, useMemo } from "react";
import { 
  Activity, 
  Search, 
  Filter, 
  Clock, 
  User, 
  Shield, 
  Loader2, 
  Download, 
  PlusCircle, 
  Edit3, 
  Trash2, 
  Key, 
  Eye, 
  Calendar, 
  Layers, 
  Copy, 
  Check, 
  FileText,
  AlertTriangle,
  Building2,
  Package,
  ShoppingCart,
  Bike,
  Landmark,
  Users as UsersIcon
} from "lucide-react";
import { collection, query, orderBy, limit, getDocs, startAfter } from "firebase/firestore";
import { db } from "../firebase/config";
import PageHeader from "../components/common/PageHeader";
import MetricCard from "../components/common/MetricCard";
import DetailDrawer from "../components/common/DetailDrawer";
import toast from "react-hot-toast";

const LOGS_PER_PAGE = 50;

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lastVisible, setLastVisible] = useState(null);
  const [hasMore, setHasMore] = useState(true);

  // Filters State
  const [searchTerm, setSearchTerm] = useState("");
  const [actionTypeFilter, setActionTypeFilter] = useState("ALL");
  const [moduleFilter, setModuleFilter] = useState("ALL");
  const [dateFilter, setDateFilter] = useState("ALL"); // ALL, TODAY, WEEK, MONTH
  const [selectedLog, setSelectedLog] = useState(null);
  const [copied, setCopied] = useState(false);

  const fetchLogs = async (isLoadMore = false) => {
    if (isLoadMore) setLoadingMore(true);
    else setLoading(true);

    try {
      let q = query(
        collection(db, "audit_logs"),
        orderBy("timestamp", "desc"),
        limit(LOGS_PER_PAGE)
      );

      if (isLoadMore && lastVisible) {
        q = query(q, startAfter(lastVisible));
      }

      const snapshot = await getDocs(q);
      const newLogs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      if (isLoadMore) {
        setLogs((prev) => [...prev, ...newLogs]);
      } else {
        setLogs(newLogs);
      }

      setLastVisible(snapshot.docs[snapshot.docs.length - 1] || null);
      setHasMore(snapshot.docs.length === LOGS_PER_PAGE);
    } catch (err) {
      console.warn("Failed to fetch audit logs:", err);
      toast.error("Could not fetch audit logs: " + err.message);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  // Filter Logic
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      // Search
      const search = searchTerm.toLowerCase();
      const matchSearch =
        !search ||
        (log.userEmail || "").toLowerCase().includes(search) ||
        (log.action || "").toLowerCase().includes(search) ||
        (log.resource || "").toLowerCase().includes(search) ||
        (log.resourceId || "").toLowerCase().includes(search) ||
        JSON.stringify(log.details || "").toLowerCase().includes(search);

      // Action Type Filter
      const action = (log.action || "").toUpperCase();
      let matchAction = true;
      if (actionTypeFilter === "CREATE") matchAction = action.includes("CREATE") || action.includes("ADD");
      else if (actionTypeFilter === "UPDATE") matchAction = action.includes("UPDATE") || action.includes("EDIT") || action.includes("STATUS");
      else if (actionTypeFilter === "DELETE") matchAction = action.includes("DELETE") || action.includes("REMOVE");
      else if (actionTypeFilter === "AUTH") matchAction = action.includes("LOGIN") || action.includes("AUTH") || action.includes("ROLE") || action.includes("ACCESS");

      // Module Filter
      const resource = (log.resource || "").toLowerCase();
      let matchModule = true;
      if (moduleFilter !== "ALL") {
        matchModule = resource.includes(moduleFilter.toLowerCase());
      }

      // Date Range Filter
      let matchDate = true;
      if (dateFilter !== "ALL" && log.timestamp) {
        const logDate = log.timestamp.toDate ? log.timestamp.toDate() : new Date(log.timestamp);
        const now = new Date();
        const diffHours = (now - logDate) / (1000 * 60 * 60);

        if (dateFilter === "TODAY") matchDate = diffHours <= 24;
        else if (dateFilter === "WEEK") matchDate = diffHours <= 24 * 7;
        else if (dateFilter === "MONTH") matchDate = diffHours <= 24 * 30;
      }

      return matchSearch && matchAction && matchModule && matchDate;
    });
  }, [logs, searchTerm, actionTypeFilter, moduleFilter, dateFilter]);

  // Statistics KPI
  const stats = useMemo(() => {
    let created = 0;
    let updated = 0;
    let deleted = 0;
    const adminSet = new Set();

    logs.forEach((log) => {
      const act = (log.action || "").toUpperCase();
      if (act.includes("CREATE") || act.includes("ADD")) created++;
      else if (act.includes("UPDATE") || act.includes("EDIT") || act.includes("STATUS")) updated++;
      else if (act.includes("DELETE") || act.includes("REMOVE")) deleted++;

      if (log.userEmail) adminSet.add(log.userEmail);
    });

    return {
      total: logs.length,
      created,
      updated,
      deleted,
      uniqueAdmins: adminSet.size,
    };
  }, [logs]);

  // Export to CSV
  const handleExportCSV = () => {
    if (filteredLogs.length === 0) {
      toast.error("No logs to export");
      return;
    }

    const headers = ["Log ID", "Timestamp", "Admin Email", "Action", "Module/Resource", "Target ID", "Details"];
    const rows = filteredLogs.map((l) => [
      l.id,
      l.timestamp?.toDate ? l.timestamp.toDate().toISOString() : l.timestamp || "",
      `"${l.userEmail || ""}"`,
      `"${l.action || ""}"`,
      `"${l.resource || ""}"`,
      `"${l.resourceId || ""}"`,
      `"${JSON.stringify(l.details || {}).replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `krishivishal_audit_logs_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success("Audit Logs exported to CSV successfully");
  };

  const getActionBadge = (actionStr = "") => {
    const act = actionStr.toUpperCase();
    if (act.includes("CREATE") || act.includes("ADD")) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200">
          <PlusCircle size={11} />
          {actionStr}
        </span>
      );
    }
    if (act.includes("DELETE") || act.includes("REMOVE")) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200">
          <Trash2 size={11} />
          {actionStr}
        </span>
      );
    }
    if (act.includes("AUTH") || act.includes("LOGIN") || act.includes("ROLE")) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-50 text-purple-700 border border-purple-200">
          <Key size={11} />
          {actionStr}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
        <Edit3 size={11} />
        {actionStr || "UPDATE"}
      </span>
    );
  };

  const getModuleIcon = (resource = "") => {
    const res = resource.toLowerCase();
    if (res.includes("order")) return <ShoppingCart size={13} className="text-blue-600" />;
    if (res.includes("product") || res.includes("sku") || res.includes("catalog")) return <Package size={13} className="text-emerald-600" />;
    if (res.includes("rider") || res.includes("trip")) return <Bike size={13} className="text-amber-600" />;
    if (res.includes("warehouse") || res.includes("hub")) return <Building2 size={13} className="text-purple-600" />;
    if (res.includes("finance") || res.includes("expense") || res.includes("payout")) return <Landmark size={13} className="text-indigo-600" />;
    if (res.includes("staff") || res.includes("user") || res.includes("employee")) return <UsersIcon size={13} className="text-cyan-600" />;
    return <Layers size={13} className="text-gray-500" />;
  };

  const formatSummary = (details) => {
    if (!details || typeof details !== "object" || Object.keys(details).length === 0) {
      return "No extra payload metadata";
    }
    if (details.note) return details.note;
    if (details.message) return details.message;
    if (details.name) return `Name: ${details.name}`;
    if (details.status) return `Status changed to: ${details.status}`;
    
    // First 2 keys formatted
    const keys = Object.keys(details).slice(0, 2);
    return keys.map((k) => `${k}: ${typeof details[k] === "object" ? "..." : details[k]}`).join(" • ");
  };

  const copyRawJSON = () => {
    if (!selectedLog) return;
    navigator.clipboard.writeText(JSON.stringify(selectedLog, null, 2));
    setCopied(true);
    toast.success("JSON copied to clipboard");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      <PageHeader
        title="Enterprise System Audit Trail"
        subtitle="Complete immutable security log of all admin mutations, catalog updates, financial approvals, and user actions."
        actions={
          <button
            onClick={handleExportCSV}
            className="bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 px-4 py-2.5 rounded-xl font-black text-xs uppercase tracking-wider shadow-sm transition-all flex items-center gap-2 cursor-pointer"
            title="Download Audit Log CSV Report"
          >
            <Download size={15} className="text-[#0B4D31]" />
            <span>Export CSV</span>
          </button>
        }
      />

      {/* KPI Overview Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
        <MetricCard label="Total Events" value={stats.total} icon={Activity} color="indigo" />
        <MetricCard label="Record Additions" value={stats.created} icon={PlusCircle} color="green" />
        <MetricCard label="Modifications" value={stats.updated} icon={Edit3} color="blue" />
        <MetricCard label="Deletions & Warn" value={stats.deleted} icon={AlertTriangle} color="red" />
        <MetricCard label="Active Admins" value={stats.uniqueAdmins} icon={Shield} color="purple" />
      </div>

      {/* Filters Bar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm space-y-3">
        {/* Search & Selectors Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Search Box */}
          <div className="relative md:col-span-1">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by admin email, action, ID, or changes..."
              className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-800 placeholder:text-gray-400 focus:bg-white focus:border-[#0B4D31] outline-none transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Module Selector */}
          <div>
            <select
              value={moduleFilter}
              onChange={(e) => setModuleFilter(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 focus:bg-white focus:border-[#0B4D31] outline-none transition-all cursor-pointer"
            >
              <option value="ALL">📦 All Modules & Resources</option>
              <option value="order">🛒 Orders & Fulfillment</option>
              <option value="product">🌱 Products & SKUs</option>
              <option value="category">🏷️ Categories & Brands</option>
              <option value="warehouse">🏢 Warehouses & Hubs</option>
              <option value="rider">🛵 Riders & Delivery</option>
              <option value="expense">💰 Finance & Expenses</option>
              <option value="staff">👥 Staff & Permissions</option>
              <option value="document">📄 HR Documents</option>
            </select>
          </div>

          {/* Date Selector */}
          <div>
            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 focus:bg-white focus:border-[#0B4D31] outline-none transition-all cursor-pointer"
            >
              <option value="ALL">📅 All Time (Full History)</option>
              <option value="TODAY">⚡ Today (Last 24 Hours)</option>
              <option value="WEEK">🗓️ Past 7 Days</option>
              <option value="MONTH">📆 Past 30 Days</option>
            </select>
          </div>
        </div>

        {/* Action Type Filter Pills */}
        <div className="flex items-center gap-1.5 pt-1 overflow-x-auto custom-scrollbar">
          {[
            { id: "ALL", label: "All Actions" },
            { id: "CREATE", label: "➕ Created / Added" },
            { id: "UPDATE", label: "✏️ Updated / Modified" },
            { id: "DELETE", label: "🗑️ Deleted / Removed" },
            { id: "AUTH", label: "🔐 Security & Roles" },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setActionTypeFilter(item.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
                actionTypeFilter === item.id
                  ? "bg-[#0B4D31] text-white shadow-sm"
                  : "bg-gray-100/70 hover:bg-gray-200/70 text-gray-600"
              }`}
            >
              {item.label}
            </button>
          ))}

          {(searchTerm || actionTypeFilter !== "ALL" || moduleFilter !== "ALL" || dateFilter !== "ALL") && (
            <button
              onClick={() => {
                setSearchTerm("");
                setActionTypeFilter("ALL");
                setModuleFilter("ALL");
                setDateFilter("ALL");
              }}
              className="ml-auto text-xs text-rose-600 hover:underline font-bold px-2 py-1 shrink-0 cursor-pointer"
            >
              Clear All Filters
            </button>
          )}
        </div>
      </div>

      {/* Logs Table */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-16 flex flex-col items-center justify-center text-gray-400">
            <Loader2 size={32} className="animate-spin text-[#0B4D31] mb-2" />
            <p className="text-xs font-bold">Loading audit trails...</p>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-16 text-center text-gray-400">
            <Activity size={36} className="mx-auto mb-3 opacity-40" />
            <h4 className="text-base font-bold text-gray-700">No matching audit logs found</h4>
            <p className="text-xs mt-1 text-gray-400">Try adjusting your filters or search keywords.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-50/80 border-b border-gray-100 text-[10px] font-black uppercase text-gray-400 tracking-wider">
                  <th className="py-3.5 px-5">Timestamp</th>
                  <th className="py-3.5 px-4">Admin Operator</th>
                  <th className="py-3.5 px-4">Action</th>
                  <th className="py-3.5 px-4">Resource / Entity</th>
                  <th className="py-3.5 px-4">Change Summary</th>
                  <th className="py-3.5 px-5 text-right">Inspect</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 text-xs font-medium text-gray-700">
                {filteredLogs.map((log) => {
                  const dateObj = log.timestamp?.toDate ? log.timestamp.toDate() : log.timestamp ? new Date(log.timestamp) : null;
                  const formattedTime = dateObj ? dateObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
                  const formattedDate = dateObj ? dateObj.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

                  return (
                    <tr 
                      key={log.id} 
                      onClick={() => setSelectedLog(log)}
                      className="hover:bg-emerald-50/30 transition-colors cursor-pointer group"
                    >
                      {/* Timestamp */}
                      <td className="py-3.5 px-5 whitespace-nowrap">
                        <div className="font-bold text-gray-900">{formattedDate}</div>
                        <div className="text-[10px] text-gray-400 font-mono">{formattedTime}</div>
                      </td>

                      {/* Admin User */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs">
                            {(log.userEmail || "A").slice(0, 1).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-bold text-gray-900">{log.userEmail || "System Automation"}</div>
                            {log.userRole && (
                              <span className="text-[9px] text-gray-400 font-bold uppercase">{log.userRole}</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Action */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {getActionBadge(log.action)}
                      </td>

                      {/* Resource */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          {getModuleIcon(log.resource)}
                          <div>
                            <span className="font-bold text-gray-900 capitalize">{log.resource || "General"}</span>
                            {log.resourceId && (
                              <p className="text-[10px] font-mono text-gray-400 truncate max-w-[120px]">
                                {log.resourceId}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Summary */}
                      <td className="py-3.5 px-4 max-w-xs">
                        <span className="text-xs text-gray-600 line-clamp-1">
                          {formatSummary(log.details)}
                        </span>
                      </td>

                      {/* Inspect Action */}
                      <td className="py-3.5 px-5 text-right whitespace-nowrap">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedLog(log);
                          }}
                          className="p-1.5 rounded-lg bg-gray-50 group-hover:bg-[#0B4D31] text-gray-500 group-hover:text-white transition-all cursor-pointer shadow-sm"
                          title="View Full Audit Payload"
                        >
                          <Eye size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Load More Button */}
        {hasMore && !loading && (
          <div className="p-4 border-t border-gray-100 flex justify-center bg-gray-50/50">
            <button
              onClick={() => fetchLogs(true)}
              disabled={loadingMore}
              className="flex items-center gap-2 px-6 py-2.5 bg-white border border-gray-200 rounded-xl text-xs font-black uppercase tracking-wider text-gray-600 hover:text-[#0B4D31] hover:border-[#0B4D31] transition-all shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {loadingMore ? <Loader2 className="animate-spin" size={15} /> : <Clock size={15} />}
              <span>{loadingMore ? "Fetching more audit history..." : "Load Older Logs"}</span>
            </button>
          </div>
        )}
      </div>

      {/* Side Inspector Drawer */}
      <DetailDrawer
        isOpen={!!selectedLog}
        onClose={() => setSelectedLog(null)}
        title="Audit Event Inspector"
        size="md"
      >
        {selectedLog && (
          <div className="space-y-6">
            {/* Header info */}
            <div className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-black uppercase text-gray-400">Event Action</span>
                <div className="mt-1">{getActionBadge(selectedLog.action)}</div>
              </div>
              <div className="text-right">
                <span className="text-[10px] font-black uppercase text-gray-400">Timestamp</span>
                <p className="text-xs font-bold text-gray-900 mt-1">
                  {selectedLog.timestamp?.toDate
                    ? selectedLog.timestamp.toDate().toLocaleString("en-IN")
                    : selectedLog.timestamp || "—"}
                </p>
              </div>
            </div>

            {/* Operator Information */}
            <div className="space-y-2">
              <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-wider">Actor & Security Info</h4>
              <div className="p-4 bg-white border border-gray-100 rounded-2xl shadow-sm space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-gray-50">
                  <span className="text-gray-400 font-bold">Admin Email:</span>
                  <span className="font-bold text-gray-900">{selectedLog.userEmail || "System Automation"}</span>
                </div>
                {selectedLog.userId && (
                  <div className="flex justify-between py-1 border-b border-gray-50">
                    <span className="text-gray-400 font-bold">User UID:</span>
                    <span className="font-mono text-[11px] text-gray-600">{selectedLog.userId}</span>
                  </div>
                )}
                {selectedLog.userRole && (
                  <div className="flex justify-between py-1 border-b border-gray-50">
                    <span className="text-gray-400 font-bold">Assigned Role:</span>
                    <span className="font-bold text-emerald-700 uppercase text-[11px]">{selectedLog.userRole}</span>
                  </div>
                )}
                <div className="flex justify-between py-1 border-b border-gray-50">
                  <span className="text-gray-400 font-bold">Target Module:</span>
                  <span className="font-bold text-gray-900 capitalize">{selectedLog.resource || "General"}</span>
                </div>
                {selectedLog.resourceId && (
                  <div className="flex justify-between py-1">
                    <span className="text-gray-400 font-bold">Target Document ID:</span>
                    <span className="font-mono text-[11px] text-gray-700 bg-gray-50 px-2 py-0.5 rounded border">
                      {selectedLog.resourceId}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Formatted Key-Value Details */}
            {selectedLog.details && typeof selectedLog.details === "object" && (
              <div className="space-y-2">
                <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-wider">Mutation Details</h4>
                <div className="bg-white border border-gray-100 rounded-2xl p-4 shadow-sm space-y-2 text-xs">
                  {Object.entries(selectedLog.details).map(([key, val]) => (
                    <div key={key} className="flex flex-col sm:flex-row sm:justify-between py-1.5 border-b border-gray-50 last:border-none">
                      <span className="font-bold text-gray-500 capitalize">{key}:</span>
                      <span className="font-semibold text-gray-900 text-right break-all">
                        {typeof val === "object" ? JSON.stringify(val) : String(val)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Raw JSON Payload */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-[11px] font-black text-gray-400 uppercase tracking-wider">Raw Immutable JSON Payload</h4>
                <button
                  onClick={copyRawJSON}
                  className="flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-900 transition-colors cursor-pointer"
                >
                  {copied ? <Check size={13} className="text-emerald-600" /> : <Copy size={13} />}
                  <span>{copied ? "Copied!" : "Copy Payload"}</span>
                </button>
              </div>
              <pre className="p-4 bg-gray-900 text-emerald-400 rounded-2xl text-[11px] font-mono overflow-x-auto max-h-56 custom-scrollbar">
                {JSON.stringify(selectedLog, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </DetailDrawer>
    </div>
  );
}
