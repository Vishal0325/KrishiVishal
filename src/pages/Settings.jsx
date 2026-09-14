import React, { useState, useEffect } from "react";
import { doc, onSnapshot, setDoc, Timestamp } from "firebase/firestore";
import { db } from "../firebase/config";
import { 
  Building2, 
  Save, 
  Truck, 
  Bike,
  CreditCard, 
  ShieldCheck, 
  Info, 
  Bell, 
  Trash2, 
  HelpCircle, 
  AlertTriangle, 
  Package, 
  MessageCircle, 
  Eye, 
  EyeOff, 
  Loader2, 
  Check, 
  FileText, 
  Printer, 
  PhoneCall, 
  Mail, 
  Sliders, 
  Scale, 
  Bot, 
  MapPin, 
  Radio
} from "lucide-react";
import toast from "react-hot-toast";
import PageHeader from "../components/common/PageHeader";

export default function Settings() {
  const [activeTab, setActiveTab] = useState("store");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Visibility toggles for sensitive API keys
  const [showRazorpayKey, setShowRazorpayKey] = useState(false);
  const [showWhatsAppKey, setShowWhatsAppKey] = useState(false);
  const [showEmailKey, setShowEmailKey] = useState(false);

  const initialSettings = {
    appName: "KrishiVishal",
    supportPhone: "",
    supportEmail: "",
    freeDeliveryAbove: 500,
    deliveryCharge: 50,
    codAvailable: true,
    razorpayKey: "",
    lowStockThreshold: 10,
    crmHighValueLTV: 10000,
    crmChurnRiskDays: 45,
    adminAlertWhatsApp: "",
    aboutUs: "",
    gstin: "10AAAAA0000A1Z5",
    stateName: "Bihar",
    stateCode: "10",
    activeBillTemplate: "standard",
    autoPrintNewOrders: false,
    baseSalaryPerDay: 300,
    commissionPerOrder: 20,
    fuelAllowancePerDay: 50,
    maintenanceMode: false,
    enableAiSupervisor: true,
    enableOnlinePayments: true,
    enableDeliveryTracking: true,
    enablePlatformFee: true,
    enableHandlingCharge: true,
    enablePackagingFee: true,
    gsp: {
      activeProvider: "MOCK",
      mode: "SANDBOX"
    },
    enableAutoBackup: false,
    whatsappProvider: "GENERIC_WEBHOOK",
    whatsappApiKey: "",
    whatsappEndpointUrl: "",
    emailProvider: "SENDGRID",
    emailApiKey: ""
  };

  const [settings, setSettings] = useState(initialSettings);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, "settings", "config"), (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setSettings((prev) => ({
          ...prev,
          ...data,
          gsp: {
            ...prev.gsp,
            ...(data.gsp || {})
          }
        }));
      }
      setLoading(false);
    }, (err) => {
      console.warn("Failed to listen to settings config:", err);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleSave = async (e) => {
    if (e) e.preventDefault();
    setSaving(true);
    try {
      await setDoc(doc(db, "settings", "config"), {
        ...settings,
        freeDeliveryAbove: Number(settings.freeDeliveryAbove) || 0,
        deliveryCharge: Number(settings.deliveryCharge) || 0,
        lowStockThreshold: Number(settings.lowStockThreshold) || 10,
        crmHighValueLTV: Number(settings.crmHighValueLTV) || 10000,
        crmChurnRiskDays: Number(settings.crmChurnRiskDays) || 45,
        baseSalaryPerDay: Number(settings.baseSalaryPerDay) || 0,
        commissionPerOrder: Number(settings.commissionPerOrder) || 0,
        fuelAllowancePerDay: Number(settings.fuelAllowancePerDay) || 0,
        updatedAt: Timestamp.now()
      }, { merge: true });
      toast.success("Settings saved successfully!");
    } catch (error) {
      console.error("Save settings error:", error);
      toast.error("Failed to save settings: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: "store", label: "Store & Support", icon: Building2 },
    { id: "delivery", label: "Delivery & Cart", icon: Truck },
    { id: "billing", label: "Bihar GST & Invoices", icon: Package },
    { id: "riders", label: "Rider Payout Rates", icon: Bike },
    { id: "gateways", label: "Gateways & API Keys", icon: CreditCard },
    { id: "system", label: "System & Kill-Switches", icon: Sliders },
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in duration-300 pb-20">
      <PageHeader
        title="Application Configuration & ERP Settings"
        subtitle="Manage global store properties, Bihar GST tax parameters, logistics pricing, rider payouts, and API credentials."
        actions={
          <button
            onClick={handleSave}
            disabled={saving || loading}
            className="bg-[#0B4D31] hover:bg-[#083a25] text-white px-6 py-2.5 rounded-xl font-black text-xs uppercase tracking-widest shadow-md shadow-[#0B4D31]/20 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            <span>{saving ? "Saving..." : "Save Settings"}</span>
          </button>
        }
      />

      {/* Tabs Navigation */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 bg-gray-100/80 p-1.5 rounded-2xl border border-gray-200/60">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex flex-col items-center justify-center p-3 rounded-xl transition-all cursor-pointer text-center ${
                isActive
                  ? "bg-white text-[#0B4D31] shadow-sm font-black scale-[1.02]"
                  : "text-gray-600 hover:text-gray-900 hover:bg-white/50 font-bold"
              }`}
            >
              <Icon size={18} className={isActive ? "text-[#0B4D31]" : "text-gray-400 mb-1"} />
              <span className="text-xs mt-1 leading-tight">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Main Settings Form Card */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-20 text-center text-gray-400">
            <Loader2 size={32} className="animate-spin text-[#0B4D31] mx-auto mb-2" />
            <p className="text-xs font-bold">Loading configuration...</p>
          </div>
        ) : (
          <form onSubmit={handleSave} className="p-6 sm:p-10 space-y-8">
            
            {/* TAB 1: Store & Support */}
            {activeTab === "store" && (
              <div className="space-y-6 animate-in fade-in duration-200">
                <div className="border-b border-gray-100 pb-4">
                  <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
                    <Building2 className="text-[#0B4D31]" size={20} />
                    Store Profile & Support Contact
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Customer-facing contact information displayed on the KrishiVishal mobile app and website.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                      App Display Name
                    </label>
                    <input
                      type="text"
                      value={settings.appName}
                      onChange={(e) => setSettings({ ...settings, appName: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:bg-white focus:border-[#0B4D31] outline-none transition-all"
                      placeholder="KrishiVishal"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider flex items-center gap-1">
                      <PhoneCall size={12} className="text-[#0B4D31]" />
                      Customer Support Helpline
                    </label>
                    <input
                      type="tel"
                      value={settings.supportPhone}
                      onChange={(e) => setSettings({ ...settings, supportPhone: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:bg-white focus:border-[#0B4D31] outline-none transition-all"
                      placeholder="+91 98765 43210"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider flex items-center gap-1">
                      <Mail size={12} className="text-[#0B4D31]" />
                      Support Email
                    </label>
                    <input
                      type="email"
                      value={settings.supportEmail}
                      onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:bg-white focus:border-[#0B4D31] outline-none transition-all"
                      placeholder="support@krishivishal.com"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-emerald-800 uppercase tracking-wider flex items-center gap-1">
                      <MessageCircle size={12} className="text-emerald-700" />
                      Admin WhatsApp for Critical Stock Alerts
                    </label>
                    <input
                      type="tel"
                      value={settings.adminAlertWhatsApp}
                      onChange={(e) => setSettings({ ...settings, adminAlertWhatsApp: e.target.value })}
                      className="w-full px-4 py-3 bg-emerald-50/40 border border-emerald-200 rounded-xl text-xs font-bold text-emerald-950 font-mono focus:bg-white focus:border-[#0B4D31] outline-none transition-all"
                      placeholder="917763044160"
                    />
                    <p className="text-[10px] text-gray-400">
                      Emergency alerts will be sent to this number when SKU stock drops below threshold.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                      Low Stock Threshold (Units)
                    </label>
                    <input
                      type="number"
                      value={settings.lowStockThreshold}
                      onChange={(e) => setSettings({ ...settings, lowStockThreshold: Number(e.target.value) })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:bg-white focus:border-[#0B4D31] outline-none transition-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                      VIP Farmer LTV Threshold (₹)
                    </label>
                    <input
                      type="number"
                      value={settings.crmHighValueLTV}
                      onChange={(e) => setSettings({ ...settings, crmHighValueLTV: Number(e.target.value) })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:bg-white focus:border-[#0B4D31] outline-none transition-all"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                      Churn Risk Inactivity (Days)
                    </label>
                    <input
                      type="number"
                      value={settings.crmChurnRiskDays}
                      onChange={(e) => setSettings({ ...settings, crmChurnRiskDays: Number(e.target.value) })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:bg-white focus:border-[#0B4D31] outline-none transition-all"
                    />
                  </div>
                </div>

                <div className="space-y-1.5 pt-3">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                    About KrishiVishal / Company Story
                  </label>
                  <textarea
                    rows={4}
                    value={settings.aboutUs}
                    onChange={(e) => setSettings({ ...settings, aboutUs: e.target.value })}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-medium text-gray-800 focus:bg-white focus:border-[#0B4D31] outline-none transition-all leading-relaxed"
                    placeholder="KrishiVishal is Bihar's premier agricultural input supply chain platform..."
                  />
                </div>
              </div>
            )}

            {/* TAB 2: Delivery & Cart */}
            {activeTab === "delivery" && (
              <div className="space-y-6 animate-in fade-in duration-200">
                <div className="border-b border-gray-100 pb-4">
                  <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
                    <Truck className="text-[#0B4D31]" size={20} />
                    Delivery Rules & Cart Surcharges
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Configure thresholds for free shipping, delivery charges, and small convenience fees.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="space-y-1.5 p-5 bg-emerald-50/50 rounded-2xl border border-emerald-100">
                    <label className="text-[10px] font-black text-emerald-800 uppercase tracking-wider">
                      Free Delivery Minimum Cart Value (₹)
                    </label>
                    <input
                      type="number"
                      value={settings.freeDeliveryAbove}
                      onChange={(e) => setSettings({ ...settings, freeDeliveryAbove: Number(e.target.value) })}
                      className="w-full px-4 py-3 bg-white border border-emerald-200 rounded-xl text-sm font-black text-emerald-900 focus:border-[#0B4D31] outline-none transition-all"
                      placeholder="500"
                    />
                    <p className="text-[10px] text-emerald-700/70 font-medium">
                      Orders above this amount will get Free Delivery automatically at checkout.
                    </p>
                  </div>

                  <div className="space-y-1.5 p-5 bg-gray-50 rounded-2xl border border-gray-200">
                    <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider">
                      Standard Delivery Fee (₹)
                    </label>
                    <input
                      type="number"
                      value={settings.deliveryCharge}
                      onChange={(e) => setSettings({ ...settings, deliveryCharge: Number(e.target.value) })}
                      className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm font-black text-gray-900 focus:border-[#0B4D31] outline-none transition-all"
                      placeholder="50"
                    />
                    <p className="text-[10px] text-gray-400 font-medium">
                      Charged when cart subtotal is below the free delivery threshold.
                    </p>
                  </div>
                </div>

                <div className="space-y-3 pt-4">
                  <h4 className="text-xs font-black text-gray-700 uppercase tracking-wider">Cart Convenience Toggles</h4>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                      { key: "enablePlatformFee", title: "Platform Fee", desc: "Enable platform maintenance fee on cart" },
                      { key: "enableHandlingCharge", title: "Handling Charge", desc: "Apply depot handling and loading charges" },
                      { key: "enablePackagingFee", title: "Packaging Fee", desc: "Add protective packaging fee for fertilizer bags" },
                    ].map((item) => (
                      <div key={item.key} className="p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between">
                        <div>
                          <p className="text-xs font-black text-gray-900">{item.title}</p>
                          <p className="text-[10px] text-gray-400 mt-0.5">{item.desc}</p>
                        </div>
                        <input
                          type="checkbox"
                          checked={settings[item.key] !== false}
                          onChange={(e) => setSettings({ ...settings, [item.key]: e.target.checked })}
                          className="w-5 h-5 accent-[#0B4D31] rounded cursor-pointer"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: Bihar GST & Invoices */}
            {activeTab === "billing" && (
              <div className="space-y-6 animate-in fade-in duration-200">
                <div className="border-b border-gray-100 pb-4">
                  <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
                    <Package className="text-[#0B4D31]" size={20} />
                    Bihar GST Tax & Invoice Configuration
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Commercial tax registration credentials and thermal/A4 invoice templates for depot billing.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                      GSTIN Number (Bihar)
                    </label>
                    <input
                      type="text"
                      value={settings.gstin}
                      onChange={(e) => setSettings({ ...settings, gstin: e.target.value.toUpperCase() })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-black font-mono text-gray-900 focus:bg-white focus:border-[#0B4D31] outline-none transition-all"
                      placeholder="10AAAAA0000A1Z5"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                      State Name
                    </label>
                    <input
                      type="text"
                      value={settings.stateName}
                      onChange={(e) => setSettings({ ...settings, stateName: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-900 focus:bg-white focus:border-[#0B4D31] outline-none transition-all"
                      placeholder="Bihar"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                      GST State Code
                    </label>
                    <input
                      type="text"
                      value={settings.stateCode}
                      onChange={(e) => setSettings({ ...settings, stateCode: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold font-mono text-gray-900 focus:bg-white focus:border-[#0B4D31] outline-none transition-all"
                      placeholder="10"
                    />
                  </div>
                </div>

                {/* Invoice Templates */}
                <div className="space-y-3 pt-4">
                  <h4 className="text-xs font-black text-gray-700 uppercase tracking-wider">Select Bill Print Layout Template</h4>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {[
                      { id: "standard", name: "Standard Tax Invoice", desc: "Professional full-page layout with HSN breakdown." },
                      { id: "modern", name: "Modern Minimalist", desc: "Sleek card design with barcode and QR." },
                      { id: "compact", name: "Thermal POS Slip", desc: "Compact 3-inch roll print for quick dispatch." },
                      { id: "detailed", name: "Agri Compliance", desc: "Detailed batch, expiry, seed license print." },
                    ].map((tpl) => {
                      const isSelected = settings.activeBillTemplate === tpl.id;
                      return (
                        <div
                          key={tpl.id}
                          onClick={() => setSettings({ ...settings, activeBillTemplate: tpl.id })}
                          className={`p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                            isSelected
                              ? "border-[#0B4D31] bg-emerald-50/50 shadow-sm"
                              : "border-gray-100 bg-gray-50/50 hover:bg-gray-100/60"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className={`text-xs font-black ${isSelected ? "text-[#0B4D31]" : "text-gray-800"}`}>
                              {tpl.name}
                            </span>
                            {isSelected && <Check size={16} className="text-[#0B4D31]" />}
                          </div>
                          <p className="text-[10px] text-gray-400 mt-1">{tpl.desc}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Auto-Print Feature */}
                <div className="p-5 bg-blue-50/60 rounded-2xl border border-blue-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Printer className="text-blue-700" size={24} />
                    <div>
                      <h4 className="text-xs font-black text-blue-950">Auto-Print Incoming Orders at Depot</h4>
                      <p className="text-[10px] text-blue-800/80">
                        Automatically triggers browser print dialog whenever a new customer order is placed.
                      </p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.autoPrintNewOrders === true}
                    onChange={(e) => setSettings({ ...settings, autoPrintNewOrders: e.target.checked })}
                    className="w-5 h-5 accent-blue-700 rounded cursor-pointer"
                  />
                </div>
              </div>
            )}

            {/* TAB 4: Rider Payout Rates */}
            {activeTab === "riders" && (
              <div className="space-y-6 animate-in fade-in duration-200">
                <div className="border-b border-gray-100 pb-4">
                  <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
                    <Bike className="text-[#0B4D31]" size={20} />
                    Delivery Rider Compensation & Allowance Rates
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Default financial parameters used to calculate daily/weekly delivery partner payouts.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div className="p-5 bg-amber-50/50 rounded-2xl border border-amber-100 space-y-1.5">
                    <label className="text-[10px] font-black text-amber-900 uppercase tracking-wider">
                      Base Salary (Per Day ₹)
                    </label>
                    <input
                      type="number"
                      value={settings.baseSalaryPerDay}
                      onChange={(e) => setSettings({ ...settings, baseSalaryPerDay: Number(e.target.value) })}
                      className="w-full px-4 py-3 bg-white border border-amber-200 rounded-xl text-sm font-black text-amber-950 focus:border-[#0B4D31] outline-none transition-all"
                      placeholder="300"
                    />
                    <p className="text-[10px] text-amber-800/70">
                      Guaranteed daily attendance base pay for verified active shifts.
                    </p>
                  </div>

                  <div className="p-5 bg-emerald-50/50 rounded-2xl border border-emerald-100 space-y-1.5">
                    <label className="text-[10px] font-black text-emerald-900 uppercase tracking-wider">
                      Commission (Per Delivered Order ₹)
                    </label>
                    <input
                      type="number"
                      value={settings.commissionPerOrder}
                      onChange={(e) => setSettings({ ...settings, commissionPerOrder: Number(e.target.value) })}
                      className="w-full px-4 py-3 bg-white border border-emerald-200 rounded-xl text-sm font-black text-emerald-950 focus:border-[#0B4D31] outline-none transition-all"
                      placeholder="20"
                    />
                    <p className="text-[10px] text-emerald-800/70">
                      Variable incentive credited for every successful order delivery.
                    </p>
                  </div>

                  <div className="p-5 bg-purple-50/50 rounded-2xl border border-purple-100 space-y-1.5">
                    <label className="text-[10px] font-black text-purple-900 uppercase tracking-wider">
                      Fuel & Vehicle Allowance (Per Day ₹)
                    </label>
                    <input
                      type="number"
                      value={settings.fuelAllowancePerDay}
                      onChange={(e) => setSettings({ ...settings, fuelAllowancePerDay: Number(e.target.value) })}
                      className="w-full px-4 py-3 bg-white border border-purple-200 rounded-xl text-sm font-black text-purple-950 focus:border-[#0B4D31] outline-none transition-all"
                      placeholder="50"
                    />
                    <p className="text-[10px] text-purple-800/70">
                      Daily fuel and motorcycle maintenance allowance.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 5: Gateways & API Keys */}
            {activeTab === "gateways" && (
              <div className="space-y-6 animate-in fade-in duration-200">
                <div className="border-b border-gray-100 pb-4">
                  <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
                    <CreditCard className="text-[#0B4D31]" size={20} />
                    Payment Gateways & Communication Credentials
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Configure Razorpay API, WhatsApp business messaging, and transactional email integrations.
                  </p>
                </div>

                {/* Razorpay Key */}
                <div className="space-y-4 p-5 bg-gray-50 rounded-2xl border border-gray-100">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black text-gray-900 uppercase tracking-wider">Razorpay Payments</h4>
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-gray-600">Accept Cash on Delivery:</span>
                      <input
                        type="checkbox"
                        checked={settings.codAvailable !== false}
                        onChange={(e) => setSettings({ ...settings, codAvailable: e.target.checked })}
                        className="w-4 h-4 accent-[#0B4D31] rounded cursor-pointer"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                      Razorpay Key ID
                    </label>
                    <div className="relative">
                      <input
                        type={showRazorpayKey ? "text" : "password"}
                        value={settings.razorpayKey}
                        onChange={(e) => setSettings({ ...settings, razorpayKey: e.target.value })}
                        className="w-full px-4 py-3 pr-11 bg-white border border-gray-200 rounded-xl text-xs font-mono font-bold text-gray-900 focus:border-[#0B4D31] outline-none transition-all"
                        placeholder="rzp_live_xxxxxxxxxxxx"
                      />
                      <button
                        type="button"
                        onClick={() => setShowRazorpayKey(!showRazorpayKey)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 cursor-pointer p-1"
                      >
                        {showRazorpayKey ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* WhatsApp Gateway */}
                <div className="space-y-4 p-5 bg-emerald-50/40 rounded-2xl border border-emerald-100">
                  <h4 className="text-xs font-black text-emerald-950 uppercase tracking-wider flex items-center gap-2">
                    <MessageCircle size={16} className="text-emerald-700" />
                    WhatsApp Gateway (Order & OTP Dispatch)
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                        Provider
                      </label>
                      <select
                        value={settings.whatsappProvider || "GENERIC_WEBHOOK"}
                        onChange={(e) => setSettings({ ...settings, whatsappProvider: e.target.value })}
                        className="w-full px-4 py-3 bg-white border border-emerald-200 rounded-xl text-xs font-bold text-gray-900 focus:border-[#0B4D31] outline-none cursor-pointer"
                      >
                        <option value="GENERIC_WEBHOOK">Custom Generic Webhook</option>
                        <option value="WATI">Wati Business API</option>
                        <option value="TWILIO">Twilio Programmable SMS/WA</option>
                        <option value="INTERAKT">Interakt API</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                        API Key / Access Token
                      </label>
                      <div className="relative">
                        <input
                          type={showWhatsAppKey ? "text" : "password"}
                          value={settings.whatsappApiKey}
                          onChange={(e) => setSettings({ ...settings, whatsappApiKey: e.target.value })}
                          className="w-full px-4 py-3 pr-11 bg-white border border-emerald-200 rounded-xl text-xs font-mono font-bold text-gray-900 focus:border-[#0B4D31] outline-none"
                          placeholder="Bearer token..."
                        />
                        <button
                          type="button"
                          onClick={() => setShowWhatsAppKey(!showWhatsAppKey)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 cursor-pointer p-1"
                        >
                          {showWhatsAppKey ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>

                    {settings.whatsappProvider === "GENERIC_WEBHOOK" && (
                      <div className="space-y-1.5 md:col-span-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                          Webhook Endpoint URL
                        </label>
                        <input
                          type="url"
                          value={settings.whatsappEndpointUrl}
                          onChange={(e) => setSettings({ ...settings, whatsappEndpointUrl: e.target.value })}
                          className="w-full px-4 py-3 bg-white border border-emerald-200 rounded-xl text-xs font-mono font-bold text-gray-900 focus:border-[#0B4D31] outline-none"
                          placeholder="https://api.krishivishal.com/webhook/whatsapp"
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Email Gateway */}
                <div className="space-y-4 p-5 bg-blue-50/40 rounded-2xl border border-blue-100">
                  <h4 className="text-xs font-black text-blue-950 uppercase tracking-wider flex items-center gap-2">
                    <Mail size={16} className="text-blue-700" />
                    Transactional Email Gateway (SendGrid / AWS SES)
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                        Email Provider
                      </label>
                      <select
                        value={settings.emailProvider || "SENDGRID"}
                        onChange={(e) => setSettings({ ...settings, emailProvider: e.target.value })}
                        className="w-full px-4 py-3 bg-white border border-blue-200 rounded-xl text-xs font-bold text-gray-900 focus:border-[#0B4D31] outline-none cursor-pointer"
                      >
                        <option value="SENDGRID">Twilio SendGrid</option>
                        <option value="AWS_SES">Amazon Simple Email Service (SES)</option>
                        <option value="SMTP">Standard SMTP Server</option>
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-wider">
                        Email API Key
                      </label>
                      <div className="relative">
                        <input
                          type={showEmailKey ? "text" : "password"}
                          value={settings.emailApiKey}
                          onChange={(e) => setSettings({ ...settings, emailApiKey: e.target.value })}
                          className="w-full px-4 py-3 pr-11 bg-white border border-blue-200 rounded-xl text-xs font-mono font-bold text-gray-900 focus:border-[#0B4D31] outline-none"
                          placeholder="SG.xxxxxxxxxxxx"
                        />
                        <button
                          type="button"
                          onClick={() => setShowEmailKey(!showEmailKey)}
                          className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700 cursor-pointer p-1"
                        >
                          {showEmailKey ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 6: System & Kill-Switches */}
            {activeTab === "system" && (
              <div className="space-y-6 animate-in fade-in duration-200">
                <div className="border-b border-gray-100 pb-4">
                  <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
                    <Sliders className="text-[#0B4D31]" size={20} />
                    System Flags & Emergency Kill-Switches
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Critical operational controls, maintenance switches, and automated backup schedules.
                  </p>
                </div>

                {/* Emergency Maintenance Mode */}
                <div className="p-6 bg-rose-50 rounded-3xl border-2 border-rose-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-rose-100 text-rose-700 rounded-xl">
                        <AlertTriangle size={24} />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-rose-950 uppercase tracking-wide">
                          Emergency Maintenance Mode
                        </h4>
                        <p className="text-[11px] text-rose-800/80 font-medium">
                          When active, the Customer Mobile App and Delivery App will pause and show a maintenance message.
                        </p>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.maintenanceMode === true}
                      onChange={(e) => setSettings({ ...settings, maintenanceMode: e.target.checked })}
                      className="w-6 h-6 accent-rose-600 rounded cursor-pointer"
                    />
                  </div>
                </div>

                {/* Standard Feature Toggles */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-5 bg-gray-50 rounded-2xl border border-gray-200 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Bot className="text-[#0B4D31]" size={20} />
                      <div>
                        <h4 className="text-xs font-black text-gray-900">AI Supervisor System</h4>
                        <p className="text-[10px] text-gray-500">Autonomous stock restocking and anomaly detection.</p>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.enableAiSupervisor !== false}
                      onChange={(e) => setSettings({ ...settings, enableAiSupervisor: e.target.checked })}
                      className="w-5 h-5 accent-[#0B4D31] rounded cursor-pointer"
                    />
                  </div>

                  <div className="p-5 bg-gray-50 rounded-2xl border border-gray-200 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Radio className="text-blue-600" size={20} />
                      <div>
                        <h4 className="text-xs font-black text-gray-900">Live GPS Fleet Tracking</h4>
                        <p className="text-[10px] text-gray-500">Real-time rider coordinate broadcasting on maps.</p>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.enableDeliveryTracking !== false}
                      onChange={(e) => setSettings({ ...settings, enableDeliveryTracking: e.target.checked })}
                      className="w-5 h-5 accent-blue-600 rounded cursor-pointer"
                    />
                  </div>

                  <div className="p-5 bg-gray-50 rounded-2xl border border-gray-200 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <CreditCard className="text-purple-600" size={20} />
                      <div>
                        <h4 className="text-xs font-black text-gray-900">Online Payments (Razorpay/UPI)</h4>
                        <p className="text-[10px] text-gray-500">Allow customers to pay digitally via QR & UPI.</p>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.enableOnlinePayments !== false}
                      onChange={(e) => setSettings({ ...settings, enableOnlinePayments: e.target.checked })}
                      className="w-5 h-5 accent-purple-600 rounded cursor-pointer"
                    />
                  </div>

                  <div className="p-5 bg-gray-50 rounded-2xl border border-gray-200 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Bell className="text-amber-600" size={20} />
                      <div>
                        <h4 className="text-xs font-black text-gray-900">Automated Daily Backups</h4>
                        <p className="text-[10px] text-gray-500">Automated Firestore snapshot to Cloud Storage.</p>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={settings.enableAutoBackup === true}
                      onChange={(e) => setSettings({ ...settings, enableAutoBackup: e.target.checked })}
                      className="w-5 h-5 accent-amber-600 rounded cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Bottom Persistent Action Bar */}
            <div className="pt-6 border-t border-gray-100 flex items-center justify-between">
              <span className="text-[11px] text-gray-400 font-medium">
                Last updated: {settings.updatedAt?.toDate ? settings.updatedAt.toDate().toLocaleString("en-IN") : "Recent"}
              </span>

              <button
                type="submit"
                disabled={saving}
                className="bg-[#0B4D31] hover:bg-[#083a25] text-white px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-[#0B4D31]/20 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                <span>{saving ? "Saving Changes..." : "Save All Settings"}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
