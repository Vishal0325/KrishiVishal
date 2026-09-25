import React, { useState, useEffect } from 'react';
import { collection, query, orderBy, limit, getDocs, doc, setDoc, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Wallet, ArrowUpRight, ArrowDownRight, AlertCircle, Search, Send, CheckCircle2, User, Phone, X } from 'lucide-react';
import { toast } from 'react-hot-toast';
import LoadingSpinner from '../components/common/LoadingSpinner';

const PartnerSettlements = () => {
  const [wallets, setWallets] = useState([]);
  const [partnersMap, setPartnersMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState('ALL'); // ALL, SUSPENDED, RECEIVABLES, PAYABLES

  // Payout Modal State
  const [selectedWallet, setSelectedWallet] = useState(null);
  const [payoutAmount, setPayoutAmount] = useState('');
  const [paymentRef, setPaymentRef] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  useEffect(() => {
    fetchWalletsAndPartners();
  }, []);

  const fetchWalletsAndPartners = async () => {
    try {
      const q = query(
        collection(db, 'partner_wallets'),
        orderBy('balance', 'asc'),
        limit(100)
      );
      const snapshot = await getDocs(q);
      const walletsData = snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      }));

      setWallets(walletsData);

      // Fetch partner profiles from users collection
      const userMap = {};
      for (const w of walletsData) {
        try {
          const userSnap = await getDoc(doc(db, 'users', w.id));
          if (userSnap.exists()) {
            userMap[w.id] = userSnap.data();
          }
        } catch (e) {
          console.error("Error fetching user profile for", w.id, e);
        }
      }
      setPartnersMap(userMap);
    } catch (error) {
      console.error("Error fetching wallets:", error);
      toast.error("Failed to load partner wallets.");
    } finally {
      setLoading(false);
    }
  };

  const handleSendReminder = async (wallet, partner) => {
    try {
      await setDoc(doc(collection(db, 'outbox')), {
        type: 'RECHARGE_REMINDER',
        payload: {
          partnerId: wallet.id,
          balance: wallet.balance,
          negativeLimit: wallet.negativeLimit || -500,
          title: '⚠️ Wallet Recharge Required',
          body: `Your wallet balance is ₹${wallet.balance}. Please recharge to resume receiving service bookings.`
        },
        status: 'PENDING',
        createdAt: serverTimestamp()
      });
      toast.success(`Recharge reminder sent to ${partner?.name || wallet.id}`);
    } catch (e) {
      console.error(e);
      toast.error('Failed to send reminder.');
    }
  };

  const handleProcessPayoutSubmit = async (e) => {
    e.preventDefault();
    if (!selectedWallet || !payoutAmount || Number(payoutAmount) <= 0) {
      toast.error("Enter a valid payout amount.");
      return;
    }

    setIsProcessing(true);
    try {
      const amountNum = Number(payoutAmount);
      const newBalance = (selectedWallet.balance || 0) - amountNum;

      // Update wallet balance
      await updateDoc(doc(db, 'partner_wallets', selectedWallet.id), {
        balance: newBalance,
        lastPayoutAt: serverTimestamp(),
        lastPayoutAmount: amountNum,
        updatedAt: serverTimestamp()
      });

      // Insert payout transaction record
      const txnId = `payout_${Date.now()}`;
      await setDoc(doc(db, 'partner_wallet_transactions', txnId), {
        partnerId: selectedWallet.id,
        type: 'PAYOUT',
        amount: amountNum,
        paymentRef: paymentRef || 'MANUAL_BANK_TRANSFER',
        balanceAfter: newBalance,
        createdAt: serverTimestamp()
      });

      toast.success(`Payout of ₹${amountNum} processed successfully!`);
      setSelectedWallet(null);
      setPayoutAmount('');
      setPaymentRef('');
      fetchWalletsAndPartners();
    } catch (e) {
      console.error(e);
      toast.error("Failed to process payout.");
    } finally {
      setIsProcessing(false);
    }
  };

  const filteredWallets = wallets.filter(w => {
    const partner = partnersMap[w.id];
    const name = partner?.name || '';
    const phone = partner?.phone || partner?.phoneNumber || '';
    const matchesSearch = w.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          phone.includes(searchQuery);

    if (!matchesSearch) return false;

    const limitVal = w.negativeLimit || -500;
    if (filterTab === 'SUSPENDED') return w.balance < limitVal;
    if (filterTab === 'RECEIVABLES') return w.balance < 0;
    if (filterTab === 'PAYABLES') return w.balance > 0;
    return true;
  });

  if (loading) return <LoadingSpinner />;

  return (
    <div className="p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Partner Settlements & Wallets</h1>
          <p className="text-sm text-gray-500">Manage negative balances, commission settlements, and payout requests</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center">
            <ArrowDownRight size={24} />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-bold">Total Receivables</p>
            <h3 className="text-2xl font-black text-red-600">
              ₹{wallets.filter(w => w.balance < 0).reduce((acc, curr) => acc + Math.abs(curr.balance), 0).toLocaleString()}
            </h3>
            <p className="text-xs text-gray-400">Commission due from partners</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-green-50 text-green-600 flex items-center justify-center">
            <ArrowUpRight size={24} />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-bold">Total Payables</p>
            <h3 className="text-2xl font-black text-green-600">
              ₹{wallets.filter(w => w.balance > 0).reduce((acc, curr) => acc + curr.balance, 0).toLocaleString()}
            </h3>
            <p className="text-xs text-gray-400">Earnings owed to partners</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center">
            <AlertCircle size={24} />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-bold">Suspended Partners</p>
            <h3 className="text-2xl font-black text-gray-900">
              {wallets.filter(w => w.balance < (w.negativeLimit || -500)).length}
            </h3>
            <p className="text-xs text-gray-400">Balance below negative threshold</p>
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-100 bg-gray-50 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex gap-2">
            {['ALL', 'SUSPENDED', 'RECEIVABLES', 'PAYABLES'].map(tab => (
              <button
                key={tab}
                onClick={() => setFilterTab(tab)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${filterTab === tab ? 'bg-[#0B4D31] text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="relative w-full md:w-64">
            <Search size={16} className="absolute left-3 top-2.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search partner name or ID..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs border rounded-lg bg-white"
            />
          </div>
        </div>

        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-white text-gray-400 text-xs uppercase border-b">
              <th className="p-4 font-bold">Partner Details</th>
              <th className="p-4 font-bold">Wallet Balance</th>
              <th className="p-4 font-bold">Limit Threshold</th>
              <th className="p-4 font-bold">Account Status</th>
              <th className="p-4 font-bold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {filteredWallets.map((wallet) => {
              const partner = partnersMap[wallet.id];
              const limitVal = wallet.negativeLimit || -500;
              const isSuspended = wallet.balance < limitVal;

              return (
                <tr key={wallet.id} className="hover:bg-gray-50 transition-colors">
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gray-100 border flex items-center justify-center text-gray-600 font-bold">
                        {partner?.name ? partner.name[0].toUpperCase() : <User size={18} />}
                      </div>
                      <div>
                        <p className="font-bold text-gray-900 text-sm">{partner?.name || 'Unknown Partner'}</p>
                        <p className="text-xs text-gray-500 font-mono flex items-center gap-1">
                          <Phone size={12} /> {partner?.phone || partner?.phoneNumber || wallet.id}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={`font-black text-lg ${wallet.balance < 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {wallet.balance < 0 ? '-' : ''}₹{Math.abs(wallet.balance).toLocaleString()}
                    </span>
                  </td>
                  <td className="p-4 text-sm text-gray-500 font-medium">
                    ₹{limitVal}
                  </td>
                  <td className="p-4">
                    {isSuspended ? (
                      <span className="flex items-center gap-1 text-xs font-bold text-red-700 bg-red-100 px-2.5 py-1 rounded-md w-max">
                        <AlertCircle size={14} /> Suspended
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs font-bold text-green-700 bg-green-100 px-2.5 py-1 rounded-md w-max">
                        <CheckCircle2 size={14} /> Active
                      </span>
                    )}
                  </td>
                  <td className="p-4 text-right flex justify-end gap-2">
                    {isSuspended && (
                      <button
                        onClick={() => handleSendReminder(wallet, partner)}
                        className="text-xs font-bold bg-orange-100 text-orange-700 px-3 py-1.5 rounded-lg hover:bg-orange-200 flex items-center gap-1"
                      >
                        <Send size={14} /> Send Reminder
                      </button>
                    )}
                    {wallet.balance > 0 ? (
                      <button
                        onClick={() => {
                          setSelectedWallet(wallet);
                          setPayoutAmount(wallet.balance.toString());
                        }}
                        className="text-xs font-bold bg-[#0B4D31] text-white px-3 py-1.5 rounded-lg hover:bg-[#083A25]"
                      >
                        Process Payout
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400 self-center font-medium">No Payout Due</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {filteredWallets.length === 0 && (
              <tr>
                <td colSpan="5" className="p-8 text-center text-gray-500">No matching partner wallet records found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Process Payout Modal */}
      {selectedWallet && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-2xl w-full max-w-md shadow-xl">
            <div className="flex justify-between items-center mb-4 border-b pb-3">
              <h2 className="text-lg font-bold text-gray-900">Process Partner Payout</h2>
              <button onClick={() => setSelectedWallet(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleProcessPayoutSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Partner ID / Name</label>
                <input
                  disabled
                  type="text"
                  value={partnersMap[selectedWallet.id]?.name ? `${partnersMap[selectedWallet.id].name} (${selectedWallet.id})` : selectedWallet.id}
                  className="w-full border p-2 rounded-lg bg-gray-50 font-medium text-sm text-gray-700"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Payout Amount (₹)</label>
                <input
                  required
                  type="number"
                  max={selectedWallet.balance}
                  value={payoutAmount}
                  onChange={e => setPayoutAmount(e.target.value)}
                  className="w-full border p-2 rounded-lg font-black text-lg text-green-700"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Payment Reference (Bank UTR / Ref No)</label>
                <input
                  type="text"
                  placeholder="e.g. UTR982347102938"
                  value={paymentRef}
                  onChange={e => setPaymentRef(e.target.value)}
                  className="w-full border p-2 rounded-lg text-sm"
                />
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setSelectedWallet(null)}
                  className="px-4 py-2 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessing}
                  className="px-4 py-2 bg-[#0B4D31] text-white text-xs font-bold rounded-lg hover:bg-[#083a24]"
                >
                  {isProcessing ? 'Processing...' : 'Confirm & Record Payout'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default PartnerSettlements;

