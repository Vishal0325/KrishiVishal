import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useToast } from '../components/ToastProvider';
import { Plus, Trash2, Tag, Leaf, Award } from 'lucide-react';

interface BaseItem {
  id: string;
  name: string;
  imageUrl: string;
}

const CategoriesCropsPage: React.FC = () => {
  const { showToast } = useToast();
  const [categories, setCategories] = useState<BaseItem[]>([]);
  const [crops, setCrops] = useState<BaseItem[]>([]);
  const [brands, setBrands] = useState<BaseItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubCat = onSnapshot(query(collection(db, 'categories')), (s) =>
      setCategories(s.docs.map(d => ({ id: d.id, ...d.data() } as BaseItem))));
    const unsubCrop = onSnapshot(query(collection(db, 'crops')), (s) =>
      setCrops(s.docs.map(d => ({ id: d.id, ...d.data() } as BaseItem))));
    const unsubBrand = onSnapshot(query(collection(db, 'brands')), (s) =>
      setBrands(s.docs.map(d => ({ id: d.id, ...d.data() } as BaseItem))));

    return () => { unsubCat(); unsubCrop(); unsubBrand(); };
  }, []);

  const addItem = async (col: string, name: string, image: string) => {
    if (!name) return;
    try {
      const id = doc(collection(db, col)).id;
      await setDoc(doc(db, col, id), { id, name, imageUrl: image, isActive: true });
      showToast(`${col} added successfully`, 'success');
    } catch (e) { showToast('Error adding item', 'error'); }
  };

  const deleteItem = async (col: string, id: string) => {
    if (window.confirm('Delete this item?')) {
      try {
        await deleteDoc(doc(db, col, id));
        showToast('Item deleted', 'success');
      } catch (e) { showToast('Error deleting', 'error'); }
    }
  };

  const Section = ({ title, items, col, icon: Icon }: any) => {
    const [name, setName] = useState('');
    const [img, setImg] = useState('');

    return (
      <div className="card" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
          <Icon size={20} color="var(--primary-color)" />
          <h3 style={{ margin: 0 }}>Manage {title}</h3>
        </div>
        <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
          <input type="text" placeholder={`New ${title} Name`} className="select-input" value={name} onChange={e => setName(e.target.value)} />
          <input type="text" placeholder="Image URL" className="select-input" value={img} onChange={e => setImg(e.target.value)} />
          <button className="btn btn-primary" onClick={() => { addItem(col, name, img); setName(''); setImg(''); }}>Add</button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '12px' }}>
          {items.map((item: any) => (
            <div key={item.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: '#f9f9f9', borderRadius: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <img src={item.imageUrl || 'https://via.placeholder.com/30'} style={{ width: '30px', height: '30px', borderRadius: '50%' }} />
                <span>{item.name}</span>
              </div>
              <button className="btn-icon text-danger" onClick={() => deleteItem(col, item.id)}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="page-header">
        <h2>Categories, Crops & Brands</h2>
        <p>Configure the basic data used in the KrishiVishal App.</p>
      </div>
      <Section title="Categories" items={categories} col="categories" icon={Tag} />
      <Section title="Crops" items={crops} col="crops" icon={Leaf} />
      <Section title="Brands" items={brands} col="brands" icon={Award} />
    </div>
  );
};

export default CategoriesCropsPage;
