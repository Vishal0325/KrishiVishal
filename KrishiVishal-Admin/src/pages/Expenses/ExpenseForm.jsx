import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Save,
  X,
  Plus,
  Receipt,
  Calendar,
  Briefcase,
  User,
  FileText,
  IndianRupee,
  AlertCircle,
  Loader2,
  Trash2,
  Download,
  Eye,
  CheckCircle,
  PlusCircle
} from 'lucide-react';
import { db, storage } from '../../firebase/config';
import { doc, getDoc } from 'firebase/firestore';
import { expenseService } from '../../services/expenseService';
import { useExpenseData } from '../../hooks/useExpenseData';
import { useAuth } from '../../hooks/useAuth';
import {
  APPROVAL_STATUS,
  PAYMENT_STATUS,
  PAYMENT_METHODS,
  DOCUMENT_TYPES
} from '../../utils/expenses/constants';
import { formatCurrency } from '../../utils/formatters';
import toast from 'react-hot-toast';

const ExpenseForm = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { categories, vendors, loading: dataLoading } = useExpenseData();

  const [loading, setLoading] = useState(id ? true : false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const [formData, setFormData] = useState({
    expenseDate: new Date().toISOString().split('T')[0],
    categoryId: '',
    vendorId: '',
    description: '',
    invoiceNumber: '',
    referenceNumber: '',

    // Amount fields (will be stored as minor units)
    subtotal: '',
    discount: '0',
    taxType: 'GST', // GST, IGST, NONE
    cgstRate: '9',
    sgstRate: '9',
    igstRate: '0',
    otherCharges: '0',
    roundOff: '0',

    paymentStatus: PAYMENT_STATUS.UNPAID,
    dueDate: '',
    attachments: []
  });

  const [budgetInfo, setBudgetInfo] = useState(null);

  useEffect(() => {
    if (formData.categoryId) {
      const date = new Date(formData.expenseDate);
      expenseService.getCategoryBudget(formData.categoryId, date.getMonth() + 1, date.getFullYear())
        .then(setBudgetInfo);
    }
  }, [formData.categoryId, formData.expenseDate]);

  // 1. Calculations
  const calculatedTotals = useMemo(() => {
    const sub = parseFloat(formData.subtotal) || 0;
    const disc = parseFloat(formData.discount) || 0;
    const taxable = Math.max(0, sub - disc);

    let cgst = 0; let sgst = 0; let igst = 0;

    if (formData.taxType === 'GST') {
      cgst = (taxable * (parseFloat(formData.cgstRate) || 0)) / 100;
      sgst = (taxable * (parseFloat(formData.sgstRate) || 0)) / 100;
    } else if (formData.taxType === 'IGST') {
      igst = (taxable * (parseFloat(formData.igstRate) || 0)) / 100;
    }

    const other = parseFloat(formData.otherCharges) || 0;
    const off = parseFloat(formData.roundOff) || 0;

    const total = taxable + cgst + sgst + igst + other + off;

    return {
      taxableAmount: taxable,
      cgstAmount: cgst,
      sgstAmount: sgst,
      igstAmount: igst,
      totalAmount: total
    };
  }, [formData]);

  useEffect(() => {
    if (id) {
      async function loadExpense() {
        try {
          const snap = await getDoc(doc(db, 'expenses', id));
          if (snap.exists()) {
            const data = snap.data();
            setFormData({
              ...data,
              expenseDate: data.expenseDate?.toDate?.() ? data.expenseDate.toDate().toISOString().split('T')[0] : data.expenseDate,
              dueDate: data.dueDate?.toDate?.() ? data.dueDate.toDate().toISOString().split('T')[0] : data.dueDate,
              subtotal: (data.subtotalMinor / 100).toString(),
              discount: (data.discountMinor / 100).toString(),
              otherCharges: (data.otherChargesMinor / 100).toString(),
              roundOff: (data.roundOffMinor / 100).toString()
            });
          }
        } catch (err) {
          toast.error("Failed to load expense");
        } finally {
          setLoading(false);
        }
      }
      loadExpense();
    }
  }, [id]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.categoryId) return toast.error("Please select a category");
    if (!formData.description) return toast.error("Please enter a description");
    if (!formData.subtotal || parseFloat(formData.subtotal) <= 0) return toast.error("Invalid amount");

    setSaving(true);
    try {
      const selectedCategory = categories.find(c => c.id === formData.categoryId);
      const selectedVendor = vendors.find(v => v.id === formData.vendorId);

      const payload = {
        ...formData,
        categoryName: selectedCategory?.name || 'Other',
        vendorName: selectedVendor?.name || 'Self',

        // Convert to minor units (Paise)
        subtotalMinor: Math.round(parseFloat(formData.subtotal) * 100),
        discountMinor: Math.round(parseFloat(formData.discount) * 100),
        taxableAmountMinor: Math.round(calculatedTotals.taxableAmount * 100),
        cgstMinor: Math.round(calculatedTotals.cgstAmount * 100),
        sgstMinor: Math.round(calculatedTotals.sgstAmount * 100),
        igstMinor: Math.round(calculatedTotals.igstAmount * 100),
        otherChargesMinor: Math.round(parseFloat(formData.otherCharges) * 100),
        roundOffMinor: Math.round(parseFloat(formData.roundOff) * 100),
        totalAmountMinor: Math.round(calculatedTotals.totalAmount * 100),

        // Date objects
        expenseDate: new Date(formData.expenseDate),
        dueDate: formData.dueDate ? new Date(formData.dueDate) : null
      };

      if (id) {
        await expenseService.updateExpense(id, payload, user.uid);
        toast.success("Expense updated successfully");
      } else {
        await expenseService.createExpense(payload, user.uid);
        toast.success("Expense created and pending approval");
      }
      navigate('/expenses');
    } catch (err) {
      console.error(err);
      toast.error("Failed to save expense");
    } finally {
      setSaving(false);
    }
  };

  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    // We need a document ID for storage path
    // If it's a new expense, we'll store them temporarily or prompt to save first
    if (!id) {
       return toast.error("Please save the expense basic info first to enable uploads.");
    }

    setUploading(true);
    try {
       for (const file of files) {
          if (file.size > 10 * 1024 * 1024) {
             toast.error(`${file.name} is too large (> 10MB)`);
             continue;
          }
          await expenseService.uploadAttachment(id, file, 'INVOICE', user.uid);
       }
       toast.success("Files uploaded successfully");
       // Refresh attachments
       const freshSnap = await getDoc(doc(db, 'expenses', id));
       setFormData(prev => ({ ...prev, attachments: freshSnap.data().attachments || [] }));
    } catch (err) {
       toast.error("Upload failed");
    } finally {
       setUploading(false);
    }
  };

  if (loading || dataLoading) return (
    <div className="h-96 flex items-center justify-center">
      <Loader2 className="animate-spin text-primary" size={48} />
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/expenses')}
            className="p-3 bg-white border border-gray-100 rounded-2xl text-gray-400 hover:text-primary transition-all shadow-sm"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight uppercase">
              {id ? 'Modify Expense' : 'Create New Expense'}
            </h1>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.3em] italic">
              {id ? `Tracking ID: ${formData.expenseNumber}` : 'Record a business expenditure'}
            </p>
          </div>
        </div>
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="flex items-center px-8 py-4 bg-primary text-white rounded-2xl font-black text-xs uppercase tracking-[0.2em] shadow-xl shadow-green-100 hover:bg-green-800 transition-all active:scale-95 disabled:opacity-50"
        >
          {saving ? <Loader2 className="animate-spin mr-2" size={18} /> : <Save className="mr-2" size={18} />}
          {id ? 'Update Record' : 'Submit for Approval'}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Left Column: Form Info */}
        <div className="lg:col-span-2 space-y-8">
          <section className="bg-white p-10 rounded-[3rem] border border-gray-100 shadow-xl shadow-green-100/10 space-y-8">
            <div className="flex items-center space-x-3 mb-2">
               <div className="p-2 bg-green-50 rounded-xl text-primary"><Receipt size={20}/></div>
               <h3 className="text-lg font-black text-gray-900 uppercase tracking-tighter">Primary Information</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Expense Date *</label>
                <input
                  type="date"
                  required
                  value={formData.expenseDate}
                  onChange={(e) => setFormData({...formData, expenseDate: e.target.value})}
                  className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-primary/20 rounded-[2rem] font-bold text-gray-800 outline-none transition-all"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Category *</label>
                <select
                  required
                  value={formData.categoryId}
                  onChange={(e) => setFormData({...formData, categoryId: e.target.value})}
                  className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-primary/20 rounded-[2rem] font-bold text-gray-800 outline-none transition-all"
                >
                  <option value="">Select Category</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                {budgetInfo && (
                  <div className={`mt-2 p-3 rounded-xl border text-[10px] font-black uppercase flex items-center justify-between ${budgetInfo.remainingMinor < 0 ? 'bg-red-50 border-red-100 text-red-600' : 'bg-green-50 border-green-100 text-green-600'}`}>
                    <span>Monthly Budget: {formatCurrency(budgetInfo.amountMinor / 100)}</span>
                    <span>Remaining: {formatCurrency(budgetInfo.remainingMinor / 100)}</span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Vendor (Optional)</label>
                <select
                  value={formData.vendorId}
                  onChange={(e) => setFormData({...formData, vendorId: e.target.value})}
                  className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-primary/20 rounded-[2rem] font-bold text-gray-800 outline-none transition-all"
                >
                  <option value="">No Vendor (Direct / Staff)</option>
                  {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Invoice Number</label>
                <input
                  placeholder="e.g. INV/2026/001"
                  value={formData.invoiceNumber}
                  onChange={(e) => setFormData({...formData, invoiceNumber: e.target.value})}
                  className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-primary/20 rounded-[2rem] font-bold text-gray-800 outline-none transition-all uppercase"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Description / Notes *</label>
              <textarea
                required
                rows={3}
                placeholder="What was this expense for?"
                value={formData.description}
                onChange={(e) => setFormData({...formData, description: e.target.value})}
                className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-primary/20 rounded-[2rem] font-bold text-gray-800 outline-none transition-all resize-none"
              />
            </div>
          </section>

          {/* Amount Breakdown Section */}
          <section className="bg-white p-10 rounded-[3rem] border border-gray-100 shadow-xl shadow-green-100/10 space-y-8">
            <div className="flex items-center justify-between">
               <div className="flex items-center space-x-3">
                  <div className="p-2 bg-blue-50 rounded-xl text-blue-600"><IndianRupee size={20}/></div>
                  <h3 className="text-lg font-black text-gray-900 uppercase tracking-tighter">Amount & Tax</h3>
               </div>
               <div className="flex bg-gray-100 p-1 rounded-2xl">
                 {['NONE', 'GST', 'IGST'].map(type => (
                   <button
                     key={type}
                     type="button"
                     onClick={() => setFormData({...formData, taxType: type})}
                     className={`px-4 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${formData.taxType === type ? 'bg-white text-primary shadow-sm' : 'text-gray-400'}`}
                   >
                     {type}
                   </button>
                 ))}
               </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Base Amount (Subtotal) *</label>
                <div className="relative">
                  <span className="absolute left-6 top-4 font-black text-gray-300">₹</span>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={formData.subtotal}
                    onChange={(e) => setFormData({...formData, subtotal: e.target.value})}
                    className="w-full pl-12 pr-6 py-4 bg-gray-50 border-2 border-transparent focus:border-primary/20 rounded-[2rem] font-black text-gray-900 text-lg outline-none transition-all"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Discount (If any)</label>
                <div className="relative">
                  <span className="absolute left-6 top-4 font-black text-gray-300">₹</span>
                  <input
                    type="number"
                    placeholder="0.00"
                    value={formData.discount}
                    onChange={(e) => setFormData({...formData, discount: e.target.value})}
                    className="w-full pl-12 pr-6 py-4 bg-gray-50 border-2 border-transparent focus:border-red-900/10 rounded-[2rem] font-bold text-gray-600 outline-none transition-all"
                  />
                </div>
              </div>

              {formData.taxType === 'GST' && (
                <>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">CGST Rate (%)</label>
                    <input
                      type="number"
                      value={formData.cgstRate}
                      onChange={(e) => setFormData({...formData, cgstRate: e.target.value})}
                      className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-primary/20 rounded-[2rem] font-bold text-gray-800 outline-none transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">SGST Rate (%)</label>
                    <input
                      type="number"
                      value={formData.sgstRate}
                      onChange={(e) => setFormData({...formData, sgstRate: e.target.value})}
                      className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-primary/20 rounded-[2rem] font-bold text-gray-800 outline-none transition-all"
                    />
                  </div>
                </>
              )}

              {formData.taxType === 'IGST' && (
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">IGST Rate (%)</label>
                  <input
                    type="number"
                    value={formData.igstRate}
                    onChange={(e) => setFormData({...formData, igstRate: e.target.value})}
                    className="w-full px-6 py-4 bg-gray-50 border-2 border-transparent focus:border-primary/20 rounded-[2rem] font-bold text-gray-800 outline-none transition-all"
                  />
                </div>
              )}
            </div>

            {/* Calculations Summary */}
            <div className="bg-gray-50 p-8 rounded-[2.5rem] border border-gray-100 space-y-4">
               <div className="flex justify-between text-xs font-bold">
                 <span className="text-gray-400 uppercase">Taxable Amount</span>
                 <span className="text-gray-700">{formatCurrency(calculatedTotals.taxableAmount)}</span>
               </div>
               {formData.taxType === 'GST' && (
                 <>
                   <div className="flex justify-between text-xs font-bold">
                     <span className="text-gray-400 uppercase">CGST ({formData.cgstRate}%)</span>
                     <span className="text-gray-700">{formatCurrency(calculatedTotals.cgstAmount)}</span>
                   </div>
                   <div className="flex justify-between text-xs font-bold">
                     <span className="text-gray-400 uppercase">SGST ({formData.sgstRate}%)</span>
                     <span className="text-gray-700">{formatCurrency(calculatedTotals.sgstAmount)}</span>
                   </div>
                 </>
               )}
               {formData.taxType === 'IGST' && (
                 <div className="flex justify-between text-xs font-bold">
                   <span className="text-gray-400 uppercase">IGST ({formData.igstRate}%)</span>
                   <span className="text-gray-700">{formatCurrency(calculatedTotals.igstAmount)}</span>
                 </div>
               )}
               <div className="h-px bg-gray-200 my-2" />
               <div className="flex justify-between items-center">
                 <span className="text-sm font-black text-gray-900 uppercase tracking-tighter">Total Payable</span>
                 <span className="text-2xl font-black text-primary">{formatCurrency(calculatedTotals.totalAmount)}</span>
               </div>
            </div>
          </section>
        </div>

        {/* Right Column: Sidebar (Status, Attachments) */}
        <div className="space-y-8">
           <section className="bg-white p-8 rounded-[3rem] border border-gray-100 shadow-sm space-y-6">
              <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em] mb-4">Lifecycle & Timeline</h3>

              <div className="space-y-4">
                 <div className="p-4 bg-orange-50 rounded-2xl border border-orange-100 flex items-center justify-between">
                    <span className="text-[10px] font-black text-orange-700 uppercase tracking-widest">Approval</span>
                    <span className="text-xs font-black text-orange-900">{id ? formData.approvalStatus : 'DRAFT'}</span>
                 </div>

                 <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 flex items-center justify-between">
                    <span className="text-[10px] font-black text-blue-700 uppercase tracking-widest">Payment</span>
                    <span className="text-xs font-black text-blue-900">{formData.paymentStatus}</span>
                 </div>
              </div>

              <div className="space-y-2 pt-4">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Payment Due Date</label>
                <div className="relative">
                  <Calendar className="absolute left-4 top-3.5 text-gray-300" size={18} />
                  <input
                    type="date"
                    value={formData.dueDate}
                    onChange={(e) => setFormData({...formData, dueDate: e.target.value})}
                    className="w-full pl-12 pr-4 py-3.5 bg-gray-50 border border-gray-100 rounded-2xl font-bold text-gray-800 outline-none text-xs"
                  />
                </div>
              </div>
           </section>

           <section className="bg-white p-8 rounded-[3rem] border border-gray-100 shadow-sm space-y-6">
              <div className="flex items-center justify-between mb-4">
                 <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em]">Evidence Vault</h3>
                 <label className="cursor-pointer p-2 bg-primary/10 text-primary rounded-xl hover:bg-primary/20 transition-all">
                    <PlusCircle size={18} />
                    <input type="file" multiple className="hidden" onChange={handleFileUpload} accept=".pdf,.jpg,.jpeg,.png,.webp" />
                 </label>
              </div>

              <div className="space-y-3">
                 {formData.attachments?.map((a, i) => (
                    <div key={i} className="group p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between hover:bg-white hover:shadow-lg transition-all duration-300">
                       <div className="flex items-center space-x-3 overflow-hidden">
                          <div className="h-10 w-10 bg-white rounded-xl flex items-center justify-center border border-gray-100 shrink-0">
                             <FileText size={18} className="text-gray-400" />
                          </div>
                          <div className="overflow-hidden">
                             <p className="text-xs font-bold text-gray-800 truncate">{a.fileName}</p>
                             <p className="text-[8px] font-black text-gray-300 uppercase tracking-widest">{a.documentType}</p>
                          </div>
                       </div>
                       <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity space-x-1">
                          <a href={a.url} target="_blank" rel="noopener" className="p-1.5 text-gray-400 hover:text-primary"><Eye size={14}/></a>
                          <button onClick={() => expenseService.deleteAttachment(id, a.id, user.uid)} className="p-1.5 text-gray-400 hover:text-red-500"><Trash2 size={14}/></button>
                       </div>
                    </div>
                 ))}
                 {(!formData.attachments || formData.attachments.length === 0) && (
                    <div className="py-8 text-center border-2 border-dashed border-gray-100 rounded-3xl">
                       <FileText size={32} className="mx-auto text-gray-100 mb-2" />
                       <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest italic">No documents attached</p>
                    </div>
                 )}
                 {uploading && (
                    <div className="flex items-center justify-center p-4">
                       <Loader2 className="animate-spin text-primary mr-2" size={16} />
                       <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest animate-pulse">Uploading...</span>
                    </div>
                 )}
              </div>
              {!id && (
                 <div className="p-4 bg-yellow-50 rounded-2xl border border-yellow-100 flex items-start space-x-3">
                    <AlertCircle size={16} className="text-yellow-600 mt-0.5" />
                    <p className="text-[9px] font-bold text-yellow-800 uppercase leading-relaxed">
                       Save the record first to enable attachment uploading to secure storage vault.
                    </p>
                 </div>
              )}
           </section>
        </div>
      </div>
    </div>
  );
};

export default ExpenseForm;
