import React, { useState, useEffect } from 'react';
import { doc, updateDoc, Timestamp, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { X, Save, Trash2, Plus, AlertCircle, Package, ArrowUpRight, TrendingDown, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';

const BulkVariantManager = ({ product, onClose }) => {
  const [variants, setVariants] = useState(product.variants || []);
  const [isSaving, setIsSaving] = useState(false);
  const [variantsCosts, setVariantsCosts] = useState({});

  // Fetch private costs on load
  useEffect(() => {
     const fetchCosts = async () => {
        try {
           const costSnap = await getDoc(doc(db, 'product_costs', product.id));
           if (costSnap.exists()) {
              setVariantsCosts(costSnap.data().variantsCost || {});
           }
        } catch (e) {
           console.error("Failed to load costs", e);
        }
     };
     fetchCosts();
  }, [product.id]);

  // Initialize if empty (Convert single product to multi-variant)
  const handleInitialize = () => {
    setVariants([{
      id: `var_${Date.now()}`,
      label: `${product.quantity || 'Standard'} ${product.unit || 'pack'}`,
      mrp: product.mrp || 0,
      price: product.price || 0,
      stock: product.stock || 0,
      reorderLevel: product.reorderLevel || 10,
      batchNumber: product.batchNumber || '',
    }]);
  };

  const handleUpdateField = (index, field, value) => {
    const updated = [...variants];
    updated[index] = { ...updated[index], [field]: value };
    setVariants(updated);
  };

  const handleAddRow = () => {
    setVariants([...variants, {
      id: `var_${Date.now()}_${variants.length}`,
      label: '',
      mrp: '',
      price: '',
      stock: '',
      reorderLevel: 10,
      batchNumber: ''
    }]);
  };

  const handleRemoveRow = (index) => {
    const updated = [...variants];
    updated.splice(index, 1);
    setVariants(updated);
  };

  const handleSaveAll = async () => {
    if (variants.length === 0) return toast.error("Add at least one variant");

    // Validation
    const invalid = variants.some(v => !v.label || !v.mrp || !v.price);
    if (invalid) return toast.error("Please fill all required fields (*)");

    setIsSaving(true);
    try {
      const processedVariants = variants.map(v => {
        const cleaned = { ...v };
        delete cleaned.costPrice; // Strict exclusion from public doc
        return {
           ...cleaned,
           mrp: Number(v.mrp),
           price: Number(v.price),
           stock: Number(v.stock),
           reorderLevel: Number(v.reorderLevel || 10)
        };
      });

      // Deriving summary fields for product list
      const totalStock = processedVariants.reduce((s, v) => s + v.stock, 0);
      const minPrice = Math.min(...processedVariants.map(v => v.price));
      const maxMrp = Math.max(...processedVariants.map(v => v.mrp));

      // 1. Update Public Doc
      await updateDoc(doc(db, 'products', product.id), {
        variants: processedVariants,
        price: minPrice,
        mrp: maxMrp,
        stock: totalStock,
        updatedAt: Timestamp.now()
      });

      // 2. Update Private Costs Doc
      const newCosts = {
         productId: product.id,
         variantsCost: variants.reduce((acc, v) => {
            acc[v.id] = v.costPrice || variantsCosts[v.id] || 0;
            return acc;
         }, {}),
         updatedAt: Timestamp.now()
      };
      await setDoc(doc(db, 'product_costs', product.id), newCosts, { merge: true });

      toast.success("All variants updated successfully!");
      onClose();
    } catch (error) {
      console.error(error);
      toast.error("Failed to save updates");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/80 backdrop-blur-sm p-4 md:p-10 animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-6xl max-h-full overflow-hidden rounded-[2.5rem] shadow-2xl flex flex-col border border-white/20">

        {/* Header */}
        <div className="p-8 border-b border-gray-100 flex items-center justify-between bg-white/50 backdrop-blur sticky top-0 z-10">
          <div className="flex items-center space-x-4">
            <div className="h-12 w-12 bg-primary/10 rounded-2xl flex items-center justify-center text-primary">
              <Package size={28} />
            </div>
            <div>
              <h2 className="text-xl font-black text-gray-900 uppercase tracking-tight leading-none mb-1">
                Variant Master: <span className="text-primary">{product.name}</span>
              </h2>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Fast-Mode Stock & Price Manager</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-red-50 hover:text-red-500 rounded-full transition-all text-gray-300">
            <X size={28} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8 bg-gray-50/30">
          {variants.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-6 text-center">
              <div className="p-6 bg-orange-50 rounded-full text-orange-500 animate-bounce">
                <AlertCircle size={48} />
              </div>
              <div className="max-w-md">
                <h3 className="text-lg font-black text-gray-900 uppercase">Single Product Detected</h3>
                <p className="text-sm text-gray-500 font-bold leading-relaxed mt-2 uppercase tracking-tighter">
                  This product currently has no defined pack sizes. Would you like to initialize it as a multi-variant product?
                </p>
              </div>
              <button
                onClick={handleInitialize}
                className="bg-primary text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-green-100 hover:bg-primary-dark transition-all active:scale-95"
              >
                Initialize Variants Now
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[1000px]">
                  <thead className="bg-gray-50/50 border-b border-gray-100">
                    <tr className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em]">
                      <th className="px-6 py-5 font-black">Label (e.g. 1kg) *</th>
                      <th className="px-6 py-5 font-black">MRP (₹) *</th>
                      <th className="px-6 py-5 font-black text-primary">Selling Price (₹) *</th>
                      <th className="px-6 py-5 font-black text-orange-500">Cost Price (₹)</th>
                      <th className="px-6 py-5 font-black">Current Stock *</th>
                      <th className="px-6 py-5 font-black">Low Stock Alert</th>
                      <th className="px-6 py-5 font-black">Batch No</th>
                      <th className="px-6 py-5 font-black text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {variants.map((v, i) => (
                      <tr key={i} className="hover:bg-green-50/30 transition-colors">
                        <td className="px-4 py-3">
                          <input
                            value={v.label}
                            onChange={(e) => handleUpdateField(i, 'label', e.target.value)}
                            className="w-full bg-white border border-gray-100 rounded-xl px-4 py-3 text-sm font-black text-gray-900 focus:ring-2 focus:ring-primary/20 outline-none"
                            placeholder="Variant Name"
                          />
                        </td>
                        <td className="px-4 py-3 w-32">
                          <input
                            type="number"
                            value={v.mrp}
                            onChange={(e) => handleUpdateField(i, 'mrp', e.target.value)}
                            className="w-full bg-white border border-gray-100 rounded-xl px-4 py-3 text-sm font-black text-gray-400 line-through focus:text-gray-900 focus:no-underline focus:ring-2 focus:ring-primary/20 outline-none"
                            placeholder="0"
                          />
                        </td>
                        <td className="px-4 py-3 w-32">
                          <input
                            type="number"
                            value={v.price}
                            onChange={(e) => handleUpdateField(i, 'price', e.target.value)}
                            className="w-full bg-green-50/50 border border-green-100 rounded-xl px-4 py-3 text-sm font-black text-primary-dark focus:ring-2 focus:ring-primary/20 outline-none shadow-inner"
                            placeholder="0"
                          />
                        </td>
                        <td className="px-4 py-3 w-32">
                          <input
                            type="number"
                            value={v.costPrice !== undefined ? v.costPrice : (variantsCosts[v.id] || '')}
                            onChange={(e) => handleUpdateField(i, 'costPrice', Number(e.target.value))}
                            className="w-full bg-orange-50/50 border border-orange-100 rounded-xl px-4 py-3 text-sm font-black text-orange-800 focus:ring-2 focus:ring-orange-200 outline-none shadow-inner"
                            placeholder="Secret"
                          />
                        </td>
                        <td className="px-4 py-3 w-32">
                          <div className="relative group/stock">
                            <input
                              type="number"
                              value={v.stock}
                              onChange={(e) => handleUpdateField(i, 'stock', Number(e.target.value))}
                              className="w-full bg-blue-50/30 border border-blue-100 rounded-xl px-4 py-3 text-sm font-black text-blue-800 focus:ring-2 focus:ring-blue-200 outline-none"
                              placeholder="0"
                            />
                             <div className="absolute -top-10 left-1/2 -translate-x-1/2 opacity-0 group-hover/stock:opacity-100 transition-opacity pointer-events-none bg-blue-900 text-white text-[8px] font-black uppercase px-2 py-1 rounded whitespace-nowrap z-20">Total inventory units</div>
                          </div>
                        </td>
                        <td className="px-4 py-3 w-32">
                          <input
                            type="number"
                            value={v.reorderLevel}
                            onChange={(e) => handleUpdateField(i, 'reorderLevel', Number(e.target.value))}
                            className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm font-bold text-gray-500 focus:text-gray-900 focus:ring-2 focus:ring-primary/20 outline-none"
                            placeholder="10"
                          />
                        </td>
                        <td className="px-4 py-3">
                          <input
                            value={v.batchNumber}
                            onChange={(e) => handleUpdateField(i, 'batchNumber', e.target.value)}
                            className="w-full bg-gray-50 border border-gray-100 rounded-xl px-4 py-3 text-sm font-medium text-gray-600 focus:ring-2 focus:ring-primary/20 outline-none uppercase placeholder:lowercase"
                            placeholder="batch id"
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => handleRemoveRow(i)}
                            className="p-3 text-red-400 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all active:scale-90"
                          >
                            <Trash2 size={18} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex items-center justify-between pt-4">
                 <button
                    onClick={handleAddRow}
                    className="flex items-center space-x-2 bg-white border-2 border-dashed border-gray-200 text-gray-400 px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:border-primary hover:text-primary transition-all active:scale-95"
                  >
                    <Plus size={16} />
                    <span>Add New Pack Size</span>
                  </button>

                  {variants.length > 0 && (
                    <div className="flex items-center space-x-4 text-[10px] font-black uppercase tracking-widest text-gray-400 bg-white px-6 py-4 rounded-2xl border border-gray-100 shadow-sm">
                        <div className="flex items-center space-x-1.5">
                            <Package size={14} className="text-primary" />
                            <span>Total Stock: <span className="text-gray-900">{variants.reduce((s, v) => s + Number(v.stock || 0), 0)}</span></span>
                        </div>
                        <div className="h-4 w-px bg-gray-100" />
                        <div className="flex items-center space-x-1.5">
                            <TrendingDown size={14} className="text-primary" />
                            <span>Starting at: <span className="text-gray-900">₹{Math.min(...variants.map(v => Number(v.price || 0)))}</span></span>
                        </div>
                    </div>
                  )}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-8 bg-gray-50 border-t border-gray-100 flex gap-4">
          <button
            onClick={onClose}
            className="flex-1 bg-white border border-gray-200 text-gray-400 py-5 rounded-[1.5rem] font-black text-sm uppercase tracking-[0.2em] hover:bg-gray-50 transition-all active:scale-98"
          >
            Discard Changes
          </button>
          <button
            onClick={handleSaveAll}
            disabled={isSaving || variants.length === 0}
            className="flex-[2] bg-primary text-white py-5 rounded-[1.5rem] font-black text-sm uppercase tracking-[0.3em] shadow-2xl shadow-green-200 hover:bg-primary-dark transition-all active:scale-[0.98] flex items-center justify-center space-x-3 disabled:opacity-50 disabled:grayscale"
          >
            {isSaving ? (
              <div className="h-5 w-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : <Save size={20} />}
            <span>Sync All Changes</span>
          </button>
        </div>

      </div>
    </div>
  );
};

export default BulkVariantManager;
