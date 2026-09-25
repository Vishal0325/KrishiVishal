import React, { useState, useEffect, useRef } from "react";
import {
  Cpu, ShieldAlert, CheckCircle, XCircle, MessageSquare, Zap, Activity,
  ArrowUp, Sparkles, Key, Mic, MicOff, Copy, Check, HelpCircle,
  Package, Truck, TrendingUp, BarChart3, RefreshCw, Send, Bot,
  User, Hash, Clock, AlertCircle, Trash2, ChevronRight, Shield,
  Layers, Database, Settings, Star
} from "lucide-react";
import { collection, query, orderBy, onSnapshot, limit, doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../firebase/config";
import { useAuth } from "../hooks/useAuth";
import toast from "react-hot-toast";
import { queryGeminiSupervisor, getGeminiApiKey, saveGeminiApiKey } from "../services/geminiService";

/* ─── Markdown to styled JSX renderer ─── */
function renderMarkdown(text) {
  if (!text) return null;
  const lines = text.split("\n");
  return lines.map((line, i) => {
    if (line.startsWith("### ")) return <h3 key={i} className="text-sm font-black text-gray-900 mt-3 mb-1">{line.slice(4)}</h3>;
    if (line.startsWith("## ")) return <h2 key={i} className="text-base font-black text-gray-900 mt-3 mb-1">{line.slice(3)}</h2>;
    if (line.startsWith("# ")) return <h1 key={i} className="text-lg font-black text-gray-900 mt-3 mb-1">{line.slice(2)}</h1>;
    if (line.startsWith("- ") || line.startsWith("* ")) {
      const content = formatInline(line.slice(2));
      return <div key={i} className="flex items-start gap-2 my-0.5"><span className="text-[#0B4D31] font-black text-xs mt-0.5 shrink-0">•</span><span className="text-xs text-gray-700 leading-relaxed">{content}</span></div>;
    }
    if (/^\d+\. /.test(line)) {
      const num = line.match(/^(\d+)\. /)[1];
      const content = formatInline(line.replace(/^\d+\. /, ""));
      return <div key={i} className="flex items-start gap-2 my-0.5"><span className="text-[#0B4D31] font-black text-xs mt-0.5 shrink-0 w-4">{num}.</span><span className="text-xs text-gray-700 leading-relaxed">{content}</span></div>;
    }
    if (line.trim() === "" || line === "---") return <div key={i} className="my-1.5" />;
    return <p key={i} className="text-xs text-gray-700 leading-relaxed my-0.5">{formatInline(line)}</p>;
  });
}

function formatInline(text) {
  const parts = [];
  const regex = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0, match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    if (match[1]) parts.push(<strong key={match.index} className="font-black text-gray-900">{match[1]}</strong>);
    if (match[2]) parts.push(<code key={match.index} className="bg-gray-100 text-[#0B4D31] px-1 rounded text-[11px] font-mono">{match[2]}</code>);
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

const AIControlRoom = () => {
  const { user } = useAuth();

  // Chat state
  const [messages, setMessages] = useState([]);
  const [inputText, setInputText] = useState("");
  const [processing, setProcessing] = useState(false);
  const chatEndRef = useRef(null);
  const inputRef = useRef(null);

  // Firestore state
  const [requests, setRequests] = useState([]);
  const [logs, setLogs] = useState([]);
  const [logsLoading, setLogsLoading] = useState(true);
  const [health, setHealth] = useState({ requestsToday: 0, pendingApprovals: 0, completedActions: 0, rejectedActions: 0 });

  // Gemini key
  const [hasGeminiKey, setHasGeminiKey] = useState(false);
  const [isKeyModalOpen, setIsKeyModalOpen] = useState(false);
  const [inputKey, setInputKey] = useState("");
  const [savingKey, setSavingKey] = useState(false);

  // Voice
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);

  // Panel
  const [activePanel, setActivePanel] = useState("chat"); // "chat" | "approvals" | "logs"
  const [copiedId, setCopiedId] = useState(null);

  // ─── Scroll to bottom on new message ───
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, processing]);

  // ─── Check Gemini Key ───
  useEffect(() => {
    getGeminiApiKey().then((key) => {
      if (key) { setHasGeminiKey(true); setInputKey(key); }
    });
  }, []);

  // ─── Firestore realtime ───
  useEffect(() => {
    const qReq = query(collection(db, "ai_action_requests"), orderBy("createdAt", "desc"), limit(50));
    const unsubReq = onSnapshot(qReq, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setRequests(list);
      const todayStart = new Date(); todayStart.setHours(0,0,0,0);
      setHealth({
        requestsToday: list.filter(r => { const d = r.createdAt?.toDate?.(); return d && d >= todayStart; }).length,
        pendingApprovals: list.filter(r => r.status === "PENDING").length,
        completedActions: list.filter(r => r.status === "APPROVED" || r.status === "COMPLETED").length,
        rejectedActions: list.filter(r => r.status === "REJECTED").length
      });
    }, err => console.error(err));

    const qLogs = query(collection(db, "ai_activity_logs"), orderBy("timestamp", "desc"), limit(30));
    const unsubLogs = onSnapshot(qLogs, (snap) => {
      setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      setLogsLoading(false);
    }, err => { console.error(err); setLogsLoading(false); });

    return () => { unsubReq(); unsubLogs(); };
  }, []);

  // ─── Voice Input ───
  const toggleVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { toast.error("Speech not supported in this browser"); return; }
    if (isListening) { recognitionRef.current?.stop(); setIsListening(false); return; }
    const rec = new SR();
    rec.lang = "hi-IN";
    rec.interimResults = false;
    rec.onstart = () => { setIsListening(true); toast("🎙️ बोलिए...", { duration: 3000 }); };
    rec.onresult = (e) => { setInputText(e.results[0][0].transcript); setIsListening(false); };
    rec.onerror = () => setIsListening(false);
    rec.onend = () => setIsListening(false);
    recognitionRef.current = rec;
    rec.start();
  };

  // ─── Send Message ───
  const sendMessage = async (customText = null) => {
    const text = (customText || inputText).trim();
    if (!text || processing) return;

    const userMsg = { id: Date.now(), role: "user", text, ts: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInputText("");
    setProcessing(true);
    inputRef.current?.focus();

    // Build history for multi-turn
    const history = messages.map(m => ({ role: m.role, text: m.text }));

    try {
      const res = await queryGeminiSupervisor(text, user?.email || "SuperAdmin", history);
      const aiMsg = {
        id: Date.now() + 1,
        role: "ai",
        text: res.message,
        agentType: res.agentType,
        isLive: res.isGeminiLive,
        tableData: Array.isArray(res.data) && res.data.length > 0 ? res.data : null,
        ts: new Date()
      };
      setMessages(prev => [...prev, aiMsg]);
    } catch (err) {
      toast.error("AI Error: " + err.message);
      setMessages(prev => [...prev, {
        id: Date.now() + 1, role: "ai",
        text: "⚠️ An error occurred while contacting AI. Please try again.",
        isLive: false, ts: new Date()
      }]);
    } finally {
      setProcessing(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const copyMsg = (id, text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    toast.success("Copied!");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const clearChat = () => {
    setMessages([]);
    toast.success("Chat cleared");
  };

  const handleApproval = async (reqId, status) => {
    try {
      await updateDoc(doc(db, "ai_action_requests", reqId), {
        status,
        reviewedBy: user?.email || "SuperAdmin",
        reviewedAt: serverTimestamp()
      });
      toast.success(status === "APPROVED" ? "✅ Approved!" : "❌ Rejected");
    } catch (e) { toast.error(e.message); }
  };

  const saveKey = async (e) => {
    e.preventDefault();
    setSavingKey(true);
    try {
      await saveGeminiApiKey(inputKey);
      setHasGeminiKey(Boolean(inputKey.trim()));
      setIsKeyModalOpen(false);
      toast.success(inputKey.trim() ? "🔑 Gemini API Key saved!" : "Key cleared.");
    } catch (e) { toast.error(e.message); }
    finally { setSavingKey(false); }
  };

  const quickPrompts = [
    { icon: "📦", label: "Low Stock Alert", prompt: "कम स्टॉक वाले प्रोडक्ट्स की लिस्ट दिखाओ जिनका स्टॉक 10 से कम है" },
    { icon: "💰", label: "Today's Sales", prompt: "आज की कुल सेल, COD कलेक्शन और ऑर्डर्स का विश्लेषण दो" },
    { icon: "🚚", label: "Fleet Status", prompt: "एक्टिव डिलीवरी राइडर्स और फ्लीट का स्टेटस बताओ" },
    { icon: "🌾", label: "Full Audit", prompt: "KrishiVishal के संपूर्ण बिजनेस और इन्वेंट्री का सुपरवाइजर ऑडिट करो" },
    { icon: "📊", label: "Order Status", prompt: "Order status breakdown dikhaao - Placed, Packed, Out for Delivery, Delivered count" },
    { icon: "⚠️", label: "Risk Check", prompt: "Aaj ke high-risk orders, NDR and RTO cases ki report do" },
  ];

  const pendingRequests = requests.filter(r => r.status === "PENDING");

  return (
    <div className="h-[calc(100vh-120px)] flex gap-4 overflow-hidden animate-in fade-in duration-300">

      {/* ═══════════ LEFT SIDEBAR ═══════════ */}
      <div className="w-72 shrink-0 flex flex-col gap-3 overflow-y-auto custom-scrollbar">

        {/* Header Card */}
        <div className="bg-gradient-to-br from-[#0B4D31] via-[#146c43] to-[#1a8a55] rounded-2xl p-4 text-white shadow-lg shadow-emerald-900/20">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center backdrop-blur-sm">
              <Sparkles size={18} className="text-white" />
            </div>
            <div>
              <p className="font-black text-sm tracking-tight">KrishiVishal AI</p>
              <p className="text-[10px] text-emerald-200 font-semibold uppercase tracking-wider">Gemini Supervisor</p>
            </div>
          </div>

          {/* Live Status Dot */}
          <div className="flex items-center gap-2 bg-white/10 rounded-xl px-3 py-2 mb-3">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-300 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-400"></span>
            </span>
            <span className="text-[11px] font-bold text-emerald-100">
              {hasGeminiKey ? "Gemini 1.5 Flash — Live" : "Local Intelligence — Active"}
            </span>
          </div>

          {/* API Key Button */}
          <button
            onClick={() => setIsKeyModalOpen(true)}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-bold transition-all ${
              hasGeminiKey
                ? "bg-white/15 text-emerald-100 hover:bg-white/25"
                : "bg-amber-400/90 text-amber-900 hover:bg-amber-400"
            }`}
          >
            <span className="flex items-center gap-1.5"><Key size={12} />{hasGeminiKey ? "API Key: Connected" : "Set Gemini API Key"}</span>
            <ChevronRight size={12} />
          </button>
        </div>

        {/* Health Stats */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-2">
          <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
            <BarChart3 size={12} />System Health
          </p>
          {[
            { label: "Requests Today", val: health.requestsToday, color: "text-blue-600" },
            { label: "AI Actions Done", val: health.completedActions, color: "text-emerald-600" },
            { label: "Pending Approval", val: health.pendingApprovals, color: "text-amber-600" },
            { label: "Safety Rejections", val: health.rejectedActions, color: "text-red-500" },
          ].map(({ label, val, color }) => (
            <div key={label} className="flex items-center justify-between py-1 border-b border-gray-50 last:border-0">
              <span className="text-[11px] text-gray-600 font-semibold">{label}</span>
              <span className={`text-xs font-black ${color}`}>{val}</span>
            </div>
          ))}
        </div>

        {/* Navigation */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-2">
          {[
            { id: "chat", icon: MessageSquare, label: "AI Chat", badge: null },
            { id: "approvals", icon: ShieldAlert, label: "Approvals", badge: pendingRequests.length },
            { id: "logs", icon: Database, label: "Activity Logs", badge: null },
          ].map(({ id, icon: Icon, label, badge }) => (
            <button
              key={id}
              onClick={() => setActivePanel(id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition-all mb-1 last:mb-0 ${
                activePanel === id
                  ? "bg-[#0B4D31] text-white shadow-sm"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <span className="flex items-center gap-2"><Icon size={14} />{label}</span>
              {badge > 0 && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-black ${activePanel === id ? "bg-white/20 text-white" : "bg-amber-100 text-amber-700"}`}>
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Quick Prompts */}
        {activePanel === "chat" && (
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-3">
            <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2.5 flex items-center gap-1.5">
              <Zap size={11} />Quick Prompts
            </p>
            <div className="space-y-1.5">
              {quickPrompts.map((chip, i) => (
                <button
                  key={i}
                  onClick={() => { sendMessage(chip.prompt); setActivePanel("chat"); }}
                  disabled={processing}
                  className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-xl text-[11px] font-semibold text-gray-700 bg-gray-50 hover:bg-emerald-50 hover:text-emerald-900 border border-transparent hover:border-emerald-200 transition-all disabled:opacity-50"
                >
                  <span className="text-sm">{chip.icon}</span>
                  <span className="truncate">{chip.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ═══════════ MAIN PANEL ═══════════ */}
      <div className="flex-1 flex flex-col min-w-0 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">

        {/* ─── CHAT PANEL ─── */}
        {activePanel === "chat" && (
          <>
            {/* Chat Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 bg-gray-50/70 shrink-0">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-gradient-to-br from-[#0B4D31] to-[#1a8a55] rounded-xl flex items-center justify-center shadow-sm">
                  <Bot size={16} className="text-white" />
                </div>
                <div>
                  <p className="text-xs font-black text-gray-900">KrishiVishal AI Supervisor</p>
                  <p className="text-[10px] text-gray-400 font-semibold">
                    Grounded with Live Firestore Data · {hasGeminiKey ? "Gemini 1.5 Flash" : "Local Mode"}
                  </p>
                </div>
              </div>
              {messages.length > 0 && (
                <button
                  onClick={clearChat}
                  className="flex items-center gap-1.5 text-[11px] font-bold text-gray-500 hover:text-red-600 px-2.5 py-1.5 rounded-lg hover:bg-red-50 transition-all"
                >
                  <Trash2 size={13} />Clear Chat
                </button>
              )}
            </div>

            {/* Chat Messages */}
            <div className="flex-1 overflow-y-auto custom-scrollbar px-5 py-4 space-y-4">
              {messages.length === 0 && (
                <div className="h-full flex flex-col items-center justify-center text-center py-8">
                  <div className="w-16 h-16 bg-gradient-to-br from-[#0B4D31]/10 to-emerald-100 rounded-2xl flex items-center justify-center mb-4 shadow-inner">
                    <Sparkles size={28} className="text-[#0B4D31]" />
                  </div>
                  <h3 className="text-base font-black text-gray-900 mb-1">KrishiVishal AI Supervisor</h3>
                  <p className="text-xs text-gray-500 font-medium mb-6 max-w-xs leading-relaxed">
                    आपके Bihar Agri-tech Platform का Real-Time AI Business Intelligence Center.
                    {!hasGeminiKey && (
                      <span className="block mt-2 text-amber-700 font-bold">
                        💡 बायीं तरफ "Set Gemini API Key" पर क्लिक करें और free key डालें।
                      </span>
                    )}
                  </p>
                  <div className="grid grid-cols-2 gap-2 max-w-sm">
                    {quickPrompts.slice(0, 4).map((chip, i) => (
                      <button
                        key={i}
                        onClick={() => sendMessage(chip.prompt)}
                        className="flex items-center gap-2 px-3 py-2.5 bg-gray-50 hover:bg-emerald-50 border border-gray-200 hover:border-emerald-300 rounded-xl text-[11px] font-bold text-gray-700 hover:text-emerald-900 transition-all text-left"
                      >
                        <span>{chip.icon}</span>
                        <span>{chip.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((msg) => (
                <div key={msg.id} className={`flex items-start gap-3 ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                  {/* Avatar */}
                  <div className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center shadow-sm ${
                    msg.role === "user"
                      ? "bg-[#0B4D31] text-white"
                      : "bg-gradient-to-br from-emerald-100 to-teal-100 border border-emerald-200"
                  }`}>
                    {msg.role === "user"
                      ? <User size={14} className="text-white" />
                      : <Sparkles size={14} className="text-[#0B4D31]" />
                    }
                  </div>

                  {/* Bubble */}
                  <div className={`group max-w-[75%] space-y-2 ${msg.role === "user" ? "items-end" : "items-start"} flex flex-col`}>
                    {msg.role === "ai" && msg.agentType && (
                      <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full uppercase tracking-wider">
                        {msg.agentType}
                      </span>
                    )}

                    <div className={`relative rounded-2xl px-4 py-3 shadow-sm ${
                      msg.role === "user"
                        ? "bg-[#0B4D31] text-white rounded-tr-sm"
                        : "bg-gray-50 border border-gray-200 rounded-tl-sm"
                    }`}>
                      {msg.role === "user"
                        ? <p className="text-xs font-semibold text-white leading-relaxed">{msg.text}</p>
                        : <div className="prose prose-xs max-w-none">{renderMarkdown(msg.text)}</div>
                      }
                    </div>

                    {/* AI table data */}
                    {msg.tableData && (
                      <div className="w-full bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                        <div className="px-3 py-2 bg-amber-50 border-b border-amber-100">
                          <span className="text-[10px] font-black text-amber-800 uppercase tracking-wider">
                            ⚠️ Low Stock Items — Live Data ({msg.tableData.length})
                          </span>
                        </div>
                        <table className="w-full text-left">
                          <thead><tr className="bg-gray-50">
                            <th className="px-3 py-2 text-[10px] font-black text-gray-500 uppercase">Product</th>
                            <th className="px-3 py-2 text-[10px] font-black text-gray-500 uppercase text-right">Stock</th>
                            <th className="px-3 py-2 text-[10px] font-black text-gray-500 uppercase text-right">Price</th>
                          </tr></thead>
                          <tbody className="divide-y divide-gray-100">
                            {msg.tableData.map((item, idx) => (
                              <tr key={idx} className="hover:bg-gray-50">
                                <td className="px-3 py-2 text-[11px] font-bold text-gray-900 truncate max-w-[150px]">{item.name}</td>
                                <td className="px-3 py-2 text-right">
                                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                                    Number(item.stock) <= 0 ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"
                                  }`}>{item.stock} Units</span>
                                </td>
                                <td className="px-3 py-2 text-[11px] font-bold text-gray-700 text-right">₹{item.price}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* Footer: time + copy */}
                    <div className={`flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                      <span className="text-[10px] text-gray-400 font-mono">
                        {msg.ts?.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {msg.role === "ai" && (
                        <button
                          onClick={() => copyMsg(msg.id, msg.text)}
                          className="flex items-center gap-1 text-[10px] font-bold text-gray-400 hover:text-gray-700 transition-colors"
                        >
                          {copiedId === msg.id ? <Check size={11} className="text-green-600" /> : <Copy size={11} />}
                          {copiedId === msg.id ? "Copied" : "Copy"}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {/* Typing indicator */}
              {processing && (
                <div className="flex items-start gap-3">
                  <div className="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center bg-gradient-to-br from-emerald-100 to-teal-100 border border-emerald-200">
                    <Sparkles size={14} className="text-[#0B4D31] animate-pulse" />
                  </div>
                  <div className="bg-gray-50 border border-gray-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 bg-[#0B4D31] rounded-full animate-bounce [animation-delay:0ms]"></span>
                      <span className="w-2 h-2 bg-[#0B4D31] rounded-full animate-bounce [animation-delay:150ms]"></span>
                      <span className="w-2 h-2 bg-[#0B4D31] rounded-full animate-bounce [animation-delay:300ms]"></span>
                    </div>
                    <p className="text-[10px] text-gray-400 font-semibold mt-1">AI analyzing your live data...</p>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* Input Bar */}
            <div className="shrink-0 border-t border-gray-100 p-4 bg-white">
              <div className="flex items-end gap-2">
                {/* Mic */}
                <button
                  type="button"
                  onClick={toggleVoice}
                  title="बोलकर पूछें"
                  className={`shrink-0 p-2.5 rounded-xl transition-all ${
                    isListening ? "bg-red-500 text-white shadow-lg animate-pulse" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                  }`}
                >
                  {isListening ? <MicOff size={16} /> : <Mic size={16} />}
                </button>

                {/* Text Input */}
                <div className="flex-1 relative">
                  <textarea
                    ref={inputRef}
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={1}
                    placeholder="कोई भी बिजनेस सवाल पूछें... (Enter to send, Shift+Enter for newline)"
                    className="w-full bg-gray-50 border border-gray-200 rounded-2xl px-4 py-3 text-xs font-semibold text-gray-800 outline-none focus:border-[#0B4D31] focus:ring-2 focus:ring-[#0B4D31]/10 resize-none transition-all placeholder:text-gray-400 max-h-32"
                    style={{ minHeight: "44px" }}
                  />
                </div>

                {/* Send */}
                <button
                  onClick={() => sendMessage()}
                  disabled={!inputText.trim() || processing}
                  className="shrink-0 w-10 h-10 bg-[#0B4D31] hover:bg-[#146c43] disabled:opacity-40 text-white rounded-xl flex items-center justify-center shadow-sm transition-all"
                >
                  {processing ? <Activity size={16} className="animate-spin" /> : <ArrowUp size={16} />}
                </button>
              </div>
              <p className="text-[10px] text-gray-400 font-medium mt-2 text-center">
                Powered by Google Gemini AI · All queries are grounded with your live Firestore data
              </p>
            </div>
          </>
        )}

        {/* ─── APPROVALS PANEL ─── */}
        {activePanel === "approvals" && (
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/70 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield size={16} className="text-orange-600" />
                <span className="font-black text-sm text-gray-900">Human-in-the-Loop Safety Approvals</span>
              </div>
              <span className="bg-orange-100 text-orange-700 text-[11px] font-black px-2.5 py-1 rounded-full">
                {pendingRequests.length} Pending
              </span>
            </div>

            <div className="p-5 space-y-3">
              {pendingRequests.length === 0 ? (
                <div className="text-center py-16">
                  <CheckCircle size={40} className="mx-auto text-emerald-400 mb-3" />
                  <p className="text-sm font-black text-gray-700">All Clear!</p>
                  <p className="text-xs text-gray-400 mt-1">कोई AI action approval pending नहीं है।</p>
                </div>
              ) : (
                pendingRequests.map(req => (
                  <div key={req.id} className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm space-y-3 hover:shadow-md transition-all">
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase ${
                        req.riskLevel === "HIGH" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"
                      }`}>{req.riskLevel || "MEDIUM"} RISK</span>
                      <span className="font-mono text-[10px] text-gray-400">#{req.id.slice(0,6)}</span>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-gray-400 uppercase mb-0.5">Action Type</p>
                      <p className="text-xs font-black text-gray-900">{req.action?.replace(/_/g, " ")}</p>
                    </div>
                    {req.reason && (
                      <p className="text-xs text-gray-600 italic bg-gray-50 rounded-xl px-3 py-2 border-l-2 border-[#0B4D31]">
                        "{req.reason}"
                      </p>
                    )}
                    <div className="flex gap-2">
                      <button onClick={() => handleApproval(req.id, "APPROVED")}
                        className="flex-1 bg-[#0B4D31] text-white py-2.5 rounded-xl text-[11px] font-black flex items-center justify-center gap-1.5 hover:bg-[#146c43] transition-all shadow-sm">
                        <CheckCircle size={13} />Approve
                      </button>
                      <button onClick={() => { const r = window.prompt("Rejection reason?"); if(r) handleApproval(req.id, "REJECTED"); }}
                        className="flex-1 bg-white border border-red-200 text-red-600 py-2.5 rounded-xl text-[11px] font-black flex items-center justify-center gap-1.5 hover:bg-red-50 transition-all">
                        <XCircle size={13} />Reject
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ─── LOGS PANEL ─── */}
        {activePanel === "logs" && (
          <div className="flex-1 overflow-y-auto custom-scrollbar">
            <div className="px-5 py-4 border-b border-gray-100 bg-gray-50/70 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database size={16} className="text-[#0B4D31]" />
                <span className="font-black text-sm text-gray-900">AI Activity Audit Logs</span>
              </div>
              <span className="text-[11px] font-bold text-gray-400">{logs.length} events</span>
            </div>

            <div className="p-4 space-y-2">
              {logsLoading ? (
                <div className="text-center py-8 text-gray-400 text-sm font-bold">Loading logs...</div>
              ) : logs.length === 0 ? (
                <div className="text-center py-12">
                  <Database size={36} className="mx-auto text-gray-200 mb-3" />
                  <p className="text-sm font-bold text-gray-400">No activity logs yet</p>
                </div>
              ) : (
                logs.map(log => (
                  <div key={log.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100 hover:bg-white hover:shadow-sm transition-all">
                    <div className="w-7 h-7 bg-emerald-100 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                      <Zap size={12} className="text-emerald-700" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-gray-900 truncate">{log.prompt || "—"}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] font-black text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded uppercase">
                          {log.agentType || "AI"}
                        </span>
                        <span className="text-[10px] text-gray-400 font-mono">
                          {log.timestamp?.toDate?.()?.toLocaleTimeString("en-IN", { hour:"2-digit", minute:"2-digit" }) || "—"}
                        </span>
                        <span className="text-[10px] text-gray-400 truncate">{log.requestedBy}</span>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* ═══════════ GEMINI KEY MODAL ═══════════ */}
      {isKeyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-gray-100">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-[#0B4D31] to-[#1a8a55] p-5 text-white">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <Key size={18} className="text-white" />
                </div>
                <div>
                  <h3 className="font-black text-sm">Google Gemini API Setup</h3>
                  <p className="text-emerald-200 text-[11px] font-medium">Free key from Google AI Studio</p>
                </div>
              </div>
            </div>

            <form onSubmit={saveKey} className="p-5 space-y-4">
              <div>
                <label className="text-xs font-black text-gray-700 block mb-1.5">Gemini API Key</label>
                <input
                  type="password"
                  value={inputKey}
                  onChange={e => setInputKey(e.target.value)}
                  placeholder="AIzaSy..."
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-xs font-mono font-bold text-gray-800 outline-none focus:border-[#0B4D31] focus:ring-2 focus:ring-[#0B4D31]/10"
                />
              </div>

              <div className="p-3.5 bg-blue-50 rounded-xl border border-blue-100 flex items-start gap-3">
                <HelpCircle size={15} className="text-blue-600 shrink-0 mt-0.5" />
                <div className="text-[11px] text-blue-800 font-medium leading-relaxed">
                  Key नहीं है? &nbsp;
                  <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noopener noreferrer"
                    className="font-black underline text-blue-900">
                    Google AI Studio पर जाएं →
                  </a>
                  &nbsp;यहाँ आपको बिल्कुल मुफ्त में API Key मिलेगी (1 minute में)।
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setIsKeyModalOpen(false)}
                  className="flex-1 py-2.5 text-xs font-bold text-gray-600 hover:bg-gray-100 rounded-xl transition-all border border-gray-200">
                  Cancel
                </button>
                <button type="submit" disabled={savingKey}
                  className="flex-1 py-2.5 bg-[#0B4D31] text-white rounded-xl text-xs font-black hover:bg-[#146c43] transition-all shadow-sm disabled:opacity-60">
                  {savingKey ? "Saving..." : "Save & Connect"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AIControlRoom;
