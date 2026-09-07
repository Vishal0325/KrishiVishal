import React, { useState, useEffect } from "react";
import {
  FileText, Search, Filter, Eye, CheckCircle, XCircle
} from "lucide-react";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { db } from "../../firebase/config";
import DataTable from "../../components/common/DataTable";
import PageHeader from "../../components/common/PageHeader";
import StatusBadge from "../../components/common/StatusBadge";
import toast from "react-hot-toast";

const RiderDocuments = () => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  
  useEffect(() => {
    fetchDocuments();
  }, []);

  const fetchDocuments = async () => {
    setLoading(true);
    try {
      // Fetch all current rider documents
      const q = query(
        collection(db, "workforce_documents"),
        where("ownerType", "==", "RDR"),
        where("isCurrentVersion", "==", true)
      );
      const snapshot = await getDocs(q);
      setDocuments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (err) {
      console.error("Error fetching rider documents", err);
      toast.error("Failed to load rider documents");
    } finally {
      setLoading(false);
    }
  };

  const filteredDocs = documents.filter(doc => 
    (doc.riderId || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (doc.documentType || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (doc.verificationStatus || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const columns = [
    {
      header: "Operational ID",
      render: (doc) => (
        <span className="font-bold text-gray-800 text-sm">{doc.riderId}</span>
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
        title="Rider Document Vault"
        subtitle="Manage driving and compliance documents for the operational delivery fleet"
      />

      <div className="flex items-center gap-4">
        <div className="flex-1 flex items-center bg-white px-4 py-3 rounded-2xl border border-gray-100 shadow-sm">
          <Search className="text-gray-400 mr-2" size={20} />
          <input
            type="text"
            placeholder="Search by Rider ID, Document Type, or Status..."
            className="bg-transparent border-none outline-none w-full font-bold text-gray-700 placeholder:text-gray-300"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <DataTable columns={columns} data={filteredDocs} loading={loading} />
    </div>
  );
};

export default RiderDocuments;
