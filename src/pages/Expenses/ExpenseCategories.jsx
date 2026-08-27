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
  AlertCircle
} from 'lucide-react';
import { db } from '../../firebase/config';
import { collection, query, orderBy, onSnapshot, doc, setDoc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import DataTable from '../../components/common/DataTable';
import toast from 'react-hot-toast';

const ExpenseCategories = () => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState({ name: '', description: '', status: 'ACTIVE' });

  useEffect(() => {
    const q = query(collection(db, 'expenseCategories'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snap) => {
      setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() })));
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
      toast.error("Operation failed");
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (cat) => {
    setEditingId(cat.id);
    setFormData({ name: cat.name, description: cat.description, status: cat.status });
    setIsModalOpen(true);
  };

  const columns = [
    { header: 'Name', key: 'name' },
    { header: 'Description', key: 'description' },
    {
      header: 'Status',
      render: (c) => (
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-tighter ${c.status === 'ACTIVE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {c.status}
        </span>
      )
    },
    {
      header: 'Actions',
      render: (c) => (
        <div className="flex space-x-2">
          <button onClick={() => openEdit(c)} className="p-1.5 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors"><Edit2 size={16}/></button>
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
            <Grid3X3 className="mr-3 text-primary" size={32} />
            Expense Categories
          </h1>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] ml-11">Classification Taxonomy</p>
        </div>
        <button
          onClick={() => { setEditingId(null); setFormData({ name: '', description: '', status: 'ACTIVE' }); setIsModalOpen(true); }}
          className="flex items-center px-6 py-3 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg shadow-green-100"
        >
          <Plus size={18} className="mr-2" /> New Category
        </button>
      </div>

      <div className="bg-white rounded-[2.5rem] border border-gray-100 shadow-xl shadow-green-100/10 overflow-hidden">
         <DataTable columns={columns} data={categories} loading={loading} />
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-6">
           <div className="bg-white rounded-[3rem] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95">
              <div className="p-8 border-b border-gray-50 flex items-center justify-between">
                 <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight">
                    {editingId ? 'Edit Category' : 'New Category'}
                 </h2>
                 <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-red-500"><X size={24}/></button>
              </div>
              <form onSubmit={handleSubmit} className="p-8 space-y-6">
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Category Name *</label>
                    <input
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({...formData, name: e.target.value})}
                      className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl font-bold text-gray-800 outline-none focus:border-primary"
                      placeholder="e.g. Marketing"
                    />
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Description</label>
                    <textarea
                      rows={3}
                      value={formData.description}
                      onChange={(e) => setFormData({...formData, description: e.target.value})}
                      className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl font-bold text-gray-800 outline-none focus:border-primary resize-none"
                    />
                 </div>
                 <button
                   disabled={saving}
                   className="w-full bg-primary text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-green-100 flex justify-center items-center"
                 >
                    {saving ? <Loader2 className="animate-spin mr-2" size={18}/> : <Save className="mr-2" size={18}/>}
                    {editingId ? 'Update Category' : 'Create Category'}
                 </button>
              </form>
           </div>
        </div>
      )}
    </div>
  );
};

export default ExpenseCategories;
