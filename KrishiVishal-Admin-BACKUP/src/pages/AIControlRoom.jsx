import React, { useState, useEffect } from "react";
import {
  Cpu,
  ShieldAlert,
  CheckCircle,
  XCircle,
  MessageSquare,
  Zap,
  Activity,
  UserCheck,
  Search,
  ArrowRight
} from "lucide-react";
import { collection, query, orderBy, onSnapshot, limit, doc, updateDoc, addDoc, serverTimestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "../firebase/config";
import DataTable from "../components/common/DataTable";

const AIControlRoom = () => {
  const [requests, setRequests] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [prompt, setPrompt] = useState("");
  const [aiResponse, setAiResponse] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [health, setHealth] = useState({
    requestsToday: 0,
    pendingApprovals: 0,
    completedActions: 0,
    rejectedActions: 0
  });

  const fetchHealth = async () => {
    try {
      const getHealth = httpsCallable(functions, "getAiSystemHealth");
      const res = await getHealth();
      setHealth(res.data);
    } catch (e) { console.error("Health fetch failed", e); }
  };

  useEffect(() => {
    fetchHealth();
    // Fetch Pending Requests
    const qRequests = query(
      collection(db, "ai_action_requests"),
      orderBy("createdAt", "desc"),
      limit(50)
    );

    const unsubscribeRequests = onSnapshot(qRequests, (snapshot) => {
      setRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    // Fetch Activity Logs
    const qLogs = query(
      collection(db, "ai_activity_logs"),
      orderBy("timestamp", "desc"),
      limit(100)
    );

    const unsubscribeLogs = onSnapshot(qLogs, (snapshot) => {
      setLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
      setLoading(false);
    });

    return () => {
      unsubscribeRequests();
      unsubscribeLogs();
    };
  }, []);

  const handleAiAsk = async (e) => {
    e.preventDefault();
    if (!prompt.trim()) return;

    setProcessing(true);
    try {
      const aiSupervisor = httpsCallable(functions, "aiSupervisor");
      const result = await aiSupervisor({ prompt }); // ONLY prompt sent
      setAiResponse(result.data);
      setPrompt("");
      fetchHealth();
    } catch (error) {
      console.error("AI Error:", error);
      alert(error.message || "AI Supervisor failed to respond.");
    } finally {
      setProcessing(false);
    }
  };

  const handleAction = async (requestId, status, reason = "") => {
    try {
      if (status === 'APPROVED') {
        const approve = httpsCallable(functions, "approveAiAction");
        await approve({ requestId });
        toast.success("Action approved!");
      } else {
        const reject = httpsCallable(functions, "rejectAiAction");
        await reject({ requestId, reason: reason || "Rejected by Admin" });
        toast.success("Action rejected.");
      }
      fetchHealth();
    } catch (error) {
      console.error("Error updating action:", error);
      toast.error(error.message || "Operation failed");
    }
  };

  const logColumns = [
    {
      header: "Timestamp",
      render: (log) => {
        const d = log.timestamp?.toDate ? log.timestamp.toDate() : new Date();
        return <span className="text-[10px] font-mono text-gray-500">{d.toLocaleString()}</span>;
      }
    },
    {
      header: "Agent",
      render: (log) => (
        <span className="px-2 py-1 bg-primary/10 text-primary rounded text-[10px] font-black uppercase">
          {log.agentType || "GENERAL"}
        </span>
      )
    },
    {
      header: "Prompt",
      render: (log) => <div className="text-sm font-medium text-gray-700 max-w-md truncate">{log.prompt}</div>
    },
    {
      header: "User",
      render: (log) => <div className="text-[10px] text-gray-400 font-bold">{log.requestedBy}</div>
    }
  ];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-black text-gray-900 tracking-tight flex items-center">
            <Cpu className="mr-3 text-primary" size={28} />
            AI Control Room
          </h1>
          <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest ml-10 mt-1">
            Orchestration & Safety Matrix
          </p>
        </div>
        <div className="flex gap-2">
            <div className="flex items-center gap-1 bg-green-50 px-3 py-1 rounded-full border border-green-100">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-[10px] font-black text-green-700 uppercase">Supervisor Active</span>
            </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* AI Supervisor Chat/Command */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-50 bg-gray-50/50">
                <div className="flex items-center gap-2 mb-4">
                    <MessageSquare size={18} className="text-primary" />
                    <span className="text-xs font-black text-gray-900 uppercase tracking-widest">Supervisor Command</span>
                </div>
                <form onSubmit={handleAiAsk} className="relative">
                    <input
                        type="text"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Ask AI to analyze stock, finance or support..."
                        className="w-full bg-white border-2 border-gray-100 rounded-2xl py-4 px-6 pr-16 font-bold text-gray-700 focus:border-primary outline-none transition-all shadow-sm"
                    />
                    <button
                        type="submit"
                        disabled={processing}
                        className="absolute right-2 top-2 bottom-2 bg-primary text-white px-4 rounded-xl hover:bg-primary-dark transition-colors disabled:opacity-50"
                    >
                        {processing ? <Activity className="animate-spin" size={20} /> : <ArrowRight size={20} />}
                    </button>
                </form>
            </div>

            {aiResponse && (
                <div className="p-8 bg-white border-t border-gray-50 animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="flex items-start gap-6">
                        <div className="flex flex-col items-center gap-2">
                            <div className="p-4 bg-primary text-white rounded-2xl shadow-lg shadow-green-100">
                                <Cpu size={24} />
                            </div>
                            <div className="h-full w-px bg-gray-100 min-h-[40px]"></div>
                        </div>

                        <div className="flex-1 space-y-6">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] font-black bg-primary/10 text-primary px-3 py-1 rounded-full uppercase tracking-widest">
                                        Agent: {aiResponse.agentType || "Supervisor"}
                                    </span>
                                    <span className="text-[10px] font-black bg-blue-50 text-blue-600 px-3 py-1 rounded-full uppercase tracking-widest flex items-center gap-1">
                                        <CheckCircle size={10} /> Verified Data
                                    </span>
                                </div>
                                <span className="text-[10px] font-bold text-gray-400 font-mono">
                                    {new Date().toLocaleTimeString()}
                                </span>
                            </div>

                            <p className="text-lg font-bold text-gray-900 leading-tight">
                                {aiResponse.message}
                            </p>

                            {/* Detailed Data Rendering */}
                            {aiResponse.data && (
                                <div className="animate-in fade-in slide-in-from-bottom-2 duration-700 delay-200">
                                    {Array.isArray(aiResponse.data) ? (
                                        <div className="bg-gray-50 rounded-3xl border border-gray-100 overflow-hidden">
                                            <table className="w-full text-left">
                                                <thead>
                                                    <tr className="bg-gray-100/50">
                                                        <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">Reference / Item</th>
                                                        <th className="px-6 py-4 text-[10px] font-black text-gray-500 uppercase tracking-widest text-right">Value / Stock</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-gray-100">
                                                    {aiResponse.data.map((item, idx) => (
                                                        <tr key={idx} className="hover:bg-white transition-colors">
                                                            <td className="px-6 py-4">
                                                                <div className="text-sm font-black text-gray-800">{item.name || item.id}</div>
                                                                <div className="text-[9px] text-gray-400 font-bold uppercase tracking-tighter">REF: {item.id?.slice(0,8)}</div>
                                                            </td>
                                                            <td className="px-6 py-4 text-right">
                                                                <span className={`text-sm font-black ${(item.stock < 10 || item.balance < 0) ? 'text-red-600' : 'text-primary'}`}>
                                                                    {item.stock !== undefined ? `${item.stock} Units` : `₹${item.balance?.toLocaleString('en-IN')}`}
                                                                </span>
                                                            </td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </div>
                                    ) : (
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                            {aiResponse.data.totalProducts !== undefined ? (
                                                <div className="bg-primary/5 p-6 rounded-[2rem] border border-primary/10 sm:col-span-2 flex items-center justify-between">
                                                    <div>
                                                        <p className="text-[10px] font-black text-primary uppercase tracking-widest mb-1">Total Catalog Strength</p>
                                                        <h4 className="text-3xl font-black text-gray-900">{aiResponse.data.totalProducts} Products</h4>
                                                    </div>
                                                    <div className="h-12 w-12 bg-primary text-white rounded-full flex items-center justify-center font-black">
                                                        Σ
                                                    </div>
                                                </div>
                                            ) : (
                                                <>
                                                    <div className="bg-green-50 p-6 rounded-[2rem] border border-green-100">
                                                        <p className="text-[10px] font-black text-green-600 uppercase tracking-widest mb-1">Status</p>
                                                        <h4 className="text-xl font-black text-green-900 uppercase">{aiResponse.data.status || 'OK'}</h4>
                                                    </div>
                                                    <div className="bg-blue-50 p-6 rounded-[2rem] border border-blue-100">
                                                        <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1">Risk Score</p>
                                                        <h4 className="text-xl font-black text-blue-900">{aiResponse.data.riskScore || 'Low'}</h4>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Recommendation / Action Card */}
                            {aiResponse.proposedActionId && (
                                <div className="bg-orange-50 p-6 rounded-[2rem] border border-orange-100 flex items-center justify-between animate-pulse-slow shadow-lg shadow-orange-100/50">
                                    <div className="flex items-center gap-4">
                                        <div className="p-3 bg-orange-500 text-white rounded-2xl">
                                            <Zap size={20} />
                                        </div>
                                        <div>
                                            <p className="text-xs font-black text-orange-800 uppercase tracking-widest">Action Proposed</p>
                                            <p className="text-[10px] text-orange-600 font-bold">Review ID: #{aiResponse.proposedActionId.slice(0,8)}</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => document.getElementById('pending-approvals')?.scrollIntoView({ behavior: 'smooth' })}
                                        className="bg-white text-orange-600 px-6 py-2 rounded-xl text-[10px] font-black uppercase shadow-sm hover:bg-orange-600 hover:text-white transition-all"
                                    >
                                        Review Now
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
          </div>

          <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-2 mb-6">
                <Zap size={18} className="text-primary" />
                <span className="text-xs font-black text-gray-900 uppercase tracking-widest">Activity Logs</span>
            </div>
            <DataTable columns={logColumns} data={logs} loading={loading} />
          </div>
        </div>

        {/* Safety & Approvals */}
        <div className="space-y-6" id="pending-approvals">
            <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6">
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-2">
                        <ShieldAlert size={18} className="text-orange-500" />
                        <span className="text-xs font-black text-gray-900 uppercase tracking-widest">Pending Approvals</span>
                    </div>
                    <span className="bg-orange-100 text-orange-600 text-[10px] px-2 py-0.5 rounded-full font-black">
                        {requests.filter(r => r.status === 'PENDING').length}
                    </span>
                </div>

                <div className="space-y-4">
                    {requests.filter(r => r.status === 'PENDING').map(request => (
                        <div key={request.id} className="p-5 rounded-[2rem] bg-gray-50 border border-gray-100 space-y-4 shadow-sm hover:shadow-md transition-all">
                            <div className="flex justify-between items-start">
                                <span className={`text-[9px] font-black px-2 py-1 rounded-lg uppercase tracking-widest ${request.riskLevel === 'HIGH' ? 'bg-red-50 text-red-600' : 'bg-orange-50 text-orange-600'}`}>
                                    {request.riskLevel || 'MEDIUM'} RISK
                                </span>
                                <span className="text-[10px] font-mono text-gray-400">#{request.id.slice(0,5)}</span>
                            </div>

                            <div>
                                <h4 className="text-xs font-black text-gray-400 uppercase tracking-tighter mb-1">Action Proposal</h4>
                                <p className="text-sm font-black text-gray-900 leading-tight">{request.action?.replace('_', ' ')}</p>
                            </div>

                            <p className="text-xs font-medium text-gray-600 leading-relaxed italic border-l-2 border-primary/20 pl-3">
                                "{request.reason}"
                            </p>

                            {request.params && (
                                <div className="bg-white/50 p-3 rounded-2xl border border-gray-100">
                                    {request.action === 'UPDATE_PRICE' && (
                                        <div className="flex justify-between items-center text-[10px] font-black uppercase">
                                            <span className="text-gray-400">New Price</span>
                                            <span className="text-primary text-sm">₹{request.params.newPrice}</span>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="flex gap-2 pt-2">
                                <button
                                    onClick={() => handleAction(request.id, 'APPROVED')}
                                    className="flex-1 bg-primary text-white py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-primary-dark shadow-lg shadow-green-100"
                                >
                                    <CheckCircle size={14} /> Approve
                                </button>
                                <button
                                    onClick={() => {
                                        const reason = prompt("Rejection Reason:");
                                        if (reason) handleAction(request.id, 'REJECTED', reason);
                                    }}
                                    className="flex-1 bg-white border border-red-100 text-red-600 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-red-50"
                                >
                                    <XCircle size={14} /> Reject
                                </button>
                            </div>
                        </div>
                    ))}
                    {requests.filter(r => r.status === 'PENDING').length === 0 && (
                        <div className="text-center py-8">
                            <CheckCircle size={32} className="mx-auto text-gray-200 mb-2" />
                            <p className="text-xs font-bold text-gray-400">All clear! No pending actions.</p>
                        </div>
                    )}
                </div>
            </div>

            <div className="bg-primary/10 rounded-3xl p-6 border border-primary/20">
                <h4 className="text-xs font-black text-primary uppercase tracking-widest mb-2">System Health</h4>
                <div className="space-y-2">
                    <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-gray-600 uppercase">Requests Today</span>
                        <span className="text-[10px] font-black text-gray-900">{health.requestsToday}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-gray-600 uppercase">Completed Actions</span>
                        <span className="text-[10px] font-black text-gray-900 text-green-600">{health.completedActions}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-[10px] font-bold text-gray-600 uppercase">Safety Rejections</span>
                        <span className="text-[10px] font-black text-gray-900 text-red-600">{health.rejectedActions}</span>
                    </div>
                </div>
            </div>
        </div>
      </div>
    </div>
  );
};

export default AIControlRoom;
