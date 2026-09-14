import React, { useState, useEffect } from 'react';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  doc,
  getDoc
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../hooks/useAuth';
import DataTable from '../../components/common/DataTable';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import {
  MessageSquare,
  Send,
  Sparkles,
  ShoppingCart,
  Truck,
  CheckCircle2,
  Calendar,
  Layers,
  Smartphone,
  Eye,
  Percent,
  Play,
  Share2,
  AlertCircle
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function WhatsAppAutomation() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('TEMPLATES'); // 'TEMPLATES' | 'ABANDONED' | 'BROADCAST'
  const [abandonedCarts, setAbandonedCarts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [testPhone, setTestPhone] = useState('9876543210');
  const [selectedTemplate, setSelectedTemplate] = useState(null);

  // Ready WhatsApp Business Official Templates
  const templates = [
    {
      id: 'ORDER_DISPATCHED',
      name: 'Order Out for Delivery',
      category: 'Utility & Logistics',
      trigger: 'When order status updates to OUT_FOR_DELIVERY',
      preview: 'नमस्ते {{customer_name}} जी! 🚚 आपका KrishiVishal ऑर्डर #{{order_id}} डिलीवरी के लिए निकल चुका है।\n\n🌾 राइडर का नाम: {{rider_name}}\n📍 लाइव लोकेशन ट्रैक करें: {{tracking_link}}\n\nKrishiVishal - आपकी खेती, हमारा संकल्प!',
      variables: ['customer_name', 'order_id', 'rider_name', 'tracking_link'],
      status: 'APPROVED (Meta Verified)'
    },
    {
      id: 'CART_RECOVERY',
      name: 'Abandoned Cart 10% Discount Recovery',
      category: 'Marketing & Sales',
      trigger: 'Triggered 2 hours after cart abandonment',
      preview: 'नमस्ते {{customer_name}} जी! 🛒 आपके बैग में {{crop_item}} छूट गया है।\n\nआज ही ऑर्डर पूरा करें और पाएं स्पेशल 10% एक्स्ट्रा छूट! कूपन कोड: KISAN10\n👉 तुरंत खरीदें: {{cart_link}}',
      variables: ['customer_name', 'crop_item', 'cart_link'],
      status: 'APPROVED (Meta Verified)'
    },
    {
      id: 'CROP_ADVISORY_BROADCAST',
      name: 'Stage-Wise Crop Protection Alert',
      category: 'Advisory & Engagement',
      trigger: 'Scheduled automatically on crop calendar milestone',
      preview: '🌾 किसान भाई {{customer_name}} जी, आपकी {{crop_name}} की फसल अब {{stage_name}} अवस्था पर है।\n\n⚠️ कीट/रोग से बचाव हेतु {{recommended_spray}} का समय पर छिड़काव करें।\n\nकृषि डॉक्टर से फ्री परामर्श या दवा मंगाने हेतु यहां क्लिक करें: {{advisory_link}}',
      variables: ['customer_name', 'crop_name', 'stage_name', 'recommended_spray', 'advisory_link'],
      status: 'APPROVED (Meta Verified)'
    },
    {
      id: 'INVOICE_BILL_DOWNLOAD',
      name: 'Official GST Tax Invoice Bill',
      category: 'Transactional',
      trigger: 'Triggered immediately after payment/delivery confirmation',
      preview: 'धन्यवाद {{customer_name}} जी! 🧾 आपके KrishiVishal ऑर्डर #{{order_id}} का डिजिटल जीएसटी बिल तैयार है।\n\nकुल राशि: ₹{{amount}}\n📄 बिल डाउनलोड लिंक: {{invoice_url}}',
      variables: ['customer_name', 'order_id', 'amount', 'invoice_url'],
      status: 'APPROVED (Meta Verified)'
    }
  ];

  // Fetch Abandoned Carts from Firestore
  useEffect(() => {
    const unsub = onSnapshot(
      query(collection(db, 'abandoned_carts'), orderBy('updatedAt', 'desc')),
      (snap) => {
        setAbandonedCarts(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }
    );
    return () => unsub();
  }, []);

  // Send WhatsApp Direct API / Link
  const handleTriggerTest = (template) => {
    let msg = template.preview
      .replace('{{customer_name}}', 'किसान भाई')
      .replace('{{order_id}}', 'KV-98421')
      .replace('{{rider_name}}', 'Mukesh Kumar')
      .replace('{{tracking_link}}', 'https://krishivishal.in/track/98421')
      .replace('{{crop_item}}', 'DAP 50kg & Mustard Seeds')
      .replace('{{cart_link}}', 'https://krishivishal.in/cart')
      .replace('{{crop_name}}', 'Wheat (गेहूँ)')
      .replace('{{stage_name}}', 'Tillering Stage')
      .replace('{{recommended_spray}}', 'Urea + Zinc Spray')
      .replace('{{advisory_link}}', 'https://krishivishal.in')
      .replace('{{amount}}', '2,450')
      .replace('{{invoice_url}}', 'https://krishivishal.in/inv/98421.pdf');

    const cleanPhone = testPhone.replace(/[^0-9]/g, '');
    const url = `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
    toast.success(`WhatsApp Web opened with template: ${template.name}!`);
  };

  // Recover Specific Cart via WhatsApp
  const handleRecoverCart = (cart) => {
    const customerName = cart.userName || cart.customerName || 'किसान भाई';
    const cleanPhone = (cart.userPhone || cart.phone || '9876543210').replace(/[^0-9]/g, '');
    const msg = `नमस्ते ${customerName} जी! 🛒 आपके KrishiVishal कार्ट में सामान शेष है।\n\nकृषि उत्पादों पर 10% स्पेशल छूट के लिए कूपन KISAN10 लगाएं।\n👉 ऑर्डर पूरा करें: https://krishivishal.in/cart`;
    const url = `https://wa.me/91${cleanPhone}?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
    toast.success(`Sent recovery WhatsApp to ${customerName}!`);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-[#128C7E] to-[#075E54] text-white p-6 rounded-3xl shadow-lg relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
              <Smartphone size={14} className="text-emerald-300" />
              Meta Official WhatsApp Business API Automation
            </div>
            <h2 className="text-2xl font-black">WhatsApp Marketing & Automated Drips</h2>
            <p className="text-white/80 text-sm max-w-2xl">
              Automate live dispatch tracking, abandoned cart recoveries with promo coupons, GST bill PDFs, and broadcast crop calendar advisories directly to farmer phones.
            </p>
          </div>
          <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md p-2 rounded-2xl shrink-0">
            <input
              type="tel"
              value={testPhone}
              onChange={(e) => setTestPhone(e.target.value)}
              placeholder="Test Mobile Number"
              className="bg-white text-gray-900 px-3 py-2 rounded-xl text-xs font-bold outline-none w-36"
            />
            <span className="text-xs font-bold text-emerald-200">Test Number</span>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 bg-white p-2 rounded-2xl border border-gray-100 shadow-sm">
        <button
          onClick={() => setActiveTab('TEMPLATES')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'TEMPLATES' ? 'bg-[#075E54] text-white shadow-md' : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <MessageSquare size={16} />
          <span>Automation Templates ({templates.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('ABANDONED')}
          className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeTab === 'ABANDONED' ? 'bg-[#075E54] text-white shadow-md' : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          <ShoppingCart size={16} />
          <span>Abandoned Cart Recoveries ({abandonedCarts.length})</span>
        </button>
      </div>

      {/* Templates Grid View */}
      {activeTab === 'TEMPLATES' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {templates.map((tpl) => (
            <div
              key={tpl.id}
              className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 flex flex-col justify-between space-y-4 hover:shadow-md transition-shadow"
            >
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="px-3 py-1 bg-emerald-50 text-emerald-800 rounded-full text-xs font-black border border-emerald-200">
                    {tpl.category}
                  </span>
                  <span className="text-[11px] font-bold text-green-700 flex items-center gap-1">
                    <CheckCircle2 size={14} /> {tpl.status}
                  </span>
                </div>

                <h3 className="text-lg font-black text-gray-900">{tpl.name}</h3>
                <p className="text-xs text-gray-500 font-medium">⚡ Trigger: {tpl.trigger}</p>

                {/* WhatsApp Chat Bubble Mockup */}
                <div className="bg-[#ECE5DD] p-4 rounded-2xl border border-[#DAD3CC] text-xs text-gray-900 font-medium whitespace-pre-line leading-relaxed shadow-inner">
                  <div className="bg-white p-3.5 rounded-2xl rounded-tl-none shadow-sm space-y-2 border border-emerald-100">
                    <p>{tpl.preview}</p>
                    <div className="flex items-center justify-end gap-1 text-[10px] text-gray-400 font-bold">
                      <span>10:30 AM</span>
                      <span className="text-blue-500">✓✓</span>
                    </div>
                  </div>
                </div>

                {/* Variables Pills */}
                <div className="flex flex-wrap gap-1.5 pt-2">
                  {tpl.variables.map(v => (
                    <span key={v} className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded text-[10px] font-mono font-bold">
                      {`{{${v}}}`}
                    </span>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                <span className="text-[11px] text-gray-400 font-semibold">Auto-Trigger Active</span>
                <button
                  onClick={() => handleTriggerTest(tpl)}
                  className="flex items-center gap-2 px-4 py-2 bg-[#128C7E] hover:bg-[#075E54] text-white rounded-xl text-xs font-bold shadow transition-transform active:scale-95 cursor-pointer"
                >
                  <Send size={14} />
                  Test Send to WhatsApp
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Abandoned Carts View */}
      {activeTab === 'ABANDONED' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
              <ShoppingCart className="text-[#128C7E]" size={18} />
              Farmers with Incomplete / Abandoned Bags
            </h3>
            <span className="text-xs font-bold text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
              {abandonedCarts.length} Carts Tracked
            </span>
          </div>

          <DataTable
            data={abandonedCarts}
            columns={[
              {
                header: 'Farmer Name / ID',
                accessor: 'userName',
                render: (row) => (
                  <div>
                    <span className="font-bold text-gray-900 block">{row.userName || 'Farmer User'}</span>
                    <span className="font-mono text-xs text-gray-500">{row.userPhone || row.phone || '-'}</span>
                  </div>
                )
              },
              {
                header: 'Cart Value',
                accessor: 'cartTotal',
                render: (row) => (
                  <span className="font-black text-emerald-700">{formatCurrency(row.cartTotal || row.total || 0)}</span>
                )
              },
              {
                header: 'Items in Bag',
                accessor: 'itemCount',
                render: (row) => (
                  <span className="text-xs font-bold text-gray-700 bg-gray-100 px-2.5 py-1 rounded-lg">
                    {row.items?.length || row.itemCount || 1} Products
                  </span>
                )
              },
              {
                header: 'Abandoned At',
                accessor: 'updatedAt',
                render: (row) => formatDateTime(row.updatedAt || row.createdAt)
              },
              {
                header: '1-Click Recovery Action',
                accessor: 'id',
                render: (row) => (
                  <button
                    onClick={() => handleRecoverCart(row)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#128C7E] hover:bg-[#075E54] text-white rounded-xl text-xs font-bold shadow transition-transform active:scale-95 cursor-pointer"
                  >
                    <Send size={12} />
                    Send 10% Discount WhatsApp
                  </button>
                )
              }
            ]}
          />
        </div>
      )}
    </div>
  );
}
