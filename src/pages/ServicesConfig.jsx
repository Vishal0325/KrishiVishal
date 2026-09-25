import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, setDoc, deleteDoc, serverTimestamp, updateDoc, query, where } from 'firebase/firestore';
import { db } from '../firebase/config';
import { toast } from 'react-hot-toast';
import { Plus, Edit2, Trash2, ShieldAlert, Image as ImageIcon, Layers, X } from 'lucide-react';
import LoadingSpinner from '../components/common/LoadingSpinner';


const ServicesConfig = () => {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    imageUrl: '',
    rateType: 'PER_ACRE',
    customRateUnit: '',
    baseRate: 0,
    radiusKm: 3,
    radiusExpansionSteps: '3, 5, 10',
    commissionType: 'PERCENT',
    commissionValue: 15,
    includesMaterial: false,
    hasVariants: false,
    variants: [],
    isActive: true,
  });
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    fetchServices();
  }, []);

  const fetchServices = async () => {
    try {
      const querySnapshot = await getDocs(collection(db, 'services'));
      const servicesData = querySnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setServices(servicesData);
    } catch (error) {
      toast.error('Failed to load services');
    } finally {
      setLoading(false);
    }
  };

  const handleAddVariant = () => {
    setFormData(prev => ({
      ...prev,
      variants: [
        ...(prev.variants || []),
        { id: `var_${Date.now()}`, name: '', capacityInfo: '', price: 0 }
      ]
    }));
  };

  const handleVariantChange = (index, field, value) => {
    const updated = [...(formData.variants || [])];
    updated[index] = { ...updated[index], [field]: field === 'price' ? Number(value) : value };
    setFormData({ ...formData, variants: updated });
  };

  const handleRemoveVariant = (index) => {
    const updated = formData.variants.filter((_, i) => i !== index);
    setFormData({ ...formData, variants: updated });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...formData,
        baseRate: Number(formData.baseRate),
        radiusKm: Number(formData.radiusKm),
        commissionValue: Number(formData.commissionValue),
        radiusExpansionSteps: formData.radiusExpansionSteps.split(',').map(s => Number(s.trim())),
        variants: formData.hasVariants ? formData.variants : [],
        updatedAt: serverTimestamp()
      };

      if (editingId) {
        await updateDoc(doc(db, 'services', editingId), payload);
        toast.success('Service updated successfully');
      } else {
        payload.createdAt = serverTimestamp();
        const newDocRef = doc(collection(db, 'services'));
        await setDoc(newDocRef, payload);
        toast.success('Service added successfully');
      }
      setIsModalOpen(false);
      setEditingId(null);
      fetchServices();
    } catch (error) {
      toast.error('Failed to save service');
    }
  };

  const handleEdit = (service) => {
    setFormData({
      ...service,
      imageUrl: service.imageUrl || '',
      hasVariants: service.hasVariants || false,
      variants: service.variants || [],
      radiusExpansionSteps: service.radiusExpansionSteps ? service.radiusExpansionSteps.join(', ') : '3, 5, 10'
    });
    setEditingId(service.id);
    setIsModalOpen(true);
  };

  const toggleStatus = async (id, currentStatus) => {
    try {
      await updateDoc(doc(db, 'services', id), {
        isActive: !currentStatus,
        updatedAt: serverTimestamp()
      });
      fetchServices();
      toast.success(currentStatus ? 'Service deactivated' : 'Service activated');
    } catch (error) {
      toast.error('Failed to update status');
    }
  };

  const handleDeleteService = async (serviceId, serviceName) => {
    try {
      const q = query(
        collection(db, 'service_bookings'),
        where('serviceId', '==', serviceId),
        where('status', 'in', ['PENDING_ASSIGNMENT', 'ASSIGNED', 'ON_THE_WAY', 'IN_PROGRESS'])
      );
      const snapshot = await getDocs(q);

      if (!snapshot.empty) {
        toast.error(`Cannot delete "${serviceName}". ${snapshot.size} active booking(s) are currently in progress.`);
        return;
      }

      if (window.confirm(`Are you sure you want to deactivate "${serviceName}"?`)) {
        await updateDoc(doc(db, 'services', serviceId), {
          isActive: false,
          updatedAt: serverTimestamp()
        });
        toast.success(`Service "${serviceName}" deactivated.`);
        fetchServices();
      }
    } catch (error) {
      console.error("Error deleting service:", error);
      toast.error('Failed to delete service');
    }
  };

  // Calculate Partner Payout for Preview
  const getPartnerPayout = (baseRate, cType, cValue) => {
    const rate = Number(baseRate) || 0;
    const val = Number(cValue) || 0;
    if (cType === 'PERCENT') {
      return rate - (rate * (val / 100));
    }
    return rate - val;
  };


  if (loading) return <LoadingSpinner />;

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Service Catalog Config</h1>
          <p className="text-sm text-gray-500">Manage base rates, packages/variants, radius, and material inclusion</p>
        </div>
        <button 
          onClick={() => {
            setFormData({
              name: '',
              description: '',
              imageUrl: '',
              rateType: 'PER_ACRE',
              customRateUnit: '',
              baseRate: 0,
              radiusKm: 3,
              radiusExpansionSteps: '3, 5, 10',
              commissionType: 'PERCENT',
              commissionValue: 15,
              includesMaterial: false,
              hasVariants: false,
              variants: [],
              isActive: true,
            });
            setEditingId(null);
            setIsModalOpen(true);
          }}
          className="bg-primary text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2"
        >
          <Plus size={18} /> Add Service
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
              <th className="p-4 font-bold">Image</th>
              <th className="p-4 font-bold">Service Details</th>
              <th className="p-4 font-bold">Customer Price</th>
              <th className="p-4 font-bold">Variants / Packages</th>
              <th className="p-4 font-bold">Radius (Km)</th>
              <th className="p-4 font-bold">Material</th>
              <th className="p-4 font-bold">Status</th>
              <th className="p-4 font-bold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {services.map((service) => (
              <tr key={service.id} className="hover:bg-gray-50 transition-colors">
                <td className="p-4">
                  {service.imageUrl ? (
                    <img src={service.imageUrl} alt={service.name} className="w-12 h-12 object-cover rounded-lg border" />
                  ) : (
                    <div className="w-12 h-12 bg-gray-100 rounded-lg border flex items-center justify-center text-gray-400">
                      <ImageIcon size={20} />
                    </div>
                  )}
                </td>
                <td className="p-4">
                  <p className="font-bold text-gray-900">{service.name}</p>
                  <p className="text-xs text-gray-500">{service.description}</p>
                </td>
                <td className="p-4 font-semibold text-gray-900">
                  ₹{service.baseRate} / {service.rateType === 'CUSTOM' ? service.customRateUnit : service.rateType.replace('PER_', '')}
                </td>
                <td className="p-4">
                  {service.hasVariants && service.variants?.length > 0 ? (
                    <span className="bg-purple-100 text-purple-700 text-xs px-2.5 py-1 rounded-md font-bold flex items-center gap-1 w-max">
                      <Layers size={14} /> {service.variants.length} Packages
                    </span>
                  ) : (
                    <span className="text-xs text-gray-400 font-medium">Standard Unit</span>
                  )}
                </td>
                <td className="p-4 text-sm text-gray-600">
                  {service.radiusKm} km <br/><span className="text-xs text-gray-400">Expand: {service.radiusExpansionSteps?.join(', ')}</span>
                </td>
                <td className="p-4">
                  {service.includesMaterial ? 
                    <span className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-md font-bold">Included</span> : 
                    <span className="bg-orange-100 text-orange-700 text-xs px-2 py-1 rounded-md font-bold">Labour Only</span>
                  }
                </td>
                <td className="p-4">
                  <button 
                    onClick={() => toggleStatus(service.id, service.isActive)}
                    className={`text-xs px-2 py-1 rounded-md font-bold ${service.isActive ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}
                  >
                    {service.isActive ? 'Active' : 'Inactive'}
                  </button>
                </td>
                <td className="p-4 text-right flex justify-end gap-1">
                  <button onClick={() => handleEdit(service)} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg" title="Edit Service">
                    <Edit2 size={16} />
                  </button>
                  <button onClick={() => handleDeleteService(service.id, service.name)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg" title="Deactivate Service">
                    <Trash2 size={16} />
                  </button>
                </td>

              </tr>
            ))}
            {services.length === 0 && (
              <tr>
                <td colSpan="8" className="p-8 text-center text-gray-500">No services configured yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white p-6 rounded-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto custom-scrollbar">
            <h2 className="text-xl font-bold mb-4">{editingId ? 'Edit Service' : 'Add New Service'}</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="block text-sm font-bold text-gray-700 mb-1">Service Name</label>
                  <input required type="text" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full border p-2 rounded-lg" placeholder="e.g. Drone Spraying" />
                </div>
                
                <div className="col-span-2">
                  <label className="block text-sm font-bold text-gray-700 mb-1">Image URL (Customer App Photo)</label>
                  <input type="url" value={formData.imageUrl} onChange={e => setFormData({...formData, imageUrl: e.target.value})} className="w-full border p-2 rounded-lg" placeholder="https://example.com/image.jpg" />
                  {formData.imageUrl && (
                    <img src={formData.imageUrl} alt="Preview" className="mt-2 h-24 rounded-lg border object-cover" />
                  )}
                </div>

                <div className="col-span-2">
                  <label className="block text-sm font-bold text-gray-700 mb-1">Description (Optional)</label>
                  <input type="text" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full border p-2 rounded-lg" placeholder="Describe the service..." />
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Base Customer Price (₹)</label>
                  <input required type="number" value={formData.baseRate} onChange={e => setFormData({...formData, baseRate: e.target.value})} className="w-full border p-2 rounded-lg" />
                  <p className="text-xs text-gray-500 mt-1">Default price when no variants are selected.</p>
                </div>
                
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Rate Type (Unit)</label>
                  <select value={formData.rateType} onChange={e => setFormData({...formData, rateType: e.target.value})} className="w-full border p-2 rounded-lg">
                    <option value="PER_ACRE">Per Acre</option>
                    <option value="PER_BIGHA">Per Bigha</option>
                    <option value="PER_KATHA">Per Katha</option>
                    <option value="PER_DAY">Per Day (Multi-Day Jobs)</option>
                    <option value="PER_WEEK">Per Week (Weekly Hire)</option>
                    <option value="PER_MONTH">Per Month (Monthly Contract)</option>
                    <option value="PER_SEASON">Per Season (3-4 Months)</option>
                    <option value="PER_HOUR">Per Hour</option>
                    <option value="PER_WORKER">Per Worker (Contractor Mode)</option>
                    <option value="FIXED">Fixed Amount (Lumpsum)</option>
                    <option value="CUSTOM">Custom Unit...</option>
                  </select>
                </div>

                {formData.rateType === 'CUSTOM' && (
                  <div>
                    <label className="block text-sm font-bold text-gray-700 mb-1">Custom Rate Unit Label</label>
                    <input type="text" value={formData.customRateUnit || ''} onChange={e => setFormData({...formData, customRateUnit: e.target.value})} className="w-full border p-2 rounded-lg" placeholder="e.g. Per Tree, Per Tank, Per Quintal" />
                  </div>
                )}

                {/* Service Variants Builder */}
                <div className="col-span-2 border p-4 rounded-xl bg-purple-50/50 border-purple-100">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <input 
                        type="checkbox" 
                        id="hasVariants" 
                        checked={formData.hasVariants} 
                        onChange={e => setFormData({...formData, hasVariants: e.target.checked})} 
                        className="w-5 h-5 text-purple-600 rounded border-gray-300"
                      />
                      <label htmlFor="hasVariants" className="text-sm font-bold text-gray-900 cursor-pointer">
                        Enable Service Variants / Packages (e.g., 1 Tanki, 3 Tanki, 10 Tanki)
                      </label>
                    </div>
                    {formData.hasVariants && (
                      <button 
                        type="button" 
                        onClick={handleAddVariant} 
                        className="text-xs bg-purple-600 text-white font-bold px-3 py-1.5 rounded-lg flex items-center gap-1"
                      >
                        <Plus size={14} /> Add Package
                      </button>
                    )}
                  </div>

                  {formData.hasVariants && (
                    <div className="space-y-3 mt-3">
                      {(formData.variants || []).map((v, idx) => (
                        <div key={v.id || idx} className="grid grid-cols-12 gap-2 bg-white p-3 rounded-lg border border-purple-100 items-center shadow-sm">
                          <div className="col-span-4">
                            <input 
                              type="text" 
                              value={v.name} 
                              onChange={e => handleVariantChange(idx, 'name', e.target.value)} 
                              placeholder="Package Title (e.g. 3 Tanki)" 
                              className="w-full border p-1.5 text-xs rounded-lg"
                            />
                          </div>
                          <div className="col-span-4">
                            <input 
                              type="text" 
                              value={v.capacityInfo} 
                              onChange={e => handleVariantChange(idx, 'capacityInfo', e.target.value)} 
                              placeholder="Capacity Info (e.g. 45L Water)" 
                              className="w-full border p-1.5 text-xs rounded-lg"
                            />
                          </div>
                          <div className="col-span-3">
                            <input 
                              type="number" 
                              value={v.price} 
                              onChange={e => handleVariantChange(idx, 'price', e.target.value)} 
                              placeholder="Price (₹)" 
                              className="w-full border p-1.5 text-xs rounded-lg font-bold text-green-700"
                            />
                          </div>
                          <div className="col-span-1 text-center">
                            <button type="button" onClick={() => handleRemoveVariant(idx)} className="text-red-500 hover:bg-red-50 p-1 rounded-md">
                              <X size={16} />
                            </button>
                          </div>
                        </div>
                      ))}
                      {formData.variants?.length === 0 && (
                        <p className="text-xs text-purple-600 italic">No packages added yet. Click "+ Add Package" above.</p>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Platform Commission Type</label>
                  <select value={formData.commissionType} onChange={e => setFormData({...formData, commissionType: e.target.value})} className="w-full border p-2 rounded-lg">
                    <option value="PERCENT">Percentage (%)</option>
                    <option value="FLAT">Flat Amount (₹)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Commission Value</label>
                  <input required type="number" value={formData.commissionValue} onChange={e => setFormData({...formData, commissionValue: e.target.value})} className="w-full border p-2 rounded-lg" />
                </div>
                
                <div className="col-span-2 bg-green-50 p-3 rounded-lg border border-green-100 flex items-center justify-between">
                   <span className="text-sm font-bold text-green-800">Preview: Base Partner (Labour) Payout Amount</span>
                   <span className="text-lg font-black text-green-700">₹{getPartnerPayout(formData.baseRate, formData.commissionType, formData.commissionValue)}</span>
                </div>

                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Initial Search Radius (Km)</label>
                  <input required type="number" value={formData.radiusKm} onChange={e => setFormData({...formData, radiusKm: e.target.value})} className="w-full border p-2 rounded-lg" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-gray-700 mb-1">Radius Expansion Steps (Comma Sep)</label>
                  <input required type="text" value={formData.radiusExpansionSteps} onChange={e => setFormData({...formData, radiusExpansionSteps: e.target.value})} className="w-full border p-2 rounded-lg" placeholder="3, 5, 10" />
                </div>
                
                <div className="col-span-2 flex items-center gap-3 mt-2 p-3 border rounded-lg bg-gray-50">
                  <input type="checkbox" id="includesMaterial" checked={formData.includesMaterial} onChange={e => setFormData({...formData, includesMaterial: e.target.checked})} className="w-5 h-5 rounded border-gray-300 text-primary focus:ring-primary" />
                  <div className="flex flex-col">
                    <label htmlFor="includesMaterial" className="text-sm font-bold text-gray-900">Includes Material / Chemical Kit</label>
                    <span className="text-xs text-gray-500">Check this if the partner needs to bring their own spray chemical or resources.</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6 pt-4 border-t">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-5 py-2.5 text-gray-600 font-bold hover:bg-gray-100 rounded-xl transition-colors">Cancel</button>
                <button type="submit" className="px-5 py-2.5 bg-[#0B4D31] text-white font-bold rounded-xl hover:bg-[#083a24] shadow-lg transition-colors">Save Service</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServicesConfig;
