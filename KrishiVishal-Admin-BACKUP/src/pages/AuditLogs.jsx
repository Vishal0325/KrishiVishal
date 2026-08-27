import React, { useState, useEffect } from "react";
import { Activity, Search, Filter } from "lucide-react";
import { collection, query, orderBy, onSnapshot, limit } from "firebase/firestore";
import { db } from "../firebase/config";
import DataTable from "../components/common/DataTable";

const AuditLogs = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    // Fetch last 100 logs by default
    const q = query(
      collection(db, "audit_logs"),
      orderBy("timestamp", "desc"),
      limit(100)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setLogs(data);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const filteredLogs = logs.filter(
    (log) =>
      (log.userEmail || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.action || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.resourceId || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const columns = [
    {
      header: "Timestamp",
      render: (log) => {
        if (!log.timestamp) return "N/A";
        const d = log.timestamp.toDate ? log.timestamp.toDate() : new Date(log.timestamp);
        return (
          <div className="text-sm">
            <span className="font-bold text-gray-900">{d.toLocaleDateString()}</span>
            <span className="text-gray-400 ml-2">{d.toLocaleTimeString()}</span>
          </div>
        );
      },
    },
    {
      header: "Admin User",
      render: (log) => (
        <span className="text-sm font-bold text-gray-700">{log.userEmail}</span>
      ),
    },
    {
      header: "Action",
      render: (log) => {
        let colorClass = "bg-gray-50 text-gray-700 border-gray-200";
        if (log.action.includes("CREATE")) colorClass = "bg-green-50 text-green-700 border-green-200";
        else if (log.action.includes("DELETE")) colorClass = "bg-red-50 text-red-700 border-red-200";
        else if (log.action.includes("UPDATE")) colorClass = "bg-blue-50 text-blue-700 border-blue-200";

        return (
          <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border ${colorClass}`}>
            {log.action}
          </span>
        );
      },
    },
    {
      header: "Resource",
      render: (log) => (
        <div>
          <div className="font-bold text-gray-900 text-xs">{log.resource}</div>
          <div className="text-[10px] text-gray-400 font-mono mt-1">{log.resourceId}</div>
        </div>
      ),
    },
    {
      header: "Details",
      render: (log) => (
        <pre className="text-[10px] bg-gray-50 p-2 rounded-lg border border-gray-100 max-w-xs overflow-x-auto whitespace-pre-wrap text-gray-600 font-mono">
          {JSON.stringify(log.details || {}, null, 2)}
        </pre>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center">
            <Activity className="mr-3 text-primary" size={28} />
            Audit Logs
          </h1>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-10 mt-1">
            System Activity Tracker
          </p>
        </div>
      </div>

      <div className="flex items-center bg-white px-4 py-3 rounded-2xl border border-gray-100 shadow-sm">
        <Search className="text-gray-400 mr-2" size={20} />
        <input
          type="text"
          placeholder="Search by admin email, action, or ID..."
          className="bg-transparent border-none outline-none w-full font-bold text-gray-700 placeholder:text-gray-300"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <DataTable columns={columns} data={filteredLogs} loading={loading} />
    </div>
  );
};

export default AuditLogs;
