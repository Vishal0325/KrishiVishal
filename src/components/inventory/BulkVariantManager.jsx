import React, { useState, useEffect } from 'react';
import { doc, updateDoc, Timestamp, getDoc, setDoc } from 'firebase/firestore';
import { db, functions } from '../../firebase/config';
import { httpsCallable } from 'firebase/functions';
import { X, Save, Trash2, Plus, AlertCircle, Package, ArrowUpRight, TrendingDown, ShieldCheck, Fingerprint } from 'lucide-react';
import SKUBuilderRow from './SKUBuilderRow';
import { fetchMasterData } from '../../services/masterData';
import toast from 'react-hot-toast';

const BulkVariantManager = ({ product, onClose }) => {
  const [variants, setVariants] = useState(product.variants || []);
  const [isSaving, setIsSaving] = useState(false);
  const [masterData, setMasterData] = useState({
    categories: [],
    items: [],
    varieties: [],
    grades: [],
    packs: [],
    brands: []
  });

  // Fetch Master Data for SKU Generation
  useEffect(() => {
    const loadMaster = async () => {
      try {
        const [cats, items, vars, grades, packs, brands] = await Promise.all([
          fetchMasterData('categories'),
          fetchMasterData('items'),
          fetchMasterData('varieties'),
          fetchMasterData('grades'),
          fetchMasterData('packs'),
          fetchMasterData('brands')
        ]);
        setMasterData({ categories: cats, items, varieties: vars, grades, packs, brands });
      } catch (e) {
        toast.error("Failed to load master data");
      }
    };
    loadMaster();
  }, []);

  const handleUpdateField = (index, field, value) => {
    const updated = [...variants];
    updated[index] = { ...updated[index], [field]: value };
    setVariants(updated);
  };

  const handleAddRow = () => {
    setVariants([...variants, {
      id: `var_${Date.now()}`,
      skuCode: '',
      segments: {},
      price: '',
      mrp: '',
      stock: 0,
      label: ''
    }]);
  };

  const handleRemoveRow = (index) => {
    const updated = [...variants];
    updated.splice(index, 1);
    setVariants(updated);
  };

  const handleSaveAll = async () => {
    if (variants.length === 0) return toast.error("Add at least one SKU");

    const invalid = variants.some(v => !v.skuCode || !v.price);
    if (invalid) return toast.error("SKU Code and Price are mandatory");

    setIsSaving(true);
    const upsertSku = httpsCallable(functions, 'upsertSku');

    try {
      // 1. Save individual SKUs via Cloud Function (SSoT)
      for (const v of variants) {
        await upsertSku({
          skuCode: v.skuCode,
          data: {
            name: `${product.name} - ${v.skuCode}`,
            mrp: v.mrp || 0,
            consumerPrice: v.price,
            stock: v.stock || 0
          }
        });
      }

      // 2. The Cloud Function onSkuWrite will automatically sync to products document.
      toast.success("All SKUs synchronized successfully!");
      onClose();
    } catch (error) {
      console.error(error);
      toast.error("Sync failed: " + error.message);
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
                <h3 className="text-lg font-black text-gray-900 uppercase">Legacy Product Detected</h3>
                <p className="text-sm text-gray-500 font-bold leading-relaxed mt-2 uppercase tracking-tighter">
                  This product has no Agri-standard SKUs. Please add variants using the 6-segment nomenclature.
                </p>
              </div>
              <button
                onClick={handleAddRow}
                className="bg-primary text-white px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-green-100 hover:bg-primary-dark transition-all active:scale-95"
              >
                Create First SKU
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="bg-white rounded-[2rem] border border-gray-100 shadow-sm overflow-hidden overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[1200px]">
                  <thead className="bg-gray-50/50 border-b border-gray-100">
                    <tr className="text-[9px] font-black text-gray-400 uppercase tracking-[0.2em]">
                      <th className="px-2 py-5">CAT</th>
                      <th className="px-2 py-5">ITEM</th>
                      <th className="px-2 py-5">VAR</th>
                      <th className="px-2 py-5">BRAND</th>
                      <th className="px-2 py-5">SIZE/UNIT</th>
                      <th className="px-4 py-5">GENERATED SKU ID</th>
                      <th className="px-2 py-5 text-primary">PRICE (₹) *</th>
                      <th className="px-2 py-5 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {variants.map((v, i) => (
                      <SKUBuilderRow
                        key={v.id}
                        variant={v}
                        index={i}
                        onUpdate={handleUpdateField}
                        onRemove={handleRemoveRow}
                        masterData={masterData}
                      />
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
