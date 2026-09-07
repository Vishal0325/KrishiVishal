import React, { useState, useEffect } from "react";
import {
  ShieldCheck, Search, Filter, Eye, CheckCircle, XCircle, AlertTriangle
} from "lucide-react";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { db } from "../../firebase/config";
import DataTable from "../../components/common/DataTable";
import PageHeader from "../../components/common/PageHeader";
import StatusBadge from "../../components/common/StatusBadge";
import toast from "react-hot-toast";

const DocumentVerification = () => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  
  useEffect(() => {
    fetchPendingVerifications();
  }, []);

  const fetchPendingVerifications = async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, "workforce_documents"),
        where("verificationStatus", "==", "UNDER_REVIEW"),
        where("isCurrentVersion", "==", true)
      );
      const snapshot = await getDocs(q);
      setDocuments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    } catch (err) {
      console.error("Error fetching documents", err);
      toast.error("Failed to load pending verifications");
    } finally {
      setLoading(false);
    }
  };

  const filteredDocs = documents.filter(doc => 
    (doc.ownerId || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (doc.documentType || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const columns = [
    {
      header: "Owner",
      render: (doc) => (
        <div>
          <span className="font-bold text-gray-800 text-sm">{doc.ownerId}</span>
          <div className="text-[10px] text-gray-500 uppercase">{doc.ownerType}</div>
        </div>
      )
    },
    {
      header: "Document Type",
      render: (doc) => (
        <div>
          <div className="font-bold text-gray-900 text-sm">{doc.documentType}</div>
          <div className="text-xs text-gray-500">{doc.documentCategory}</div>
        </div>
      )
    },
    {
      header: "Uploaded",
      render: (doc) => (
        <span className="text-xs font-bold text-gray-700">
          {doc.uploadedAt?.toDate ? doc.uploadedAt.toDate().toLocaleDateString() : 'Just now'}
        </span>
      )
    },
    {
      header: "Actions",
      render: (doc) => (
        <div className="flex gap-2">
          <button className="px-3 py-1.5 bg-gray-50 text-gray-600 rounded-lg text-xs font-bold hover:bg-gray-100 transition-colors flex items-center gap-1">
            <Eye size={14} /> Review
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6 pb-10 animate-in fade-in duration-300">
      <PageHeader
        title="Document Verification Queue"
        subtitle="Review and approve newly uploaded employee and rider documents"
      />

      <div className="flex items-center gap-4">
        <div className="flex-1 flex items-center bg-white px-4 py-3 rounded-2xl border border-gray-100 shadow-sm">
          <Search className="text-gray-400 mr-2" size={20} />
          <input
            type="text"
            placeholder="Search by ID or Document Type..."
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

export default DocumentVerification;
