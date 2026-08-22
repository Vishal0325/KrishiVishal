import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, getDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import DataTable from '../components/common/DataTable';
import { Users, Search, Phone, MapPin, Calendar, CreditCard, ChevronRight, X, UserCircle, MessageCircle } from 'lucide-react';
import { formatCurrency, formatDate } from '../utils/formatters';

const Customers = () => {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  useEffect(() => {
    const q = query(collection(db, 'users'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allUsers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      // IMPROVED FILTER: A farmer is someone who is NOT an admin and NOT a rider/staff
      const farmersOnly = allUsers.filter(u => {
        const isAdmin = u.isAdmin === true || String(u.isAdmin).toLowerCase() === "true";
        const isStaffOrRider = ['SuperAdmin', 'CatalogManager', 'OrderManager', 'RIDER'].includes(u.role);
        return !isAdmin && !isStaffOrRider;
      });
      setCustomers(farmersOnly);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const filteredCustomers = customers.filter(c => {
    const search = searchTerm.toLowerCase();
    return (
      (c.name || "").toLowerCase().includes(search) ||
      (c.phone || "").includes(searchTerm) || // Direct phone matching
      (c.email || "").toLowerCase().includes(search)
    );
  });

  const columns = [
    { header: 'Customer', render: (c) => (
      <div className="flex items-center space-x-3">
        <div className="h-10 w-10 bg-primary-dark/10 text-primary-dark rounded-full flex items-center justify-center font-black text-sm border border-primary/10">
          {c.name?.charAt(0).toUpperCase() || 'U'}
        </div>
        <div className="flex flex-col">
          <span className="font-black text-gray-900 tracking-tight leading-none mb-1">{c.name || 'Anonymous User'}</span>
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest leading-none">{c.email || 'No email'}</span>
        </div>
      </div>
    )},
    { header: 'Contact', render: (c) => (
      <div className="flex flex-col">
        <span className="font-bold text-gray-700 text-sm">{c.phone || '-'}</span>
      </div>
    )},
    { header: 'Location', render: (c) => (
      <span className="text-gray-500 font-medium text-xs">{(c.state || 'N/A') + (c.district ? `, ${c.district}` : '')}</span>
    )},
    { header: 'Joined', render: (c) => <span className="text-gray-400 font-bold text-xs">{formatDate(c.createdAt)}</span> },
    { header: 'Status', render: (c) => (
      <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter bg-green-100 text-green-700">
        Verified Farmer
      </span>
    )}
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center">
          <Users className="mr-3 text-primary" size={28} />
          Farmers Database
        </h1>
      </div>

      <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 flex items-center group">
        <Search className="absolute left-12 text-gray-400 group-focus-within:text-primary transition-colors" size={20} />
        <input
          type="text"
          placeholder="Search by name, phone or email..."
          value={searchTerm}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-12 pr-6 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary focus:bg-white outline-none text-sm transition-all font-medium"
        />
      </div>

      <DataTable columns={columns} data={filteredCustomers} loading={loading} onRowClick={(c) => setSelectedCustomer(c)} />

      {/* Side Panel for Customer Detail */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="w-full max-w-md h-screen bg-white shadow-2xl animate-in slide-in-from-right duration-500 overflow-y-auto">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white/95 backdrop-blur z-10">
              <h2 className="text-lg font-black text-gray-900 uppercase tracking-widest">Farmer Profile</h2>
              <button onClick={() => setSelectedCustomer(null)} className="p-2 hover:bg-gray-100 rounded-full transition-all text-gray-400">
                <X size={24} />
              </button>
            </div>

            <div className="p-8 space-y-10">
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="h-24 w-24 bg-[#f0f4f0] rounded-3xl flex items-center justify-center text-primary-dark border-4 border-white shadow-xl relative overflow-hidden group">
                  <div className="absolute inset-0 bg-primary/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                  <UserCircle size={64} className="relative z-10" strokeWidth={1} />
                </div>
                <div>
                  <h3 className="text-2xl font-black text-gray-900 tracking-tight leading-none">{selectedCustomer.name || 'Anonymous'}</h3>
                  <p className="text-sm text-primary font-bold mt-2 uppercase tracking-widest">Customer ID: {selectedCustomer.id.substring(0, 8)}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-1">
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Mobile Number</p>
                  <p className="text-sm font-black text-gray-900 flex items-center"><Phone size={14} className="mr-2 text-primary" /> {selectedCustomer.phone || '-'}</p>
                </div>
                <div className="bg-gray-50 p-4 rounded-2xl border border-gray-100 space-y-1">
                  <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Registration</p>
                  <p className="text-sm font-black text-gray-900 flex items-center"><Calendar size={14} className="mr-2 text-primary" /> {formatDate(selectedCustomer.createdAt)}</p>
                </div>
              </div>

              <section className="space-y-4">
                <div className="flex items-center space-x-2 text-primary-dark">
                  <MapPin size={18} />
                  <h4 className="text-xs font-black uppercase tracking-widest">Address Information</h4>
                </div>
                <div className="bg-gray-50/50 p-6 rounded-2xl border border-gray-100 space-y-4 shadow-inner">
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-xs font-bold text-gray-400 uppercase tracking-tighter">State</span>
                      <span className="text-sm font-black text-gray-700">{selectedCustomer.state || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-xs font-bold text-gray-400 uppercase tracking-tighter">District</span>
                      <span className="text-sm font-black text-gray-700">{selectedCustomer.district || '-'}</span>
                    </div>
                  </div>
                </div>
              </section>

              <div className="pt-6 space-y-3">
                <a
                  href={`https://wa.me/91${selectedCustomer.phone?.replace(/\D/g, '')}?text=${encodeURIComponent(`Namaste ${selectedCustomer.name}, KrishiVishal se baat ho rahi hai.`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full bg-[#1b5e20] text-white py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-green-100 hover:bg-[#2e7d32] transition-all active:scale-[0.98] flex items-center justify-center space-x-2"
                >
                  <MessageCircle size={18} />
                  <span>WhatsApp Message</span>
                </a>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Customers;
