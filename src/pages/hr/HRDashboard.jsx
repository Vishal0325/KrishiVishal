import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase/config";
import toast from "react-hot-toast";
import PageHeader from "../../components/common/PageHeader";
import { getHRDashboardMetrics } from "../../services/hrExtendedService";
import {
  Users,
  Truck,
  FileText,
  Clock,
  AlertTriangle,
  ShieldCheck,
  Archive,
  Laptop,
  LogOut,
  FileCheck,
  Award,
  TrendingUp,
  ArrowRight,
  RefreshCw
} from "lucide-react";

const HRDashboard = () => {
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchMetrics = async () => {
    try {
      setRefreshing(true);
      // [FIXED] Point #131: Fetch summarized metrics from a single document or Cloud Function
      // instead of performing O(N) reads across 9 collections on the client.
      const { getFunctions, httpsCallable } = await import('firebase/functions');
      const syncFn = httpsCallable(getFunctions(), 'syncHRMetrics');
      const res = await syncFn();
      setMetrics(res.data.metrics);
    } catch (error) {
      console.error("Failed to load HR dashboard metrics:", error);
      toast.error("Metric sync failed. Check cloud permissions.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    // Attempt to load from cached summary first
    getDoc(doc(db, "system_summaries", "hr")).then(snap => {
       if (snap.exists()) {
          setMetrics(snap.data());
          setLoading(false);
       } else {
          fetchMetrics();
       }
    }).catch((err) => {
       console.error("Error reading cached HR summary:", err);
       fetchMetrics();
    });
  }, []);

  return (
    <div className="space-y-6 pb-12 animate-in fade-in duration-300">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <PageHeader
          title="HR & Workforce Intelligence"
          subtitle="Enterprise workforce analytics, compliance tracking, and document lifecycle control"
        />
        <div className="flex items-center gap-3">
          <button
            onClick={fetchMetrics}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            Sync Real-time
          </button>
          <Link
            to="/hr/reports"
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors shadow-sm"
          >
            <TrendingUp className="w-4 h-4" />
            Executive Reports
          </Link>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : (
        <>
          {/* Top KPI Metric Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* Total Headcount */}
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Total Headcount</p>
                  <h3 className="text-2xl font-bold text-gray-900 mt-1">{metrics?.totalHeadcount || 0}</h3>
                  <div className="flex items-center gap-2 text-xs text-gray-500 mt-2">
                    <span className="text-emerald-600 font-medium">{metrics?.activeEmployees || 0} Staff</span>
                    <span>•</span>
                    <span className="text-indigo-600 font-medium">{metrics?.activeRiders || 0} Riders</span>
                  </div>
                </div>
                <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center">
                  <Users className="w-6 h-6" />
                </div>
              </div>
            </div>

            {/* Document Compliance Score */}
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Compliance Index</p>
                  <h3 className="text-2xl font-bold text-gray-900 mt-1">{metrics?.complianceScore || 0}%</h3>
                  <div className="w-full bg-gray-100 h-1.5 rounded-full mt-3 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                      style={{ width: `${metrics?.complianceScore || 0}%` }}
                    ></div>
                  </div>
                </div>
                <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center">
                  <ShieldCheck className="w-6 h-6" />
                </div>
              </div>
            </div>

            {/* Verification Queue */}
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Verification Queue</p>
                  <h3 className="text-2xl font-bold text-amber-600 mt-1">{metrics?.pendingVerification || 0}</h3>
                  <p className="text-xs text-gray-500 mt-2">
                    Synced: {metrics?.lastSyncedAt ? (metrics.lastSyncedAt.toDate ? metrics.lastSyncedAt.toDate().toLocaleString() : new Date(metrics.lastSyncedAt).toLocaleString()) : 'Never'}
                  </p>
                </div>
                <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-2xl flex items-center justify-center">
                  <Clock className="w-6 h-6" />
                </div>
              </div>
            </div>

            {/* Expiry Risk (30 Days) */}
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Expiring (30 Days)</p>
                  <h3 className="text-2xl font-bold text-rose-600 mt-1">{metrics?.expiringSoonDocs || 0}</h3>
                  <p className="text-xs text-gray-500 mt-2">
                    <span className="text-rose-600 font-medium">{metrics?.expiredDocs || 0}</span> Already Expired
                  </p>
                </div>
                <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6" />
                </div>
              </div>
            </div>
          </div>

          {/* Secondary Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <Link to="/hr/physical-files" className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:border-emerald-200 transition-all">
              <div className="flex items-center gap-3">
                <Archive className="w-5 h-5 text-amber-500" />
                <div>
                  <p className="text-xs text-gray-500">Physical Files</p>
                  <p className="text-lg font-bold text-gray-900">{metrics?.totalPhysicalFiles || 0}</p>
                </div>
              </div>
            </Link>

            <Link to="/hr/assets" className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:border-emerald-200 transition-all">
              <div className="flex items-center gap-3">
                <Laptop className="w-5 h-5 text-indigo-500" />
                <div>
                  <p className="text-xs text-gray-500">Assets Assigned</p>
                  <p className="text-lg font-bold text-gray-900">{metrics?.allocatedAssets || 0} / {metrics?.totalAssets || 0}</p>
                </div>
              </div>
            </Link>

            <Link to="/hr/exit" className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:border-emerald-200 transition-all">
              <div className="flex items-center gap-3">
                <LogOut className="w-5 h-5 text-rose-500" />
                <div>
                  <p className="text-xs text-gray-500">Pending Exits</p>
                  <p className="text-lg font-bold text-gray-900">{metrics?.pendingExits || 0}</p>
                </div>
              </div>
            </Link>

            <Link to="/hr/contracts" className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:border-emerald-200 transition-all">
              <div className="flex items-center gap-3">
                <FileText className="w-5 h-5 text-blue-500" />
                <div>
                  <p className="text-xs text-gray-500">Active Contracts</p>
                  <p className="text-lg font-bold text-gray-900">{metrics?.activeContracts || 0}</p>
                </div>
              </div>
            </Link>

            <Link to="/hr/bgv" className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:border-emerald-200 transition-all">
              <div className="flex items-center gap-3">
                <FileCheck className="w-5 h-5 text-purple-500" />
                <div>
                  <p className="text-xs text-gray-500">BGV In-Progress</p>
                  <p className="text-lg font-bold text-gray-900">{metrics?.pendingBGV || 0}</p>
                </div>
              </div>
            </Link>

            <Link to="/hr/training" className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm hover:border-emerald-200 transition-all">
              <div className="flex items-center gap-3">
                <Award className="w-5 h-5 text-emerald-500" />
                <div>
                  <p className="text-xs text-gray-500">Certifications</p>
                  <p className="text-lg font-bold text-gray-900">{metrics?.completedTraining || 0}</p>
                </div>
              </div>
            </Link>
          </div>

          {/* Quick Hub Navigation & Department Distribution */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Department Headcount Breakdown */}
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
              <h3 className="text-base font-bold text-gray-900 mb-4">Workforce by Department</h3>
              {metrics?.departmentDistribution && metrics.departmentDistribution.length > 0 ? (
                <div className="space-y-3">
                  {metrics.departmentDistribution.map((dept, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm">
                      <span className="text-gray-600 font-medium">{dept.name}</span>
                      <div className="flex items-center gap-3">
                        <div className="w-32 bg-gray-100 h-2 rounded-full overflow-hidden">
                          <div
                            className="bg-emerald-500 h-full rounded-full"
                            style={{
                              width: `${Math.min(100, (dept.count / (metrics.totalEmployees || 1)) * 100)}%`
                            }}
                          ></div>
                        </div>
                        <span className="text-gray-900 font-semibold w-6 text-right">{dept.count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400 py-6 text-center">No department data recorded yet.</p>
              )}
            </div>

            {/* Critical Action Center */}
            <div className="lg:col-span-2 bg-gradient-to-br from-slate-900 to-slate-800 p-6 rounded-2xl text-white shadow-sm flex flex-col justify-between">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/20 text-emerald-400 rounded-full text-xs font-semibold uppercase tracking-wider mb-3">
                  Quick Actions & Fast Workflows
                </div>
                <h3 className="text-xl font-bold mb-2">Workforce Lifecycle Operations</h3>
                <p className="text-slate-300 text-sm max-w-xl">
                  Quickly jump into pending verification queues, onboarding workflows, physical file custody logs, and exit clearances.
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
                <Link
                  to="/hr/employees"
                  className="bg-white/10 hover:bg-white/20 transition-colors p-3 rounded-xl flex flex-col items-center justify-center text-center gap-2 group"
                >
                  <Users className="w-5 h-5 text-emerald-400 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-medium">Add Employee</span>
                </Link>

                <Link
                  to="/hr/riders"
                  className="bg-white/10 hover:bg-white/20 transition-colors p-3 rounded-xl flex flex-col items-center justify-center text-center gap-2 group"
                >
                  <Truck className="w-5 h-5 text-indigo-400 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-medium">Rider Fleet HR</span>
                </Link>

                <Link
                  to="/hr/documents/verification"
                  className="bg-white/10 hover:bg-white/20 transition-colors p-3 rounded-xl flex flex-col items-center justify-center text-center gap-2 group"
                >
                  <FileCheck className="w-5 h-5 text-amber-400 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-medium">Review Queue</span>
                </Link>

                <Link
                  to="/hr/documents/expiring"
                  className="bg-white/10 hover:bg-white/20 transition-colors p-3 rounded-xl flex flex-col items-center justify-center text-center gap-2 group"
                >
                  <AlertTriangle className="w-5 h-5 text-rose-400 group-hover:scale-110 transition-transform" />
                  <span className="text-xs font-medium">Expiry Alerts</span>
                </Link>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default HRDashboard;
