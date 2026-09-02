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
  MessageSquare
} from "lucide-react";
import { collection, query, orderBy, limit, onSnapshot, getDocs } from "firebase/firestore";
import { db } from "../firebase/config";
import { formatCurrency } from "../utils/formatters";
import { sendAbandonedCartWhatsApp } from "../services/whatsappService";
import toast from "react-hot-toast";

export default function AbandonedCarts() {
  const [carts, setCarts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [discountCode, setDiscountCode] = useState("KISAN10");
  const [selectedCart, setSelectedCart] = useState(null);
  const [customMsgModal, setCustomMsgModal] = useState(false);

  // Fallback demo/sample abandoned carts for Purnea/Bihar regional farmers if collection is empty
  const sampleCarts = [
    {
      id: "CART-901",
      customerName: "रामेश सिंह (Ramesh Singh)",
      phone: "9876543210",
      village: "कसबा, पूर्णिया (Kasba, Purnea)",
      pincode: "854305",
      cartValue: 3450,
      items: [
        { name: "IFFCO Neem Coated Urea 50kg", quantity: 3, price: 266 },
        { name: "DAP Fertilizer 50kg", quantity: 2, price: 1350 }
      ],
      abandonedAt: new Date(Date.now() - 2 * 3600 * 1000), // 2 hours ago
      status: "ABANDONED",
      remindersSent: 0
    },
    {
      id: "CART-902",
      customerName: "मनोज यादव (Manoj Yadav)",
      phone: "9812345678",
      village: "गुलाबबाग, पूर्णिया (Gulabbagh)",
      pincode: "854302",
      cartValue: 1890,
      items: [
        { name: "FMC Coragen 60ml", quantity: 1, price: 890 },
        { name: "UPL Saaf Fungicide 500g", quantity: 2, price: 500 }
      ],
      abandonedAt: new Date(Date.now() - 5 * 3600 * 1000), // 5 hours ago
      status: "ABANDONED",
      remindersSent: 1
    },
    {
      id: "CART-903",
      customerName: "अजय कुमार (Ajay Kumar)",
      phone: "7004123890",
      village: "बनमनखी, पूर्णिया (Banmankhi)",
      pincode: "854303",
      cartValue: 5600,
      items: [
        { name: "Paddy Hybrid Seeds (PR-126) 10kg", quantity: 4, price: 1400 }
      ],
      abandonedAt: new Date(Date.now() - 24 * 3600 * 1000), // 1 day ago
      status: "ABANDONED",
      remindersSent: 0
    },
    {
      id: "CART-904",
      customerName: "सुरेश मंडल (Suresh Mandal)",
      phone: "9431234567",
      village: "डगरुआ, पूर्णिया (Dagarua)",
      pincode: "854326",
      cartValue: 2400,
      items: [
        { name: "NPK 19:19:19 1kg Water Soluble", quantity: 10, price: 240 }
      ],
      abandonedAt: new Date(Date.now() - 14 * 3600 * 1000), // 14 hours ago
      status: "RECOVERED",
      remindersSent: 2
    }
  ];

  useEffect(() => {
    // Attempt real-time fetch from Firestore 'abandoned_carts' or use rich live data
    try {
      const q = query(collection(db, "abandoned_carts"), limit(50));
      const unsubscribe = onSnapshot(q, (snapshot) => {
        if (!snapshot.empty) {
          const liveData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setCarts(liveData);
        } else {
          setCarts(sampleCarts);
        }
        setLoading(false);
      }, (err) => {
        console.warn("Firestore abandoned_carts listener fallback to sample data", err);
        setCarts(sampleCarts);
        setLoading(false);
      });

      return () => unsubscribe();
    } catch (e) {
      setCarts(sampleCarts);
      setLoading(false);
    }
  }, []);

  const handleSendWhatsApp = (cart) => {
    const success = sendAbandonedCartWhatsApp(cart, discountCode);
    if (success) {
      toast.success(`WhatsApp reminder opened for ${cart.customerName}!`);
      // Update local state reminders count
      setCarts(prev => prev.map(c => c.id === cart.id ? { ...c, remindersSent: (c.remindersSent || 0) + 1 } : c));
    } else {
      toast.error("Valid customer phone number not found.");
    }
  };

  const handleMarkRecovered = (cartId) => {
    setCarts(prev => prev.map(c => c.id === cartId ? { ...c, status: "RECOVERED" } : c));
    toast.success("Cart marked as successfully recovered!");
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

        {/* Global Discount Code Input */}
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
      </div>
    </div>
  );
}
