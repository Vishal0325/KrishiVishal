import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Receipt,
  User,
  Calendar,
  FileText,
  CheckCircle,
  XCircle,
  Clock,
  CreditCard,
  MoreVertical,
  Download,
  Eye,
  Trash2,
  AlertTriangle,
  History,
  Banknote,
  Send,
  Loader2,
  Lock,
  Plus
} from 'lucide-react';
import { db } from '../../firebase/config';
import { doc, onSnapshot, collection, query, where, orderBy } from 'firebase/firestore';
import { expenseService } from '../../services/expenseService';
import { useAuth } from '../../hooks/useAuth';
import { formatCurrency, formatDateTime, formatDate } from '../../utils/formatters';
import { APPROVAL_STATUS, PAYMENT_STATUS, PAYMENT_METHODS, STATUS_COLORS } from '../../utils/expenses/constants';
import StatusTimeline from '../../components/common/StatusTimeline';
import toast from 'react-hot-toast';

const ExpenseDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, role } = useAuth();

  const [expense, setExpense] = useState(null);
  const [payments, setPayments] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  // Action Modals
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [isRejectModalOpen, setIsRejectModalOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [paymentForm, setPaymentForm] = useState({ amount: '', method: 'UPI', reference: '', notes: '' });
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    if (!id) return;

    // 1. Listen to Expense
    const unsubscribeExpense = onSnapshot(doc(db, 'expenses', id), (snap) => {
      if (snap.exists()) {
        setExpense({ id: snap.id, ...snap.data() });
      } else {
        toast.error("Expense not found");
        navigate('/expenses');
      }
      setLoading(false);
    });

    // 2. Listen to Payments
    const qPayments = query(
      collection(db, 'expensePayments'),
      where('expenseId', '==', id),
      orderBy('createdAt', 'desc')
    );
    const unsubscribePayments = onSnapshot(qPayments, (snap) => {
      setPayments(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    // 3. Listen to Audit Logs
    const qAudit = query(
      collection(db, 'expenseAuditLogs'),
      where('entityId', '==', id),
      orderBy('performedAt', 'desc')
    );
    const unsubscribeAudit = onSnapshot(qAudit, (snap) => {
      setAuditLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });

    return () => {
      unsubscribeExpense();
      unsubscribePayments();
      unsubscribeAudit();
    };
  }, [id]);

  const handleApprove = async () => {
    if (!window.confirm("Approve this expense?")) return;
    setProcessing(true);
    try {
      await expenseService.approveExpense(id, user.uid, "Approved from detail view");
      toast.success("Expense Approved");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason) return toast.error("Reason is required");
    setProcessing(true);
    try {
      await expenseService.rejectExpense(id, user.uid, rejectReason);
      toast.success("Expense Rejected");
      setIsRejectModalOpen(false);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const handleRecordPayment = async (e) => {
    e.preventDefault();
    const amt = parseFloat(paymentForm.amount);
    if (!amt || amt <= 0) return toast.error("Invalid amount");

    setProcessing(true);
    try {
      await expenseService.recordPayment(id, {
        amountMinor: Math.round(amt * 100),
        method: paymentForm.method,
        transactionId: paymentForm.reference,
        notes: paymentForm.notes,
        paymentDate: new Date().toISOString()
      }, user.uid);
      toast.success("Payment recorded");
      setIsPayModalOpen(false);
      setPaymentForm({ amount: '', method: 'UPI', reference: '', notes: '' });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setProcessing(false);
    }
  };

  if (loading) return <div className="h-96 flex items-center justify-center"><Loader2 className="animate-spin text-primary" size={48} /></div>;
  if (!expense) return null;

  const isSuperAdmin = role === 'SuperAdmin';
  const balanceDue = (expense.totalAmountMinor - (expense.paidAmountMinor || 0)) / 100;

  return (
    <div className="max-w-6xl mx-auto space-y-10 animate-in fade-in duration-500 pb-20">
      {/* Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="flex items-center space-x-4">
          <button
            onClick={() => navigate('/expenses')}
            className="p-3 bg-white border border-gray-100 rounded-2xl text-gray-400 hover:text-primary transition-all shadow-sm"
          >
            <ArrowLeft size={24} />
          </button>
          <div>
            <div className="flex items-center space-x-3 mb-1">
               <span className="text-[10px] font-black bg-gray-100 px-2 py-0.5 rounded text-gray-400 tracking-widest uppercase">{expense.expenseNumber}</span>
               <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-tighter ${STATUS_COLORS[expense.approvalStatus]}`}>
                  {expense.approvalStatus}
               </span>
            </div>
            <h1 className="text-3xl font-black text-gray-900 tracking-tight">{expense.description}</h1>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          {expense.approvalStatus === APPROVAL_STATUS.PENDING && isSuperAdmin && (
            <>
              <button
                onClick={() => setIsRejectModalOpen(true)}
                disabled={processing}
                className="flex items-center px-6 py-3 bg-red-50 text-red-600 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-red-100 transition-all border border-red-100"
              >
                <XCircle size={16} className="mr-2" /> Reject
              </button>
              <button
                onClick={handleApprove}
                disabled={processing}
                className="flex items-center px-6 py-3 bg-primary text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-green-800 transition-all shadow-lg shadow-green-100"
              >
                <CheckCircle size={16} className="mr-2" /> Approve
              </button>
            </>
          )}

          {expense.approvalStatus === APPROVAL_STATUS.APPROVED && expense.paymentStatus !== PAYMENT_STATUS.PAID && (
            <button
              onClick={() => setIsPayModalOpen(true)}
              className="flex items-center px-6 py-3 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-700 transition-all shadow-lg shadow-blue-100"
            >
              <CreditCard size={16} className="mr-2" /> Mark Paid
            </button>
          )}

          <button className="p-3 bg-white border border-gray-100 rounded-2xl text-gray-400 hover:text-primary transition-all">
             <Download size={20} />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
        {/* Main Content */}
        <div className="lg:col-span-2 space-y-10">
          {/* Summary Card */}
          <div className="bg-white p-10 rounded-[3rem] border border-gray-100 shadow-xl shadow-green-100/5 relative overflow-hidden">
             <div className="grid grid-cols-2 md:grid-cols-4 gap-8 relative z-10">
                <div className="space-y-1">
                   <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Total Amount</p>
                   <p className="text-2xl font-black text-gray-900 tracking-tight">{formatCurrency(expense.totalAmountMinor / 100)}</p>
                </div>
                <div className="space-y-1">
                   <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Paid Amount</p>
                   <p className="text-2xl font-black text-green-600 tracking-tight">{formatCurrency(expense.paidAmountMinor / 100)}</p>
                </div>
                <div className="space-y-1 border-l border-gray-100 pl-8">
                   <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Balance Due</p>
                   <p className={`text-2xl font-black tracking-tight ${balanceDue > 0 ? 'text-red-500' : 'text-gray-300'}`}>{formatCurrency(balanceDue)}</p>
                </div>
                <div className="space-y-1">
                   <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Category</p>
                   <p className="text-sm font-black text-gray-700 uppercase tracking-tight">{expense.categoryName}</p>
                </div>
             </div>

             {/* Due Date Banner */}
             {expense.dueDate && expense.paymentStatus !== PAYMENT_STATUS.PAID && (
                <div className="mt-8 p-4 bg-red-50 rounded-2xl border border-red-100 flex items-center justify-between">
                   <div className="flex items-center space-x-3 text-red-700">
                      <Clock size={18} />
                      <span className="text-xs font-black uppercase tracking-widest">Payment Due on {formatDate(expense.dueDate)}</span>
                   </div>
                   <span className="text-[10px] font-bold text-red-400 italic">
                      {new Date(expense.dueDate.seconds * 1000) < new Date() ? 'OVERDUE' : 'UPCOMING'}
                   </span>
                </div>
             )}
          </div>

          {/* Breakdown Section */}
          <section className="space-y-6">
             <div className="flex items-center space-x-2 text-gray-900">
                <Receipt size={20} className="text-primary" />
                <h2 className="text-xl font-black uppercase tracking-tight">Financial Breakdown</h2>
             </div>
             <div className="bg-white rounded-[3rem] border border-gray-100 shadow-sm overflow-hidden">
                <div className="p-8 space-y-4">
                   <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-400 font-bold uppercase tracking-widest">Taxable Subtotal</span>
                      <span className="font-black text-gray-700">{formatCurrency(expense.taxableAmountMinor / 100)}</span>
                   </div>
                   {expense.taxType === 'GST' && (
                     <>
                        <div className="flex justify-between items-center text-sm">
                           <span className="text-gray-400 font-bold uppercase tracking-widest">CGST ({expense.cgstRate}%)</span>
                           <span className="font-bold text-gray-600">{formatCurrency(expense.cgstMinor / 100)}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                           <span className="text-gray-400 font-bold uppercase tracking-widest">SGST ({expense.sgstRate}%)</span>
                           <span className="font-bold text-gray-600">{formatCurrency(expense.sgstMinor / 100)}</span>
                        </div>
                     </>
                   )}
                   <div className="flex justify-between items-center text-sm">
                      <span className="text-gray-400 font-bold uppercase tracking-widest">Other Charges</span>
                      <span className="font-bold text-gray-600">{formatCurrency(expense.otherChargesMinor / 100)}</span>
                   </div>
                   <div className="h-px bg-gray-50 my-2" />
                   <div className="flex justify-between items-center">
                      <span className="text-lg font-black text-gray-900 uppercase tracking-tighter">Total Invoiced</span>
                      <span className="text-3xl font-black text-primary">{formatCurrency(expense.totalAmountMinor / 100)}</span>
                   </div>
                </div>
             </div>
          </section>

          {/* Payment History */}
          <section className="space-y-6">
             <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2 text-gray-900">
                   <Banknote size={20} className="text-blue-600" />
                   <h2 className="text-xl font-black uppercase tracking-tight">Payment History</h2>
                </div>
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{payments.length} Records</span>
             </div>

             <div className="space-y-4">
                {payments.map((p, i) => (
                   <div key={i} className="bg-white p-6 rounded-[2.5rem] border border-gray-100 shadow-sm flex items-center justify-between group hover:shadow-lg transition-all">
                      <div className="flex items-center space-x-4">
                         <div className="h-12 w-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center font-black">
                            {p.paymentMethod.charAt(0)}
                         </div>
                         <div>
                            <p className="text-sm font-black text-gray-900">{p.paymentMethod} Payment</p>
                            <p className="text-[10px] text-gray-400 font-bold uppercase">{formatDateTime(p.createdAt)}</p>
                         </div>
                      </div>
                      <div className="text-right">
                         <p className="text-lg font-black text-gray-900">{formatCurrency(p.amountMinor / 100)}</p>
                         <p className="text-[9px] font-mono text-gray-400 uppercase tracking-tighter">{p.transactionId || 'No Ref'}</p>
                      </div>
                   </div>
                ))}
                {payments.length === 0 && (
                   <div className="py-12 text-center bg-gray-50 rounded-[3rem] border border-dashed border-gray-200">
                      <CreditCard size={40} className="mx-auto text-gray-200 mb-2" />
                      <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest">No payments recorded yet</p>
                   </div>
                )}
             </div>
          </section>
        </div>

        {/* Sidebar Info */}
        <div className="space-y-10">
           {/* Vendor Info */}
           <section className="bg-[#1b5e20] p-8 rounded-[3rem] text-white shadow-2xl shadow-green-200 relative overflow-hidden">
              <User size={120} className="absolute -right-10 -bottom-10 opacity-5 rotate-12" />
              <h3 className="text-xs font-black uppercase tracking-[0.2em] mb-6 text-green-200">Vendor Profile</h3>
              <div className="space-y-6 relative z-10">
                 <div>
                    <h4 className="text-2xl font-black tracking-tight leading-none mb-1">{expense.vendorName}</h4>
                    <span className="text-[10px] font-bold text-green-100/60 uppercase tracking-widest">ID: {expense.vendorId?.substring(0,8) || 'SELF'}</span>
                 </div>
                 <div className="space-y-4">
                    <div className="flex items-center space-x-3">
                       <div className="h-8 w-8 bg-white/10 rounded-xl flex items-center justify-center"><FileText size={16}/></div>
                       <div className="text-xs font-bold uppercase tracking-tight">Invoice: {expense.invoiceNumber || 'N/A'}</div>
                    </div>
                 </div>
              </div>
           </section>

           {/* Attachments */}
           <section className="bg-white p-8 rounded-[3rem] border border-gray-100 shadow-sm space-y-6">
              <h3 className="text-xs font-black text-gray-900 uppercase tracking-[0.2em]">Evidence Vault</h3>
              <div className="space-y-3">
                 {expense.attachments?.map((a, i) => (
                    <div key={i} className="group p-4 bg-gray-50 rounded-2xl border border-gray-100 flex items-center justify-between hover:bg-white hover:shadow-lg transition-all duration-300">
                       <div className="flex items-center space-x-3 overflow-hidden">
                          <FileText size={18} className="text-gray-400 shrink-0" />
                          <p className="text-xs font-bold text-gray-800 truncate">{a.fileName}</p>
                       </div>
                       <a href={a.url} target="_blank" rel="noopener" className="p-1.5 text-gray-400 hover:text-primary"><Eye size={14}/></a>
                    </div>
                 ))}
                 {(!expense.attachments || expense.attachments.length === 0) && (
                    <p className="text-[10px] font-black text-gray-300 uppercase tracking-widest italic text-center py-4">No documents</p>
                 )}
              </div>
           </section>

           {/* Audit Trail */}
           <section className="bg-white p-8 rounded-[3rem] border border-gray-100 shadow-sm space-y-6">
              <div className="flex items-center space-x-2 text-gray-900 mb-4">
                 <History size={16} />
                 <h3 className="text-xs font-black uppercase tracking-[0.2em]">Audit Trail</h3>
              </div>
              <div className="space-y-6 relative ml-2">
                 <div className="absolute left-[7px] top-2 bottom-0 w-0.5 bg-gray-50" />
                 {auditLogs.slice(0, 5).map((log, i) => (
                    <div key={i} className="relative pl-6">
                       <div className="absolute left-0 top-1 h-3.5 w-3.5 rounded-full bg-white border-2 border-gray-200 z-10" />
                       <p className="text-[10px] font-black text-gray-700 uppercase tracking-tighter leading-none mb-1">{log.action.replace(/_/g, ' ')}</p>
                       <p className="text-[9px] text-gray-400 font-bold">{formatDateTime(log.performedAt)}</p>
                    </div>
                 ))}
                 {auditLogs.length > 5 && (
                    <button className="text-[9px] font-black text-primary uppercase tracking-widest pl-6 hover:underline">View Full Log</button>
                 )}
              </div>
           </section>
        </div>
      </div>

      {/* MODALS */}
      {/* Payment Modal */}
      {isPayModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-6">
           <div className="bg-white rounded-[3rem] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95">
              <div className="p-8 border-b border-gray-50 flex items-center justify-between">
                 <h2 className="text-xl font-black text-gray-900 tracking-tight uppercase">Record Payment</h2>
                 <button onClick={() => setIsPayModalOpen(false)} className="text-gray-400 hover:text-red-500"><XCircle size={24}/></button>
              </div>
              <form onSubmit={handleRecordPayment} className="p-8 space-y-6">
                 <div className="bg-blue-50 p-6 rounded-[2rem] border border-blue-100 space-y-2">
                    <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest">Outstanding Balance</p>
                    <p className="text-3xl font-black text-blue-700 tracking-tighter">{formatCurrency(balanceDue)}</p>
                 </div>

                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Payment Amount (₹)</label>
                    <input
                      type="number" step="0.01" required
                      value={paymentForm.amount}
                      onChange={(e) => setPaymentForm({...paymentForm, amount: e.target.value})}
                      className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl font-black text-gray-800 outline-none focus:border-primary"
                    />
                 </div>

                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Method</label>
                    <select
                      value={paymentForm.method}
                      onChange={(e) => setPaymentForm({...paymentForm, method: e.target.value})}
                      className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl font-bold text-gray-800 outline-none"
                    >
                       {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                 </div>

                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">UTR / Transaction Ref</label>
                    <input
                      placeholder="e.g. 123456789"
                      value={paymentForm.reference}
                      onChange={(e) => setPaymentForm({...paymentForm, reference: e.target.value})}
                      className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl font-bold text-gray-800 outline-none"
                    />
                 </div>

                 <button
                   disabled={processing}
                   className="w-full bg-primary text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-green-100 flex justify-center"
                 >
                    {processing ? <Loader2 className="animate-spin" size={20}/> : "CONFIRM PAYMENT"}
                 </button>
              </form>
           </div>
        </div>
      )}

      {/* Reject Modal */}
      {isRejectModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-6">
           <div className="bg-white rounded-[3rem] w-full max-w-md shadow-2xl overflow-hidden">
              <div className="p-8 border-b border-gray-50">
                 <h2 className="text-xl font-black text-gray-900 tracking-tight uppercase">Reject Expense</h2>
              </div>
              <div className="p-8 space-y-6">
                 <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-1">Reason for Rejection</label>
                    <textarea
                      required rows={4}
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      className="w-full px-6 py-4 bg-red-50 border border-red-100 rounded-2xl font-bold text-gray-800 outline-none focus:border-red-500"
                      placeholder="e.g. Invalid invoice document attached..."
                    />
                 </div>
                 <div className="flex gap-4">
                    <button onClick={() => setIsRejectModalOpen(false)} className="flex-1 py-4 text-xs font-black text-gray-400 uppercase tracking-widest">Cancel</button>
                    <button
                      onClick={handleReject}
                      disabled={processing}
                      className="flex-1 bg-red-600 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl shadow-red-100 flex justify-center"
                    >
                       REJECT RECORD
                    </button>
                 </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default ExpenseDetail;
