import React, { useState, useEffect } from 'react';
import {
  Users,
  Plus,
  Edit2,
  Trash2,
  X,
  Save,
  Loader2,
  Search,
  Building,
  Phone,
  Mail,
  MapPin,
  Landmark
} from 'lucide-react';
import { db } from '../../firebase/config';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import DataTable from '../../components/common/DataTable';
import toast from 'react-hot-toast';

const ExpenseVendors = () => {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    companyName: '',
    phone: '',
    email: '',
    gstin: '',
    pan: '',
    address: '',
    bankName: '',
    accountNumber: '',
    ifsc: '',
    status: 'ACTIVE'
  });

  useEffect(() => {
    const q = query(collection(db, 'expenseVendors'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      setVendors(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name) return toast.error("Name is required");

    setSaving(true);
    try {
      if (editingId) {
        await updateDoc(doc(db, 'expenseVendors', editingId), {
          ...formData,
          updatedAt: serverTimestamp()
        });
        toast.success("Vendor updated");
      } else {
        await addDoc(collection(db, 'expenseVendors'), {
          ...formData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        toast.success("Vendor created");
      }
      setIsModalOpen(false);
      setEditingId(null);
    } catch (err) {
      toast.error("Operation failed");
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (v) => {
    setEditingId(v.id);
    setFormData({ ...v });
    setIsModalOpen(true);
  };

  const filteredVendors = vendors.filter(v =>
    v.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.companyName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    v.phone?.includes(searchTerm)
  );

  const columns = [
    {
      header: 'Vendor Name',
      render: (v) => (
        <div className="flex flex-col">
          <span className="font-bold text-gray-900 text-sm">{v.name}</span>
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">{v.companyName || 'Personal'}</span>
        </div>
      )
    },
    { header: 'Contact', render: (v) => (
      <div className="text-xs font-medium text-gray-600">
        <div>{v.phone}</div>
        <div className="text-gray-400">{v.email}</div>
      </div>
    )},
    { header: 'GSTIN / PAN', render: (v) => (
      <div className="text-[10px] font-mono font-bold text-gray-500 uppercase">
        <div>{v.gstin || '-'}</div>
        <div className="text-gray-300">{v.pan || '-'}</div>
      </div>
    )},
    {
      header: 'Status',
      render: (v) => (
        <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter ${v.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {v.status}
        </span>
      )
    },
    {
      header: 'Actions',
      render: (v) => (
        <div className="flex space-x-2">
          <button onClick={() => openEdit(v)} className="p-1.5 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors"><Edit2 size={16}/></button>
          <button className="p-1.5 hover:bg-red-50 text-red-500 rounded-lg transition-colors"><Trash2 size={16}/></button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-black text-gray-900 tracking-tight flex items-center uppercase">
            <Users className="mr-3 text-primary" size={32} />
            Supply Partners
          </h1>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] ml-11">Vendor & Contractor Directory</p>
        </div>
        <button
          onClick={() => { setEditingId(null); setIsModalOpen(true); }}
          className="flex items-center px-6 py-3 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-green-100"
        >
          <Plus size={18} className="mr-2" /> New Vendor
        </button>
      </div>

      <div className="flex items-center bg-white px-6 py-4 rounded-[2rem] border border-gray-100 shadow-sm">
        <Search className="text-gray-300 mr-3" size={20} />
        <input
          type="text"
          placeholder="Search by name, company or phone..."
          className="bg-transparent border-none outline-none w-full font-bold text-gray-700 placeholder:text-gray-200 text-sm"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-xl shadow-green-100/10 overflow-hidden">
         <DataTable columns={columns} data={filteredVendors} loading={loading} />
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-6 overflow-y-auto">
           <div className="bg-white rounded-[3rem] w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 my-auto">
              <div className="p-8 border-b border-gray-50 flex items-center justify-between">
                 <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight">
                    {editingId ? 'Edit Vendor Details' : 'Onboard New Vendor'}
                 </h2>
                 <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-red-500"><X size={24}/></button>
              </div>
              <form onSubmit={handleSubmit} className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Full Name *</label>
                    <input required value={formData.name} onChange={(e) => setFormData({...formData, name: e.target.value})} className="w-full px-5 py-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-gray-800" />
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Company Name</label>
                    <input value={formData.companyName} onChange={(e) => setFormData({...formData, companyName: e.target.value})} className="w-full px-5 py-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-gray-800" />
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Mobile Number</label>
                    <input value={formData.phone} onChange={(e) => setFormData({...formData, phone: e.target.value})} className="w-full px-5 py-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-gray-800" />
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Email Address</label>
                    <input type="email" value={formData.email} onChange={(e) => setFormData({...formData, email: e.target.value})} className="w-full px-5 py-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-gray-800" />
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">GSTIN</label>
                    <input value={formData.gstin} onChange={(e) => setFormData({...formData, gstin: e.target.value})} className="w-full px-5 py-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-gray-800 uppercase" />
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">PAN Card</label>
                    <input value={formData.pan} onChange={(e) => setFormData({...formData, pan: e.target.value})} className="w-full px-5 py-3 bg-gray-50 border border-gray-100 rounded-xl font-bold text-gray-800 uppercase" />
                 </div>

                 <div className="md:col-span-2 p-6 bg-blue-50/50 rounded-3xl space-y-4 border border-blue-100">
                    <div className="flex items-center space-x-2 text-blue-700">
                       <Landmark size={18} />
                       <h3 className="text-[10px] font-black uppercase tracking-widest">Bank Settlement Details</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                       <input placeholder="Bank Name" value={formData.bankName} onChange={(e) => setFormData({...formData, bankName: e.target.value})} className="w-full px-5 py-3 bg-white border border-blue-100 rounded-xl text-xs font-bold" />
                       <input placeholder="Account Number" value={formData.accountNumber} onChange={(e) => setFormData({...formData, accountNumber: e.target.value})} className="w-full px-5 py-3 bg-white border border-blue-100 rounded-xl text-xs font-bold" />
                       <input placeholder="IFSC Code" value={formData.ifsc} onChange={(e) => setFormData({...formData, ifsc: e.target.value})} className="w-full px-5 py-3 bg-white border border-blue-100 rounded-xl text-xs font-bold uppercase" />
                    </div>
                 </div>

                 <button
                   disabled={saving}
                   className="md:col-span-2 bg-primary text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-green-100 flex justify-center items-center mt-4"
                 >
                    {saving ? <Loader2 className="animate-spin mr-2" size={18}/> : <Save className="mr-2" size={18}/>}
                    {editingId ? 'Update Partner' : 'Register Partner'}
                 </button>
              </form>
           </div>
        </div>
      )}
    </div>
  );
};

export default ExpenseVendors;
