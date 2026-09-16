import React, { useState, useEffect } from "react";
import { 
  ShoppingCart, 
  Send, 
  Phone, 
  Clock, 
  Percent, 
  TrendingUp, 
  CheckCircle2, 
  AlertCircle, 
  Search, 
  RefreshCw,
  ExternalLink,
  MessageSquare,
  Zap
} from "lucide-react";
import { collection, query, orderBy, limit, onSnapshot, getDocs, doc, updateDoc, Timestamp, startAfter } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../firebase/config";
import { formatCurrency } from "../utils/formatters";
import { sendAbandonedCartWhatsApp } from "../services/whatsappService";
import toast from "react-hot-toast";

export default function AbandonedCarts() {
  const [carts, setCarts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [discountCode, setDiscountCode] = useState("KISAN10");
  const [lastDoc, setLastDoc] = useState(null);
  const [hasMore, setHasMore] = useState(true);
  const [scanning, setScanning] = useState(false);

  const handleManualScan = async () => {
    setScanning(true);
    try {
      const scanFn = httpsCallable(functions, 'runAbandonedCartScan');
      const result = await scanFn({});
      const data = result.data;
      toast.success(`✅ Scan complete! ${data.newAbandonedCount || 0} new abandoned carts found, ${data.updatedCount || 0} updated.`);
    } catch (err) {
      console.error('Manual scan error:', err);
      toast.error('Scan failed: ' + (err.message || 'Unknown error'));
    } finally {
      setScanning(false);
    }
  };

  const CARTS_PER_PAGE = 50;

  useEffect(() => {
    // [FIXED] Point #123: Added pagination and load more support for abandoned carts
    const q = query(
      collection(db, "abandoned_carts"),
      orderBy("createdAt", "desc"),
      limit(CARTS_PER_PAGE)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const liveData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setCarts(liveData);
      setLastDoc(snapshot.docs[snapshot.docs.length - 1]);
      setHasMore(snapshot.docs.length === CARTS_PER_PAGE);
      setLoading(false);
    }, (err) => {
      console.error(err);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const fetchMore = async () => {
    if (!lastDoc || !hasMore) return;
    setLoadingMore(true);
    try {
      const { startAfter, getDocs } = await import("firebase/firestore");
      const q = query(
        collection(db, "abandoned_carts"),
        orderBy("createdAt", "desc"),
        startAfter(lastDoc),
        limit(CARTS_PER_PAGE)
      );
      const snap = await getDocs(q);
      const moreData = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

      setCarts(prev => [...prev, ...moreData]);
      setLastDoc(snap.docs[snap.docs.length - 1]);
      setHasMore(snap.docs.length === CARTS_PER_PAGE);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingMore(false);
    }
  };

  const handleSendWhatsApp = async (cart) => {
    const success = sendAbandonedCartWhatsApp(cart, discountCode);
    if (success) {
      toast.success(`WhatsApp reminder opened for ${cart.customerName}!`);
      // [FIXED] Point #118: Save reminders count to Firestore instead of just local state
      try {
        const cartRef = doc(db, "abandoned_carts", cart.id);
        await updateDoc(cartRef, {
          remindersSent: (cart.remindersSent || 0) + 1,
          lastReminderAt: Timestamp.now()
        });
      } catch (err) {
        console.error("Failed to update reminder count:", err);
      }
    } else {
      toast.error("Valid customer phone number not found.");
    }
  };

  const handleMarkRecovered = async (cartId) => {
    // [FIXED] Point #118: Persist recovered status to Firestore
    try {
      const cartRef = doc(db, "abandoned_carts", cartId);
      await updateDoc(cartRef, {
        status: "RECOVERED",
        recoveredAt: Timestamp.now()
      });
      toast.success("Cart marked as successfully recovered!");
    } catch (err) {
      toast.error("Failed to update status in database");
    }
  };

  const filteredCarts = carts.filter(c => {
    const search = searchTerm.toLowerCase();
    return (
      (c.customerName || "").toLowerCase().includes(search) ||
      (c.phone || "").includes(search) ||
      (c.village || "").toLowerCase().includes(search)
    );
  });

  const totalAbandonedValue = carts
    .filter(c => c.status !== "RECOVERED")
    .reduce((sum, c) => sum + Number(c.cartValue || 0), 0);

  const totalRecoveredValue = carts
    .filter(c => c.status === "RECOVERED")
    .reduce((sum, c) => sum + Number(c.cartValue || 0), 0);

  const recoveryRate = carts.length > 0 
    ? Math.round((carts.filter(c => c.status === "RECOVERED").length / carts.length) * 100) 
    : 0;

  return (
    <div className="p-8 space-y-8 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-emerald-100 text-emerald-800 rounded-2xl">
              <ShoppingCart size={28} />
            </div>
            <div>
              <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center gap-2">
                Abandoned Carts Recovery (छूटे हुए कार्ट रिकवरी)
              </h1>
              <p className="text-xs text-gray-500 font-medium">
                जिन किसानों ने कार्ट में सामान जोड़ा पर ऑर्डर नहीं किया — 1-क्लिक व्हाट्सएप डिस्काउंट भेजकर रिकवर करें
              </p>
            </div>
          </div>
        </div>

        {/* Global Discount Code Input + Scan Now */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-3 bg-white p-2 rounded-2xl border border-gray-200 shadow-sm">
            <Percent size={18} className="text-emerald-600 ml-2" />
            <span className="text-xs font-bold text-gray-500">Auto Coupon:</span>
            <input
              type="text"
              value={discountCode}
              onChange={(e) => setDiscountCode(e.target.value.toUpperCase())}
              className="w-28 px-3 py-1.5 bg-emerald-50 text-emerald-900 font-mono font-black text-xs rounded-xl outline-none uppercase text-center border border-emerald-200"
              placeholder="COUPON"
            />
          </div>
          <button
            onClick={handleManualScan}
            disabled={scanning}
            className="flex items-center gap-2 px-4 py-3 bg-amber-500 text-white rounded-2xl text-xs font-black uppercase shadow-sm hover:bg-amber-600 active:scale-95 transition-all disabled:opacity-50"
            title="Scan all user carts now and detect abandoned ones"
          >
            {scanning ? <RefreshCw size={16} className="animate-spin" /> : <Zap size={16} />}
            <span>{scanning ? 'Scanning...' : 'Scan Now'}</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              Total Abandoned Value
            </p>
            <h3 className="text-2xl font-black text-rose-600 mt-1">
              {formatCurrency(totalAbandonedValue)}
            </h3>
            <p className="text-[11px] text-gray-500 font-medium mt-1">
              {carts.filter(c => c.status !== "RECOVERED").length} किसानों के कार्ट पेंडिंग
            </p>
          </div>
          <div className="h-12 w-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center font-bold">
            <AlertCircle size={24} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              Recovered Revenue
            </p>
            <h3 className="text-2xl font-black text-emerald-600 mt-1">
              {formatCurrency(totalRecoveredValue)}
            </h3>
            <p className="text-[11px] text-gray-500 font-medium mt-1">
              व्हाट्सएप फॉलोअप से वापस आया राजस्व
            </p>
          </div>
          <div className="h-12 w-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center font-bold">
            <TrendingUp size={24} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              Recovery Success Rate
            </p>
            <h3 className="text-2xl font-black text-blue-600 mt-1">
              {recoveryRate}%
            </h3>
            <p className="text-[11px] text-gray-500 font-medium mt-1">
              औसत 35% इंडस्ट्री बेंचमार्क
            </p>
          </div>
          <div className="h-12 w-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center font-bold">
            <CheckCircle2 size={24} />
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
              Active Reminder Template
            </p>
            <h3 className="text-lg font-black text-emerald-800 mt-1">
              10% Off + Free COD
            </h3>
            <p className="text-[11px] text-emerald-600 font-bold mt-1">
              कोड: {discountCode}
            </p>
          </div>
          <div className="h-12 w-12 bg-green-50 text-green-700 rounded-2xl flex items-center justify-center font-bold">
            <Send size={20} />
          </div>
        </div>
      </div>

      {/* Table Section */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="relative flex-1 max-w-md">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search farmer name, phone or village..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-bold text-gray-900 outline-none focus:border-emerald-600"
            />
          </div>
          <div className="text-xs text-gray-500 font-semibold">
            दिखाए जा रहे हैं: <span className="font-black text-gray-900">{filteredCarts.length}</span> कार्ट्स
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-gray-50/75 border-b border-gray-100 text-gray-400 uppercase font-black text-[10px] tracking-wider">
              <tr>
                <th className="px-6 py-4">किसान का नाम व संपर्क (Farmer Info)</th>
                <th className="px-6 py-4">स्थान / हब (Location)</th>
                <th className="px-6 py-4">कार्ट में मौजूद सामग्री (Cart Items)</th>
                <th className="px-6 py-4">कुल राशि (Value)</th>
                <th className="px-6 py-4">स्थिति (Status)</th>
                <th className="px-6 py-4 text-right">1-Click Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 font-medium">
              {filteredCarts.map((cart) => (
                <tr key={cart.id} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4">
                    <p className="font-black text-gray-900 text-sm">{cart.customerName}</p>
                    <p className="text-gray-500 font-mono text-xs mt-0.5">{cart.phone}</p>
                  </td>

                  <td className="px-6 py-4">
                    <p className="font-bold text-gray-800">{cart.village}</p>
                    <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-bold mt-1">
                      PIN: {cart.pincode}
                    </span>
                  </td>

                  <td className="px-6 py-4 max-w-xs">
                    <div className="space-y-1">
                      {(cart.items || []).map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between text-xs">
                          <span className="text-gray-700 font-semibold truncate pr-2">
                            • {item.name}
                          </span>
                          <span className="text-gray-500 font-mono shrink-0">
                            x{item.quantity}
                          </span>
                        </div>
                      ))}
                    </div>
                  </td>

                  <td className="px-6 py-4">
                    <p className="font-black text-sm text-gray-900">
                      {formatCurrency(cart.cartValue)}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                      {cart.remindersSent > 0 ? `${cart.remindersSent} बार भेजा गया` : 'फॉलोअप बाकी'}
                    </p>
                  </td>

                  <td className="px-6 py-4">
                    {cart.status === "RECOVERED" ? (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-100 text-emerald-800 rounded-full font-black text-[10px]">
                        <CheckCircle2 size={12} /> RECOVERED
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-100 text-amber-800 rounded-full font-black text-[10px]">
                        <Clock size={12} /> PENDING
                      </span>
                    )}
                  </td>

                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end space-x-2">
                      {/* WhatsApp Button */}
                      <button
                        onClick={() => handleSendWhatsApp(cart)}
                        className="flex items-center space-x-1.5 bg-[#25D366] text-white px-3 py-2 rounded-xl text-xs font-black shadow-sm hover:bg-[#1ebd5a] active:scale-95 transition-all"
                        title="Send 10% Discount WhatsApp to Farmer"
                      >
                        <MessageSquare size={14} />
                        <span>WhatsApp Offer</span>
                      </button>

                      {/* Phone Call */}
                      <a
                        href={`tel:${cart.phone}`}
                        className="p-2 bg-gray-100 text-gray-600 rounded-xl hover:bg-primary/10 hover:text-primary transition-all active:scale-95"
                        title="Call Farmer"
                      >
                        <Phone size={14} />
                      </a>

                      {/* Mark Recovered */}
                      {cart.status !== "RECOVERED" && (
                        <button
                          onClick={() => handleMarkRecovered(cart.id)}
                          className="p-2 bg-emerald-50 text-emerald-700 rounded-xl hover:bg-emerald-100 transition-all active:scale-95"
                          title="Mark as Converted/Recovered"
                        >
                          <CheckCircle2 size={14} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Load More Button */}
        {hasMore && (
          <div className="p-6 border-t border-gray-100 flex justify-center">
            <button
              onClick={fetchMore}
              disabled={loadingMore}
              className="flex items-center gap-2 px-8 py-3 bg-white border border-gray-200 rounded-2xl text-xs font-black uppercase tracking-widest text-gray-500 hover:text-emerald-700 hover:border-emerald-700 transition-all shadow-sm disabled:opacity-50"
            >
              {loadingMore ? <RefreshCw className="animate-spin" size={16} /> : <Clock size={16} />}
              <span>{loadingMore ? 'Fetching more carts...' : 'Load Older Abandoned Carts'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
