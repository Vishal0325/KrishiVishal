import React, { useState, useEffect, useMemo } from "react";
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
import PageHeader from "../components/common/PageHeader";
import MetricCard from "../components/common/MetricCard";
import { format } from "date-fns";
import {
  Bell,
  Package,
  User,
  Clock,
  CheckCircle2,
  XCircle,
  Search,
  RefreshCcw,
  AlertTriangle,
  Inbox,
  Loader2
} from "lucide-react";
import toast from "react-hot-toast";

const STATUS_TABS = [
  { key: 'ALL', label: 'All Requests' },
  { key: 'PENDING', label: 'Pending' },
  { key: 'COMPLETED', label: 'Notified' },
  { key: 'CANCELLED', label: 'Cancelled' }
];

const StockRequests = () => {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState({});
  const [users, setUsers] = useState({});
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = () => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 600);
  };

  useEffect(() => {
    const q = query(
      collection(db, "stock_notification_requests"),
      orderBy("timestamp", "desc")
    );

    const unsubscribe = onSnapshot(q, async (snapshot) => {
      const requestsData = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
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

  // Metrics
  const metrics = useMemo(() => {
    const pending = requests.filter(r => !r.status || r.status === 'PENDING').length;
    const completed = requests.filter(r => r.status === 'COMPLETED').length;
    const cancelled = requests.filter(r => r.status === 'CANCELLED').length;
    return { total: requests.length, pending, completed, cancelled };
  }, [requests]);

  // Filtered & Searched
  const filteredRequests = useMemo(() => {
    let filtered = requests;
    if (statusFilter !== 'ALL') {
      if (statusFilter === 'PENDING') {
        filtered = filtered.filter(r => !r.status || r.status === 'PENDING');
      } else {
        filtered = filtered.filter(r => r.status === statusFilter);
      }
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(r =>
        (products[r.productId] || r.productId || '').toLowerCase().includes(term) ||
        (users[r.userId] || r.userId || '').toLowerCase().includes(term)
      );
    }
    return filtered;
  }, [requests, statusFilter, searchTerm, products, users]);

  const columns = [
    {
      header: "Product",
      accessor: (row) => (
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 bg-orange-100 rounded-xl flex items-center justify-center text-orange-600">
            <Package size={16} />
          </div>
          <div>
            <p className="font-bold text-gray-900 text-sm">{products[row.productId] || row.productId}</p>
            <p className="text-[10px] text-gray-400 font-mono">{row.productId?.slice(0, 16)}</p>
          </div>
        </div>
      ),
    },
    {
      header: "Customer",
      accessor: (row) => (
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 bg-blue-50 rounded-lg flex items-center justify-center">
            <User size={13} className="text-blue-500" />
          </div>
          <span className="text-sm font-medium text-gray-700">
            {row.userId === "guest_user" ? "Guest User" : (users[row.userId] || row.userId?.slice(0, 12))}
          </span>
        </div>
      ),
    },
    {
      header: "Requested On",
      accessor: (row) => (
        <div className="flex items-center gap-2 text-gray-500">
          <Clock size={13} className="text-gray-400" />
          <span className="text-xs font-medium">
            {row.timestamp ? format(row.timestamp.toDate(), "dd MMM yyyy, hh:mm a") : "N/A"}
          </span>
        </div>
      ),
    },
    {
      header: "Status",
      accessor: (row) => {
        const status = row.status || 'PENDING';
        const styles = {
          COMPLETED: 'bg-green-100 text-green-700',
          CANCELLED: 'bg-red-100 text-red-700',
          PENDING: 'bg-amber-100 text-amber-700'
        };
        return (
          <span className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-tighter ${styles[status] || styles.PENDING}`}>
            {status}
          </span>
        );
      },
    },
    {
      header: "Actions",
      accessor: (row) => (
        <div className="flex items-center gap-1.5">
          {(!row.status || row.status === 'PENDING') && (
            <>
              <button
                onClick={() => handleStatusUpdate(row.id, "COMPLETED")}
                className="p-2 hover:bg-green-50 text-green-600 rounded-xl transition-colors"
                title="Mark as Notified"
              >
                <CheckCircle2 size={17} />
              </button>
              <button
                onClick={() => handleStatusUpdate(row.id, "CANCELLED")}
                className="p-2 hover:bg-red-50 text-red-500 rounded-xl transition-colors"
                title="Cancel Request"
              >
                <XCircle size={17} />
              </button>
            </>
          )}
          {row.status === 'COMPLETED' && (
            <span className="text-[9px] font-bold text-green-600 uppercase">Notified ✓</span>
          )}
          {row.status === 'CANCELLED' && (
            <span className="text-[9px] font-bold text-red-500 uppercase">Cancelled</span>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 pb-10 animate-in fade-in duration-300">
      <PageHeader
        title="Stock Notification Requests"
        subtitle="Manage customer waitlist for out-of-stock products — notify when restocked"
        actions={[
          {
            label: refreshing ? 'Refreshing...' : 'Refresh',
            icon: refreshing ? Loader2 : RefreshCcw,
            onClick: fetchData,
            variant: 'secondary'
          }
        ]}
      />

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Total Requests" value={metrics.total} icon={Bell} color="blue" />
        <MetricCard label="Pending" value={metrics.pending} icon={AlertTriangle} color="amber" />
        <MetricCard label="Notified" value={metrics.completed} icon={CheckCircle2} color="green" />
        <MetricCard label="Cancelled" value={metrics.cancelled} icon={XCircle} color="red" />
      </div>

      {/* Status Filter Tabs */}
      <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-2xl w-fit">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              statusFilter === tab.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
            {tab.key === 'PENDING' && metrics.pending > 0 && (
              <span className="ml-1.5 bg-amber-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-black">
                {metrics.pending}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Search + Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-50 flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search by product or customer..."
              className="pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-xs font-medium w-full outline-none focus:ring-2 focus:ring-[#1b5e20]/10 focus:border-[#1b5e20]/30 transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <span className="text-xs text-gray-400 font-medium">
            {filteredRequests.length} result{filteredRequests.length !== 1 ? 's' : ''}
          </span>
        </div>
        <DataTable
          columns={columns}
          data={filteredRequests}
          loading={loading}
          emptyMessage="No stock notification requests found"
          emptyIcon={Inbox}
        />
      </div>
    </div>
  );
};

export default StockRequests;
