import React, { useState, useEffect } from "react";
import {
  AlertTriangle, Search, Filter, AlertCircle
} from "lucide-react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../../firebase/config";
import DataTable from "../../components/common/DataTable";
import PageHeader from "../../components/common/PageHeader";
import toast from "react-hot-toast";

const ExpiredDocuments = () => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  
  useEffect(() => {
    fetchExpiredDocuments();
  }, []);

  const fetchExpiredDocuments = async () => {
    setLoading(true);
    try {
      const q = query(
        collection(db, "workforce_documents"),
        where("isCurrentVersion", "==", true),
        // we can filter "EXPIRED" directly if our cloud function handles the status
        // or we can fetch verified and filter by date. Assuming we filter by date:
        where("verificationStatus", "==", "VERIFIED")
      );
      const snapshot = await getDocs(q);
      
      const now = new Date();
      
      const expired = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(doc => {
          if (!doc.expiryDate) return false;
          return new Date(doc.expiryDate) < now;
        })
        .sort((a, b) => new Date(b.expiryDate) - new Date(a.expiryDate));
        
      setDocuments(expired);
    } catch (err) {
      console.error("Error fetching expired documents", err);
      toast.error("Failed to load expired documents");
    } finally {
      setLoading(false);
    }
  };

  const getDaysExpired = (expiryDate) => {
    const today = new Date();
    const expiry = new Date(expiryDate);
    const diffTime = Math.abs(today - expiry);
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
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
      header: "Document",
      render: (doc) => (
        <div>
          <div className="font-bold text-gray-900 text-sm">{doc.documentType}</div>
          <div className="text-xs text-gray-500">{doc.documentCategory}</div>
        </div>
      )
    },
    {
      header: "Expired On",
      render: (doc) => (
        <span className="text-sm font-bold text-red-600">
          {new Date(doc.expiryDate).toLocaleDateString()}
        </span>
      )
    },
    {
      header: "Status",
      render: (doc) => {
        const days = getDaysExpired(doc.expiryDate);
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 flex items-center gap-1 w-max">
            <AlertCircle size={12} /> Expired {days} days ago
          </span>
        );
      }
    }
  ];

  return (
    <div className="space-y-6 pb-10 animate-in fade-in duration-300">
      <PageHeader
        title="Expired Documents"
        subtitle="Critical: Review and request replacement for expired compliance documents"
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

export default ExpiredDocuments;
