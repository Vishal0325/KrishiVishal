import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, Timestamp, addDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase/config';
import DataTable from '../components/common/DataTable';
import { Grid3X3, Plus, Edit2, Trash2, X, ChevronRight, Package, FolderPlus, Layers, Image as ImageIcon, Upload, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

const Categories = () => {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [uploading, setUploading] = useState(null); // stores id of item being uploaded
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    hindiName: '',
    order: 1,
    imageUrl: '',
    subCategories: []
  });

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'categories'), (snapshot) => {
      setCategories(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).sort((a, b) => a.order - b.order));
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const handleFileUpload = async (file, path, callback) => {
    if (!file) return;
    const uploadId = path; // unique id for loading state
    setUploading(uploadId);
    const toastId = toast.loading('Uploading image...');

    try {
      const storageRef = ref(storage, `${path}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      callback(url);
      toast.success('Uploaded successfully', { id: toastId });
    } catch (error) {
      console.error("Upload error:", error);
      toast.error(`Upload failed: ${error.message}`, { id: toastId });
    } finally {
      setUploading(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = {
        ...formData,
        order: Number(formData.order),
        updatedAt: Timestamp.now()
      };

      if (editingCategory) {
        await setDoc(doc(db, 'categories', editingCategory.id), data, { merge: true });
        toast.success('Category updated');
      } else {
        await addDoc(collection(db, 'categories'), { ...data, createdAt: Timestamp.now() });
        toast.success('Category added');
      }
      closeModal();
    } catch (error) {
      toast.error('Operation failed');
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingCategory(null);
    setFormData({ name: '', code: '', hindiName: '', order: categories.length + 1, imageUrl: '', subCategories: [] });
  };

  const openEdit = (cat) => {
    setEditingCategory(cat);
    setFormData({
      ...cat,
      subCategories: cat.subCategories || []
    });
    setIsModalOpen(true);
  };

  const deleteCategory = async (id) => {
    if (window.confirm('Delete category?')) {
      await deleteDoc(doc(db, 'categories', id));
      toast.success('Category removed');
    }
  };

  const addSubCategory = () => {
    setFormData({
      ...formData,
      subCategories: [...formData.subCategories, { name: '', imageUrl: '', id: Date.now().toString() }]
    });
  };

  const removeSubCategory = (id) => {
    setFormData({
      ...formData,
      subCategories: formData.subCategories.filter(s => s.id !== id)
    });
  };

  const handleSubCategoryChange = (id, field, value) => {
    setFormData({
      ...formData,
      subCategories: formData.subCategories.map(s => s.id === id ? { ...s, [field]: value } : s)
    });
  };

  const columns = [
    { header: 'Order', key: 'order', render: (c) => <span className="font-black text-primary-dark bg-green-50 w-8 h-8 flex items-center justify-center rounded-lg border border-green-100">{c.order}</span> },
    { header: 'Image', key: 'imageUrl', render: (c) => (
      <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden border border-gray-100">
        {c.imageUrl ? <img src={c.imageUrl} className="w-full h-full object-cover" alt="" /> : <ImageIcon size={20} className="m-auto mt-3 text-gray-300" />}
      </div>
    )},
    { header: 'Code', key: 'code', render: (c) => <span className="font-mono font-black text-primary-dark bg-green-50 px-2 py-1 rounded border border-green-100 uppercase">{c.code || '--'}</span> },
    { header: 'Name (English)', key: 'name', render: (c) => <span className="font-black text-gray-900 tracking-tight">{c.name}</span> },
    { header: 'Sub-categories', render: (c) => <span className="text-xs font-bold text-gray-500 bg-gray-50 px-2 py-1 rounded">{c.subCategories?.length || 0} items</span> },
    { header: 'Actions', render: (c) => (
      <div className="flex space-x-2">
        <button onClick={() => openEdit(c)} className="p-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-all"><Edit2 size={16} /></button>
        <button onClick={() => deleteCategory(c.id)} className="p-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-all"><Trash2 size={16} /></button>
      </div>
    )}
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center">
          <Layers className="mr-3 text-primary" size={28} />
          Categories Hierarchy
        </h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-[#1b5e20] text-white px-6 py-3 rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-green-100 hover:bg-[#2e7d32] transition-all flex items-center group active:scale-95"
        >
          <FolderPlus size={18} className="mr-2 group-hover:scale-110 transition-transform" />
          New Category
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <DataTable columns={columns} data={categories} loading={loading} />
        </div>

        <div className="space-y-6">
          <div className="bg-[#1b5e20] p-8 rounded-3xl text-white shadow-xl shadow-green-100 relative overflow-hidden group">
            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:scale-125 transition-transform duration-700">
              <Grid3X3 size={120} />
            </div>
            <h3 className="text-lg font-black uppercase tracking-widest mb-2 relative z-10">Usage Tip</h3>
            <p className="text-sm font-medium text-green-100 leading-relaxed relative z-10">
              Order numbers determine how categories appear in the mobile app. You can now add sub-categories which will be shown as filters in the app.
            </p>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-md p-6 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-3xl shadow-2xl animate-in zoom-in duration-300 relative border border-white/20">
            <div className="p-6 border-b border-gray-50 flex items-center justify-between sticky top-0 bg-white z-10">
              <h2 className="text-lg font-black text-gray-900 tracking-tight uppercase tracking-[0.1em]">{editingCategory ? 'Edit Category' : 'Add Category'}</h2>
              <button onClick={closeModal} className="p-2 hover:bg-gray-100 rounded-full transition-all text-gray-400"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-8 space-y-8">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Category Name (English)</label>
                  <input
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-gray-900"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Category Code (2 Chars)</label>
                  <input
                    required
                    maxLength={2}
                    value={formData.code}
                    onChange={(e) => setFormData({...formData, code: e.target.value.toUpperCase()})}
                    className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-black text-gray-900 uppercase"
                    placeholder="e.g. IN"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Name (Hindi)</label>
                  <input
                    value={formData.hindiName}
                    onChange={(e) => setFormData({...formData, hindiName: e.target.value})}
                    className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-gray-900"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Display Order</label>
                  <input
                    type="number"
                    required
                    value={formData.order}
                    onChange={(e) => setFormData({...formData, order: e.target.value})}
                    className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-black text-gray-900 shadow-inner"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Category Image</label>
                  <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl border border-gray-100 relative group">
                    <div className="h-16 w-16 bg-white rounded-lg overflow-hidden border border-gray-200 flex items-center justify-center shrink-0">
                      {formData.imageUrl ? (
                        <img src={formData.imageUrl} className="w-full h-full object-cover" />
                      ) : (
                        <ImageIcon className="text-gray-300" />
                      )}
                    </div>
                    <label className="flex-1">
                      <div className="bg-white border border-gray-200 py-2 px-4 rounded-lg text-xs font-bold text-gray-600 text-center cursor-pointer hover:bg-gray-50 transition-colors flex items-center justify-center gap-2">
                        {uploading === 'main' ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                        {uploading === 'main' ? 'Uploading...' : 'Change Category Image'}
                      </div>
                      <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e.target.files[0], 'categories', (url) => setFormData(prev => ({...prev, imageUrl: url})))} disabled={uploading !== null} />
                    </label>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-gray-100 pb-2">
                  <h3 className="text-sm font-black uppercase tracking-widest text-gray-900">Sub-Categories</h3>
                  <button
                    type="button"
                    onClick={addSubCategory}
                    className="text-xs font-black text-primary flex items-center hover:underline"
                  >
                    <Plus size={14} className="mr-1" /> Add Sub-Category
                  </button>
                </div>

                <div className="space-y-4">
                  {formData.subCategories.map((sub, index) => (
                    <div key={sub.id} className="p-4 bg-gray-50 rounded-2xl border border-gray-100 space-y-4 relative group">
                      <button
                        type="button"
                        onClick={() => removeSubCategory(sub.id)}
                        className="absolute top-2 right-2 p-1 text-red-400 hover:text-red-600 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                      <div className="flex items-start gap-4">
                        <div className="h-12 w-12 bg-white rounded-lg overflow-hidden border border-gray-200 flex items-center justify-center shrink-0 relative">
                          {sub.imageUrl ? (
                            <img src={sub.imageUrl} className="w-full h-full object-cover" />
                          ) : (
                            <ImageIcon className="text-gray-300" size={20} />
                          )}
                          <label className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer">
                            <Upload size={12} className="text-white" />
                            <input type="file" className="hidden" accept="image/*" onChange={(e) => handleFileUpload(e.target.files[0], 'subcategories', (url) => handleSubCategoryChange(sub.id, 'imageUrl', url))} disabled={uploading !== null} />
                          </label>
                        </div>
                        <div className="flex-1 space-y-1">
                          <label className="text-[9px] font-black text-gray-400 uppercase tracking-widest ml-1">Sub-Category Name</label>
                          <input
                            required
                            value={sub.name}
                            onChange={(e) => handleSubCategoryChange(sub.id, 'name', e.target.value)}
                            className="w-full px-4 py-2 bg-white border border-gray-200 rounded-lg focus:border-primary outline-none text-sm font-bold"
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  {formData.subCategories.length === 0 && (
                    <p className="text-center py-4 text-xs font-bold text-gray-400 italic">No sub-categories added yet.</p>
                  )}
                </div>
              </div>

              <button type="submit" className="w-full bg-primary text-white py-4 rounded-xl font-black text-sm uppercase tracking-widest shadow-lg shadow-green-100 hover:bg-primary-dark transition-all active:scale-[0.98]">
                {editingCategory ? 'Save Changes' : 'Create Category'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Categories;
