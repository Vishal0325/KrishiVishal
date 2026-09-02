import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, Timestamp, addDoc, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase/config';
import DataTable from '../components/common/DataTable';
import { Layers, Plus, Edit2, Trash2, X, Database, Tag, Box, Ruler, CheckCircle2, ChevronRight, Hash } from 'lucide-react';
import toast from 'react-hot-toast';

const MasterData = () => {
  const [activeTab, setActiveTab] = useState('items'); // items | varieties | grades | packs
  const [data, setData] = useState([]);
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);

  const initialFormState = {
    code: '',
    name: '',
    parentCode: '', // CategoryCode for Items, ItemCode for Varieties
    size: '',
    unit: ''
  };
  const [formData, setFormData] = useState(initialFormState);

  const tabs = [
    { id: 'items', label: 'Items (III)', icon: <Tag size={16} /> },
    { id: 'varieties', label: 'Varieties (VVV)', icon: <Layers size={16} /> },
    { id: 'grades', label: 'Grades (GG)', icon: <CheckCircle2 size={16} /> },
    { id: 'packs', label: 'Pack Sizes (SSSUU)', icon: <Box size={16} /> }
  ];

  useEffect(() => {
    setLoading(true);
    const q = query(collection(db, 'master_data', activeTab, 'records'), orderBy('name', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setData(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });

    // Load prerequisites for parent selection
    const unsubCats = onSnapshot(collection(db, 'categories'), (snap) => {
        // Note: Using existing categories collection for Item parents
        setCategories(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    const unsubItems = onSnapshot(collection(db, 'master_data', 'items', 'records'), (snap) => {
        setItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
        unsubscribe();
        unsubCats();
        unsubItems();
    };
  }, [activeTab]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const recordData = {
        ...formData,
        code: formData.code.toUpperCase(),
        updatedAt: Timestamp.now()
      };

      const docId = recordData.code; // Use code as document ID for consistency
      await setDoc(doc(db, 'master_data', activeTab, 'records', docId), recordData, { merge: true });

      toast.success(`${activeTab.slice(0, -1)} saved successfully`);
      closeModal();
    } catch (error) {
      toast.error('Operation failed: ' + error.message);
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingRecord(null);
    setFormData(initialFormState);
  };

  const openEdit = (record) => {
    setEditingRecord(record);
    setFormData(record);
    setIsModalOpen(true);
  };

  const deleteRecord = async (id) => {
    if (window.confirm('Are you sure? This might affect SKU generation.')) {
      await deleteDoc(doc(db, 'master_data', activeTab, 'records', id));
      toast.success('Record removed');
    }
  };

  const columns = [
    {
        header: 'Code',
        key: 'code',
        render: (r) => <span className="font-mono font-black text-primary-dark bg-green-50 px-2 py-1 rounded border border-green-100 uppercase">{r.code}</span>
    },
    {
        header: 'Name',
        key: 'name',
        render: (r) => <span className="font-bold text-gray-900">{r.name || (activeTab === 'packs' ? `${r.size} ${r.unit}` : '-')}</span>
    }
  ];

  if (activeTab === 'items') {
    columns.push({ header: 'Category', render: (r) => <span className="text-xs font-bold text-gray-400">{r.parentCode}</span> });
  }
  if (activeTab === 'varieties') {
    columns.push({ header: 'Parent Item', render: (r) => <span className="text-xs font-bold text-gray-400">{r.parentCode}</span> });
  }

  columns.push({
    header: 'Actions',
    render: (r) => (
      <div className="flex space-x-2">
        <button onClick={() => openEdit(r)} className="p-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-all"><Edit2 size={14} /></button>
        <button onClick={() => deleteRecord(r.id)} className="p-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-all"><Trash2 size={14} /></button>
      </div>
    )
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center uppercase">
          <Database className="mr-3 text-primary" size={28} />
          Master Data Management
        </h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-primary text-white px-6 py-3 rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-green-100 hover:bg-primary-dark transition-all flex items-center group active:scale-95"
        >
          <Plus size={18} className="mr-2" />
          Add {activeTab.slice(0, -1)}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center space-x-2 bg-gray-100 p-1.5 rounded-2xl w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center space-x-2 px-6 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
              activeTab === tab.id
                ? 'bg-white text-primary shadow-sm'
                : 'text-gray-400 hover:text-gray-600'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
        <DataTable columns={columns} data={data} loading={loading} />
      </div>

      {/* Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-md p-6">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl animate-in zoom-in duration-300">
            <div className="p-6 border-b border-gray-50 flex items-center justify-between">
              <h2 className="text-lg font-black text-gray-900 uppercase tracking-widest">
                {editingRecord ? 'Edit' : 'Add'} {activeTab.slice(0, -1)}
              </h2>
              <button onClick={closeModal} className="p-2 hover:bg-gray-100 rounded-full transition-all text-gray-400"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              <div className="space-y-1">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Unique Code ({activeTab === 'packs' ? 'e.g. 500ML' : 'e.g. IMD'})</label>
                <input
                  required
                  maxLength={activeTab === 'grades' ? 2 : (activeTab === 'packs' ? 5 : 3)}
                  value={formData.code}
                  onChange={(e) => setFormData({...formData, code: e.target.value.toUpperCase()})}
                  className="w-full px-5 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:border-primary outline-none font-black text-gray-900"
                  placeholder="CODE"
                />
              </div>

              {activeTab !== 'packs' && (
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Display Name</label>
                  <input
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="w-full px-5 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:border-primary outline-none font-bold text-gray-900"
                    placeholder="e.g. Imidacloprid"
                  />
                </div>
              )}

              {activeTab === 'items' && (
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Parent Category</label>
                  <select
                    required
                    value={formData.parentCode}
                    onChange={(e) => setFormData({...formData, parentCode: e.target.value})}
                    className="w-full px-5 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:border-primary outline-none font-bold text-gray-900"
                  >
                    <option value="">Select Category</option>
                    {categories.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                  </select>
                </div>
              )}

              {activeTab === 'varieties' && (
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Parent Item</label>
                  <select
                    required
                    value={formData.parentCode}
                    onChange={(e) => setFormData({...formData, parentCode: e.target.value})}
                    className="w-full px-5 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:border-primary outline-none font-bold text-gray-900"
                  >
                    <option value="">Select Item</option>
                    {items.map(i => <option key={i.code} value={i.code}>{i.name}</option>)}
                  </select>
                </div>
              )}

              {activeTab === 'packs' && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Size (Value)</label>
                    <input
                      type="number"
                      required
                      value={formData.size}
                      onChange={(e) => setFormData({...formData, size: e.target.value})}
                      className="w-full px-5 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:border-primary outline-none font-bold"
                      placeholder="e.g. 500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Unit (2 Char)</label>
                    <select
                      required
                      value={formData.unit}
                      onChange={(e) => setFormData({...formData, unit: e.target.value.toUpperCase()})}
                      className="w-full px-5 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:border-primary outline-none font-black"
                    >
                      <option value="">Select</option>
                      <option value="ML">ML</option>
                      <option value="LT">LT</option>
                      <option value="GM">GM</option>
                      <option value="KG">KG</option>
                      <option value="PC">PC</option>
                    </select>
                  </div>
                </div>
              )}

              <button type="submit" className="w-full bg-primary text-white py-4 rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-green-100 hover:bg-primary-dark transition-all">
                Save {activeTab.slice(0, -1)}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default MasterData;
