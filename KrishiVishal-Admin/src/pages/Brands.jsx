import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, Timestamp, addDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { db, storage } from '../firebase/config';
import DataTable from '../components/common/DataTable';
import { Plus, Edit2, Trash2, X, Award, Image as ImageIcon, Upload, Link, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

const Brands = () => {
  const [brands, setBrands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBrand, setEditingBrand] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [useUrl, setUseUrl] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    imageUrl: '',
    isActive: true
  });

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'brands'), (snapshot) => {
      setBrands(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!file.type.includes('image')) {
      toast.error('Please upload an image file');
      return;
    }

    setUploading(true);
    const toastId = toast.loading('Uploading image...');

    try {
      const storageRef = ref(storage, `brands/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);

      setFormData(prev => ({ ...prev, imageUrl: url }));
      toast.success('Image uploaded successfully', { id: toastId });
    } catch (error) {
      console.error("Upload error:", error);
      toast.error(`Upload failed: ${error.message}`, { id: toastId });
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = {
        ...formData,
        updatedAt: Timestamp.now()
      };

      if (editingBrand) {
        await setDoc(doc(db, 'brands', editingBrand.id), data, { merge: true });
        toast.success('Brand updated');
      } else {
        const newDocRef = doc(collection(db, 'brands'));
        await setDoc(newDocRef, {
          ...data,
          id: newDocRef.id,
          createdAt: Timestamp.now()
        });
        toast.success('Brand added');
      }
      closeModal();
    } catch (error) {
      toast.error('Operation failed');
    }
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setEditingBrand(null);
    setFormData({ name: '', imageUrl: '', isActive: true });
    setUseUrl(false);
  };

  const openEdit = (brand) => {
    setEditingBrand(brand);
    setFormData({ ...brand });
    setIsModalOpen(true);
  };

  const deleteBrand = async (id) => {
    if (window.confirm('Delete brand?')) {
      await deleteDoc(doc(db, 'brands', id));
      toast.success('Brand removed');
    }
  };

  const columns = [
    { header: 'Image', key: 'imageUrl', render: (b) => (
      <div className="w-12 h-12 rounded-lg bg-gray-100 overflow-hidden border border-gray-100">
        {b.imageUrl ? <img src={b.imageUrl} className="w-full h-full object-cover" alt="" /> : <ImageIcon size={20} className="m-auto mt-3 text-gray-300" />}
      </div>
    )},
    { header: 'Name', key: 'name', render: (b) => <span className="font-black text-gray-900 tracking-tight">{b.name}</span> },
    { header: 'Status', key: 'isActive', render: (b) => (
      <span className={`text-[10px] font-black px-2 py-1 rounded uppercase tracking-widest ${b.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
        {b.isActive ? 'Active' : 'Inactive'}
      </span>
    )},
    { header: 'Actions', render: (b) => (
      <div className="flex space-x-2">
        <button onClick={() => openEdit(b)} className="p-2 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg transition-all"><Edit2 size={16} /></button>
        <button onClick={() => deleteBrand(b.id)} className="p-2 bg-red-50 text-red-600 hover:bg-red-100 rounded-lg transition-all"><Trash2 size={16} /></button>
      </div>
    )}
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center">
          <Award className="mr-3 text-[#1b5e20]" size={28} />
          Popular Brands
        </h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-[#1b5e20] text-white px-6 py-3 rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-green-100 hover:bg-[#2e7d32] transition-all flex items-center group active:scale-95"
        >
          <Plus size={18} className="mr-2 group-hover:scale-110 transition-transform" />
          Add Brand
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <DataTable columns={columns} data={brands} loading={loading} />
        </div>

        <div className="space-y-6">
          <div className="bg-[#1b5e20] p-8 rounded-3xl text-white shadow-xl shadow-green-100 relative overflow-hidden group">
            <h3 className="text-lg font-black uppercase tracking-widest mb-2 relative z-10">Brands Management</h3>
            <p className="text-sm font-medium text-green-100 leading-relaxed relative z-10">
              Manage the popular brands shown on the home screen. Brands can now be added with or without images.
            </p>
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-md p-6 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl animate-in zoom-in duration-300 relative border border-white/20">
            <div className="p-6 border-b border-gray-50 flex items-center justify-between sticky top-0 bg-white z-10">
              <h2 className="text-lg font-black text-gray-900 tracking-tight uppercase tracking-[0.1em]">{editingBrand ? 'Edit Brand' : 'Add Brand'}</h2>
              <button onClick={closeModal} className="p-2 hover:bg-gray-100 rounded-full transition-all text-gray-400"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="p-8 space-y-6">
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Brand Name</label>
                  <input
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-gray-900"
                  />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Brand Logo</label>
                    <button
                      type="button"
                      onClick={() => setUseUrl(!useUrl)}
                      className="text-[10px] font-black text-primary uppercase flex items-center gap-1 hover:underline"
                    >
                      {useUrl ? <Upload size={10} /> : <Link size={10} />}
                      {useUrl ? 'Switch to Upload' : 'Switch to URL'}
                    </button>
                  </div>

                  {useUrl ? (
                    <input
                      value={formData.imageUrl}
                      onChange={(e) => setFormData({...formData, imageUrl: e.target.value})}
                      placeholder="Paste Image URL here..."
                      className="w-full px-5 py-3.5 bg-gray-50 border border-gray-100 rounded-xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-gray-900 text-sm"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center border-2 border-dashed border-gray-200 rounded-2xl p-4 bg-gray-50 hover:bg-gray-100 transition-colors relative group">
                      {formData.imageUrl ? (
                        <div className="relative">
                          <img src={formData.imageUrl} alt="Preview" className="h-24 w-24 object-contain rounded-lg shadow-sm" />
                          <label className="absolute -bottom-2 -right-2 bg-white p-1.5 rounded-full shadow-md cursor-pointer border border-gray-100 hover:text-primary transition-colors">
                            <Upload size={14} />
                            <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} disabled={uploading} />
                          </label>
                        </div>
                      ) : (
                        <label className="flex flex-col items-center justify-center cursor-pointer w-full py-4">
                          {uploading ? (
                            <Loader2 className="animate-spin text-primary mb-2" size={32} />
                          ) : (
                            <Upload className="text-gray-400 group-hover:text-primary transition-colors mb-2" size={32} />
                          )}
                          <span className="text-xs font-bold text-gray-500">{uploading ? 'Uploading...' : 'Click to upload logo'}</span>
                          <input type="file" className="hidden" accept="image/*" onChange={handleImageUpload} disabled={uploading} />
                        </label>
                      )}
                    </div>
                  )}
                  <p className="text-[10px] text-gray-400 font-medium italic">* Image is optional. You can add it later.</p>
                </div>

                <div className="flex items-center space-x-3 pt-2">
                  <input
                    type="checkbox"
                    id="isActive"
                    checked={formData.isActive}
                    onChange={(e) => setFormData({...formData, isActive: e.target.checked})}
                    className="w-5 h-5 accent-[#1b5e20]"
                  />
                  <label htmlFor="isActive" className="text-sm font-bold text-gray-700">Mark as Active</label>
                </div>
              </div>

              <button
                type="submit"
                disabled={uploading}
                className={`w-full bg-[#1b5e20] text-white py-4 rounded-xl font-black text-sm uppercase tracking-widest shadow-lg shadow-green-100 hover:bg-[#2e7d32] transition-all active:scale-[0.98] ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                {editingBrand ? 'Save Changes' : 'Add Brand'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Brands;
