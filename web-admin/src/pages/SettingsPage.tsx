import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, collection, onSnapshot, deleteDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../firebase';
import { useToast } from '../components/ToastProvider';
import { 
  Store, MapPin, Clock, Users, Bell, Shield, 
  Save, Send, ToggleLeft, ToggleRight, Plus, Trash2, Image as ImageIcon, Package
} from 'lucide-react';

interface Banner {
  id: string;
  imageUrl: string;
}


interface StoreConfig {
  storeName: string;
  storeAddress: string;
  storePhone: string;
  storeGstin: string;
  storeState: string;
  storeStateCode: string;
  activeBillTemplate: string;
  storeLat: number;
  storeLng: number;
  deliveryRadiusKm: number;
  openTime: string;
  closeTime: string;
  codEnabled: boolean;
  autoAssignRiders: boolean;
  maxOrdersPerRider: number;
}

interface RiderEntry {
  id: string;
  name: string;
  phone: string;
}

const defaultConfig: StoreConfig = {
  storeName: 'KrishiVishal Store',
  storeAddress: '',
  storePhone: '',
  storeGstin: '10AAAAA0000A1Z5', // Default Bihar Pattern
  storeState: 'Bihar',
  storeStateCode: '10',
  activeBillTemplate: 'standard',
  storeLat: 28.6139,
  storeLng: 77.2090,
  deliveryRadiusKm: 10,
  openTime: '09:00',
  closeTime: '21:00',
  codEnabled: true,
  autoAssignRiders: false,
  maxOrdersPerRider: 5,
};

const SettingsPage: React.FC = () => {
  const { showToast } = useToast();
  const [config, setConfig] = useState<StoreConfig>(defaultConfig);
  const [riders, setRiders] = useState<RiderEntry[]>([]);
  const [banners, setBanners] = useState<Banner[]>([]);
  const [newBannerUrl, setNewBannerUrl] = useState('');
  const [newRider, setNewRider] = useState({ name: '', phone: '' });
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastBody, setBroadcastBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadingConfig, setLoadingConfig] = useState(true);

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const configDoc = await getDoc(doc(db, 'settings', 'store_config'));
        if (configDoc.exists()) {
          setConfig({ ...defaultConfig, ...configDoc.data() as StoreConfig });
        }

        const ridersDoc = await getDoc(doc(db, 'settings', 'riders'));
        if (ridersDoc.exists()) {
          setRiders(ridersDoc.data().list || []);
        }
      } catch (error) {
        console.error('Error loading settings:', error);
        showToast('Settings load nahi ho paye. Default values dikh rahe hain.', 'warning');
      } finally {
        setLoadingConfig(false);
      }
    };

    const unsubBanners = onSnapshot(collection(db, 'banners'), (snapshot) => {
      setBanners(snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Banner)));
    });

    fetchConfig();
    return () => unsubBanners();
  }, [showToast]);

  const handleAddBanner = async () => {
    if (!newBannerUrl.trim()) return;
    try {
      const id = doc(collection(db, 'banners')).id;
      await setDoc(doc(db, 'banners', id), { id, imageUrl: newBannerUrl.trim() });
      setNewBannerUrl('');
      showToast('Banner added successfully!', 'success');
    } catch (e) { showToast('Error adding banner', 'error'); }
  };

  const handleRemoveBanner = async (id: string) => {
    try {
      await deleteDoc(doc(db, 'banners', id));
      showToast('Banner removed', 'info');
    } catch (e) { showToast('Error removing banner', 'error'); }
  };

  const handleSaveConfig = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'store_config'), config);
      showToast('Store configuration saved successfully!', 'success');
    } catch (error) {
      console.error('Error saving config:', error);
      showToast('Configuration save karne mein error aaya.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleAddRider = async () => {
    if (!newRider.name.trim() || !newRider.phone.trim()) {
      showToast('Rider ka naam aur phone dono daalo.', 'warning');
      return;
    }

    const riderEntry: RiderEntry = {
      id: `rider_${Date.now()}`,
      name: newRider.name.trim(),
      phone: newRider.phone.trim(),
    };

    const updatedRiders = [...riders, riderEntry];
    try {
      await setDoc(doc(db, 'settings', 'riders'), { list: updatedRiders });
      setRiders(updatedRiders);
      setNewRider({ name: '', phone: '' });
      showToast(`Rider "${riderEntry.name}" added successfully!`, 'success');
    } catch (error) {
      console.error('Error adding rider:', error);
      showToast('Rider add karne mein error aaya.', 'error');
    }
  };

  const handleRemoveRider = async (riderId: string) => {
    const updatedRiders = riders.filter((r) => r.id !== riderId);
    try {
      await setDoc(doc(db, 'settings', 'riders'), { list: updatedRiders });
      setRiders(updatedRiders);
      showToast('Rider removed.', 'info');
    } catch (error) {
      console.error('Error removing rider:', error);
      showToast('Rider remove karne mein error aaya.', 'error');
    }
  };

  const handleBroadcastNotification = async () => {
    if (!broadcastTitle.trim() || !broadcastBody.trim()) {
      showToast('Notification ka title aur body dono daalo.', 'warning');
      return;
    }

    try {
      const sendNotification = httpsCallable(functions, 'sendBroadcastNotification');
      await sendNotification({ title: broadcastTitle, body: broadcastBody, topic: 'all' });
      showToast('Broadcast notification sent to all users!', 'success');
      setBroadcastTitle('');
      setBroadcastBody('');
    } catch (error) {
      console.error('Error sending broadcast:', error);
      showToast('Notification send karne mein error. Cloud Function check karo.', 'error');
    }
  };

  const updateConfig = (key: keyof StoreConfig, value: string | number | boolean) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  if (loadingConfig) {
    return (
      <div>
        <div className="page-header">
          <h2>Settings</h2>
          <p>Configure your store, riders, and notification preferences.</p>
        </div>
        <div className="settings-grid">
          <div className="card skeleton" style={{ height: '300px' }} />
          <div className="card skeleton" style={{ height: '300px' }} />
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <h2>Settings</h2>
        <p>Configure your store, riders, and notification preferences.</p>
      </div>

      <div className="settings-grid">
        {/* Store Configuration */}
        <div className="card settings-card">
          <div className="settings-card-header">
            <Store size={22} />
            <h3>Store Configuration</h3>
          </div>

          <div className="form-group">
            <label className="form-label">Store Name</label>
            <input
              type="text"
              className="form-input"
              value={config.storeName}
              onChange={(e) => updateConfig('storeName', e.target.value)}
              placeholder="Enter store name"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Store Address</label>
            <textarea
              className="form-input form-textarea"
              value={config.storeAddress}
              onChange={(e) => updateConfig('storeAddress', e.target.value)}
              placeholder="Enter full store address"
              rows={3}
            />
          </div>

          <div className="form-group">
            <label className="form-label">GSTIN Number</label>
            <input
              type="text"
              className="form-input"
              value={config.storeGstin}
              onChange={(e) => updateConfig('storeGstin', e.target.value.toUpperCase())}
              placeholder="10XXXXXXXXXXXXX"
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">State</label>
              <input type="text" className="form-input" value={config.storeState} onChange={(e) => updateConfig('storeState', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">State Code</label>
              <input type="text" className="form-input" value={config.storeStateCode} onChange={(e) => updateConfig('storeStateCode', e.target.value)} />
            </div>
          </div>


          <div className="form-row">
            <div className="form-group">
              <label className="form-label"><MapPin size={14} /> Latitude</label>
              <input
                type="number"
                className="form-input"
                value={config.storeLat}
                onChange={(e) => updateConfig('storeLat', parseFloat(e.target.value) || 0)}
                step="0.0001"
              />
            </div>
            <div className="form-group">
              <label className="form-label"><MapPin size={14} /> Longitude</label>
              <input
                type="number"
                className="form-input"
                value={config.storeLng}
                onChange={(e) => updateConfig('storeLng', parseFloat(e.target.value) || 0)}
                step="0.0001"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Delivery Radius (km)</label>
            <input
              type="number"
              className="form-input"
              value={config.deliveryRadiusKm}
              onChange={(e) => updateConfig('deliveryRadiusKm', parseInt(e.target.value) || 0)}
              min={1}
              max={50}
            />
          </div>

          <button className="btn btn-primary" onClick={handleSaveConfig} disabled={saving}>
            <Save size={18} />
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>

        {/* Working Hours & Toggles */}
        <div className="card settings-card">
          <div className="settings-card-header">
            <Clock size={22} />
            <h3>Operations</h3>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Opening Time</label>
              <input
                type="time"
                className="form-input"
                value={config.openTime}
                onChange={(e) => updateConfig('openTime', e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Closing Time</label>
              <input
                type="time"
                className="form-input"
                value={config.closeTime}
                onChange={(e) => updateConfig('closeTime', e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Max Orders Per Rider</label>
            <input
              type="number"
              className="form-input"
              value={config.maxOrdersPerRider}
              onChange={(e) => updateConfig('maxOrdersPerRider', parseInt(e.target.value) || 1)}
              min={1}
              max={20}
            />
          </div>

          <div className="toggle-row" onClick={() => updateConfig('codEnabled', !config.codEnabled)}>
            <div className="toggle-info">
              <Shield size={18} />
              <div>
                <div className="toggle-label">COD Enabled</div>
                <div className="toggle-desc">Allow Cash on Delivery orders</div>
              </div>
            </div>
            {config.codEnabled ? (
              <ToggleRight size={32} className="toggle-on" />
            ) : (
              <ToggleLeft size={32} className="toggle-off" />
            )}
          </div>

          <div className="toggle-row" onClick={() => updateConfig('autoAssignRiders', !config.autoAssignRiders)}>
            <div className="toggle-info">
              <Users size={18} />
              <div>
                <div className="toggle-label">Auto-Assign Riders</div>
                <div className="toggle-desc">Automatically assign available rider to new orders</div>
              </div>
            </div>
            {config.autoAssignRiders ? (
              <ToggleRight size={32} className="toggle-on" />
            ) : (
              <ToggleLeft size={32} className="toggle-off" />
            )}
          </div>

          <button className="btn btn-primary" onClick={handleSaveConfig} disabled={saving} style={{ marginTop: '8px' }}>
            <Save size={18} />
            {saving ? 'Saving...' : 'Save Operations'}
          </button>
        </div>

        {/* Bill Template Selector - MOVED UP */}
        <div className="card settings-card" style={{ gridColumn: 'span 2' }}>
          <div className="settings-card-header">
            <Package size={22} />
            <h3>Invoice / Bill Templates (Bihar GST Compliant)</h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '20px', marginTop: '20px' }}>
            {[
              { id: 'standard', name: 'Standard (Official)', desc: 'Clean, multi-color traditional layout.' },
              { id: 'modern', name: 'Modern UI', desc: 'Stylish typography and soft shadows.' },
              { id: 'compact', name: 'Compact', desc: 'Short height, optimized for paper saving.' },
              { id: 'elegant', name: 'Elegant Dark', desc: 'Premium dark theme header.' },
              { id: 'detailed', name: 'Detailed Tax', desc: 'Includes HSN codes and full GST split.' }
            ].map(tpl => (
              <div
                key={tpl.id}
                onClick={() => updateConfig('activeBillTemplate', tpl.id)}
                style={{
                  padding: '16px',
                  borderRadius: '12px',
                  border: config.activeBillTemplate === tpl.id ? '2px solid var(--primary-color)' : '1px solid #ddd',
                  background: config.activeBillTemplate === tpl.id ? '#e8f5e9' : 'white',
                  cursor: 'pointer'
                }}
              >
                <div style={{ fontWeight: 'bold', marginBottom: '4px' }}>{tpl.name}</div>
                <div style={{ fontSize: '0.8rem', color: '#666' }}>{tpl.desc}</div>
              </div>
            ))}
          </div>
          <button className="btn btn-primary" style={{ marginTop: '24px' }} onClick={handleSaveConfig} disabled={saving}>
             <Save size={18} /> Update Selected Template
          </button>
        </div>

        {/* Rider Management */}
        <div className="card settings-card">
          <div className="settings-card-header">
            <Users size={22} />
            <h3>Rider Management</h3>
          </div>

          <div className="rider-add-row">
            <input
              type="text"
              className="form-input"
              value={newRider.name}
              onChange={(e) => setNewRider((prev) => ({ ...prev, name: e.target.value }))}
              placeholder="Rider Name"
            />
            <input
              type="tel"
              className="form-input"
              value={newRider.phone}
              onChange={(e) => setNewRider((prev) => ({ ...prev, phone: e.target.value }))}
              placeholder="Phone Number"
            />
            <button className="btn btn-primary btn-sm" onClick={handleAddRider}>
              <Plus size={16} /> Add
            </button>
          </div>

          <div className="rider-list">
            {riders.length === 0 ? (
              <div className="empty-state-small">No riders added yet.</div>
            ) : (
              riders.map((rider) => (
                <div key={rider.id} className="rider-item">
                  <div className="rider-info">
                    <div className="rider-avatar">{rider.name.charAt(0).toUpperCase()}</div>
                    <div>
                      <div className="rider-name">{rider.name}</div>
                      <div className="rider-phone">{rider.phone}</div>
                    </div>
                  </div>
                  <button
                    className="btn-icon-danger"
                    onClick={() => handleRemoveRider(rider.id)}
                    title="Remove rider"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Broadcast Notifications */}
        <div className="card settings-card">
          <div className="settings-card-header">
            <Bell size={22} />
            <h3>Broadcast Notification</h3>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '16px' }}>
            Send a push notification to all users subscribed to the "all" topic.
          </p>

          <div className="form-group">
            <label className="form-label">Notification Title</label>
            <input
              type="text"
              className="form-input"
              value={broadcastTitle}
              onChange={(e) => setBroadcastTitle(e.target.value)}
              placeholder="e.g., New Offer! 🎉"
            />
          </div>

          <div className="form-group">
            <label className="form-label">Notification Body</label>
            <textarea
              className="form-input form-textarea"
              value={broadcastBody}
              onChange={(e) => setBroadcastBody(e.target.value)}
              placeholder="e.g., Get 20% off on your next order!"
              rows={3}
            />
          </div>

          <button className="btn btn-primary" onClick={handleBroadcastNotification}>
            <Send size={18} />
            Send Broadcast
          </button>
        </div>

        {/* Banner Management */}
        <div className="card settings-card" style={{ gridColumn: 'span 2' }}>
          <div className="settings-card-header">
            <ImageIcon size={22} />
            <h3>Home Screen Banners</h3>
          </div>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
            <input
              type="text"
              className="form-input"
              placeholder="Enter Image URL for new banner"
              value={newBannerUrl}
              onChange={e => setNewBannerUrl(e.target.value)}
            />
            <button className="btn btn-primary" onClick={handleAddBanner}>
              <Plus size={18} /> Add Banner
            </button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '16px' }}>
            {banners.map(banner => (
              <div key={banner.id} style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', border: '1px solid #eee' }}>
                <img src={banner.imageUrl} alt="" style={{ width: '100%', height: '120px', objectFit: 'cover' }} />
                <button
                  className="btn-icon text-danger"
                  onClick={() => handleRemoveBanner(banner.id)}
                  style={{ position: 'absolute', top: '8px', right: '8px', background: 'white', padding: '4px', borderRadius: '50%' }}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};

export default SettingsPage;
