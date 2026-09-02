import React, { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc, Timestamp, collection, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../firebase/config';
import { Settings as SettingsIcon, Save, Truck, CreditCard, ShieldCheck, Info, Bell, Trash2, UserPlus, HelpCircle, AlertTriangle, Package, MessageCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import ConfirmDialog from '../components/common/ConfirmDialog';

const Settings = () => {
  const [activeTab, setActiveTab] = useState('general');
  const [isDeleting, setIsDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [settings, setSettings] = useState({
    appName: 'KrishiVishal',
    supportPhone: '',
    supportEmail: '',
    freeDeliveryAbove: 500,
    deliveryCharge: 50,
    codAvailable: true,
    razorpayKey: '',
    lowStockThreshold: 10,
    crmHighValueLTV: 10000,
    crmChurnRiskDays: 45,
    adminAlertWhatsApp: '',
    aboutUs: '',
    gstin: '10AAAAA0000A1Z5',
    stateName: 'Bihar',
    stateCode: '10',
    activeBillTemplate: 'standard',
    autoPrintNewOrders: false,
    baseSalaryPerDay: 300,
    commissionPerOrder: 20,
    fuelAllowancePerDay: 50,
    maintenanceMode: false,
    enableAiSupervisor: true,
    enableOnlinePayments: true,
    enableDeliveryTracking: true,
    gsp: {
        activeProvider: 'MOCK',
        mode: 'SANDBOX'
    }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, 'settings', 'config'), (snapshot) => {
      if (snapshot.exists()) setSettings(snapshot.data());
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      await setDoc(doc(db, 'settings', 'config'), {
        ...settings,
        updatedAt: Timestamp.now()
      });
      toast.success('Settings updated successfully!');
    } catch (error) {
      toast.error('Failed to save');
    }
  };

  const handleClearProducts = async () => {
    setIsDeleting(true);
    setShowConfirm(false);
    try {
      const querySnapshot = await getDocs(collection(db, 'products'));
      const batch = writeBatch(db);
      querySnapshot.forEach((doc) => {
        batch.delete(doc.ref);
      });
      await batch.commit();
      toast.success('Inventory cleared successfully!');
    } catch (error) {
      console.error(error);
      toast.error('Failed to clear inventory');
    } finally {
      setIsDeleting(false);
    }
  };

  const tabs = [
    { id: 'general', label: 'General', icon: <Info size={18} /> },
    { id: 'delivery', label: 'Logistics', icon: <Truck size={18} /> },
    { id: 'payments', label: 'Payments', icon: <CreditCard size={18} /> },
    { id: 'billing', label: 'Bihar GST & Billing', icon: <Package size={18} /> },
    { id: 'gsp', label: 'Compliance & GSP', icon: <ShieldCheck size={18} /> },
    { id: 'inventory', label: 'Inventory Tools', icon: <Trash2 size={18} /> },
    { id: 'feature_flags', label: 'Feature Flags', icon: <ShieldCheck size={18} /> },
    { id: 'app_content', label: 'Legal & Info', icon: <Info size={18} /> },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-10 animate-in fade-in duration-500 pb-20">
      <ConfirmDialog
        isOpen={showConfirm}
        title="Wipe Entire Inventory?"
        message="This will permanently delete ALL products from your database. This action cannot be undone. Are you absolutely sure?"
        onConfirm={handleClearProducts}
        onCancel={() => setShowConfirm(false)}
        type="danger"
      />
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center">
            <SettingsIcon className="mr-3 text-primary" size={28} />
            System Configuration
          </h1>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-11">Manage global application behaviors</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-10">
        {/* Navigation Tabs */}
        <aside className="lg:w-64 space-y-2">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`w-full flex items-center space-x-3 px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest transition-all ${
                activeTab === tab.id
                  ? 'bg-primary text-white shadow-xl shadow-green-100 scale-[1.02]'
                  : 'bg-white text-gray-400 hover:bg-gray-50 border border-gray-100'
              }`}
            >
              {tab.icon}
              <span>{tab.label}</span>
            </button>
          ))}
        </aside>

        {/* Form Content */}
        <div className="flex-1 bg-white rounded-[2.5rem] shadow-2xl shadow-green-100/30 border border-gray-50 overflow-hidden">
          <form onSubmit={handleSave} className="flex flex-col h-full">
            <div className="p-10 flex-1 space-y-10">
              {activeTab === 'general' && (
                <div className="space-y-8 animate-in slide-in-from-bottom-2">
                  <h2 className="text-lg font-black text-gray-900 uppercase tracking-tighter flex items-center border-b pb-4">
                    <div className="h-8 w-1 bg-primary mr-3 rounded-full" />
                    Global Info
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">App Display Name</label>
                      <input
                        value={settings.appName}
                        onChange={(e) => setSettings({...settings, appName: e.target.value})}
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-black text-gray-900"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Support Email</label>
                      <input
                        type="email"
                        value={settings.supportEmail}
                        onChange={(e) => setSettings({...settings, supportEmail: e.target.value})}
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-gray-900"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Support Hotline</label>
                      <input
                        value={settings.supportPhone}
                        onChange={(e) => setSettings({...settings, supportPhone: e.target.value})}
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-black text-gray-900"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest ml-1 flex items-center">
                        <MessageCircle size={10} className="mr-1" /> Admin Alert WhatsApp
                      </label>
                      <input
                        value={settings.adminAlertWhatsApp}
                        onChange={(e) => setSettings({...settings, adminAlertWhatsApp: e.target.value})}
                        className="w-full px-6 py-4 bg-blue-50/30 border border-blue-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-black text-gray-900"
                        placeholder="e.g. 917763044160"
                      />
                      <p className="text-[8px] text-gray-400 font-bold uppercase ml-1 tracking-tighter italic">* This number will receive Low Stock alerts</p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Low Stock Threshold</label>
                      <input
                        type="number"
                        value={settings.lowStockThreshold}
                        onChange={(e) => setSettings({...settings, lowStockThreshold: Number(e.target.value)})}
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-black text-gray-900"
                      />
                    </div>
                  </div>

                  <h2 className="text-lg font-black text-gray-900 uppercase tracking-tighter flex items-center border-b pb-4 mt-12">
                    <div className="h-8 w-1 bg-amber-500 mr-3 rounded-full" />
                    CRM Business Intelligence Threholds
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-amber-600 uppercase tracking-widest ml-1">High Value Farmer LTV (₹)</label>
                      <input
                        type="number"
                        value={settings.crmHighValueLTV}
                        onChange={(e) => setSettings({...settings, crmHighValueLTV: Number(e.target.value)})}
                        className="w-full px-6 py-4 bg-amber-50/20 border border-amber-100 rounded-2xl focus:ring-4 focus:ring-amber-500/5 focus:border-amber-500 outline-none transition-all font-black text-gray-900"
                      />
                      <p className="text-[8px] text-gray-400 font-bold uppercase ml-1 tracking-tighter italic">* Minimum spend to be marked as VIP</p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-orange-600 uppercase tracking-widest ml-1">Churn Risk Duration (Days)</label>
                      <input
                        type="number"
                        value={settings.crmChurnRiskDays}
                        onChange={(e) => setSettings({...settings, crmChurnRiskDays: Number(e.target.value)})}
                        className="w-full px-6 py-4 bg-orange-50/20 border border-orange-100 rounded-2xl focus:ring-4 focus:ring-orange-500/5 focus:border-orange-500 outline-none transition-all font-black text-gray-900"
                      />
                      <p className="text-[8px] text-gray-400 font-bold uppercase ml-1 tracking-tighter italic">* Inactivity period before churn alert</p>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'delivery' && (
                <div className="space-y-8 animate-in slide-in-from-bottom-2">
                  <h2 className="text-lg font-black text-gray-900 uppercase tracking-tighter flex items-center border-b pb-4">
                    <div className="h-8 w-1 bg-primary mr-3 rounded-full" />
                    Delivery Rules
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Free Delivery Minimum (₹)</label>
                      <input
                        type="number"
                        value={settings.freeDeliveryAbove}
                        onChange={(e) => setSettings({...settings, freeDeliveryAbove: Number(e.target.value)})}
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-green-500/5 focus:border-primary outline-none transition-all font-black text-primary-dark"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Base Delivery Fee (₹)</label>
                      <input
                        type="number"
                        value={settings.deliveryCharge}
                        onChange={(e) => setSettings({...settings, deliveryCharge: Number(e.target.value)})}
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-black text-gray-900"
                      />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'payments' && (
                <div className="space-y-8 animate-in slide-in-from-bottom-2">
                  <h2 className="text-lg font-black text-gray-900 uppercase tracking-tighter flex items-center border-b pb-4">
                    <div className="h-8 w-1 bg-primary mr-3 rounded-full" />
                    Gateway Credentials
                  </h2>
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Razorpay Key ID</label>
                      <input
                        type="password"
                        value={settings.razorpayKey}
                        onChange={(e) => setSettings({...settings, razorpayKey: e.target.value})}
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-mono text-sm tracking-widest"
                        placeholder="rzp_live_••••••••••••"
                      />
                    </div>
                    <div className="flex items-center justify-between bg-gray-50 p-6 rounded-3xl border border-gray-100 shadow-inner">
                      <div className="flex items-center space-x-3">
                        <div className={`h-6 w-11 rounded-full transition-all duration-300 relative cursor-pointer ${settings.codAvailable ? 'bg-primary' : 'bg-gray-300'}`}
                          onClick={() => setSettings({...settings, codAvailable: !settings.codAvailable})}>
                          <div className={`h-4 w-4 bg-white rounded-full absolute top-1 transition-all duration-300 ${settings.codAvailable ? 'left-6' : 'left-1'}`} />
                        </div>
                        <span className="text-sm font-black text-gray-700 uppercase tracking-widest leading-none">Accept Cash on Delivery</span>
                      </div>
                      <HelpCircle size={18} className="text-gray-300 cursor-help" />
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'billing' && (
                <div className="space-y-10 animate-in slide-in-from-bottom-2">
                  <h2 className="text-lg font-black text-gray-900 uppercase tracking-tighter flex items-center border-b pb-4">
                    <div className="h-8 w-1 bg-primary mr-3 rounded-full" />
                    GST & Invoice Configuration (Bihar)
                  </h2>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">GSTIN Number</label>
                      <input
                        value={settings.gstin}
                        onChange={(e) => setSettings({...settings, gstin: e.target.value.toUpperCase()})}
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-black text-gray-900"
                        placeholder="10XXXXXXXXXXXXX"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">State Name</label>
                      <input
                        value={settings.stateName}
                        onChange={(e) => setSettings({...settings, stateName: e.target.value})}
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-gray-900"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">State Code</label>
                      <input
                        value={settings.stateCode}
                        onChange={(e) => setSettings({...settings, stateCode: e.target.value})}
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-black text-gray-900"
                      />
                    </div>
                  </div>

                  <div className="space-y-6">
                    <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest">Select Invoice Template</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {[
                        { id: 'standard', name: 'Standard (Official)', desc: 'Professional multi-color Bihar trade layout.' },
                        { id: 'modern', name: 'Modern UI', desc: 'Sleek design with gradient headers.' },
                        { id: 'compact', name: 'Compact', desc: 'Minimalist view for paper billing.' },
                        { id: 'elegant', name: 'Elegant Dark', desc: 'Premium style for high-end receipts.' },
                        { id: 'detailed', name: 'Detailed Tax', desc: 'Includes HSN/SAC and full tax split.' }
                      ].map(tpl => (
                        <div
                          key={tpl.id}
                          onClick={() => setSettings({...settings, activeBillTemplate: tpl.id})}
                          className={`p-6 rounded-[1.5rem] border-2 cursor-pointer transition-all ${
                            settings.activeBillTemplate === tpl.id
                            ? 'border-primary bg-green-50/50 ring-4 ring-primary/5'
                            : 'border-gray-100 bg-white hover:border-gray-200'
                          }`}
                        >
                          <div className="flex justify-between items-start mb-2">
                             <span className={`font-black text-xs uppercase tracking-tighter ${settings.activeBillTemplate === tpl.id ? 'text-primary' : 'text-gray-900'}`}>
                               {tpl.name}
                             </span>
                             {settings.activeBillTemplate === tpl.id && <div className="h-2 w-2 bg-primary rounded-full animate-pulse" />}
                          </div>
                          <p className="text-[10px] font-bold text-gray-400 leading-relaxed uppercase tracking-widest">{tpl.desc}</p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-10 p-8 bg-blue-50/50 rounded-[2rem] border border-blue-100 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="space-y-1">
                          <h4 className="text-sm font-black text-blue-800 uppercase tracking-widest">Auto-Print New Orders</h4>
                          <p className="text-[10px] font-bold text-blue-700/60 uppercase tracking-widest">Automatically triggers shipping label print for incoming orders.</p>
                        </div>
                        <div
                          onClick={() => setSettings({...settings, autoPrintNewOrders: !settings.autoPrintNewOrders})}
                          className={`h-6 w-11 rounded-full transition-all duration-300 relative cursor-pointer ${settings.autoPrintNewOrders ? 'bg-blue-600' : 'bg-gray-300'}`}
                        >
                          <div className={`h-4 w-4 bg-white rounded-full absolute top-1 transition-all duration-300 ${settings.autoPrintNewOrders ? 'left-6' : 'left-1'}`} />
                        </div>
                      </div>
                      <div className="flex items-start space-x-2 text-[10px] text-blue-600 font-bold uppercase tracking-tight italic">
                        <Info size={12} className="shrink-0 mt-0.5" />
                        <span>Note: For a truly hands-free experience, launch Chrome with <code className="bg-blue-100 px-1">--kiosk-printing</code> flag.</span>
                      </div>
                    </div>

                    <div className="mt-10 p-8 bg-orange-50/50 rounded-[2rem] border border-orange-100 space-y-8">
                        <h4 className="text-sm font-black text-orange-800 uppercase tracking-widest flex items-center">
                            <Truck size={18} className="mr-2" />
                            Rider Payout Defaults
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="space-y-2">
                                <label className="text-[9px] font-black text-orange-400 uppercase tracking-widest ml-1">Base Salary (Per Day)</label>
                                <input
                                    type="number"
                                    value={settings.baseSalaryPerDay}
                                    onChange={(e) => setSettings({...settings, baseSalaryPerDay: Number(e.target.value)})}
                                    className="w-full px-4 py-3 bg-white border border-orange-100 rounded-xl outline-none font-bold text-orange-900"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[9px] font-black text-orange-400 uppercase tracking-widest ml-1">Commission (Per Order)</label>
                                <input
                                    type="number"
                                    value={settings.commissionPerOrder}
                                    onChange={(e) => setSettings({...settings, commissionPerOrder: Number(e.target.value)})}
                                    className="w-full px-4 py-3 bg-white border border-orange-100 rounded-xl outline-none font-bold text-orange-900"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-[9px] font-black text-orange-400 uppercase tracking-widest ml-1">Fuel Allowance (Per Day)</label>
                                <input
                                    type="number"
                                    value={settings.fuelAllowancePerDay}
                                    onChange={(e) => setSettings({...settings, fuelAllowancePerDay: Number(e.target.value)})}
                                    className="w-full px-4 py-3 bg-white border border-orange-100 rounded-xl outline-none font-bold text-orange-900"
                                />
                            </div>
                        </div>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'gsp' && (
                <div className="space-y-10 animate-in slide-in-from-bottom-2">
                  <h2 className="text-lg font-black text-gray-900 uppercase tracking-tighter flex items-center border-b pb-4">
                    <div className="h-8 w-1 bg-purple-500 mr-3 rounded-full" />
                    Government GSP Integration
                  </h2>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Active Provider</label>
                      <select
                        value={settings.gsp?.activeProvider}
                        onChange={(e) => setSettings({...settings, gsp: { ...settings.gsp, activeProvider: e.target.value }})}
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-black text-gray-900 appearance-none"
                      >
                        <option value="MOCK">MOCK (Safe Sandbox)</option>
                        <option value="CLEARTAX">ClearTax (Production Ready)</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Environment Mode</label>
                      <select
                        value={settings.gsp?.mode}
                        onChange={(e) => setSettings({...settings, gsp: { ...settings.gsp, mode: e.target.value }})}
                        className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-black text-gray-900 appearance-none"
                      >
                        <option value="SANDBOX">SANDBOX (Testing)</option>
                        <option value="PRODUCTION">PRODUCTION (Live Government Portal)</option>
                      </select>
                    </div>
                  </div>

                  <div className="bg-orange-50 p-6 rounded-[2rem] border border-orange-100 flex items-center space-x-4">
                    <AlertTriangle className="text-orange-500" size={24} />
                    <p className="text-[10px] font-bold text-orange-800 uppercase tracking-widest leading-relaxed italic">
                      Switching to PRODUCTION mode with ClearTax requires valid API tokens in Secret Manager. MOCK is strictly prohibited in live environment.
                    </p>
                  </div>
                </div>
              )}

              {activeTab === 'inventory' && (
                <div className="space-y-10 animate-in slide-in-from-bottom-2">
                  <h2 className="text-lg font-black text-gray-900 uppercase tracking-tighter flex items-center border-b pb-4">
                    <div className="h-8 w-1 bg-red-500 mr-3 rounded-full" />
                    Inventory Maintenance
                  </h2>

                  <div className="bg-red-50 p-8 rounded-[2rem] border border-red-100 flex flex-col md:flex-row items-center justify-between gap-6 shadow-inner">
                    <div className="flex items-start space-x-4">
                      <div className="p-3 bg-white rounded-2xl text-red-500 shadow-sm">
                        <AlertTriangle size={24} />
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-red-800 uppercase tracking-widest mb-1">Clear Entire Catalog</h4>
                        <p className="text-xs font-bold text-red-700/60 leading-relaxed max-w-md">
                          Use this only if you uploaded a wrong bulk list. This will delete all products from Firestore instantly.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      disabled={isDeleting}
                      onClick={() => setShowConfirm(true)}
                      className="bg-red-500 text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-red-100 hover:bg-red-600 transition-all active:scale-95 disabled:opacity-50"
                    >
                      {isDeleting ? 'Wiping Database...' : 'Flush Inventory'}
                    </button>
                  </div>

                  <div className="bg-gray-50 p-6 rounded-[2rem] border border-gray-100 flex items-center space-x-4">
                    <Info className="text-gray-400" size={20} />
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-relaxed italic">
                      Tip: Individual products can still be deleted from the Products dashboard using the trash icon.
                    </p>
                  </div>
                </div>
              )}

              {activeTab === 'feature_flags' && (
                <div className="space-y-10 animate-in slide-in-from-bottom-2">
                  <h2 className="text-lg font-black text-gray-900 uppercase tracking-tighter flex items-center border-b pb-4">
                    <div className="h-8 w-1 bg-blue-500 mr-3 rounded-full" />
                    Feature Flags & Kill Switches
                  </h2>

                  <div className="space-y-6">
                    <div className="bg-red-50 p-6 rounded-3xl border border-red-100 flex items-center justify-between shadow-inner">
                      <div className="flex items-center space-x-4">
                        <AlertTriangle className="text-red-500" />
                        <div>
                          <h4 className="text-sm font-black text-red-800 uppercase tracking-widest">Maintenance Mode</h4>
                          <p className="text-[10px] font-bold text-red-700/60 uppercase tracking-widest">Disables all apps for emergency maintenance.</p>
                        </div>
                      </div>
                      <div
                        onClick={() => setSettings({...settings, maintenanceMode: !settings.maintenanceMode})}
                        className={`h-6 w-11 rounded-full transition-all duration-300 relative cursor-pointer ${settings.maintenanceMode ? 'bg-red-600' : 'bg-gray-300'}`}
                      >
                        <div className={`h-4 w-4 bg-white rounded-full absolute top-1 transition-all duration-300 ${settings.maintenanceMode ? 'left-6' : 'left-1'}`} />
                      </div>
                    </div>

                    {[
                      { key: 'enableAiSupervisor', label: 'AI Supervisor System', desc: 'Toggle AI-driven inventory and support modules.' },
                      { key: 'enableOnlinePayments', label: 'Razorpay Integration', desc: 'Allow users to pay online via UPI/Cards.' },
                      { key: 'enableDeliveryTracking', label: 'Real-time Tracking', desc: 'Enable GPS tracking for delivery partners.' }
                    ].map(flag => (
                      <div key={flag.key} className="bg-gray-50 p-6 rounded-3xl border border-gray-100 flex items-center justify-between transition-all hover:bg-white hover:shadow-md">
                        <div className="space-y-1">
                          <h4 className="text-sm font-black text-gray-800 uppercase tracking-widest">{flag.label}</h4>
                          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{flag.desc}</p>
                        </div>
                        <div
                          onClick={() => setSettings({...settings, [flag.key]: !settings[flag.key]})}
                          className={`h-6 w-11 rounded-full transition-all duration-300 relative cursor-pointer ${settings[flag.key] ? 'bg-primary' : 'bg-gray-300'}`}
                        >
                          <div className={`h-4 w-4 bg-white rounded-full absolute top-1 transition-all duration-300 ${settings[flag.key] ? 'left-6' : 'left-1'}`} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'app_content' && (
                <div className="space-y-8 animate-in slide-in-from-bottom-2">
                  <h2 className="text-lg font-black text-gray-900 uppercase tracking-tighter flex items-center border-b pb-4">
                    <div className="h-8 w-1 bg-primary mr-3 rounded-full" />
                    Application Content
                  </h2>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">About KrishiVishal</label>
                    <textarea
                      rows="6"
                      value={settings.aboutUs}
                      onChange={(e) => setSettings({...settings, aboutUs: e.target.value})}
                      className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-3xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-medium text-gray-700 leading-relaxed shadow-inner"
                      placeholder="Write company biography..."
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="p-8 bg-gray-50/50 border-t border-gray-50 backdrop-blur sticky bottom-0 z-10">
              <button
                type="submit"
                className="w-full bg-[#1b5e20] text-white py-5 rounded-3xl font-black text-sm uppercase tracking-[0.3em] shadow-2xl shadow-green-200 hover:bg-[#2e7d32] transition-all flex items-center justify-center space-x-3 active:scale-[0.98]"
              >
                <Save size={20} />
                <span>Save All Changes</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Settings;
