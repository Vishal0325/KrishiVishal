import React, { useState, useEffect } from "react";
import {
  AlertTriangle, Search, Filter, Eye, Bell, Send
} from "lucide-react";
import { collection, query, where, getDocs, orderBy } from "firebase/firestore";
import { db } from "../../firebase/config";
import DataTable from "../../components/common/DataTable";
import PageHeader from "../../components/common/PageHeader";
import toast from "react-hot-toast";

const ExpiringDocuments = () => {
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  
  useEffect(() => {
    fetchExpiringDocuments();
  }, []);

  const fetchExpiringDocuments = async () => {
    setLoading(true);
    try {
      // In a real app, this would query for expiryDate between now and +90 days
      // For this implementation, we fetch documents with expiryDate and filter in memory for simplicity
      const q = query(
        collection(db, "workforce_documents"),
        where("isCurrentVersion", "==", true),
        where("verificationStatus", "==", "VERIFIED")
      );
      const snapshot = await getDocs(q);
      
      const now = new Date();
      const ninetyDaysFromNow = new Date();
      ninetyDaysFromNow.setDate(now.getDate() + 90);
      
      const expiring = snapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(doc => {
          if (!doc.expiryDate) return false;
          const expiry = new Date(doc.expiryDate);
          return expiry > now && expiry <= ninetyDaysFromNow;
        })
        .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
        
      setDocuments(expiring);
    } catch (err) {
      console.error("Error fetching documents", err);
      toast.error("Failed to load expiring documents");
    } finally {
      setLoading(false);
    }
  };

  const getDaysRemaining = (expiryDate) => {
    const today = new Date();
    const expiry = new Date(expiryDate);
    const diffTime = Math.abs(expiry - today);
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
      header: "Expiry Date",
      render: (doc) => (
        <span className="text-sm font-bold text-gray-700">
          {new Date(doc.expiryDate).toLocaleDateString()}
        </span>
      )
    },
    {
      header: "Status",
      render: (doc) => {
        const days = getDaysRemaining(doc.expiryDate);
        let color = "bg-yellow-100 text-yellow-800";
        if (days <= 7) color = "bg-red-100 text-red-800";
        else if (days <= 30) color = "bg-orange-100 text-orange-800";
        
        return (
          <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${color}`}>
            Expires in {days} Days
          </span>
        );
      }
    },
    {
      header: "Actions",
      render: (doc) => (
        <div className="flex gap-2">
          <button className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg text-xs font-bold hover:bg-blue-100 transition-colors flex items-center gap-1">
            <Send size={14} /> Notify
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6 pb-10 animate-in fade-in duration-300">
      <PageHeader
        title="Expiring Documents Dashboard"
        subtitle="Track documents expiring in the next 90 days"
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

export default ExpiringDocuments;
