import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useToast } from '../components/ToastProvider';
import PODModal from '../components/PODModal';
import {
  Search, Image as ImageIcon, Package,
  Clock, Truck, CheckCircle, XCircle
} from 'lucide-react';

interface Order {
  id: string;
  riderId?: string;
  codAmount: number;
  isCOD: boolean;
  deliveryStatus: string;
  isSettledByAdmin: boolean;
  customerName?: string;
  address?: string;
  createdAt?: number;
}

interface Rider {
  id: string;
  name: string;
}

const STATUS_OPTIONS = ['ALL', 'PENDING', 'ASSIGNED', 'IN-TRANSIT', 'DELIVERED', 'FAILED'];

const OrdersDashboard: React.FC = () => {
  const { showToast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [riders, setRiders] = useState<Rider[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  useEffect(() => {
    // Real-time listener for orders collection
    const q = query(collection(db, 'orders'));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ordersData: Order[] = [];
      snapshot.forEach((doc) => {
        ordersData.push({ id: doc.id, ...doc.data() } as Order);
      });
      setOrders(ordersData);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching orders:", error);
      showToast('Orders fetch karne mein error aaya.', 'error');
      setLoading(false);
    });

    // Fetch riders
    const unsubRiders = onSnapshot(collection(db, 'riders'), (snapshot) => {
      const ridersData = snapshot.docs.map(doc => ({ id: doc.id, name: doc.data().name || doc.id }));
      setRiders(ridersData);
    });

    return () => { unsubscribe(); unsubRiders(); };
  }, [showToast]);

  // Stats calculation
  const stats = useMemo(() => {
    const total = orders.length;
    const pending = orders.filter(o => !o.deliveryStatus || o.deliveryStatus === 'PENDING').length;
    const assigned = orders.filter(o => o.deliveryStatus === 'ASSIGNED').length;
    const inTransit = orders.filter(o => o.deliveryStatus === 'IN-TRANSIT').length;
    const delivered = orders.filter(o => o.deliveryStatus === 'DELIVERED').length;
    const failed = orders.filter(o => o.deliveryStatus === 'FAILED').length;
    return { total, pending, assigned, inTransit, delivered, failed };
  }, [orders]);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    let filtered = orders;

    if (statusFilter !== 'ALL') {
      filtered = filtered.filter(o => (o.deliveryStatus || 'PENDING') === statusFilter);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(o =>
        o.id.toLowerCase().includes(q) ||
        (o.customerName || '').toLowerCase().includes(q) ||
        (o.address || '').toLowerCase().includes(q)
      );
    }

    return filtered;
  }, [orders, statusFilter, searchQuery]);

  const handleAssignRider = async (orderId: string, riderId: string) => {
    try {
      const orderRef = doc(db, 'orders', orderId);
      await updateDoc(orderRef, {
        riderId,
        deliveryStatus: 'ASSIGNED'
      });

      const riderName = riders.find(r => r.id === riderId)?.name || riderId;
      showToast(`Order #${orderId.slice(0, 8)} assigned to ${riderName}.`, 'success');
    } catch (error) {
      console.error("Error assigning rider:", error);
      showToast('Rider assign karne mein error aaya.', 'error');
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch(status) {
      case 'DELIVERED': return 'badge badge-success';
      case 'FAILED': return 'badge badge-danger';
      case 'IN-TRANSIT': return 'badge badge-warning';
      case 'ASSIGNED': return 'badge badge-primary';
      default: return 'badge';
    }
  };

  return (
    <div>
      <div className="page-header">
        <h2>Orders Lifecycle & Assignment</h2>
        <p>Monitor order statuses, assign unallocated orders to riders, and view Proof of Delivery.</p>
      </div>

      {/* Stats Cards */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-icon blue"><Package size={24} /></div>
          <div className="stat-info">
            <h4>Total Orders</h4>
            <div className="stat-value">{stats.total}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon yellow"><Clock size={24} /></div>
          <div className="stat-info">
            <h4>Pending</h4>
            <div className="stat-value">{stats.pending + stats.assigned}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon purple"><Truck size={24} /></div>
          <div className="stat-info">
            <h4>In Transit</h4>
            <div className="stat-value">{stats.inTransit}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green"><CheckCircle size={24} /></div>
          <div className="stat-info">
            <h4>Delivered</h4>
            <div className="stat-value">{stats.delivered}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon red"><XCircle size={24} /></div>
          <div className="stat-info">
            <h4>Failed</h4>
            <div className="stat-value">{stats.failed}</div>
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card">
        <div className="filter-bar">
          <div className="search-input-wrapper">
            <Search size={18} />
            <input
              type="text"
              className="search-input"
              placeholder="Search by Order ID, Customer Name, or Address..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <select
            className="select-input"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            {STATUS_OPTIONS.map(opt => (
              <option key={opt} value={opt}>{opt === 'ALL' ? 'All Statuses' : opt}</option>
            ))}
          </select>
        </div>

        {/* Table */}
        {loading ? (
          <div className="skeleton" style={{ height: '400px', width: '100%' }}></div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Customer</th>
                  <th>Status</th>
                  <th>COD Details</th>
                  <th>Rider Allocation</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredOrders.map(order => (
                  <tr key={order.id}>
                    <td style={{ fontFamily: 'monospace' }}>#{order.id.slice(0, 8)}</td>
                    <td>{order.customerName || 'Unknown'}</td>
                    <td>
                      <span className={getStatusBadgeClass(order.deliveryStatus || 'PENDING')}>
                        {order.deliveryStatus || 'PENDING'}
                      </span>
                    </td>
                    <td>
                      {order.isCOD ? (
                        <div style={{ color: 'var(--warning-color)', fontWeight: 500 }}>
                          ₹{order.codAmount} (COD)
                        </div>
                      ) : (
                        <div style={{ color: 'var(--success-color)' }}>Prepaid</div>
                      )}
                    </td>
                    <td>
                      <select
                        className="select-input"
                        value={order.riderId || ''}
                        onChange={(e) => handleAssignRider(order.id, e.target.value)}
                        disabled={order.deliveryStatus === 'DELIVERED'}
                      >
                        <option value="" disabled>Assign Rider</option>
                        {riders.map(rider => (
                          <option key={rider.id} value={rider.id}>{rider.name}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {order.deliveryStatus === 'DELIVERED' && (
                        <button
                          className="btn btn-sm"
                          style={{ backgroundColor: 'var(--surface-color-light)', color: 'white' }}
                          onClick={() => {
                            setSelectedOrderId(order.id);
                            setIsModalOpen(true);
                          }}
                        >
                          <ImageIcon size={16} /> View POD
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredOrders.length === 0 && (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                      {orders.length === 0 ? 'No orders found in database.' : 'No orders match your search filters.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {selectedOrderId && (
        <PODModal
          isOpen={isModalOpen}
          onClose={() => setIsModalOpen(false)}
          orderId={selectedOrderId}
        />
      )}
    </div>
  );
};

export default OrdersDashboard;
