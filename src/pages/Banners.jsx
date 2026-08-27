import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, doc, setDoc, deleteDoc, Timestamp, addDoc, query, orderBy } from 'firebase/firestore';
import { db, storage } from '../firebase/config';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { Image as ImageIcon, Plus, Trash2, X, Link as LinkIcon, Eye, MoveHorizontal, AlertCircle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

const Banners = () => {
  const [banners, setBanners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [formData, setFormData] = useState({ title: '', link: '', imageUrl: '', order: 1 });

  useEffect(() => {
    const q = query(collection(db, 'banners'), orderBy('order', 'asc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setBanners(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploading(true);
    try {
      // 1. Upload to Firebase Storage
      const fileName = `${Date.now()}_${file.name}`;
      const storageRef = ref(storage, `banners/${fileName}`);
      const snapshot = await uploadBytes(storageRef, file);

      // 2. Get Download URL
      const imageUrl = await getDownloadURL(snapshot.ref);

      setFormData({ ...formData, imageUrl: imageUrl });
      toast.success('Banner uploaded to Firebase!');
    } catch (error) {
      console.error(error);
      toast.error('Upload failed. Check Firebase Storage rules.');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.imageUrl) return toast.error('Upload image first');

    try {
      await addDoc(collection(db, 'banners'), {
        title: formData.title,
        imageUrl: formData.imageUrl,
        linkUrl: formData.link, // Mapped to Android 'linkUrl'
        priority: Number(formData.order), // Mapped to Android 'priority'
        createdAt: Timestamp.now()
      });
      toast.success('Banner added!');
      setIsModalOpen(false);
      setFormData({ title: '', link: '', imageUrl: '', order: banners.length + 1 });
    } catch (error) {
      toast.error('Failed to save');
    }
  };

  const deleteBanner = async (id) => {
    if (window.confirm('Remove this banner?')) {
      await deleteDoc(doc(db, 'banners', id));
      toast.success('Banner removed');
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center">
          <ImageIcon className="mr-3 text-primary" size={28} />
          Marketing Banners
        </h1>
        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-[#1b5e20] text-white px-6 py-3 rounded-2xl font-black text-sm uppercase tracking-widest shadow-lg shadow-green-100 hover:bg-[#2e7d32] transition-all flex items-center group active:scale-95"
        >
          <Plus size={18} className="mr-2 group-hover:rotate-90 transition-transform" />
          Create Banner
        </button>
      </div>

      {/* Banner Preview Section */}
      <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center space-x-2 text-primary">
            <Eye size={20} />
            <h2 className="text-xs font-black uppercase tracking-[0.2em]">App Home Preview</h2>
          </div>
          <div className="flex items-center space-x-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest">
            <MoveHorizontal size={14} className="animate-pulse" />
            <span>Drag to reorder in production</span>
          </div>
        </div>

        <div className="relative w-full max-w-2xl mx-auto aspect-[12/5] bg-gray-50 rounded-3xl border-4 border-gray-100 overflow-hidden shadow-2xl flex items-center justify-center">
          {banners.length > 0 ? (
            <img src={banners[0].imageUrl} className="w-full h-full object-cover animate-in fade-in duration-700" alt="Preview" />
          ) : (
            <div className="text-center space-y-3">
              <AlertCircle size={48} className="mx-auto text-gray-200" />
              <p className="text-sm font-black text-gray-300 uppercase tracking-widest">No Active Banners</p>
            </div>
          )}
          <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex space-x-2">
            {banners.map((_, i) => (
              <div key={i} className={`h-1.5 w-1.5 rounded-full ${i === 0 ? 'bg-primary w-4' : 'bg-white/50'}`} />
            ))}
          </div>
        </div>
      </div>

      {/* Banner Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
        {banners.map((banner, i) => (
          <div key={banner.id} className="group bg-white rounded-3xl shadow-sm border border-gray-100 overflow-hidden hover:shadow-xl transition-all duration-500 relative">
            <div className="absolute top-4 left-4 bg-white/95 backdrop-blur px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest text-primary shadow-sm z-10">
              #{banner.order} Priority
            </div>
            <div className="aspect-[16/7] overflow-hidden bg-gray-50">
              <img src={banner.imageUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" alt="" />
            </div>
            <div className="p-6 space-y-4">
              <div className="space-y-1">
                <h3 className="font-black text-gray-900 tracking-tight text-lg truncate">{banner.title || 'Promotional Slide'}</h3>
                <div className="flex items-center text-primary-dark space-x-1.5">
                  <LinkIcon size={12} />
                  <span className="text-[10px] font-bold uppercase tracking-tighter truncate max-w-[200px]">{banner.link || 'No redirect link'}</span>
                </div>
              </div>
              <button
                onClick={() => deleteBanner(banner.id)}
                className="w-full flex items-center justify-center space-x-2 bg-red-50 text-red-600 py-3 rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] hover:bg-red-500 hover:text-white transition-all shadow-sm"
              >
                <Trash2 size={14} />
                <span>Remove Banner</span>
              </button>
            </div>
          </div>
        ))}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-md max-h-[90vh] overflow-y-auto rounded-[2rem] shadow-2xl animate-in zoom-in duration-300 relative border border-white/20">
            <div className="p-6 border-b border-gray-50 flex items-center justify-between sticky top-0 bg-white z-10">
              <h2 className="text-lg font-black text-gray-900 uppercase tracking-tighter">New Banner</h2>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-red-50 hover:text-red-500 rounded-full transition-all text-gray-300"><X size={20} /></button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Custom Image Input */}
              <div className="space-y-3">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Banner Image (1200 x 500)</label>
                <div className="relative aspect-[16/7] rounded-2xl bg-gray-50 border-2 border-dashed border-gray-200 overflow-hidden flex items-center justify-center group cursor-pointer hover:border-primary transition-colors">
                  {formData.imageUrl ? (
                    <>
                      <img src={formData.imageUrl} className="w-full h-full object-cover" alt="" />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <Plus className="text-white rotate-45" size={28} onClick={(e) => { e.stopPropagation(); setFormData({...formData, imageUrl: ''})}} />
                      </div>
                    </>
                  ) : (
                    <div className="text-center space-y-1">
                      {uploading ? <Loader2 className="animate-spin mx-auto text-primary" size={24} /> : (
                        <>
                          <ImageIcon className="mx-auto text-gray-300" size={28} />
                          <p className="text-[8px] font-black text-gray-400 uppercase tracking-[0.2em]">Click to Upload</p>
                        </>
                      )}
                      <input type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleImageUpload} accept="image/*" disabled={uploading} />
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Banner Title</label>
                  <input
                    value={formData.title}
                    onChange={(e) => setFormData({...formData, title: e.target.value})}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-gray-900 text-sm"
                    placeholder="e.g., Monsoon Special Offer"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Link/Route</label>
                  <input
                    value={formData.link}
                    onChange={(e) => setFormData({...formData, link: e.target.value})}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-gray-900 text-sm"
                    placeholder="product_id or category_name"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Display Order</label>
                  <input
                    type="number"
                    value={formData.order}
                    onChange={(e) => setFormData({...formData, order: e.target.value})}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-black text-gray-900 text-sm"
                  />
                </div>
              </div>

              <button type="submit" className="w-full bg-primary text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-green-100 hover:bg-primary-dark transition-all active:scale-[0.98]">
                Publish Banner
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Banners;
