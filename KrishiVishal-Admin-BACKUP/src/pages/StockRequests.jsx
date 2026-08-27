import React, { useState, useEffect } from "react";
import {
  collection,
  query,
  onSnapshot,
  doc,
  updateDoc,
  getDoc,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import { db } from "../firebase/config";
import DataTable from "../components/common/DataTable";
import { format } from "date-fns";
import { Bell, Package, User, Clock, CheckCircle2, XCircle } from "lucide-react";
import toast from "react-hot-toast";

const StockRequests = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState({});
  const [users, setUsers] = useState({});

  useEffect(() => {
    const q = query(
      collection(db, "stock_notification_requests"),
      orderBy("timestamp", "desc")
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const requestsData = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));

      // Fetch product and user details for these requests
      const newProducts = { ...products };
      const newUsers = { ...users };

      for (const req of requestsData) {
        if (req.productId && !newProducts[req.productId]) {
          const pDoc = await getDoc(doc(db, "products", req.productId));
          if (pDoc.exists()) newProducts[req.productId] = pDoc.data().name;
        }
        if (req.userId && !newUsers[req.userId] && req.userId !== "guest_user") {
          const uDoc = await getDoc(doc(db, "users", req.userId));
          if (uDoc.exists()) newUsers[req.userId] = uDoc.data().name || uDoc.data().phone;
        }
      }

      setProducts(newProducts);
      setUsers(newUsers);
      setRequests(requestsData);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleStatusUpdate = async (id, status) => {
    try {
      await updateDoc(doc(db, "stock_notification_requests", id), {
        status,
        updatedAt: Timestamp.now(),
      });
      toast.success(`Request marked as ${status.toLowerCase()}`);
    } catch (e) {
      toast.error("Failed to update status");
    }
  };

  const columns = [
    {
      header: "Product",
      accessor: (row) => (
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 bg-orange-100 rounded-lg flex items-center justify-center text-orange-600">
            <Package size={16} />
          </div>
          <div>
            <p className="font-bold text-gray-900">{products[row.productId] || row.productId}</p>
            <p className="text-[10px] text-gray-400 font-mono">{row.productId}</p>
          </div>
        </div>
      ),
    },
    {
      header: "Customer",
      accessor: (row) => (
        <div className="flex items-center gap-2">
          <User size={14} className="text-gray-400" />
          <span className="text-sm font-medium">
            {row.userId === "guest_user" ? "Guest User" : (users[row.userId] || row.userId)}
          </span>
        </div>
      ),
    },
    {
      header: "Requested On",
      accessor: (row) => (
        <div className="flex items-center gap-2 text-gray-500">
          <Clock size={14} />
          <span className="text-xs">
            {row.timestamp ? format(row.timestamp.toDate(), "dd MMM yyyy, hh:mm a") : "N/A"}
          </span>
        </div>
      ),
    },
    {
      header: "Status",
      accessor: (row) => (
        <span
          className={`px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter ${
            row.status === "COMPLETED"
              ? "bg-green-100 text-green-700"
              : row.status === "CANCELLED"
              ? "bg-red-100 text-red-700"
              : "bg-yellow-100 text-yellow-700"
          }`}
        >
          {row.status || "PENDING"}
        </span>
      ),
    },
    {
      header: "Actions",
      accessor: (row) => (
        <div className="flex items-center gap-2">
          {row.status !== "COMPLETED" && (
            <button
              onClick={() => handleStatusUpdate(row.id, "COMPLETED")}
              className="p-2 hover:bg-green-50 text-green-600 rounded-lg transition-colors"
              title="Mark as Notified"
            >
              <CheckCircle2 size={18} />
            </button>
          )}
          {row.status !== "CANCELLED" && (
            <button
              onClick={() => handleStatusUpdate(row.id, "CANCELLED")}
              className="p-2 hover:bg-red-50 text-red-600 rounded-lg transition-colors"
              title="Cancel Request"
            >
              <XCircle size={18} />
            </button>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-black text-gray-900 flex items-center gap-3">
            <Bell className="text-[#1b5e20]" />
            Stock Notification Requests
          </h1>
          <p className="text-gray-500 text-sm mt-1">
            Manage customers waiting for out-of-stock products
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <DataTable
          columns={columns}
          data={requests}
          loading={loading}
          searchPlaceholder="Search requests..."
        />
      </div>
    </div>
  );
};

export default StockRequests;
