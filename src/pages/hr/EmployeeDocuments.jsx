import React, { useState, useEffect } from "react";
import {
  FileText, Search, Filter, Eye, CheckCircle, XCircle, 
  RefreshCcw, History, FileBadge, Download
} from "lucide-react";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { db } from "../../firebase/config";
import DataTable from "../../components/common/DataTable";
import PageHeader from "../../components/common/PageHeader";
import StatusBadge from "../../components/common/StatusBadge";
import toast from "react-hot-toast";

const EmployeeDocuments = () => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  
  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      // For now, fetch all current employee documents
      const q = query(
        collection(db, "workforce_documents"),
        where("ownerType", "==", "EMP"),
        where("isCurrentVersion", "==", true)
      );
      const snapshot = await getDocs(q);
      setDocuments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (err) {
      console.error("Error fetching documents", err);
      toast.error("Failed to load documents");
    } finally {
      setLoading(false);
    }
  };

  const filteredDocs = documents.filter(doc => 
    (doc.employeeId || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (doc.documentType || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (doc.verificationStatus || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const columns = [
    {
      header: "Employee",
      render: (doc) => (
        <span className="font-bold text-gray-800 text-sm">{doc.employeeId}</span>
      )
    },
    {
      header: "Document",
      render: (doc) => (
        <div>
          <div className="font-bold text-gray-900 text-sm">{doc.documentType}</div>
          <div className="text-xs text-gray-500">{doc.documentCategory}</div>
        </div>
      )
    },
    {
      header: "Status",
      render: (doc) => {
        const type = doc.verificationStatus === "VERIFIED" ? "success" 
                   : doc.verificationStatus === "REJECTED" ? "error" 
                   : "warning";
        return <StatusBadge status={doc.verificationStatus} type={type} />;
      }
    },
    {
      header: "Expiry",
      render: (doc) => {
        if (!doc.expiryDate) return <span className="text-gray-400 text-xs">No Expiry</span>;
        const isExpired = new Date(doc.expiryDate) < new Date();
        return (
          <span className={`text-xs font-bold ${isExpired ? 'text-red-600' : 'text-gray-700'}`}>
            {new Date(doc.expiryDate).toLocaleDateString()}
          </span>
        );
      }
    },
    {
      header: "Sensitivity",
      render: (doc) => (
        <span className="text-[10px] font-black uppercase tracking-wider text-gray-500 bg-gray-100 px-2 py-1 rounded-md">
          {doc.sensitivityLevel}
        </span>
      )
    },
    {
      header: "Actions",
      render: (doc) => (
        <div className="flex gap-2">
          <button className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Preview">
            <Eye size={16} />
          </button>
          <button className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors" title="Verify">
            <CheckCircle size={16} />
          </button>
          <button className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Reject">
            <XCircle size={16} />
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6 pb-10 animate-in fade-in duration-300">
      <PageHeader
        title="Employee Document Vault"
        subtitle="Central repository for all employee HR and compliance documents"
      />

      <div className="flex items-center gap-4">
        <div className="flex-1 flex items-center bg-white px-4 py-3 rounded-2xl border border-gray-100 shadow-sm">
          <Search className="text-gray-400 mr-2" size={20} />
          <input
            type="text"
            placeholder="Search by Employee ID, Document Type, or Status..."
            className="bg-transparent border-none outline-none w-full font-bold text-gray-700 placeholder:text-gray-300"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <button className="bg-white p-3 rounded-2xl border border-gray-100 shadow-sm text-gray-500 hover:text-gray-900 transition-colors">
          <Filter size={20} />
        </button>
      </div>

      <DataTable columns={columns} data={filteredDocs} loading={loading} />
    </div>
  );
};

export default EmployeeDocuments;
