import React, { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot, writeBatch, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { useToast } from '../components/ToastProvider';
import { CheckCircle, Wallet, TrendingUp, AlertTriangle } from 'lucide-react';

interface Order {
  id: string;
  riderId: string;
  codAmount: number;
  isCOD: boolean;
  deliveryStatus: string;
  isSettledByAdmin: boolean;
}

interface RiderLedger {
  riderId: string;
  totalCashCollected: number;
  settledCash: number;
  pendingCash: number;
  pendingOrderIds: string[];
}

const SettlementDesk: React.FC = () => {
  const { showToast } = useToast();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Only listen to COD delivered orders
    const q = query(
      collection(db, 'orders'),
      where('isCOD', '==', true),
      where('deliveryStatus', '==', 'DELIVERED')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const ordersData: Order[] = [];
      snapshot.forEach((doc) => {
        ordersData.push({ id: doc.id, ...doc.data() } as Order);
      });
      setOrders(ordersData);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching COD orders:", error);
      showToast('COD orders fetch karne mein error aaya.', 'error');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [showToast]);

  const ledgers = useMemo(() => {
    const map = new Map<string, RiderLedger>();

    orders.forEach(order => {
      if (!order.riderId) return;

      if (!map.has(order.riderId)) {
        map.set(order.riderId, {
          riderId: order.riderId,
          totalCashCollected: 0,
          settledCash: 0,
          pendingCash: 0,
          pendingOrderIds: []
        });
      }

      const ledger = map.get(order.riderId)!;
      ledger.totalCashCollected += order.codAmount;

      if (order.isSettledByAdmin) {
        ledger.settledCash += order.codAmount;
      } else {
        ledger.pendingCash += order.codAmount;
        ledger.pendingOrderIds.push(order.id);
      }
    });

    return Array.from(map.values());
  }, [orders]);

  // Summary stats
  const summary = useMemo(() => {
    return ledgers.reduce(
      (acc, l) => ({
        totalCollected: acc.totalCollected + l.totalCashCollected,
        totalSettled: acc.totalSettled + l.settledCash,
        totalPending: acc.totalPending + l.pendingCash,
      }),
      { totalCollected: 0, totalSettled: 0, totalPending: 0 }
    );
  }, [ledgers]);

  const handleSettle = async (riderId: string, pendingOrderIds: string[]) => {
    if (pendingOrderIds.length === 0) return;

    const pendingAmount = ledgers.find(l => l.riderId === riderId)?.pendingCash || 0;

    if (!window.confirm(`Are you sure you want to mark ₹${pendingAmount} as settled for rider ${riderId}?`)) {
      return;
    }

    try {
      // Create a batch to update all pending orders for this rider
      const batch = writeBatch(db);

      pendingOrderIds.forEach(orderId => {
        const orderRef = doc(db, 'orders', orderId);
        batch.update(orderRef, { isSettledByAdmin: true });
      });

      await batch.commit();
      showToast(`₹${pendingAmount} successfully settled for rider ${riderId}!`, 'success');
    } catch (error) {
      console.error("Error settling cash:", error);
      showToast('Cash settlement mein error aaya. Retry karo.', 'error');
    }
  };

  return (
    <div>
      <div className="page-header">
        <h2>COD Ledger & Settlement Desk</h2>
        <p>Monitor collected cash and settle pending amounts with riders.</p>
      </div>

      {/* Summary Stats */}
      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-icon blue"><Wallet size={24} /></div>
          <div className="stat-info">
            <h4>Total COD Collected</h4>
            <div className="stat-value">₹{summary.totalCollected.toLocaleString()}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green"><TrendingUp size={24} /></div>
          <div className="stat-info">
            <h4>Settled</h4>
            <div className="stat-value">₹{summary.totalSettled.toLocaleString()}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon yellow"><AlertTriangle size={24} /></div>
          <div className="stat-info">
            <h4>Pending</h4>
            <div className="stat-value">₹{summary.totalPending.toLocaleString()}</div>
          </div>
        </div>
      </div>

      <div className="card">
        {loading ? (
          <div className="skeleton" style={{ height: '300px', width: '100%' }}></div>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>Rider ID</th>
                  <th>Total Cash Collected</th>
                  <th>Settled Cash</th>
                  <th>Pending Cash</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {ledgers.map(ledger => (
                  <tr key={ledger.riderId}>
                    <td style={{ fontWeight: 600 }}>{ledger.riderId}</td>
                    <td>₹{ledger.totalCashCollected.toLocaleString()}</td>
                    <td style={{ color: 'var(--success-color)' }}>₹{ledger.settledCash.toLocaleString()}</td>
                    <td style={{ color: 'var(--warning-color)', fontWeight: 600 }}>₹{ledger.pendingCash.toLocaleString()}</td>
                    <td>
                      <button
                        className="btn btn-primary btn-sm"
                        disabled={ledger.pendingCash === 0}
                        onClick={() => handleSettle(ledger.riderId, ledger.pendingOrderIds)}
                      >
                        <CheckCircle size={16} /> {ledger.pendingCash === 0 ? 'Settled ✓' : 'Settle Cash'}
                      </button>
                    </td>
                  </tr>
                ))}
                {ledgers.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)' }}>
                      No COD collections found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default SettlementDesk;
