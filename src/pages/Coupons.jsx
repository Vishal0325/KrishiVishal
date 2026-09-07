import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  query,
  onSnapshot,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  Timestamp,
  orderBy
} from 'firebase/firestore';
import { db } from '../firebase/config';
import DataTable from '../components/common/DataTable';
import PageHeader from '../components/common/PageHeader';
import MetricCard from '../components/common/MetricCard';
import { addAuditLog } from '../services/logger';
import {
  Tag,
  Plus,
  Search,
  Edit2,
  Trash2,
  X,
  CheckCircle2,
  Clock,
  Percent,
  IndianRupee,
  Calendar,
  Users,
  ShieldCheck,
  AlertTriangle,
  Loader2,
  Copy,
  ToggleLeft,
  ToggleRight
} from 'lucide-react';
import toast from 'react-hot-toast';
import { formatCurrency, formatDate } from '../utils/formatters';

const DISCOUNT_TYPES = [
  { value: 'FLAT', label: 'Flat Discount (₹)' },
  { value: 'PERCENT', label: 'Percentage Discount (%)' }
];

const STATUS_TABS = [
  { key: 'ALL', label: 'All Coupons' },
  { key: 'ACTIVE', label: 'Active' },
  { key: 'EXPIRED', label: 'Expired' },
  { key: 'DISABLED', label: 'Disabled' }
];

const EMPTY_FORM = {
  code: '',
  discountType: 'PERCENT',
  discountValue: '',
  minOrderAmount: '',
  maxDiscount: '',
  usageLimit: '',
  perUserLimit: '1',
  startDate: '',
  endDate: '',
  description: '',
  isActive: true,
  applicableCategories: ''
};

const Coupons = () => {
  const [coupons, setCoupons] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingCoupon, setEditingCoupon] = useState(null);
  const [formData, setFormData] = useState({ ...EMPTY_FORM });

  useEffect(() => {
    const q = query(collection(db, 'coupons'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(q, (snapshot) => {
      setCoupons(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      setLoading(false);
    });
    return unsub;
  }, []);

  const getCouponStatus = (coupon) => {
    if (!coupon.isActive) return 'DISABLED';
    const now = new Date();
    if (coupon.endDate) {
      const end = coupon.endDate.toDate ? coupon.endDate.toDate() : new Date(coupon.endDate);
      if (end < now) return 'EXPIRED';
    }
    if (coupon.startDate) {
      const start = coupon.startDate.toDate ? coupon.startDate.toDate() : new Date(coupon.startDate);
      if (start > now) return 'SCHEDULED';
    }
    return 'ACTIVE';
  };

  const metrics = useMemo(() => {
    const active = coupons.filter(c => getCouponStatus(c) === 'ACTIVE').length;
    const expired = coupons.filter(c => getCouponStatus(c) === 'EXPIRED').length;
    const disabled = coupons.filter(c => getCouponStatus(c) === 'DISABLED').length;
    const totalUsage = coupons.reduce((s, c) => s + (c.usedCount || 0), 0);
    return { total: coupons.length, active, expired, disabled, totalUsage };
  }, [coupons]);

  const filteredCoupons = useMemo(() => {
    let filtered = coupons;
    if (statusFilter !== 'ALL') {
      filtered = filtered.filter(c => getCouponStatus(c) === statusFilter);
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(c =>
        (c.code || '').toLowerCase().includes(term) ||
        (c.description || '').toLowerCase().includes(term)
      );
    }
    return filtered;
  }, [coupons, statusFilter, searchTerm]);

  const openCreateModal = () => {
    setEditingCoupon(null);
    setFormData({ ...EMPTY_FORM });
    setIsModalOpen(true);
  };

  const openEditModal = (coupon) => {
    setEditingCoupon(coupon);
    setFormData({
      code: coupon.code || '',
      discountType: coupon.discountType || 'PERCENT',
      discountValue: coupon.discountValue || '',
      minOrderAmount: coupon.minOrderAmount || '',
      maxDiscount: coupon.maxDiscount || '',
      usageLimit: coupon.usageLimit || '',
      perUserLimit: coupon.perUserLimit || '1',
      startDate: coupon.startDate?.toDate ? coupon.startDate.toDate().toISOString().slice(0, 10) : (coupon.startDate || ''),
      endDate: coupon.endDate?.toDate ? coupon.endDate.toDate().toISOString().slice(0, 10) : (coupon.endDate || ''),
      description: coupon.description || '',
      isActive: coupon.isActive !== false,
      applicableCategories: coupon.applicableCategories || ''
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.code || !formData.discountValue) {
      toast.error('Coupon code and discount value are required');
      return;
    }

    setSaving(true);
    try {
      const couponData = {
        code: formData.code.toUpperCase().trim(),
        discountType: formData.discountType,
        discountValue: Number(formData.discountValue),
        minOrderAmount: Number(formData.minOrderAmount) || 0,
        maxDiscount: Number(formData.maxDiscount) || 0,
        usageLimit: Number(formData.usageLimit) || 0,
        perUserLimit: Number(formData.perUserLimit) || 1,
        startDate: formData.startDate ? Timestamp.fromDate(new Date(formData.startDate)) : null,
        endDate: formData.endDate ? Timestamp.fromDate(new Date(formData.endDate)) : null,
        description: formData.description,
        isActive: formData.isActive,
        applicableCategories: formData.applicableCategories,
        updatedAt: Timestamp.now()
      };

      if (editingCoupon) {
        await updateDoc(doc(db, 'coupons', editingCoupon.id), couponData);
        await addAuditLog('UPDATE_COUPON', 'Coupon', editingCoupon.id, { code: couponData.code });
        toast.success('Coupon updated successfully');
      } else {
        couponData.createdAt = Timestamp.now();
        couponData.usedCount = 0;
        const docRef = doc(collection(db, 'coupons'));
        await setDoc(docRef, couponData);
        await addAuditLog('CREATE_COUPON', 'Coupon', docRef.id, { code: couponData.code });
        toast.success('Coupon created successfully');
      }

      setIsModalOpen(false);
      setFormData({ ...EMPTY_FORM });
    } catch (error) {
      console.error(error);
      toast.error('Failed to save coupon');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (coupon) => {
    if (!window.confirm(`Delete coupon "${coupon.code}"?`)) return;
    try {
      await deleteDoc(doc(db, 'coupons', coupon.id));
      await addAuditLog('DELETE_COUPON', 'Coupon', coupon.id, { code: coupon.code });
      toast.success('Coupon deleted');
    } catch (error) {
      toast.error('Failed to delete coupon');
    }
  };

  const toggleActive = async (coupon) => {
    try {
      await updateDoc(doc(db, 'coupons', coupon.id), {
        isActive: !coupon.isActive,
        updatedAt: Timestamp.now()
      });
      toast.success(coupon.isActive ? 'Coupon disabled' : 'Coupon activated');
    } catch (error) {
      toast.error('Failed to update coupon');
    }
  };

  const columns = [
    {
      header: 'Coupon Code',
      render: (c) => (
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 bg-purple-100 rounded-xl flex items-center justify-center text-purple-600">
            <Tag size={16} />
          </div>
          <div>
            <p className="font-black text-gray-900 text-sm tracking-wide font-mono">{c.code}</p>
            <p className="text-[10px] text-gray-400 font-medium line-clamp-1">{c.description || 'No description'}</p>
          </div>
        </div>
      )
    },
    {
      header: 'Discount',
      render: (c) => (
        <div className="flex items-center gap-1.5">
          {c.discountType === 'PERCENT' ? (
            <span className="bg-green-100 text-green-700 px-2.5 py-1 rounded-lg text-xs font-black">
              {c.discountValue}% OFF
            </span>
          ) : (
            <span className="bg-blue-100 text-blue-700 px-2.5 py-1 rounded-lg text-xs font-black">
              ₹{c.discountValue} OFF
            </span>
          )}
        </div>
      )
    },
    {
      header: 'Min Order',
      render: (c) => (
        <span className="text-xs font-bold text-gray-600">
          {c.minOrderAmount ? formatCurrency(c.minOrderAmount) : '—'}
        </span>
      )
    },
    {
      header: 'Usage',
      render: (c) => (
        <div className="flex flex-col">
          <span className="text-xs font-bold text-gray-900">{c.usedCount || 0} used</span>
          <span className="text-[10px] text-gray-400">
            {c.usageLimit ? `Limit: ${c.usageLimit}` : 'Unlimited'}
          </span>
        </div>
      )
    },
    {
      header: 'Validity',
      render: (c) => {
        const start = c.startDate?.toDate ? c.startDate.toDate() : (c.startDate ? new Date(c.startDate) : null);
        const end = c.endDate?.toDate ? c.endDate.toDate() : (c.endDate ? new Date(c.endDate) : null);
        return (
          <div className="text-[10px] text-gray-500 font-medium">
            {start ? start.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '—'}
            {' → '}
            {end ? end.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '∞'}
          </div>
        );
      }
    },
    {
      header: 'Status',
      render: (c) => {
        const status = getCouponStatus(c);
        const styles = {
          ACTIVE: 'bg-green-100 text-green-700',
          EXPIRED: 'bg-red-100 text-red-700',
          DISABLED: 'bg-gray-100 text-gray-500',
          SCHEDULED: 'bg-blue-100 text-blue-700'
        };
        return (
          <span className={`px-2.5 py-1 rounded-full text-[9px] font-black uppercase tracking-wider ${styles[status]}`}>
            {status}
          </span>
        );
      }
    },
    {
      header: 'Actions',
      render: (c) => (
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); toggleActive(c); }}
            className="p-2 hover:bg-gray-100 rounded-xl transition-colors"
            title={c.isActive ? 'Disable' : 'Enable'}
          >
            {c.isActive ? <ToggleRight size={16} className="text-green-600" /> : <ToggleLeft size={16} className="text-gray-400" />}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); openEditModal(c); }}
            className="p-2 hover:bg-blue-50 text-blue-500 rounded-xl transition-colors"
          >
            <Edit2 size={15} />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); handleDelete(c); }}
            className="p-2 hover:bg-red-50 text-red-500 rounded-xl transition-colors"
          >
            <Trash2 size={15} />
          </button>
        </div>
      )
    }
  ];

  return (
    <div className="space-y-6 pb-10 animate-in fade-in duration-300">
      <PageHeader
        title="Coupons & Offers Management"
        subtitle="Create, manage, and track promotional discount coupons for the KrishiVishal platform"
        actions={[
          { label: 'Create Coupon', icon: Plus, onClick: openCreateModal, variant: 'primary' }
        ]}
      />

      {/* KPI Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard label="Total Coupons" value={metrics.total} icon={Tag} color="purple" />
        <MetricCard label="Active" value={metrics.active} icon={CheckCircle2} color="green" />
        <MetricCard label="Expired" value={metrics.expired} icon={Clock} color="red" />
        <MetricCard label="Total Redemptions" value={metrics.totalUsage} icon={Users} color="blue" />
      </div>

      {/* Status Filter Tabs */}
      <div className="flex items-center gap-2 bg-gray-50 p-1.5 rounded-2xl w-fit">
        {STATUS_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
              statusFilter === tab.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search + Table */}
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-50 flex items-center gap-3">
          <div className="relative flex-1 max-w-xs">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search coupon code..."
              className="pl-9 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-xs font-medium w-full outline-none focus:ring-2 focus:ring-[#1b5e20]/10 transition-all"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <span className="text-xs text-gray-400 font-medium">
            {filteredCoupons.length} coupon{filteredCoupons.length !== 1 ? 's' : ''}
          </span>
        </div>
        <DataTable columns={columns} data={filteredCoupons} loading={loading} />
      </div>

      {/* Create/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/60 backdrop-blur-md p-4">
          <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl border border-white/20 max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white rounded-t-3xl z-10">
              <div>
                <h3 className="text-lg font-black text-gray-900">
                  {editingCoupon ? 'Edit Coupon' : 'Create New Coupon'}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {editingCoupon ? `Editing: ${editingCoupon.code}` : 'Fill in coupon details below'}
                </p>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-gray-100 rounded-xl">
                <X size={20} className="text-gray-400" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              {/* Code */}
              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1.5">Coupon Code *</label>
                <input
                  type="text"
                  required
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  placeholder="e.g. KRISHI25"
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold uppercase tracking-wider outline-none focus:ring-2 focus:ring-[#1b5e20]/10"
                />
              </div>

              {/* Discount Type + Value */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1.5">Discount Type</label>
                  <select
                    value={formData.discountType}
                    onChange={(e) => setFormData({ ...formData, discountType: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none"
                  >
                    {DISCOUNT_TYPES.map(dt => (
                      <option key={dt.value} value={dt.value}>{dt.label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1.5">
                    Discount Value * {formData.discountType === 'PERCENT' ? '(%)' : '(₹)'}
                  </label>
                  <input
                    type="number"
                    required
                    value={formData.discountValue}
                    onChange={(e) => setFormData({ ...formData, discountValue: e.target.value })}
                    placeholder={formData.discountType === 'PERCENT' ? '25' : '100'}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-[#1b5e20]/10"
                  />
                </div>
              </div>

              {/* Min Order + Max Discount */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1.5">Min Order (₹)</label>
                  <input
                    type="number"
                    value={formData.minOrderAmount}
                    onChange={(e) => setFormData({ ...formData, minOrderAmount: e.target.value })}
                    placeholder="500"
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-[#1b5e20]/10"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1.5">Max Discount (₹)</label>
                  <input
                    type="number"
                    value={formData.maxDiscount}
                    onChange={(e) => setFormData({ ...formData, maxDiscount: e.target.value })}
                    placeholder="200"
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-[#1b5e20]/10"
                  />
                </div>
              </div>

              {/* Usage Limits */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1.5">Total Usage Limit</label>
                  <input
                    type="number"
                    value={formData.usageLimit}
                    onChange={(e) => setFormData({ ...formData, usageLimit: e.target.value })}
                    placeholder="0 = Unlimited"
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-[#1b5e20]/10"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1.5">Per User Limit</label>
                  <input
                    type="number"
                    value={formData.perUserLimit}
                    onChange={(e) => setFormData({ ...formData, perUserLimit: e.target.value })}
                    placeholder="1"
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-[#1b5e20]/10"
                  />
                </div>
              </div>

              {/* Date Range */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1.5">Start Date</label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-[#1b5e20]/10"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1.5">End Date</label>
                  <input
                    type="date"
                    value={formData.endDate}
                    onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                    className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-[#1b5e20]/10"
                  />
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-wider block mb-1.5">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="e.g. Monsoon sale 25% off on all pesticides"
                  rows={2}
                  className="w-full px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium outline-none focus:ring-2 focus:ring-[#1b5e20]/10 resize-none"
                />
              </div>

              {/* Active Toggle */}
              <div className="flex items-center justify-between bg-gray-50 p-3 rounded-xl border border-gray-100">
                <span className="text-xs font-bold text-gray-700">Coupon is Active</span>
                <button
                  type="button"
                  onClick={() => setFormData({ ...formData, isActive: !formData.isActive })}
                  className="transition-all"
                >
                  {formData.isActive ? (
                    <ToggleRight size={28} className="text-green-600" />
                  ) : (
                    <ToggleLeft size={28} className="text-gray-400" />
                  )}
                </button>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={saving}
                className="w-full py-3 bg-[#1b5e20] hover:bg-[#2e7d32] text-white rounded-xl font-black text-xs uppercase tracking-wider transition-all shadow-lg shadow-green-100 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving && <Loader2 size={14} className="animate-spin" />}
                {editingCoupon ? 'Update Coupon' : 'Create Coupon'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Coupons;
