import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy, addDoc, Timestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import DataTable from '../components/common/DataTable';
import { Bell, Send, History, X, CheckCircle2, MessageSquare, Info, Target, Calendar } from 'lucide-react';
import { formatDateTime } from '../utils/formatters';
import toast from 'react-hot-toast';

const Notifications = () => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({ title: '', body: '', topic: 'all' });
  const [sending, setSending] = useState(false);

  useEffect(() => {
    const q = query(collection(db, 'broadcast_notifications'), orderBy('sentAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setHistory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!formData.title || !formData.body) return toast.error('Fill all fields');

    setSending(true);
    try {
      // Cloud Function will trigger from this collection
      await addDoc(collection(db, 'broadcast_notifications'), {
        ...formData,
        sentAt: Timestamp.now(),
        sent: false // Trigger flag
      });
      toast.success('Notification queued for sending!');
      setFormData({ title: '', body: '', topic: 'all' });
    } catch (error) {
      toast.error('Failed to queue');
    } finally {
      setSending(false);
    }
  };

  const columns = [
    { header: 'Title', render: (n) => <span className="font-black text-gray-900 tracking-tight">{n.title}</span> },
    { header: 'Message', render: (n) => <span className="text-gray-500 font-medium text-xs line-clamp-1">{n.body}</span> },
    { header: 'Target', render: (n) => <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded text-[9px] font-black uppercase">{n.topic}</span> },
    { header: 'Sent At', render: (n) => <span className="text-gray-400 font-bold text-xs">{formatDateTime(n.sentAt)}</span> },
    { header: 'Status', render: (n) => (
      <span className={`flex items-center space-x-1.5 font-black text-[9px] uppercase tracking-widest ${n.sent ? 'text-green-600' : 'text-orange-500'}`}>
        {n.sent ? <CheckCircle2 size={10} /> : <div className="w-2.5 h-2.5 border-2 border-orange-500 border-t-transparent animate-spin rounded-full" />}
        <span>{n.sent ? 'Delivered' : 'Pending'}</span>
      </span>
    )}
  ];

  return (
    <div className="max-w-6xl mx-auto space-y-10 animate-in fade-in duration-500">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center">
          <Bell className="mr-3 text-primary" size={28} />
          Broadcast Center
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-10">
        {/* Composition Panel */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-10 rounded-[2.5rem] shadow-2xl shadow-green-100/50 border border-green-50 relative overflow-hidden">
            <div className="absolute top-0 right-0 p-6 opacity-5">
              <MessageSquare size={120} className="text-primary" />
            </div>

            <div className="flex items-center space-x-3 mb-8">
              <div className="p-3 bg-green-50 rounded-2xl text-primary shadow-inner">
                <Send size={24} />
              </div>
              <h2 className="text-xl font-black text-gray-900 uppercase tracking-tighter">Compose</h2>
            </div>

            <form onSubmit={handleSend} className="space-y-8 relative z-10">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Target Topic</label>
                <div className="grid grid-cols-2 gap-3">
                  {['all', 'premium'].map(t => (
                    <button
                      key={t} type="button"
                      onClick={() => setFormData({...formData, topic: t})}
                      className={`py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${formData.topic === t ? 'bg-primary text-white border-primary shadow-lg shadow-green-100 scale-[1.02]' : 'bg-gray-50 border-gray-100 text-gray-400'}`}
                    >
                      {t} Users
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1 text-primary-dark flex items-center"><Info size={12} className="mr-1" /> Alert Title</label>
                <input
                  required
                  value={formData.title}
                  onChange={(e) => setFormData({...formData, title: e.target.value})}
                  className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-black text-gray-900 tracking-tight shadow-inner"
                  placeholder="e.g., Seasonal Discount 🚜"
                />
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Message Content</label>
                <textarea
                  required rows="5"
                  value={formData.body}
                  onChange={(e) => setFormData({...formData, body: e.target.value})}
                  className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:ring-4 focus:ring-primary/5 focus:border-primary outline-none transition-all font-bold text-gray-700 leading-relaxed shadow-inner"
                  placeholder="Write your broadcast message here..."
                />
              </div>

              <button
                type="submit"
                disabled={sending}
                className="w-full bg-[#1b5e20] text-white py-5 rounded-3xl font-black text-sm uppercase tracking-[0.2em] shadow-xl shadow-green-100 hover:bg-[#2e7d32] transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center space-x-3"
              >
                {sending ? <div className="w-5 h-5 border-2 border-white border-t-transparent animate-spin rounded-full" /> : <Send size={20} />}
                <span>Blast Notification</span>
              </button>
            </form>
          </div>

          <div className="bg-orange-50 p-6 rounded-3xl border border-orange-100 flex items-start space-x-4 shadow-sm">
            <Target className="text-orange-500 shrink-0 mt-1" size={20} />
            <div>
              <h4 className="text-xs font-black text-orange-800 uppercase tracking-widest mb-1 text-primary-dark">Pro Tip</h4>
              <p className="text-[11px] font-bold text-orange-700/70 leading-relaxed italic">
                Emojis like 🚜, 🌾 or 🌱 increase user engagement by up to 40% in agricultural apps.
              </p>
            </div>
          </div>
        </div>

        {/* History Panel */}
        <div className="lg:col-span-3 space-y-6">
          <div className="bg-white rounded-[2.5rem] shadow-sm border border-gray-100 overflow-hidden min-h-[600px] flex flex-col">
            <div className="p-8 border-b border-gray-50 flex items-center justify-between bg-white/50 backdrop-blur">
              <div className="flex items-center space-x-3">
                <History className="text-primary-dark" size={20} />
                <h2 className="text-lg font-black text-gray-900 uppercase tracking-tighter">Delivery History</h2>
              </div>
              <span className="text-[10px] font-black bg-gray-100 text-gray-400 px-3 py-1 rounded-full uppercase tracking-widest">{history.length} Logs</span>
            </div>

            <div className="flex-1 overflow-y-auto">
              <DataTable columns={columns} data={history} loading={loading} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Notifications;
