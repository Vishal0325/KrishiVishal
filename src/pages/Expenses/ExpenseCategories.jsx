import React, { useState, useEffect } from 'react';
import {
  Grid3X3,
  Plus,
  Edit2,
  Trash2,
  X,
  Save,
  Loader2,
  CheckCircle,
  AlertCircle,
  Sparkles
} from 'lucide-react';
import { db } from '../../firebase/config';
import { collection, query, orderBy, onSnapshot, doc, updateDoc, addDoc, deleteDoc, serverTimestamp, getDocs } from 'firebase/firestore';
import DataTable from '../../components/common/DataTable';
import toast from 'react-hot-toast';

const DEFAULT_CATEGORIES = [
  { name: 'Warehouse Rent & Hub Lease', description: 'Monthly lease for hub storage and sorting facilities', status: 'ACTIVE' },
  { name: 'Logistics Fleet & Fuel', description: 'Diesel, petrol, vehicle maintenance & delivery van rentals', status: 'ACTIVE' },
  { name: 'Packaging, Sacks & Crates', description: 'Corrugated boxes, plastic crates, gunny bags & tape', status: 'ACTIVE' },
  { name: 'Agronomy Consultant & QA', description: 'Crop inspection, soil test lab kits, expert farm fees', status: 'ACTIVE' },
  { name: 'Staff Salary & Workforce', description: 'Warehouse pickers, sorters, riders, and field operators', status: 'ACTIVE' },
  { name: 'Marketing & Farmer Outreach', description: 'Village mela banners, WhatsApp campaigns & demo field plots', status: 'ACTIVE' },
  { name: 'Electricity & Utilities', description: 'Cold storage electricity bills, internet, generator backup', status: 'ACTIVE' },
  { name: 'Legal, GST & Audit Fees', description: 'CA retainer, ROC compliance, licensing & food safety audits', status: 'ACTIVE' }
];

const ExpenseCategories = () => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [formData, setFormData] = useState({ name: '', description: '', status: 'ACTIVE' });

  useEffect(() => {
    const q = query(collection(db, 'expenseCategories'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        setCategories(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.warn("Categories query fallback:", err);
        getDocs(collection(db, 'expenseCategories'))
          .then((snap) => {
            setCategories(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
          })
          .finally(() => setLoading(false));
      }
    );
    return unsubscribe;
  }, []);

  const handleSeedDefaults = async () => {
    setSeeding(true);
    try {
      for (const cat of DEFAULT_CATEGORIES) {
        await addDoc(collection(db, 'expenseCategories'), {
          ...cat,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      }
      toast.success("Standard agricultural expense categories seeded successfully!");
    } catch (err) {
      toast.error("Failed to seed categories: " + err.message);
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
        await updateDoc(doc(db, 'expenseCategories', editingId), {
          ...formData,
          updatedAt: serverTimestamp()
        });
        toast.success("Category updated");
      } else {
        await addDoc(collection(db, 'expenseCategories'), {
          ...formData,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        toast.success("Category created");
      }
      setIsModalOpen(false);
      setFormData({ name: '', description: '', status: 'ACTIVE' });
      setEditingId(null);
    } catch (err) {
      toast.error("Operation failed: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Are you sure you want to delete this category?")) return;
    try {
      await deleteDoc(doc(db, 'expenseCategories', id));
      toast.success("Category deleted");
    } catch (err) {
      toast.error("Delete failed: " + err.message);
    }
  };

  const openEdit = (cat) => {
    setEditingId(cat.id);
    setFormData({ name: cat.name, description: cat.description || '', status: cat.status || 'ACTIVE' });
    setIsModalOpen(true);
  };

  const columns = [
    {
      header: 'Category Name',
      render: (c) => (
        <div>
          <span className="font-bold text-gray-900 text-xs">{c.name}</span>
          {c.description && <p className="text-[10px] text-gray-400 mt-0.5">{c.description}</p>}
        </div>
      )
    },
    {
      header: 'Status',
      render: (c) => (
        <span
          className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${
            c.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
          }`}
        >
          {c.status || 'ACTIVE'}
        </span>
      )
    },
    {
      header: 'Actions',
      render: (c) => (
        <div className="flex space-x-2">
          <button
            onClick={() => openEdit(c)}
            className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors cursor-pointer"
            title="Edit Category"
          >
            <Edit2 size={15} />
          </button>
          <button
            onClick={() => handleDelete(c.id)}
            className="p-2 hover:bg-red-50 text-red-500 rounded-lg transition-colors cursor-pointer"
            title="Delete Category"
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
            <Grid3X3 className="mr-3 text-[#0B4D31]" size={28} />
            Expense Categories Master
          </h1>
          <p className="text-xs font-medium text-gray-500 mt-0.5">Classification taxonomy for operating expenses, COGS, and overheads.</p>
        </div>
        <div className="flex items-center gap-3">
          {categories.length === 0 && (
            <button
              onClick={handleSeedDefaults}
              disabled={seeding}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 text-[#0B4D31] border border-emerald-200 rounded-xl font-bold text-xs hover:bg-emerald-100 transition-all cursor-pointer"
            >
              <Sparkles size={16} />
              {seeding ? "Seeding Defaults..." : "Seed Default Categories"}
            </button>
          )}
          <button
            onClick={() => {
              setEditingId(null);
              setFormData({ name: '', description: '', status: 'ACTIVE' });
              setIsModalOpen(true);
            }}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#0B4D31] text-white rounded-xl font-bold text-xs shadow-md shadow-[#0B4D31]/20 hover:bg-[#083824] transition-all cursor-pointer"
          >
            <Plus size={16} /> New Category
          </button>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <DataTable columns={columns} data={categories} loading={loading} />
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-base font-black text-gray-900 uppercase tracking-tight">
                {editingId ? 'Edit Category' : 'New Expense Category'}
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-red-500 cursor-pointer">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700">Category Name *</label>
                <input
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl font-bold text-xs text-gray-800 outline-none focus:border-[#0B4D31] focus:bg-white"
                  placeholder="e.g. Warehouse Rent & Storage"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700">Description</label>
                <textarea
                  rows={3}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl font-medium text-xs text-gray-800 outline-none focus:border-[#0B4D31] focus:bg-white resize-none"
                  placeholder="Brief details about what is billed under this category..."
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-700">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl font-bold text-xs text-gray-800 outline-none focus:border-[#0B4D31]"
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              </div>
              <button
                disabled={saving}
                className="w-full bg-[#0B4D31] text-white py-3 rounded-xl font-black text-xs uppercase tracking-wider shadow-lg shadow-[#0B4D31]/20 hover:bg-[#083824] transition-all flex justify-center items-center cursor-pointer mt-2"
              >
                {saving ? <Loader2 className="animate-spin mr-2" size={16} /> : <Save className="mr-2" size={16} />}
                {editingId ? 'Update Category' : 'Save Category'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExpenseCategories;

