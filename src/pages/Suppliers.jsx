import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, Timestamp, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';
import DataTable from '../components/common/DataTable';
import { addAuditLog } from '../services/logger';
import {
  Search, Plus, Edit2, Trash2, X, Factory, Phone, Mail, MapPin,
  Building2, CreditCard, Clock, CheckCircle2, XCircle, Loader2, FileText
} from 'lucide-react';
import toast from 'react-hot-toast';

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

const PAYMENT_TERMS_OPTIONS = [
  { value: 'COD', label: 'Cash on Delivery' },
  { value: 'NET_7', label: 'Net 7 Days' },
  { value: 'NET_15', label: 'Net 15 Days' },
  { value: 'NET_30', label: 'Net 30 Days' },
  { value: 'ADVANCE', label: 'Advance Payment' },
];

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
  'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
  'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
  'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Delhi', 'Jammu & Kashmir', 'Ladakh',
];

const EMPTY_FORM = {
  name: '',
  contactPerson: '',
  phone: '',
  email: '',
  gstin: '',
  address: { street: '', district: '', state: 'Bihar', pincode: '' },
  paymentTerms: 'NET_15',
  bankDetails: { bankName: '', accountNo: '', ifsc: '' },
  leadTimeDays: 2,
  status: 'ACTIVE',
};

const Suppliers = () => {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({ ...EMPTY_FORM });
  const [gstinError, setGstinError] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'suppliers'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setSuppliers(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (error) => {
      console.error('Suppliers listener error:', error);
      toast.error('Failed to load suppliers');
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const validateGstin = (value) => {
    if (!value) { setGstinError(''); return true; }
    if (!GSTIN_REGEX.test(value)) {
      setGstinError('Invalid GSTIN format (e.g. 10ABCDE1234F1Z5)');
      return false;
    }
    setGstinError('');
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.gstin && !validateGstin(formData.gstin)) return;

    setSaving(true);
    try {
      const data = {
        ...formData,
        leadTimeDays: Number(formData.leadTimeDays) || 2,
        updatedAt: Timestamp.now(),
      };

      if (editingSupplier) {
        await setDoc(doc(db, 'suppliers', editingSupplier.id), data, { merge: true });
        await addAuditLog('UPDATE_SUPPLIER', 'Supplier', editingSupplier.id, { name: data.name });
        toast.success('Supplier updated successfully');
      } else {
        const newRef = doc(collection(db, 'suppliers'));
        await setDoc(newRef, { ...data, id: newRef.id, createdAt: Timestamp.now() });
        await addAuditLog('CREATE_SUPPLIER', 'Supplier', newRef.id, { name: data.name });
        toast.success('Supplier added successfully');
      }
      closeModal();
    } catch (error) {
      console.error('Save error:', error);
      toast.error('Operation failed: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingSupplier(null);
    setFormData({ ...EMPTY_FORM });
    setGstinError('');
  };

  const openEdit = (supplier) => {
    setEditingSupplier(supplier);
    setFormData({
      name: supplier.name || '',
      contactPerson: supplier.contactPerson || '',
      phone: supplier.phone || '',
      email: supplier.email || '',
      gstin: supplier.gstin || '',
      address: supplier.address || { street: '', district: '', state: 'Bihar', pincode: '' },
      paymentTerms: supplier.paymentTerms || 'NET_15',
      bankDetails: supplier.bankDetails || { bankName: '', accountNo: '', ifsc: '' },
      leadTimeDays: supplier.leadTimeDays || 2,
      status: supplier.status || 'ACTIVE',
    });
    setIsModalOpen(true);
  };

  const deleteSupplier = async (supplier) => {
    if (!window.confirm(`Delete supplier "${supplier.name}"? This action cannot be undone.`)) return;
    try {
      await deleteDoc(doc(db, 'suppliers', supplier.id));
      await addAuditLog('DELETE_SUPPLIER', 'Supplier', supplier.id, { name: supplier.name });
      toast.success('Supplier deleted');
    } catch (error) {
      toast.error('Delete failed');
    }
  };

  const toggleStatus = async (supplier) => {
    const newStatus = supplier.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      await setDoc(doc(db, 'suppliers', supplier.id), { status: newStatus, updatedAt: Timestamp.now() }, { merge: true });
      toast.success(`Supplier ${newStatus === 'ACTIVE' ? 'activated' : 'deactivated'}`);
    } catch (error) {
      toast.error('Status update failed');
    }
  };

  // Filtered suppliers
  const filtered = suppliers.filter(s => {
    const matchSearch = !searchTerm ||
      s.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.contactPerson?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      s.phone?.includes(searchTerm) ||
      s.gstin?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchStatus = statusFilter === 'ALL' || s.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const activeCount = suppliers.filter(s => s.status === 'ACTIVE').length;
  const inactiveCount = suppliers.filter(s => s.status === 'INACTIVE').length;

  const columns = [
    {
      header: 'Supplier', key: 'name', render: (s) => (
        <div>
          <p className="font-black text-gray-900 tracking-tight">{s.name}</p>
          <p className="text-[11px] text-gray-400 font-medium">{s.contactPerson}</p>
        </div>
      )
    },
    {
      header: 'Contact', key: 'phone', render: (s) => (
        <div className="space-y-0.5">
          <p className="text-xs font-bold text-gray-700 flex items-center gap-1"><Phone size={11} />{s.phone}</p>
          {s.email && <p className="text-[11px] text-gray-400 flex items-center gap-1"><Mail size={10} />{s.email}</p>}
        </div>
      )
    },
    {
      header: 'GSTIN', key: 'gstin', render: (s) => (
        <span className="font-mono text-xs text-gray-600 bg-gray-50 px-2 py-1 rounded">{s.gstin || '—'}</span>
      )
    },
    {
      header: 'Location', key: 'address', render: (s) => (
        <div className="text-xs text-gray-500">
          <span className="font-bold">{s.address?.district || '—'}</span>
          {s.address?.state && <span>, {s.address.state}</span>}
        </div>
      )
    },
    {
      header: 'Terms', key: 'paymentTerms', render: (s) => (
        <span className="text-[10px] font-black px-2 py-1 rounded bg-blue-50 text-blue-700 uppercase tracking-widest">
          {(s.paymentTerms || 'NET_15').replace('_', ' ')}
        </span>
      )
    },
    {
      header: 'Lead Time', key: 'leadTimeDays', render: (s) => (
        <span className="text-xs font-bold text-gray-600 flex items-center gap-1">
          <Clock size={12} />{s.leadTimeDays || 0}d
        </span>
      )
    },
    {
      header: 'Status', key: 'status', render: (s) => (
        <button onClick={() => toggleStatus(s)}
          className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-widest transition-all cursor-pointer ${
            s.status === 'ACTIVE'
              ? 'bg-green-100 text-green-700 hover:bg-green-200'
              : 'bg-red-100 text-red-700 hover:bg-red-200'
          }`}
        >
          {s.status === 'ACTIVE' ? <span className="flex items-center gap-1"><CheckCircle2 size={10} />Active</span> : <span className="flex items-center gap-1"><XCircle size={10} />Inactive</span>}
        </button>
      )
    },
    {
      header: 'Actions', render: (s) => (
        <div className="flex space-x-2">
          <button onClick={() => openEdit(s)} className="p-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-all"><Edit2 size={16} /></button>
          <button onClick={() => deleteSupplier(s)} className="p-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-all"><Trash2 size={16} /></button>
        </div>
      )
    }
  ];

  // -- Form field helper
  const InputField = ({ label, value, onChange, required, type = 'text', placeholder, error, className = '' }) => (
    <div className={`space-y-1 ${className}`}>
      <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">{label}</label>
      <input
        type={type}
        required={required}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={`w-full px-4 py-3 bg-gray-50 border ${error ? 'border-red-300 ring-2 ring-red-100' : 'border-gray-100'} rounded-xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-gray-900 text-sm`}
      />
      {error && <p className="text-[10px] text-red-500 font-bold ml-1">{error}</p>}
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center">
          <Factory className="mr-3 text-[#1b5e20]" size={28} />
          Suppliers
        </h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-[#1b5e20] text-white px-6 py-3 rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-green-100 hover:bg-[#2e7d32] transition-all flex items-center group active:scale-95"
        >
          <Plus size={18} className="mr-2 group-hover:scale-110 transition-transform" />
          Add Supplier
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Suppliers</p>
          <p className="text-3xl font-black text-gray-900 mt-1">{suppliers.length}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-green-100 shadow-sm">
          <p className="text-[10px] font-black text-green-600 uppercase tracking-widest">Active</p>
          <p className="text-3xl font-black text-green-700 mt-1">{activeCount}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-red-100 shadow-sm">
          <p className="text-[10px] font-black text-red-500 uppercase tracking-widest">Inactive</p>
          <p className="text-3xl font-black text-red-600 mt-1">{inactiveCount}</p>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name, contact, phone, or GSTIN..."
            className="w-full pl-11 pr-4 py-3 bg-white border border-gray-100 rounded-xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-sm text-gray-900"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-4 py-3 bg-white border border-gray-100 rounded-xl font-bold text-sm text-gray-700 outline-none"
        >
          <option value="ALL">All Status</option>
          <option value="ACTIVE">Active Only</option>
          <option value="INACTIVE">Inactive Only</option>
        </select>
      </div>

      {/* Data Table */}
      <DataTable columns={columns} data={filtered} loading={loading} />

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-gray-900/60 backdrop-blur-md p-6 animate-in fade-in duration-300 overflow-y-auto">
          <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl animate-in zoom-in duration-300 relative border border-white/20 my-8">
            {/* Modal Header */}
            <div className="p-6 border-b border-gray-50 flex items-center justify-between sticky top-0 bg-white z-10 rounded-t-3xl">
              <h2 className="text-lg font-black text-gray-900 uppercase tracking-[0.1em] flex items-center gap-2">
                <Factory size={20} className="text-[#1b5e20]" />
                {editingSupplier ? 'Edit Supplier' : 'Add Supplier'}
              </h2>
              <button onClick={closeModal} className="p-2 hover:bg-gray-100 rounded-full transition-all text-gray-400"><X size={20} /></button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Basic Info */}
              <div>
                <p className="text-[10px] font-black text-[#1b5e20] uppercase tracking-widest mb-3 flex items-center gap-1.5"><Building2 size={12} />Basic Information</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <InputField label="Supplier / Company Name *" required value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })} placeholder="e.g. IFFCO Agro" />
                  <InputField label="Contact Person" value={formData.contactPerson}
                    onChange={(e) => setFormData({ ...formData, contactPerson: e.target.value })} placeholder="e.g. Ramesh Sharma" />
                  <InputField label="Phone *" required value={formData.phone} type="tel"
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })} placeholder="+919876543210" />
                  <InputField label="Email" value={formData.email} type="email"
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })} placeholder="contact@supplier.com" />
                </div>
              </div>

              {/* GSTIN */}
              <div>
                <p className="text-[10px] font-black text-[#1b5e20] uppercase tracking-widest mb-3 flex items-center gap-1.5"><FileText size={12} />Tax Details</p>
                <InputField label="GSTIN (Optional)" value={formData.gstin} error={gstinError}
                  onChange={(e) => {
                    const val = e.target.value.toUpperCase();
                    setFormData({ ...formData, gstin: val });
                    if (val) validateGstin(val);
                    else setGstinError('');
                  }}
                  placeholder="e.g. 10ABCDE1234F1Z5" />
              </div>

              {/* Address */}
              <div>
                <p className="text-[10px] font-black text-[#1b5e20] uppercase tracking-widest mb-3 flex items-center gap-1.5"><MapPin size={12} />Address</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <InputField label="Street / Area" value={formData.address.street} className="md:col-span-2"
                    onChange={(e) => setFormData({ ...formData, address: { ...formData.address, street: e.target.value } })} placeholder="Agro Market Road" />
                  <InputField label="District" value={formData.address.district}
                    onChange={(e) => setFormData({ ...formData, address: { ...formData.address, district: e.target.value } })} placeholder="Purnea" />
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">State</label>
                    <select
                      value={formData.address.state}
                      onChange={(e) => setFormData({ ...formData, address: { ...formData.address, state: e.target.value } })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-gray-900 text-sm"
                    >
                      {INDIAN_STATES.map(st => <option key={st} value={st}>{st}</option>)}
                    </select>
                  </div>
                  <InputField label="Pincode" value={formData.address.pincode}
                    onChange={(e) => setFormData({ ...formData, address: { ...formData.address, pincode: e.target.value } })} placeholder="854301" />
                </div>
              </div>

              {/* Payment & Bank */}
              <div>
                <p className="text-[10px] font-black text-[#1b5e20] uppercase tracking-widest mb-3 flex items-center gap-1.5"><CreditCard size={12} />Payment & Banking</p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Payment Terms</label>
                    <select
                      value={formData.paymentTerms}
                      onChange={(e) => setFormData({ ...formData, paymentTerms: e.target.value })}
                      className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-gray-900 text-sm"
                    >
                      {PAYMENT_TERMS_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                    </select>
                  </div>
                  <InputField label="Lead Time (Days)" value={formData.leadTimeDays} type="number"
                    onChange={(e) => setFormData({ ...formData, leadTimeDays: e.target.value })} placeholder="2" />
                  <InputField label="Bank Name" value={formData.bankDetails.bankName}
                    onChange={(e) => setFormData({ ...formData, bankDetails: { ...formData.bankDetails, bankName: e.target.value } })} placeholder="SBI" />
                  <InputField label="Account Number" value={formData.bankDetails.accountNo}
                    onChange={(e) => setFormData({ ...formData, bankDetails: { ...formData.bankDetails, accountNo: e.target.value } })} placeholder="123456789" />
                  <InputField label="IFSC Code" value={formData.bankDetails.ifsc}
                    onChange={(e) => setFormData({ ...formData, bankDetails: { ...formData.bankDetails, ifsc: e.target.value.toUpperCase() } })} placeholder="SBIN0001234" />
                </div>
              </div>

              {/* Status Toggle */}
              <div className="flex items-center space-x-3 pt-2">
                <input
                  type="checkbox"
                  id="supplierStatus"
                  checked={formData.status === 'ACTIVE'}
                  onChange={(e) => setFormData({ ...formData, status: e.target.checked ? 'ACTIVE' : 'INACTIVE' })}
                  className="w-5 h-5 accent-[#1b5e20]"
                />
                <label htmlFor="supplierStatus" className="text-sm font-bold text-gray-700">Mark as Active Supplier</label>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={saving}
                className={`w-full bg-[#1b5e20] text-white py-4 rounded-xl font-black text-sm uppercase tracking-widest shadow-lg shadow-green-100 hover:bg-[#2e7d32] transition-all active:scale-[0.98] flex items-center justify-center gap-2 ${saving ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {saving && <Loader2 size={18} className="animate-spin" />}
                {editingSupplier ? 'Save Changes' : 'Add Supplier'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Suppliers;
