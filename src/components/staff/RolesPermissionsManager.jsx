import React, { useState, useEffect, useMemo } from "react";
import {
  Shield,
  ShieldCheck,
  Plus,
  Search,
  Edit3,
  Trash2,
  Copy,
  Lock,
  CheckCircle2,
  RotateCcw,
  Sparkles,
  Save,
  Users,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  Filter,
  Layers,
  LayoutDashboard,
  ShoppingCart,
  Grid3X3,
  Building2,
  Bike,
  Landmark,
  Briefcase,
  Settings,
  AlertTriangle,
  HelpCircle,
  Play
} from "lucide-react";
import toast from "react-hot-toast";
import {
  PERMISSION_MODULES,
  DEFAULT_SYSTEM_ROLES,
  fetchRoleDefinitions,
  saveRoleDefinition,
  deleteRoleDefinition,
  hasRolePermission
} from "../../services/rbacService";
import { useAuth } from "../../hooks/useAuth";

// Icon mapping helper
const MODULE_ICONS = {
  LayoutDashboard: <LayoutDashboard size={18} className="text-emerald-600" />,
  ShoppingCart: <ShoppingCart size={18} className="text-blue-600" />,
  Grid3X3: <Grid3X3 size={18} className="text-purple-600" />,
  Building2: <Building2 size={18} className="text-amber-600" />,
  Bike: <Bike size={18} className="text-cyan-600" />,
  Users: <Users size={18} className="text-rose-600" />,
  Landmark: <Landmark size={18} className="text-emerald-700" />,
  Briefcase: <Briefcase size={18} className="text-indigo-600" />,
  Settings: <Settings size={18} className="text-slate-600" />
};

const BADGE_COLORS = {
  emerald: { bg: "bg-emerald-50", text: "text-emerald-800", border: "border-emerald-200", dot: "bg-emerald-500" },
  blue: { bg: "bg-blue-50", text: "text-blue-800", border: "border-blue-200", dot: "bg-blue-500" },
  purple: { bg: "bg-purple-50", text: "text-purple-800", border: "border-purple-200", dot: "bg-purple-500" },
  indigo: { bg: "bg-indigo-50", text: "text-indigo-800", border: "border-indigo-200", dot: "bg-indigo-500" },
  amber: { bg: "bg-amber-50", text: "text-amber-800", border: "border-amber-200", dot: "bg-amber-500" },
  rose: { bg: "bg-rose-50", text: "text-rose-800", border: "border-rose-200", dot: "bg-rose-500" },
  cyan: { bg: "bg-cyan-50", text: "text-cyan-800", border: "border-cyan-200", dot: "bg-cyan-500" },
  teal: { bg: "bg-teal-50", text: "text-teal-800", border: "border-teal-200", dot: "bg-teal-500" },
  slate: { bg: "bg-slate-100", text: "text-slate-800", border: "border-slate-300", dot: "bg-slate-500" }
};

const RolesPermissionsManager = ({ staffList = [] }) => {
  const { role: currentAdminRole } = useAuth();
  const isSuperAdmin = currentAdminRole === "SuperAdmin";

  const [roles, setRoles] = useState(DEFAULT_SYSTEM_ROLES);
  const [selectedRoleId, setSelectedRoleId] = useState("SuperAdmin");
  const [selectedRoleData, setSelectedRoleData] = useState(null);
  const [activePermissions, setActivePermissions] = useState(new Set());
  const [collapsedModules, setCollapsedModules] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isModified, setIsModified] = useState(false);

  // Modal States
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState("create"); // 'create' | 'edit' | 'clone'
  const [roleForm, setRoleForm] = useState({
    id: "",
    name: "",
    department: "OPERATIONS",
    description: "",
    badgeColor: "blue",
    cloneFrom: ""
  });

  // Simulator state
  const [simulatorModule, setSimulatorModule] = useState(PERMISSION_MODULES[0].id);
  const [simulatorKey, setSimulatorKey] = useState(PERMISSION_MODULES[0].permissions[0].key);

  useEffect(() => {
    loadRoles();
  }, []);

  const loadRoles = async () => {
    setLoading(true);
    try {
      const fetched = await fetchRoleDefinitions();
      setRoles(fetched);
      if (fetched.length > 0) {
        const initialRole = fetched.find(r => r.id === selectedRoleId) || fetched[0];
        selectRole(initialRole);
      }
    } catch (err) {
      toast.error("Failed to load RBAC roles");
    } finally {
      setLoading(false);
    }
  };

  const selectRole = (roleObj) => {
    setSelectedRoleId(roleObj.id);
    setSelectedRoleData(roleObj);
    setActivePermissions(new Set(roleObj.permissions || []));
    setIsModified(false);
  };

  // Calculate staff assigned per role
  const staffCountsByRole = useMemo(() => {
    const counts = {};
    staffList.forEach(s => {
      const r = s.role || "Viewer";
      counts[r] = (counts[r] || 0) + 1;
    });
    return counts;
  }, [staffList]);

  // Total available permissions count
  const totalPermissionsCount = useMemo(() => {
    return PERMISSION_MODULES.reduce((acc, m) => acc + m.permissions.length, 0);
  }, []);

  // Filter permissions based on search
  const filteredModules = useMemo(() => {
    if (!searchQuery.trim()) return PERMISSION_MODULES;
    const q = searchQuery.toLowerCase();
    return PERMISSION_MODULES.map(m => {
      const matchingPerms = m.permissions.filter(p => 
        p.label.toLowerCase().includes(q) || 
        p.desc.toLowerCase().includes(q) ||
        p.key.toLowerCase().includes(q)
      );
      if (matchingPerms.length > 0 || m.name.toLowerCase().includes(q)) {
        return {
          ...m,
          permissions: matchingPerms.length > 0 ? matchingPerms : m.permissions
        };
      }
      return null;
    }).filter(Boolean);
  }, [searchQuery]);

  // Toggle single permission
  const handleTogglePermission = (permKey) => {
    if (selectedRoleId === "SuperAdmin") {
      toast("SuperAdmin role automatically holds all permissions", { icon: "🔒" });
      return;
    }

    const nextSet = new Set(activePermissions);
    if (nextSet.has(permKey)) {
      nextSet.delete(permKey);
    } else {
      nextSet.add(permKey);
    }
    setActivePermissions(nextSet);
    setIsModified(true);
  };

  // Toggle all permissions for a specific module
  const handleToggleModule = (moduleId, shouldEnable) => {
    if (selectedRoleId === "SuperAdmin") return;
    const mod = PERMISSION_MODULES.find(m => m.id === moduleId);
    if (!mod) return;

    const nextSet = new Set(activePermissions);
    mod.permissions.forEach(p => {
      if (shouldEnable) {
        nextSet.add(p.key);
      } else {
        nextSet.delete(p.key);
      }
    });
    setActivePermissions(nextSet);
    setIsModified(true);
  };

  // Preset Template Actions
  const applyPreset = (presetType) => {
    if (selectedRoleId === "SuperAdmin") return;

    let nextSet = new Set();
    if (presetType === "all") {
      PERMISSION_MODULES.forEach(m => m.permissions.forEach(p => nextSet.add(p.key)));
    } else if (presetType === "readonly") {
      PERMISSION_MODULES.forEach(m => {
        m.permissions.forEach(p => {
          if (p.key.startsWith("view_")) nextSet.add(p.key);
        });
      });
    } else if (presetType === "clear") {
      nextSet = new Set();
    }
    setActivePermissions(nextSet);
    setIsModified(true);
    toast.success(`Preset applied: ${presetType.toUpperCase()}`);
  };

  // Save current role changes
  const handleSaveChanges = async () => {
    if (!selectedRoleData) return;
    setSaving(true);
    try {
      const updatedData = {
        ...selectedRoleData,
        permissions: Array.from(activePermissions)
      };
      await saveRoleDefinition(updatedData);
      setSelectedRoleData(updatedData);
      setIsModified(false);
      
      // Update local state
      setRoles(prev => prev.map(r => r.id === updatedData.id ? updatedData : r));
      toast.success(`Permissions saved for role "${selectedRoleData.name}"`);
    } catch (err) {
      toast.error(err.message || "Failed to save permissions");
    } finally {
      setSaving(false);
    }
  };

  // Reset unsaved changes
  const handleReset = () => {
    if (selectedRoleData) {
      setActivePermissions(new Set(selectedRoleData.permissions || []));
      setIsModified(false);
      toast("Reverted to saved permissions", { icon: "↩️" });
    }
  };

  // Open Create / Edit / Clone Modal
  const openRoleModal = (mode, roleToEdit = null) => {
    setModalMode(mode);
    if (mode === "edit" && roleToEdit) {
      setRoleForm({
        id: roleToEdit.id,
        name: roleToEdit.name,
        department: roleToEdit.department || "OPERATIONS",
        description: roleToEdit.description || "",
        badgeColor: roleToEdit.badgeColor || "blue",
        cloneFrom: ""
      });
    } else if (mode === "clone" && roleToEdit) {
      setRoleForm({
        id: `${roleToEdit.id}_Copy`,
        name: `${roleToEdit.name} (Copy)`,
        department: roleToEdit.department || "OPERATIONS",
        description: `Cloned from ${roleToEdit.name}`,
        badgeColor: roleToEdit.badgeColor || "indigo",
        cloneFrom: roleToEdit.id
      });
    } else {
      setRoleForm({
        id: "",
        name: "",
        department: "OPERATIONS",
        description: "",
        badgeColor: "blue",
        cloneFrom: ""
      });
    }
    setIsCreateModalOpen(true);
  };

  // Handle Role Form Submission
  const handleRoleFormSubmit = async (e) => {
    e.preventDefault();
    if (!roleForm.id.trim() || !roleForm.name.trim()) {
      toast.error("Role Code & Name are required");
      return;
    }

    const cleanId = roleForm.id.trim().replace(/[^a-zA-Z0-9_]/g, "");
    if (!cleanId) {
      toast.error("Invalid Role ID format");
      return;
    }

    try {
      let initialPermissions = [];
      if (modalMode === "clone" && roleForm.cloneFrom) {
        const source = roles.find(r => r.id === roleForm.cloneFrom);
        if (source) initialPermissions = [...(source.permissions || [])];
      } else if (modalMode === "edit" && selectedRoleData) {
        initialPermissions = selectedRoleData.permissions || [];
      }

      const newRoleObj = {
        id: cleanId,
        name: roleForm.name.trim(),
        department: roleForm.department,
        description: roleForm.description.trim(),
        badgeColor: roleForm.badgeColor,
        isSystem: modalMode === "edit" ? selectedRoleData?.isSystem || false : false,
        permissions: initialPermissions
      };

      await saveRoleDefinition(newRoleObj);
      await loadRoles();
      setSelectedRoleId(cleanId);
      setSelectedRoleData(newRoleObj);
      setActivePermissions(new Set(initialPermissions));
      setIsCreateModalOpen(false);
      toast.success(`Role "${newRoleObj.name}" ${modalMode === "edit" ? "updated" : "created"} successfully!`);
    } catch (err) {
      toast.error(err.message || "Failed to save role");
    }
  };

  // Delete custom role
  const handleDeleteRole = async (roleId) => {
    const roleToDelete = roles.find(r => r.id === roleId);
    if (!roleToDelete) return;

    if (roleToDelete.isSystem) {
      toast.error("Built-in system roles cannot be deleted.");
      return;
    }

    const staffWithRole = staffList.filter(s => s.role === roleId);
    if (staffWithRole.length > 0) {
      toast.error(`Cannot delete role: ${staffWithRole.length} staff member(s) are currently assigned to it.`);
      return;
    }

    if (!window.confirm(`Are you sure you want to permanently delete custom role "${roleToDelete.name}"?`)) {
      return;
    }

    try {
      await deleteRoleDefinition(roleId);
      toast.success(`Role "${roleToDelete.name}" deleted.`);
      const remaining = roles.filter(r => r.id !== roleId);
      setRoles(remaining);
      if (selectedRoleId === roleId) {
        selectRole(remaining[0] || DEFAULT_SYSTEM_ROLES[0]);
      }
    } catch (err) {
      toast.error(err.message || "Failed to delete role");
    }
  };

  // Permission Simulator Calculation
  const simulationResult = useMemo(() => {
    if (!selectedRoleData) return false;
    return hasRolePermission(
      { ...selectedRoleData, permissions: Array.from(activePermissions) },
      simulatorKey
    );
  }, [selectedRoleData, activePermissions, simulatorKey]);

  return (
    <div className="space-y-6">
      {/* Top Banner / Summary Header */}
      <div className="bg-gradient-to-r from-[#0B4D31] to-[#146b45] rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 w-64 h-64 bg-white/5 rounded-full blur-2xl pointer-events-none" />
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 text-emerald-200 text-xs font-semibold backdrop-blur-md">
              <ShieldCheck size={14} className="text-emerald-300" />
              Enterprise RBAC v2.5
            </div>
            <h2 className="text-2xl font-black tracking-tight">Role-Based Access Control & Permissions</h2>
            <p className="text-emerald-100/80 text-sm max-w-2xl leading-relaxed">
              Dynamically define operational boundaries, grant granular privileges across all 9 enterprise hubs, and enforce least-privilege security policies across the workforce.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => openRoleModal("create")}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-white text-[#0B4D31] font-bold text-sm shadow-lg hover:bg-emerald-50 transition-all active:scale-95"
            >
              <Plus size={16} />
              Create Custom Role
            </button>
          </div>
        </div>

        {/* Quick KPI Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6 pt-6 border-t border-white/10">
          <div>
            <span className="text-[11px] text-emerald-200/70 font-semibold uppercase tracking-wider">Total Defined Roles</span>
            <p className="text-2xl font-black mt-0.5">{roles.length}</p>
          </div>
          <div>
            <span className="text-[11px] text-emerald-200/70 font-semibold uppercase tracking-wider">Active Staff Assigned</span>
            <p className="text-2xl font-black mt-0.5">{staffList.length}</p>
          </div>
          <div>
            <span className="text-[11px] text-emerald-200/70 font-semibold uppercase tracking-wider">Configurable Capabilities</span>
            <p className="text-2xl font-black mt-0.5">{totalPermissionsCount}</p>
          </div>
          <div>
            <span className="text-[11px] text-emerald-200/70 font-semibold uppercase tracking-wider">Protected System Roles</span>
            <p className="text-2xl font-black mt-0.5">{DEFAULT_SYSTEM_ROLES.length}</p>
          </div>
        </div>
      </div>

      {/* Main Content Layout: Roles List Left Sidebar + Permissions Matrix Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left Column: Role Selector (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black text-gray-900 flex items-center gap-2">
                <Layers size={16} className="text-[#0B4D31]" />
                Available Roles ({roles.length})
              </h3>
              <span className="text-xs text-gray-400 font-medium">Click to configure</span>
            </div>

            {/* Roles List */}
            <div className="space-y-2 max-h-[620px] overflow-y-auto pr-1 custom-scrollbar">
              {roles.map((r) => {
                const isSelected = r.id === selectedRoleId;
                const staffCount = staffCountsByRole[r.id] || 0;
                const permCount = r.id === "SuperAdmin" ? totalPermissionsCount : (r.permissions?.length || 0);
                const colorScheme = BADGE_COLORS[r.badgeColor] || BADGE_COLORS.slate;

                return (
                  <div
                    key={r.id}
                    onClick={() => selectRole(r)}
                    className={`group relative p-3.5 rounded-2xl border transition-all cursor-pointer ${
                      isSelected
                        ? "bg-green-50/70 border-green-300 ring-2 ring-green-600/10 shadow-sm"
                        : "bg-white border-gray-100 hover:border-gray-200 hover:bg-gray-50/50"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className={`w-2.5 h-2.5 rounded-full ${colorScheme.dot} flex-shrink-0`} />
                        <div className="min-w-0">
                          <h4 className="text-sm font-bold text-gray-900 truncate flex items-center gap-1.5">
                            {r.name}
                            {r.isSystem && (
                              <span title="Built-in System Role" className="text-[10px] text-gray-400 font-normal">
                                <Lock size={11} className="inline text-gray-400" />
                              </span>
                            )}
                          </h4>
                          <span className="text-[11px] font-mono text-gray-400">{r.id}</span>
                        </div>
                      </div>

                      {/* Action buttons on hover */}
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          title="Clone this role"
                          onClick={(e) => {
                            e.stopPropagation();
                            openRoleModal("clone", r);
                          }}
                          className="p-1 text-gray-400 hover:text-gray-700 rounded-md hover:bg-gray-100"
                        >
                          <Copy size={13} />
                        </button>
                        {!r.isSystem && (
                          <>
                            <button
                              title="Edit role metadata"
                              onClick={(e) => {
                                e.stopPropagation();
                                openRoleModal("edit", r);
                              }}
                              className="p-1 text-blue-500 hover:text-blue-700 rounded-md hover:bg-blue-50"
                            >
                              <Edit3 size={13} />
                            </button>
                            <button
                              title="Delete custom role"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteRole(r.id);
                              }}
                              className="p-1 text-red-500 hover:text-red-700 rounded-md hover:bg-red-50"
                            >
                              <Trash2 size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>

                    <p className="text-xs text-gray-500 line-clamp-1 mt-1.5">{r.description || "No description provided."}</p>

                    <div className="flex items-center justify-between text-[11px] font-semibold text-gray-500 mt-3 pt-2.5 border-t border-gray-100/80">
                      <span className="flex items-center gap-1 text-gray-600">
                        <Users size={12} className="text-gray-400" />
                        {staffCount} {staffCount === 1 ? "staff" : "staff"}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full font-bold ${colorScheme.bg} ${colorScheme.text}`}>
                        {permCount} / {totalPermissionsCount} perms
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Quick Staff Assigned to Selected Role Card */}
          {selectedRoleData && (
            <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 flex items-center gap-1.5">
                  <Users size={14} className="text-gray-400" />
                  Staff with "{selectedRoleData.name}"
                </h4>
                <span className="text-xs font-bold text-gray-900 bg-gray-100 px-2 py-0.5 rounded-full">
                  {staffCountsByRole[selectedRoleId] || 0}
                </span>
              </div>

              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                {staffList.filter(s => s.role === selectedRoleId).length === 0 ? (
                  <p className="text-xs text-gray-400 italic py-2">No staff members currently assigned to this role.</p>
                ) : (
                  staffList
                    .filter(s => s.role === selectedRoleId)
                    .map(member => (
                      <div key={member.id} className="flex items-center justify-between py-1.5 px-2 rounded-xl bg-gray-50 text-xs">
                        <div className="min-w-0">
                          <p className="font-bold text-gray-900 truncate">{member.name || member.email}</p>
                          <p className="text-[10px] text-gray-400 truncate">{member.email}</p>
                        </div>
                        <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md flex-shrink-0">
                          {member.designation || member.department || "Active"}
                        </span>
                      </div>
                    ))
                )}
              </div>
            </div>
          )}

          {/* Interactive Permission Simulator */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-5 text-white shadow-md space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                <Sparkles size={14} />
                Permission Tester Simulator
              </h4>
              <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded-md border border-slate-700">Live Test</span>
            </div>
            <p className="text-xs text-slate-300">
              Verify in real-time whether <strong className="text-white">{selectedRoleData?.name}</strong> can execute a specific action:
            </p>

            <div className="space-y-2 pt-1">
              <select
                value={simulatorModule}
                onChange={(e) => {
                  setSimulatorModule(e.target.value);
                  const targetMod = PERMISSION_MODULES.find(m => m.id === e.target.value);
                  if (targetMod?.permissions?.[0]) {
                    setSimulatorKey(targetMod.permissions[0].key);
                  }
                }}
                className="w-full bg-slate-800 border border-slate-700 text-xs rounded-xl px-3 py-2 text-white focus:ring-1 focus:ring-emerald-400 outline-none"
              >
                {PERMISSION_MODULES.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>

              <select
                value={simulatorKey}
                onChange={(e) => setSimulatorKey(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-xs rounded-xl px-3 py-2 text-white focus:ring-1 focus:ring-emerald-400 outline-none"
              >
                {PERMISSION_MODULES.find(m => m.id === simulatorModule)?.permissions.map(p => (
                  <option key={p.key} value={p.key}>{p.label}</option>
                ))}
              </select>
            </div>

            <div className={`p-3 rounded-xl flex items-center justify-between text-xs font-bold mt-2 ${
              simulationResult ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
            }`}>
              <div className="flex items-center gap-2">
                {simulationResult ? <CheckCircle2 size={16} className="text-emerald-400" /> : <X size={16} className="text-rose-400" />}
                <span>{simulationResult ? "Access GRANTED" : "Access DENIED (403)"}</span>
              </div>
              <span className="text-[10px] font-mono opacity-70">
                {simulationResult ? "200 OK" : "Forbidden"}
              </span>
            </div>
          </div>
        </div>

        {/* Right Column: Permission Matrix Builder (8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          
          {/* Active Role Control Bar */}
          <div className="bg-white rounded-3xl p-5 border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-black text-gray-900">{selectedRoleData?.name || "Select a Role"}</h3>
                <span className="text-xs font-mono bg-gray-100 text-gray-600 px-2 py-0.5 rounded-md font-bold">
                  {selectedRoleData?.id}
                </span>
                {selectedRoleId === "SuperAdmin" && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md">
                    <Lock size={12} /> Root Locked
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-1">{selectedRoleData?.description}</p>
            </div>

            {/* Actions: Presets & Save */}
            <div className="flex items-center gap-2 flex-wrap">
              {selectedRoleId !== "SuperAdmin" && (
                <div className="flex items-center gap-1 bg-gray-100 p-1 rounded-2xl">
                  <button
                    onClick={() => applyPreset("all")}
                    className="px-2.5 py-1 text-[11px] font-bold text-gray-600 hover:text-gray-900 hover:bg-white rounded-xl transition-all"
                  >
                    Select All
                  </button>
                  <button
                    onClick={() => applyPreset("readonly")}
                    className="px-2.5 py-1 text-[11px] font-bold text-gray-600 hover:text-gray-900 hover:bg-white rounded-xl transition-all"
                  >
                    Read-Only
                  </button>
                  <button
                    onClick={() => applyPreset("clear")}
                    className="px-2.5 py-1 text-[11px] font-bold text-rose-600 hover:bg-white rounded-xl transition-all"
                  >
                    Clear All
                  </button>
                </div>
              )}

              {isModified && (
                <button
                  onClick={handleReset}
                  className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-xl"
                  title="Discard unsaved changes"
                >
                  <RotateCcw size={16} />
                </button>
              )}

              <button
                disabled={!isModified || saving || selectedRoleId === "SuperAdmin"}
                onClick={handleSaveChanges}
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl font-bold text-sm shadow-md transition-all ${
                  isModified && selectedRoleId !== "SuperAdmin"
                    ? "bg-[#0B4D31] text-white hover:bg-[#146b45] active:scale-95 shadow-emerald-900/20"
                    : "bg-gray-100 text-gray-400 cursor-not-allowed"
                }`}
              >
                <Save size={16} />
                {saving ? "Saving..." : isModified ? "Save Changes" : "Saved"}
              </button>
            </div>
          </div>

          {/* Search permissions filter */}
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
            <input
              type="text"
              placeholder="Search capability by name, key, or module description (e.g., 'packing', 'reconcile', 'export')..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-white border border-gray-200 rounded-2xl text-xs font-medium focus:ring-2 focus:ring-[#0B4D31]/20 focus:border-[#0B4D31] outline-none shadow-sm"
            />
          </div>

          {/* Modules Permission Accordion Cards */}
          <div className="space-y-4">
            {filteredModules.map((module) => {
              const isCollapsed = collapsedModules[module.id];
              const modulePermKeys = module.permissions.map(p => p.key);
              const activeInModule = modulePermKeys.filter(k => 
                selectedRoleId === "SuperAdmin" ? true : activePermissions.has(k)
              ).length;
              const isAllModuleActive = activeInModule === module.permissions.length;

              return (
                <div
                  key={module.id}
                  className="bg-white rounded-3xl border border-gray-100 shadow-sm overflow-hidden transition-all hover:border-gray-200"
                >
                  {/* Module Header Bar */}
                  <div
                    onClick={() => setCollapsedModules(prev => ({ ...prev, [module.id]: !prev[module.id] }))}
                    className="p-4 bg-gray-50/70 border-b border-gray-100 flex items-center justify-between cursor-pointer select-none hover:bg-gray-100/50"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-white rounded-xl shadow-xs border border-gray-100">
                        {MODULE_ICONS[module.icon] || <Shield size={18} className="text-gray-600" />}
                      </div>
                      <div>
                        <h4 className="text-sm font-black text-gray-900 flex items-center gap-2">
                          {module.name}
                          <span className="text-xs font-bold text-gray-400">
                            ({activeInModule}/{module.permissions.length} active)
                          </span>
                        </h4>
                        <p className="text-[11px] text-gray-500">{module.description}</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-3" onClick={(e) => e.stopPropagation()}>
                      {selectedRoleId !== "SuperAdmin" && (
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handleToggleModule(module.id, true)}
                            className="text-[10px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1 rounded-lg transition-colors"
                          >
                            Enable All
                          </button>
                          <button
                            onClick={() => handleToggleModule(module.id, false)}
                            className="text-[10px] font-bold text-gray-500 bg-gray-100 hover:bg-gray-200 px-2.5 py-1 rounded-lg transition-colors"
                          >
                            Disable
                          </button>
                        </div>
                      )}
                      
                      <div className="text-gray-400 p-1">
                        {isCollapsed ? <ChevronRight size={18} /> : <ChevronDown size={18} />}
                      </div>
                    </div>
                  </div>

                  {/* Permissions Checklist */}
                  {!isCollapsed && (
                    <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                      {module.permissions.map((perm) => {
                        const isGranted = selectedRoleId === "SuperAdmin" ? true : activePermissions.has(perm.key);

                        return (
                          <div
                            key={perm.key}
                            onClick={() => handleTogglePermission(perm.key)}
                            className={`p-3 rounded-2xl border transition-all flex items-start justify-between gap-3 cursor-pointer ${
                              isGranted
                                ? "bg-emerald-50/40 border-emerald-200 shadow-xs"
                                : "bg-white border-gray-100 hover:border-gray-200 hover:bg-gray-50/40"
                            }`}
                          >
                            <div className="space-y-0.5 min-w-0">
                              <span className="text-xs font-bold text-gray-900 block truncate">
                                {perm.label}
                              </span>
                              <p className="text-[11px] text-gray-500 leading-tight">
                                {perm.desc}
                              </p>
                              <span className="text-[10px] font-mono text-gray-400 block pt-0.5">
                                {perm.key}
                              </span>
                            </div>

                            {/* Custom Toggle Switch */}
                            <div className="flex-shrink-0 pt-0.5">
                              <div
                                className={`w-9 h-5 rounded-full transition-colors relative flex items-center px-0.5 ${
                                  isGranted ? "bg-[#0B4D31]" : "bg-gray-200"
                                }`}
                              >
                                <div
                                  className={`w-4 h-4 rounded-full bg-white shadow-md transform transition-transform ${
                                    isGranted ? "translate-x-4" : "translate-x-0"
                                  }`}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Create / Edit / Clone Role Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 border border-gray-100 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-black text-gray-900">
                  {modalMode === "create" ? "Create Custom RBAC Role" : modalMode === "clone" ? "Clone Role" : "Edit Role Details"}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Define a customized authorization tier with explicit permissions.
                </p>
              </div>
              <button
                onClick={() => setIsCreateModalOpen(false)}
                className="p-1.5 text-gray-400 hover:text-gray-700 rounded-xl hover:bg-gray-100"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleRoleFormSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block mb-1">
                  Role Code / ID (Unique)*
                </label>
                <input
                  type="text"
                  required
                  disabled={modalMode === "edit"}
                  placeholder="e.g. Regional_Agronomist, Warehouse_Auditor"
                  value={roleForm.id}
                  onChange={(e) => setRoleForm({ ...roleForm, id: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold font-mono focus:ring-2 focus:ring-[#0B4D31]/20 focus:border-[#0B4D31] outline-none disabled:opacity-60"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block mb-1">
                  Display Name*
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Senior Regional Agronomist"
                  value={roleForm.name}
                  onChange={(e) => setRoleForm({ ...roleForm, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:ring-2 focus:ring-[#0B4D31]/20 focus:border-[#0B4D31] outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block mb-1">
                    Department
                  </label>
                  <select
                    value={roleForm.department}
                    onChange={(e) => setRoleForm({ ...roleForm, department: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-[#0B4D31]/20 focus:border-[#0B4D31] outline-none"
                  >
                    <option value="OPERATIONS">Operations</option>
                    <option value="COMMERCIAL">Commercial / Catalog</option>
                    <option value="LOGISTICS">Logistics & Fleet</option>
                    <option value="FINANCE">Finance & Accounts</option>
                    <option value="HUMAN_RESOURCES">HR & Legal</option>
                    <option value="EXECUTIVE">Executive / Admin</option>
                    <option value="AUDIT">Audit & Compliance</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block mb-1">
                    Badge Color
                  </label>
                  <select
                    value={roleForm.badgeColor}
                    onChange={(e) => setRoleForm({ ...roleForm, badgeColor: e.target.value })}
                    className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-[#0B4D31]/20 focus:border-[#0B4D31] outline-none"
                  >
                    <option value="blue">Blue</option>
                    <option value="emerald">Emerald</option>
                    <option value="purple">Purple</option>
                    <option value="indigo">Indigo</option>
                    <option value="amber">Amber</option>
                    <option value="rose">Rose</option>
                    <option value="cyan">Cyan</option>
                    <option value="teal">Teal</option>
                    <option value="slate">Slate</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-gray-700 uppercase tracking-wider block mb-1">
                  Description
                </label>
                <textarea
                  rows={2}
                  placeholder="Describe operational responsibilities and scope..."
                  value={roleForm.description}
                  onChange={(e) => setRoleForm({ ...roleForm, description: e.target.value })}
                  className="w-full px-3.5 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs focus:ring-2 focus:ring-[#0B4D31]/20 focus:border-[#0B4D31] outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-[#0B4D31] text-white text-xs font-bold shadow-md hover:bg-[#146b45]"
                >
                  {modalMode === "create" ? "Create Role" : "Save Role"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default RolesPermissionsManager;
