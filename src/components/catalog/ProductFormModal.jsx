import React, { useEffect } from "react";
import { X, Plus, Edit2, ShieldAlert, Zap, Search, Trash2, Check } from "lucide-react";
import ImageUpload from "../common/ImageUpload";
import toast from "react-hot-toast";
import { autoDeriveSkuFromProduct } from "../../utils/skuGenerator";

const validUnits = ["ml", "L", "gm", "kg", "piece", "meter", "pack", "bag", "pouch"];
const validFormulationTypes = ["None", "SL", "EC", "SC", "WP", "WG", "WDG", "GR", "SP", "FS", "CS"];

const toxicityLabels = [
  { id: "red", label: "Bright Red (Extremely Toxic)", color: "#FF0000" },
  { id: "yellow", label: "Bright Yellow (Highly Toxic)", color: "#FFFF00" },
  { id: "blue", label: "Bright Blue (Moderately Toxic)", color: "#0000FF" },
  { id: "green", label: "Bright Green (Slightly Toxic)", color: "#008000" },
];

export default function ProductFormModal({
  isOpen,
  onClose,
  formData,
  setFormData,
  categories,
  brands,
  crops,
  suppliers,
  onSubmit,
  isSubmitting,
  editingProduct,
}) {
  if (!isOpen) return null;

  const handleCategoryChange = (e) => {
    const newCategory = e.target.value;
    const updates = { category: newCategory, subCategory: "" };

    // Auto GST & HSN logic
    if (newCategory === "Seeds") {
      updates.gstRate = 0;
      updates.hsnCode = "120999";
    } else if (["Insecticide", "Fungicide", "Herbicide"].includes(newCategory)) {
      updates.gstRate = 18;
    } else if (newCategory === "Micronutrient") {
      updates.gstRate = 12;
    }

    setFormData({ ...formData, ...updates });
  };

  const selectedCategoryData = categories.find((c) => c.name === formData.category);
  const subCategories = selectedCategoryData?.subCategories || [];

  const handleAddVariant = () => {
    let newVariants = [...(formData.variants || [])];
    if (newVariants.length === 0) {
      // Transition from single to multiple: copy existing single data to variant #1
      newVariants.push({
        label: formData.quantity ? `${formData.quantity} ${formData.unit}` : "",
        quantity: formData.quantity || "",
        unit: formData.unit || "piece",
        mrp: formData.mrp || "",
        price: formData.price || "",
        costPrice: formData.costPrice || "",
        stock: formData.stock || "",
        reorderLevel: formData.reorderLevel || 10,
        shippingWeightGm: formData.shippingWeightGm || "",
        batchNumber: formData.batchNumber || "",
        mfgDate: formData.mfgDate || "",
        expiryDate: formData.expiryDate || "",
        skuCode: autoDeriveSkuFromProduct({
          name: formData.name,
          brand: formData.brand,
          category: formData.category,
          quantity: formData.quantity || "",
          unit: formData.unit || "piece"
        })
      });
    }
    // Add a new empty variant
    newVariants.push({
      label: "",
      quantity: "",
      unit: formData.unit || "piece",
      mrp: "",
      price: "",
      costPrice: "",
      stock: "",
      reorderLevel: 10,
      shippingWeightGm: "",
      batchNumber: "",
      mfgDate: "",
      expiryDate: "",
      skuCode: ""
    });
    setFormData({ ...formData, variants: newVariants });
  };

  const handleRemoveVariant = (idx) => {
    const newVariants = [...formData.variants];
    newVariants.splice(idx, 1);
    setFormData({ ...formData, variants: newVariants });
  };

  const handleVariantChange = (idx, field, value) => {
    const newVariants = [...formData.variants];
    newVariants[idx][field] = value;
    
    // Auto update label and SKU when quantity/unit changes
    if (field === "quantity" || field === "unit") {
       newVariants[idx].label = `${newVariants[idx].quantity || ''} ${newVariants[idx].unit || ''}`.trim();
       newVariants[idx].skuCode = autoDeriveSkuFromProduct({
          name: formData.name,
          brand: formData.brand,
          category: formData.category,
          quantity: newVariants[idx].quantity,
          unit: newVariants[idx].unit
       });
    }
    
    setFormData({ ...formData, variants: newVariants });
  };

  const isMultiVariant = formData.variants && formData.variants.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-md p-6 animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-5xl max-h-[90vh] overflow-y-auto rounded-3xl shadow-2xl relative border border-white/20 custom-scrollbar">
        <div className="p-6 border-b border-gray-50 sticky top-0 bg-white/95 backdrop-blur z-20 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 bg-green-50 rounded-xl flex items-center justify-center text-primary-dark">
              {editingProduct ? <Edit2 size={20} /> : <Plus size={24} />}
            </div>
            <div>
              <h2 className="text-xl font-black text-gray-900 tracking-tight">
                {editingProduct ? "Edit Product" : "Add Product"}
              </h2>
              <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                Product Specification Form
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-red-50 hover:text-red-500 rounded-full transition-all text-gray-400"
          >
            <X size={24} />
          </button>
        </div>

        <form onSubmit={onSubmit} className="p-8 space-y-12">
          {/* Block 1: Basic Information & Taxonomy */}
          <section className="space-y-6">
            <h3 className="text-sm font-black uppercase tracking-widest text-primary-dark border-b border-gray-100 pb-2">
              Block 1: Basic Information & Taxonomy
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
                <label className="text-xs font-bold text-gray-500 uppercase">Product Imagery</label>
                <ImageUpload
                  currentImages={formData.images || []}
                  onUpload={(urls) => setFormData({ ...formData, images: urls })}
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase">Product Name *</label>
                <input
                  type="text"
                  required
                  value={formData.name || ""}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 mt-1 focus:ring-2 focus:ring-primary-dark"
                  placeholder="e.g. Coragen Insecticide"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase">Brand *</label>
                <select
                  required
                  value={formData.brand || ""}
                  onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                  className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 mt-1 focus:ring-2 focus:ring-primary-dark"
                >
                  <option value="">Select Brand</option>
                  {brands.map((b) => (
                    <option key={b.id || b.name} value={b.name}>{b.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase">Category *</label>
                <select
                  required
                  value={formData.category || ""}
                  onChange={handleCategoryChange}
                  className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 mt-1 focus:ring-2 focus:ring-primary-dark"
                >
                  <option value="">Select Category</option>
                  {categories.map((c) => (
                    <option key={c.id || c.name} value={c.name}>{c.name}</option>
                  ))}
                  <option value="Insecticide">Insecticide</option>
                  <option value="Fungicide">Fungicide</option>
                  <option value="Herbicide">Herbicide</option>
                  <option value="Micronutrient">Micronutrient</option>
                  <option value="Tools & Equipment">Tools & Equipment</option>
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase">Sub-Category</label>
                <select
                  value={formData.subCategory || ""}
                  onChange={(e) => setFormData({ ...formData, subCategory: e.target.value })}
                  className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 mt-1 focus:ring-2 focus:ring-primary-dark"
                >
                  <option value="">Select Sub-Category</option>
                  {subCategories.map((sc) => (
                    <option key={sc.id || sc.name} value={sc.name}>{sc.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase">HSN Code *</label>
                <input
                  type="text"
                  required
                  value={formData.hsnCode || ""}
                  onChange={(e) => setFormData({ ...formData, hsnCode: e.target.value })}
                  className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 mt-1"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-500 uppercase">GST Rate (%) *</label>
                <select
                  required
                  value={formData.gstRate ?? 18}
                  onChange={(e) => setFormData({ ...formData, gstRate: Number(e.target.value) })}
                  className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 mt-1"
                >
                  <option value="0">0% (Exempt)</option>
                  <option value="5">5%</option>
                  <option value="12">12%</option>
                  <option value="18">18%</option>
                  <option value="28">28%</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="flex items-center space-x-3 cursor-pointer p-4 border border-gray-100 rounded-xl bg-gray-50">
                  <input
                    type="checkbox"
                    checked={formData.isTaxInclusive ?? true}
                    onChange={(e) => setFormData({ ...formData, isTaxInclusive: e.target.checked })}
                    className="w-5 h-5 text-primary-dark rounded focus:ring-primary-dark"
                  />
                  <span className="font-bold text-gray-700">Prices are Inclusive of Tax</span>
                </label>
              </div>
              
              <div className="md:col-span-2">
                 <label className="text-xs font-bold text-gray-500 uppercase">Associated Crops</label>
                 <div className="flex items-center space-x-3 mb-2 mt-1">
                    <input
                       type="checkbox"
                       checked={formData.isAllCrops || false}
                       onChange={(e) => setFormData({ ...formData, isAllCrops: e.target.checked, associatedCropNames: e.target.checked ? [] : formData.associatedCropNames })}
                       className="w-4 h-4 text-primary-dark rounded"
                    />
                    <span className="text-sm text-gray-700 font-bold">Available for ALL Crops</span>
                 </div>
                 {!formData.isAllCrops && (
                    <select
                       multiple
                       value={formData.associatedCropNames || []}
                       onChange={(e) => {
                          const options = [...e.target.selectedOptions];
                          const values = options.map(o => o.value);
                          setFormData({ ...formData, associatedCropNames: values });
                       }}
                       className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-primary-dark h-32"
                    >
                       {crops.map((c) => (
                          <option key={c.id || c.name} value={c.name}>{c.name}</option>
                       ))}
                    </select>
                 )}
                 <p className="text-xs text-gray-400 mt-1">Hold Ctrl (Windows) or Cmd (Mac) to select multiple crops.</p>
              </div>
            </div>
          </section>

          {/* Block 2: Category-Specific Dynamic Engine */}
          {(["Insecticide", "Fungicide", "Herbicide"].includes(formData.category) || formData.category === "Seeds" || formData.category === "Micronutrient" || formData.category === "Tools & Equipment") && (
             <section className="space-y-6">
               <h3 className="text-sm font-black uppercase tracking-widest text-primary-dark border-b border-gray-100 pb-2">
                 Block 2: Category-Specific Metadata
               </h3>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 
                 {/* Agrochemicals */}
                 {["Insecticide", "Fungicide", "Herbicide"].includes(formData.category) && (
                    <>
                      <div className="md:col-span-2">
                        <label className="text-xs font-bold text-gray-500 uppercase">Technical Formulation (Chemical Composition) *</label>
                        <input
                           type="text"
                           required
                           value={formData.chemicalComposition || ""}
                           onChange={(e) => setFormData({ ...formData, chemicalComposition: e.target.value })}
                           className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 mt-1"
                           placeholder="e.g., Azoxystrobin 18.2% + Difenoconazole 11.4% SC"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Formulation Type</label>
                        <select
                           value={formData.formulationType || "None"}
                           onChange={(e) => setFormData({ ...formData, formulationType: e.target.value })}
                           className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 mt-1"
                        >
                           {validFormulationTypes.map((t) => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Target Pests / Diseases / Weeds</label>
                        <input
                           type="text"
                           value={(formData.agroMetadata?.targetPests || "")}
                           onChange={(e) => setFormData({ ...formData, agroMetadata: { ...formData.agroMetadata, targetPests: e.target.value } })}
                           className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 mt-1"
                           placeholder="Comma separated (e.g. Stem Borer, Blast)"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Recommended Dosage</label>
                        <input
                           type="text"
                           value={formData.agroMetadata?.dosePerAcre || ""}
                           onChange={(e) => setFormData({ ...formData, agroMetadata: { ...formData.agroMetadata, dosePerAcre: e.target.value } })}
                           className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 mt-1"
                           placeholder="e.g. 200 ml / Acre"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Toxicity Triangle</label>
                        <select
                           value={formData.agroMetadata?.toxicityLabel || "green"}
                           onChange={(e) => setFormData({ ...formData, agroMetadata: { ...formData.agroMetadata, toxicityLabel: e.target.value } })}
                           className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 mt-1"
                        >
                           {toxicityLabels.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">PHI (Waiting Period in Days)</label>
                        <input
                           type="number"
                           value={formData.agroMetadata?.phiDays || ""}
                           onChange={(e) => setFormData({ ...formData, agroMetadata: { ...formData.agroMetadata, phiDays: e.target.value } })}
                           className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 mt-1"
                           placeholder="Days"
                        />
                      </div>
                    </>
                 )}

                 {/* Seeds */}
                 {formData.category === "Seeds" && (
                    <>
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Crop Type</label>
                        <input
                           type="text"
                           value={formData.seedMetadata?.cropType || ""}
                           onChange={(e) => setFormData({ ...formData, seedMetadata: { ...formData.seedMetadata, cropType: e.target.value } })}
                           className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 mt-1"
                           placeholder="e.g. Cauliflower"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Variety / Hybrid Name *</label>
                        <input
                           type="text"
                           required
                           value={formData.seedMetadata?.variety || ""}
                           onChange={(e) => setFormData({ ...formData, seedMetadata: { ...formData.seedMetadata, variety: e.target.value } })}
                           className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Sowing Season</label>
                        <input
                           type="text"
                           value={formData.seedMetadata?.sowingSeason || ""}
                           onChange={(e) => setFormData({ ...formData, seedMetadata: { ...formData.seedMetadata, sowingSeason: e.target.value } })}
                           className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 mt-1"
                           placeholder="e.g. Kharif, Rabi"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Maturity Duration</label>
                        <input
                           type="text"
                           value={formData.seedMetadata?.maturityDuration || ""}
                           onChange={(e) => setFormData({ ...formData, seedMetadata: { ...formData.seedMetadata, maturityDuration: e.target.value } })}
                           className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 mt-1"
                           placeholder="e.g. 60-65 DAT"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Germination Rate (% Min)</label>
                        <input
                           type="number"
                           value={formData.seedMetadata?.germination || ""}
                           onChange={(e) => setFormData({ ...formData, seedMetadata: { ...formData.seedMetadata, germination: e.target.value } })}
                           className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Physical Purity (%)</label>
                        <input
                           type="number"
                           value={formData.seedMetadata?.purity || 98}
                           onChange={(e) => setFormData({ ...formData, seedMetadata: { ...formData.seedMetadata, purity: e.target.value } })}
                           className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Recommended Seed Rate / Acre</label>
                        <input
                           type="text"
                           value={formData.seedMetadata?.seedRatePerAcre || ""}
                           onChange={(e) => setFormData({ ...formData, seedMetadata: { ...formData.seedMetadata, seedRatePerAcre: e.target.value } })}
                           className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 mt-1"
                        />
                      </div>
                    </>
                 )}

                 {/* Micronutrient */}
                 {formData.category === "Micronutrient" && (
                    <>
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Nutrient Composition *</label>
                        <input
                           type="text"
                           required
                           value={formData.chemicalComposition || ""}
                           onChange={(e) => setFormData({ ...formData, chemicalComposition: e.target.value })}
                           className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 mt-1"
                           placeholder="e.g. Zinc 12% EDTA"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Application Method</label>
                        <input
                           type="text"
                           value={formData.agroMetadata?.applicationMethod || ""}
                           onChange={(e) => setFormData({ ...formData, agroMetadata: { ...formData.agroMetadata, applicationMethod: e.target.value } })}
                           className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 mt-1"
                           placeholder="e.g. Foliar Spray, Drip"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Target Deficiency</label>
                        <input
                           type="text"
                           value={formData.agroMetadata?.targetDeficiency || ""}
                           onChange={(e) => setFormData({ ...formData, agroMetadata: { ...formData.agroMetadata, targetDeficiency: e.target.value } })}
                           className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 mt-1"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Dosage per Acre / Liter</label>
                        <input
                           type="text"
                           value={formData.agroMetadata?.dosePerAcre || ""}
                           onChange={(e) => setFormData({ ...formData, agroMetadata: { ...formData.agroMetadata, dosePerAcre: e.target.value } })}
                           className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 mt-1"
                        />
                      </div>
                    </>
                 )}

                 {/* Tools */}
                 {formData.category === "Tools & Equipment" && (
                    <>
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Power Source</label>
                        <select
                           value={formData.equipmentMetadata?.powerSource || "Manual"}
                           onChange={(e) => setFormData({ ...formData, equipmentMetadata: { ...formData.equipmentMetadata, powerSource: e.target.value } })}
                           className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 mt-1"
                        >
                           <option value="Manual">Manual</option>
                           <option value="Battery">Battery</option>
                           <option value="Petrol/Diesel">Petrol/Diesel</option>
                           <option value="Electric">Electric</option>
                           <option value="PTO">PTO</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Capacity (Tank/Equipment)</label>
                        <input
                           type="text"
                           value={formData.equipmentMetadata?.capacity || ""}
                           onChange={(e) => setFormData({ ...formData, equipmentMetadata: { ...formData.equipmentMetadata, capacity: e.target.value } })}
                           className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 mt-1"
                           placeholder="e.g. 16 Ltr"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-bold text-gray-500 uppercase">Warranty Period</label>
                        <input
                           type="text"
                           value={formData.equipmentMetadata?.warrantyPeriod || ""}
                           onChange={(e) => setFormData({ ...formData, equipmentMetadata: { ...formData.equipmentMetadata, warrantyPeriod: e.target.value } })}
                           className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 mt-1"
                        />
                      </div>
                    </>
                 )}
               </div>
             </section>
          )}

          {/* Block 3: Supply Chain & Procurement */}
          <section className="space-y-6">
            <h3 className="text-sm font-black uppercase tracking-widest text-primary-dark border-b border-gray-100 pb-2">
              Block 3: Supply Chain
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase">Fulfillment Model *</label>
                <div className="flex space-x-4 mt-2">
                   <label className="flex items-center space-x-2">
                      <input type="radio" name="fulfillment" value="SELF_STOCK" checked={formData.fulfillmentType === "SELF_STOCK" || !formData.fulfillmentType} onChange={() => setFormData({...formData, fulfillmentType: "SELF_STOCK"})} className="text-primary-dark" />
                      <span className="text-sm font-bold">Self Stock</span>
                   </label>
                   <label className="flex items-center space-x-2">
                      <input type="radio" name="fulfillment" value="ON_DEMAND" checked={formData.fulfillmentType === "ON_DEMAND"} onChange={() => setFormData({...formData, fulfillmentType: "ON_DEMAND"})} className="text-primary-dark" />
                      <span className="text-sm font-bold">On Demand (JIT)</span>
                   </label>
                </div>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 uppercase">Primary Supplier</label>
                <select
                  value={formData.primarySupplierId || ""}
                  onChange={(e) => setFormData({ ...formData, primarySupplierId: e.target.value })}
                  className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 mt-1"
                >
                  <option value="">Select Supplier</option>
                  {suppliers.map(s => <option key={s.id} value={s.id}>{s.name} - {s.leadTime || 0}d lead</option>)}
                </select>
              </div>
            </div>
          </section>

          {/* Block 4: Packaging, Variants & Inventory Matrix */}
          <section className="space-y-6 bg-gray-50 -mx-8 px-8 py-8 border-y border-gray-100">
            <div className="flex items-center justify-between">
               <h3 className="text-sm font-black uppercase tracking-widest text-primary-dark">
                 Block 4: Packaging & Inventory Matrix
               </h3>
               <label className="flex items-center space-x-3 cursor-pointer p-3 border border-gray-200 rounded-xl bg-white shadow-sm hover:shadow transition-all">
                 <input
                   type="checkbox"
                   checked={isMultiVariant}
                   onChange={(e) => {
                     if (e.target.checked) handleAddVariant();
                     else setFormData({ ...formData, variants: [] });
                   }}
                   className="w-5 h-5 text-primary-dark rounded focus:ring-primary-dark"
                 />
                 <span className="font-bold text-gray-900">Has Multiple Variants / Pack Sizes?</span>
               </label>
            </div>

            {!isMultiVariant ? (
               // SINGLE VARIANT
               <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                 <div className="md:col-span-2 flex space-x-2">
                   <div className="flex-1">
                     <label className="text-xs font-bold text-gray-500 uppercase">Pack Size Value</label>
                     <input type="number" required value={formData.quantity || ""} onChange={e => setFormData({...formData, quantity: e.target.value})} className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 mt-1" placeholder="e.g. 500" />
                   </div>
                   <div className="flex-1">
                     <label className="text-xs font-bold text-gray-500 uppercase">Unit</label>
                     <select value={formData.unit || "piece"} onChange={e => setFormData({...formData, unit: e.target.value})} className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 mt-1">
                        {validUnits.map(u => <option key={u} value={u}>{u}</option>)}
                     </select>
                   </div>
                 </div>
                 
                 <div>
                   <label className="text-xs font-bold text-gray-500 uppercase">MRP (₹) *</label>
                   <input type="number" required min="0" value={formData.mrp || ""} onChange={e => setFormData({...formData, mrp: e.target.value})} className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 mt-1" />
                 </div>
                 <div>
                   <label className="text-xs font-bold text-gray-500 uppercase">Selling Price (₹) *</label>
                   <input type="number" required min="0" value={formData.price || ""} onChange={e => setFormData({...formData, price: e.target.value})} className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 mt-1" />
                   {Number(formData.price) > Number(formData.mrp) && <p className="text-red-500 text-[10px] mt-1">Selling price cannot exceed MRP.</p>}
                 </div>
                 <div>
                   <label className="text-xs font-bold text-gray-500 uppercase">Purchase Cost (₹)</label>
                   <input type="number" min="0" value={formData.costPrice || ""} onChange={e => setFormData({...formData, costPrice: e.target.value})} className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 mt-1" />
                 </div>
                 <div>
                   <label className="text-xs font-bold text-gray-500 uppercase">Stock Qty *</label>
                   <input type="number" required min="0" value={formData.stock || ""} onChange={e => setFormData({...formData, stock: e.target.value})} className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 mt-1" />
                 </div>
                 <div>
                   <label className="text-xs font-bold text-gray-500 uppercase">Alert Threshold</label>
                   <input type="number" min="0" value={formData.reorderLevel ?? 10} onChange={e => setFormData({...formData, reorderLevel: e.target.value})} className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 mt-1" />
                 </div>
                 <div>
                   <label className="text-xs font-bold text-gray-500 uppercase">Courier Weight (gm)</label>
                   <input type="number" min="0" value={formData.shippingWeightGm || ""} onChange={e => setFormData({...formData, shippingWeightGm: e.target.value})} className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 mt-1" />
                 </div>
                 <div>
                   <label className="text-xs font-bold text-gray-500 uppercase">Batch / Lot No</label>
                   <input type="text" value={formData.batchNumber || ""} onChange={e => setFormData({...formData, batchNumber: e.target.value})} className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 mt-1" />
                 </div>
                 <div>
                   <label className="text-xs font-bold text-gray-500 uppercase">{formData.category === "Seeds" ? "Date of Test" : "Expiry Date"}</label>
                   <input type="date" value={formData.expiryDate || ""} onChange={e => setFormData({...formData, expiryDate: e.target.value})} className="w-full bg-gray-50 p-3 rounded-xl border border-gray-200 mt-1" />
                 </div>
               </div>
            ) : (
               // MULTI VARIANT
               <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 overflow-x-auto custom-scrollbar">
                  <div className="mb-4 flex justify-between items-center">
                    <h4 className="font-bold text-gray-800">Variant Matrix</h4>
                    <button type="button" onClick={handleAddVariant} className="flex items-center gap-2 text-sm font-bold text-primary hover:bg-primary-light px-3 py-1.5 rounded-lg transition-colors">
                      <Plus size={16}/> Add Variant
                    </button>
                  </div>
                  <table className="w-full text-left text-sm border-collapse min-w-[900px]">
                     <thead>
                       <tr className="border-b-2 border-gray-200">
                          <th className="pb-3 text-xs text-gray-400 uppercase tracking-wider font-bold">Pack Size</th>
                          <th className="pb-3 text-xs text-gray-400 uppercase tracking-wider font-bold w-48">SKU Code</th>
                          <th className="pb-3 text-xs text-gray-400 uppercase tracking-wider font-bold w-24">MRP</th>
                          <th className="pb-3 text-xs text-gray-400 uppercase tracking-wider font-bold w-24">Selling</th>
                          <th className="pb-3 text-xs text-gray-400 uppercase tracking-wider font-bold w-24">Cost</th>
                          <th className="pb-3 text-xs text-gray-400 uppercase tracking-wider font-bold w-20">Stock</th>
                          <th className="pb-3 text-xs text-gray-400 uppercase tracking-wider font-bold w-24">Wt (gm)</th>
                          <th className="pb-3 text-xs text-gray-400 uppercase tracking-wider font-bold">Batch</th>
                          <th className="pb-3 text-xs text-gray-400 uppercase tracking-wider font-bold">Expiry</th>
                          <th className="pb-3 text-xs text-gray-400 uppercase tracking-wider font-bold w-12"></th>
                       </tr>
                     </thead>
                     <tbody className="divide-y divide-gray-100">
                       {formData.variants.map((v, i) => (
                          <tr key={i} className="hover:bg-gray-50 transition-colors">
                             <td className="py-3 px-1">
                               <div className="flex items-center space-x-1">
                                 <input type="number" required className="w-16 p-2 border border-gray-200 rounded-lg text-sm bg-gray-50" value={v.quantity} onChange={e => handleVariantChange(i, "quantity", e.target.value)} placeholder="Size" />
                                 <select className="w-16 p-2 border border-gray-200 rounded-lg text-sm bg-gray-50" value={v.unit} onChange={e => handleVariantChange(i, "unit", e.target.value)}>
                                   {validUnits.map(u => <option key={u} value={u}>{u}</option>)}
                                 </select>
                               </div>
                             </td>
                             <td className="py-3 px-1">
                               <input type="text" className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-gray-50" value={v.skuCode} onChange={e => handleVariantChange(i, "skuCode", e.target.value)} placeholder="Auto-generated" />
                             </td>
                             <td className="py-3 px-1">
                               <input type="number" required min="0" className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-gray-50" value={v.mrp} onChange={e => handleVariantChange(i, "mrp", e.target.value)} />
                             </td>
                             <td className="py-3 px-1">
                               <input type="number" required min="0" className={`w-full p-2 border rounded-lg text-sm bg-gray-50 ${Number(v.price) > Number(v.mrp) ? 'border-red-500' : 'border-gray-200'}`} value={v.price} onChange={e => handleVariantChange(i, "price", e.target.value)} />
                             </td>
                             <td className="py-3 px-1">
                               <input type="number" min="0" className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-gray-50" value={v.costPrice} onChange={e => handleVariantChange(i, "costPrice", e.target.value)} />
                             </td>
                             <td className="py-3 px-1">
                               <input type="number" required min="0" className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-gray-50" value={v.stock} onChange={e => handleVariantChange(i, "stock", e.target.value)} />
                             </td>
                             <td className="py-3 px-1">
                               <input type="number" min="0" className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-gray-50" value={v.shippingWeightGm || ""} onChange={e => handleVariantChange(i, "shippingWeightGm", e.target.value)} />
                             </td>
                             <td className="py-3 px-1">
                               <input type="text" className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-gray-50" value={v.batchNumber} onChange={e => handleVariantChange(i, "batchNumber", e.target.value)} />
                             </td>
                             <td className="py-3 px-1">
                               <input type="date" className="w-full p-2 border border-gray-200 rounded-lg text-sm bg-gray-50" value={v.expiryDate} onChange={e => handleVariantChange(i, "expiryDate", e.target.value)} />
                             </td>
                             <td className="py-3 px-1 text-center">
                               {formData.variants.length > 1 && (
                                  <button type="button" onClick={() => handleRemoveVariant(i)} className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                                    <Trash2 size={16} />
                                  </button>
                               )}
                             </td>
                          </tr>
                       ))}
                     </tbody>
                  </table>
               </div>
            )}
          </section>

          {/* Action Bar */}
          <div className="flex items-center justify-end space-x-4 pt-6 border-t border-gray-100 sticky bottom-0 bg-white z-10 p-4 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.05)] rounded-b-3xl">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 text-sm font-bold text-gray-500 hover:text-gray-900 transition-colors"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center space-x-2 px-8 py-3 bg-primary-dark hover:bg-green-900 text-white rounded-xl font-bold transition-all shadow-lg shadow-primary-dark/30 hover:shadow-xl hover:shadow-primary-dark/40 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Check size={18} />
                  <span>{editingProduct ? "Update Catalog" : "List Product"}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
