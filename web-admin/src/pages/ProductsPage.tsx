
import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, doc, setDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { useToast } from '../components/ToastProvider';
import { Search, Plus, Edit2, Trash2, Package, Save, X } from 'lucide-react';

interface Product {
  id: string;
  name: string;
  brand: string;
  category: string;
  price: number;
  mrp: number;
  stockQuantity: number;
  imageUrl: string;
  isReturnable?: boolean;
}

const ProductsPage: React.FC = () => {
  const { showToast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [currentProduct, setCurrentProduct] = useState<Partial<Product>>({});

  useEffect(() => {
    const q = query(collection(db, 'products'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data: Product[] = [];
      snapshot.forEach((doc) => data.push({ id: doc.id, ...doc.data() } as Product));
      setProducts(data);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.brand.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSave = async () => {
    if (!currentProduct.name || !currentProduct.price) {
      showToast('Name and Price are required', 'error');
      return;
    }

    try {
      const id = currentProduct.id || doc(collection(db, 'products')).id;
      await setDoc(doc(db, 'products', id), { ...currentProduct, id });
      showToast('Product saved successfully', 'success');
      setIsEditing(false);
      setCurrentProduct({});
    } catch (error) {
      showToast('Error saving product', 'error');
    }
  };

  const handleDelete = async (id: string) => {
    if (window.confirm('Are you sure you want to delete this product?')) {
      try {
        await deleteDoc(doc(db, 'products', id));
        showToast('Product deleted', 'success');
      } catch (error) {
        showToast('Error deleting product', 'error');
      }
    }
  };

  return (
    <div>
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div>
            <h2>Product Management</h2>
            <p>Add, edit or remove products from the catalog.</p>
          </div>
          <button className="btn btn-primary" onClick={() => { setIsEditing(true); setCurrentProduct({}); }}>
            <Plus size={20} /> Add Product
          </button>
        </div>
      </div>

      {isEditing && (
        <div className="card" style={{ marginBottom: '24.dp', padding: '20px' }}>
          <h3>{currentProduct.id ? 'Edit Product' : 'New Product'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginTop: '16px' }}>
            <input type="text" placeholder="Product Name" className="select-input" value={currentProduct.name || ''} onChange={e => setCurrentProduct({...currentProduct, name: e.target.value})} />
            <input type="text" placeholder="Brand" className="select-input" value={currentProduct.brand || ''} onChange={e => setCurrentProduct({...currentProduct, brand: e.target.value})} />
            <input type="text" placeholder="Category" className="select-input" value={currentProduct.category || ''} onChange={e => setCurrentProduct({...currentProduct, category: e.target.value})} />
            <input type="number" placeholder="Price (₹)" className="select-input" value={currentProduct.price || ''} onChange={e => setCurrentProduct({...currentProduct, price: Number(e.target.value)})} />
            <input type="number" placeholder="MRP (₹)" className="select-input" value={currentProduct.mrp || ''} onChange={e => setCurrentProduct({...currentProduct, mrp: Number(e.target.value)})} />
            <input type="number" placeholder="Stock" className="select-input" value={currentProduct.stockQuantity || ''} onChange={e => setCurrentProduct({...currentProduct, stockQuantity: Number(e.target.value)})} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 8px' }}>
              <input
                type="checkbox"
                id="isReturnable"
                checked={currentProduct.isReturnable !== false}
                onChange={e => setCurrentProduct({...currentProduct, isReturnable: e.target.checked})}
                style={{ width: '18px', height: '18px' }}
              />
              <label htmlFor="isReturnable" style={{ fontWeight: 500 }}>Product is Returnable (7 Days)</label>
            </div>
            <input type="text" placeholder="Image URL" className="select-input" style={{ gridColumn: 'span 2' }} value={currentProduct.imageUrl || ''} onChange={e => setCurrentProduct({...currentProduct, imageUrl: e.target.value})} />
          </div>
          <div style={{ marginTop: '20px', display: 'flex', gap: '12px' }}>
            <button className="btn btn-primary" onClick={handleSave}><Save size={18} /> Save</button>
            <button className="btn" style={{ background: '#eee' }} onClick={() => setIsEditing(false)}><X size={18} /> Cancel</button>
          </div>
        </div>
      )}

      <div className="card">
        <div className="filter-bar">
          <div className="search-input-wrapper">
            <Search size={18} />
            <input type="text" className="search-input" placeholder="Search products..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
          </div>
        </div>

        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th>Image</th>
                <th>Name</th>
                <th>Brand</th>
                <th>Price</th>
                <th>Returnable</th>
                <th>Stock</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map(p => (
                <tr key={p.id}>
                  <td><img src={p.imageUrl || 'https://via.placeholder.com/40'} alt="" style={{ width: '40px', height: '40px', borderRadius: '4px', objectFit: 'cover' }} /></td>
                  <td style={{ fontWeight: 600 }}>{p.name}</td>
                  <td>{p.brand}</td>
                  <td>₹{p.price}</td>
                  <td>
                    <span style={{
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      background: p.isReturnable !== false ? '#E3F2FD' : '#FFEBEE',
                      color: p.isReturnable !== false ? '#1976D2' : '#D32F2F',
                      fontWeight: 600
                    }}>
                      {p.isReturnable !== false ? 'Returnable' : 'No Return'}
                    </span>
                  </td>
                  <td>{p.stockQuantity}</td>
                  <td>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button className="btn-icon" onClick={() => { setIsEditing(true); setCurrentProduct(p); }}><Edit2 size={16} /></button>
                      <button className="btn-icon text-danger" onClick={() => handleDelete(p.id)}><Trash2 size={16} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ProductsPage;
