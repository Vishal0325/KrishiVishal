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
  Landmark,
  Sparkles
} from 'lucide-react';
import { db } from '../../firebase/config';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, addDoc, deleteDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import DataTable from '../../components/common/DataTable';
import toast from 'react-hot-toast';

const DEFAULT_VENDORS = [
  { name: 'IFFCO Fertilizer & Agro Chemical Ltd', companyName: 'Indian Farmers Fertiliser Coop', phone: '0612-2234567', email: 'sales.patna@iffco.in', gstin: '10AAACI0001A1Z5', pan: 'AAACI0001A', status: 'ACTIVE', bankName: 'State Bank of India', accountNumber: '30291823910', ifsc: 'SBIN0001234' },
  { name: 'Corteva Pioneer Agri Seeds', companyName: 'Corteva Agriscience India Pvt Ltd', phone: '0612-2598765', email: 'bihar.orders@corteva.com', gstin: '10AACCP9821B1Z2', pan: 'AACCP9821B', status: 'ACTIVE', bankName: 'HDFC Bank', accountNumber: '50200039281920', ifsc: 'HDFC0000456' },
  { name: 'Patna Regional Logistics & Freight', companyName: 'M/s Patna Cold Chain Logistics', phone: '9835012345', email: 'dispatch@patnalogistics.in', gstin: '10ABCDE1234F1Z8', pan: 'ABCDE1234F', status: 'ACTIVE', bankName: 'ICICI Bank', accountNumber: '002105001298', ifsc: 'ICIC0000021' },
  { name: 'Kisan Corrugated Boxes & Packaging', companyName: 'Kisan Agro Pack Industries', phone: '9431098765', email: 'info@kisanpackaging.com', gstin: '10BCDFG5678H1Z1', pan: 'BCDFG5678H', status: 'ACTIVE', bankName: 'Punjab National Bank', accountNumber: '10920021000982', ifsc: 'PUNB0109200' }
];

const ExpenseVendors = () => {
  const [vendors, setVendors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);

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
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setVendors(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.warn("Vendors query fallback:", err);
        getDocs(collection(db, 'expenseVendors'))
          .then((snap) => {
            setVendors(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
          })
          .finally(() => setLoading(false));
      }
    );
    return unsubscribe;
  }, []);

  const handleSeedDefaults = async () => {
    setSeeding(true);
    try {
      for (const v of DEFAULT_VENDORS) {
        await addDoc(collection(db, 'expenseVendors'), {
          ...v,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      toast.success("Standard agricultural vendors seeded successfully!");
    } catch (err) {
      toast.error("Failed to seed vendors: " + err.message);
    } finally {
      setSeeding(false);
    }
  };

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
      toast.error("Operation failed: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this vendor?")) return;
    try {
      await deleteDoc(doc(db, 'expenseVendors', id));
      toast.success("Vendor removed");
    } catch (err) {
      toast.error("Delete failed: " + err.message);
    }
  };

  const openEdit = (v) => {
    setEditingId(v.id);
    setFormData({ ...v });
    setIsModalOpen(true);
  };

  const filteredVendors = vendors.filter((v) =>
    (v.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (v.companyName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (v.phone || '').includes(searchTerm) ||
    (v.gstin || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const columns = [
    {
      header: 'Vendor Name',
      render: (v) => (
        <div className="flex flex-col">
          <span className="font-bold text-gray-900 text-xs">{v.name}</span>
          <span className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{v.companyName || 'Individual Partner'}</span>
        </div>
      )
    },
    {
      header: 'Contact Details',
      render: (v) => (
        <div className="text-xs font-medium text-gray-600">
          <div className="font-mono text-xs">{v.phone || '—'}</div>
          <div className="text-[10px] text-gray-400">{v.email || '—'}</div>
        </div>
      )
    },
    {
      header: 'GSTIN / PAN',
      render: (v) => (
        <div className="text-[10px] font-mono font-bold text-gray-600 uppercase">
          <div>{v.gstin || 'No GSTIN'}</div>
          <div className="text-gray-400">{v.pan || '—'}</div>
        </div>
      )
    },
    {
      header: 'Bank Details',
      render: (v) => (
        <div className="text-[10px] font-mono text-gray-600">
          <div className="font-bold text-gray-800">{v.bankName || '—'}</div>
          <div className="text-gray-400">{v.accountNumber ? `A/c: ****${v.accountNumber.slice(-4)}` : '—'}</div>
        </div>
      )
    },
    {
      header: 'Status',
      render: (v) => (
        <span
          className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
            v.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
          }`}
        >
          {v.status || 'ACTIVE'}
        </span>
      )
    },
    {
      header: 'Actions',
      render: (v) => (
        <div className="flex space-x-2">
          <button
            onClick={() => openEdit(v)}
            className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors cursor-pointer"
            title="Edit Vendor"
          >
            <Edit2 size={15} />
          </button>
          <button
            onClick={() => handleDelete(v.id)}
            className="p-2 hover:bg-red-50 text-red-500 rounded-lg transition-colors cursor-pointer"
            title="Delete Vendor"
          >
            <Trash2 size={15} />
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center">
            <Users className="mr-3 text-[#0B4D31]" size={28} />
            Supply Partners & Expense Vendors
          </h1>
          <p className="text-xs font-medium text-gray-500 mt-0.5">Directory of agri input suppliers, logistics fleets, warehouse landlords, and service providers.</p>
        </div>
        <div className="flex items-center gap-3">
          {vendors.length === 0 && (
            <button
              onClick={handleSeedDefaults}
              disabled={seeding}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 text-[#0B4D31] border border-emerald-200 rounded-xl font-bold text-xs hover:bg-emerald-100 transition-all cursor-pointer"
            >
              <Sparkles size={16} />
              {seeding ? "Seeding Vendors..." : "Seed Default Vendors"}
            </button>
          )}
          <button
            onClick={() => {
              setEditingId(null);
              setFormData({
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
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#0B4D31] text-white rounded-xl font-bold text-xs shadow-md shadow-[#0B4D31]/20 hover:bg-[#083824] transition-all cursor-pointer"
          >
            <Plus size={16} /> New Vendor
          </button>
        </div>
      </div>

      <div className="flex items-center bg-white px-4 py-3 rounded-2xl border border-gray-100 shadow-sm">
        <Search className="text-gray-400 mr-3" size={18} />
        <input
          type="text"
          placeholder="Search by vendor name, company, GSTIN, or phone..."
          className="bg-transparent border-none outline-none w-full font-bold text-gray-700 placeholder:text-gray-300 text-xs"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <DataTable columns={columns} data={filteredVendors} loading={loading} />
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="bg-white rounded-3xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 my-auto">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-black text-gray-900 uppercase tracking-tight">
                {editingId ? 'Edit Vendor Details' : 'Onboard New Vendor'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-red-500 cursor-pointer">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700">Vendor Contact Name *</label>
                <input
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl font-bold text-xs text-gray-800 outline-none focus:border-[#0B4D31]"
                  placeholder="e.g. Ramesh Kumar"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700">Company / Trade Name</label>
                <input
                  value={formData.companyName}
                  onChange={(e) => setFormData({ ...formData, companyName: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl font-bold text-xs text-gray-800 outline-none focus:border-[#0B4D31]"
                  placeholder="e.g. Kisan Logistics Pvt Ltd"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700">Mobile Phone</label>
                <input
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl font-medium text-xs text-gray-800 outline-none focus:border-[#0B4D31]"
                  placeholder="e.g. 9876543210"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700">Email Address</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl font-medium text-xs text-gray-800 outline-none focus:border-[#0B4D31]"
                  placeholder="e.g. vendor@agro.com"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700">GSTIN Number</label>
                <input
                  value={formData.gstin}
                  onChange={(e) => setFormData({ ...formData, gstin: e.target.value.toUpperCase() })}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl font-bold text-xs text-gray-800 uppercase outline-none focus:border-[#0B4D31]"
                  placeholder="10AAAAA0000A1Z5"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700">PAN Number</label>
                <input
                  value={formData.pan}
                  onChange={(e) => setFormData({ ...formData, pan: e.target.value.toUpperCase() })}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl font-bold text-xs text-gray-800 uppercase outline-none focus:border-[#0B4D31]"
                  placeholder="AAAAA0000A"
                />
              </div>

              <div className="md:col-span-2 p-4 bg-emerald-50/50 rounded-2xl space-y-3 border border-emerald-100">
                <div className="flex items-center space-x-2 text-[#0B4D31]">
                  <Landmark size={16} />
                  <h3 className="text-xs font-black uppercase tracking-wider">Bank Settlement Details</h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <input
                    placeholder="Bank Name"
                    value={formData.bankName}
                    onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-emerald-200 rounded-xl text-xs font-bold"
                  />
                  <input
                    placeholder="Account Number"
                    value={formData.accountNumber}
                    onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value })}
                    className="w-full px-3 py-2 bg-white border border-emerald-200 rounded-xl text-xs font-bold"
                  />
                  <input
                    placeholder="IFSC Code"
                    value={formData.ifsc}
                    onChange={(e) => setFormData({ ...formData, ifsc: e.target.value.toUpperCase() })}
                    className="w-full px-3 py-2 bg-white border border-emerald-200 rounded-xl text-xs font-bold uppercase"
                  />
                </div>
              </div>

              <button
                disabled={saving}
                className="md:col-span-2 bg-[#0B4D31] text-white py-3 rounded-xl font-black text-xs uppercase tracking-wider shadow-lg shadow-[#0B4D31]/20 hover:bg-[#083824] transition-all flex justify-center items-center cursor-pointer mt-2"
              >
                {saving ? <Loader2 className="animate-spin mr-2" size={16} /> : <Save className="mr-2" size={16} />}
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

