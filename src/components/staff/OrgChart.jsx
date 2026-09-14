import React, { useState } from "react";
import {
  Users,
  ChevronDown,
  ChevronRight,
  ShieldCheck,
  Building2,
  Mail,
  UserCheck,
  Layers,
  Crown
} from "lucide-react";
import { buildOrgTree, HIERARCHY_LEVELS, DEPARTMENTS } from "../../services/hierarchyService";

const OrgNode = ({ node, onSelect, selectedId, level = 0 }) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedId === node.id;

  const levelInfo = HIERARCHY_LEVELS.find(l => l.level === Number(node.hierarchyLevel || 4)) || HIERARCHY_LEVELS[3];

  return (
    <div className="flex flex-col items-center">
      {/* Node Card */}
      <div
        onClick={() => onSelect(node)}
        className={`relative bg-white rounded-2xl p-4 border transition-all duration-200 cursor-pointer w-64 shadow-sm hover:shadow-md ${
          isSelected
            ? "border-[#0B4D31] ring-2 ring-[#0B4D31]/20 shadow-lg scale-102"
            : "border-gray-200 hover:border-gray-300"
        }`}
      >
        {/* Top level badge */}
        <div className="flex items-center justify-between mb-2">
          <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md border ${levelInfo.color}`}>
            {levelInfo.code} • {node.hierarchyLevel === 1 ? 'Board' : `Level ${node.hierarchyLevel || 4}`}
          </span>
          {node.role === "SuperAdmin" ? (
            <span className="text-purple-600 bg-purple-50 p-1 rounded-lg">
              <Crown size={12} />
            </span>
          ) : (
            <span className="text-emerald-600 bg-emerald-50 p-1 rounded-lg">
              <ShieldCheck size={12} />
            </span>
          )}
        </div>

        {/* User Info */}
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#0B4D31] to-[#18754e] text-white flex items-center justify-center font-black text-sm shrink-0 shadow-sm">
            {(node.name || node.email || "A").charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-xs font-black text-gray-900 truncate">{node.name || "Unnamed"}</h4>
            <p className="text-[11px] font-bold text-[#0B4D31] truncate mt-0.5">{node.designation || node.role}</p>
            <p className="text-[10px] text-gray-400 font-medium truncate mt-0.5">{node.email}</p>
          </div>
        </div>

        {/* Footer info: Hub and direct reports */}
        <div className="mt-3 pt-2.5 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-500 font-semibold">
          <span className="flex items-center gap-1 truncate max-w-[120px]">
            <Building2 size={11} className="text-gray-400 shrink-0" />
            <span className="truncate">{node.warehouseName || (node.warehouseId ? node.warehouseId : "Global Depot")}</span>
          </span>
          {hasChildren && (
            <span className="bg-gray-100 px-2 py-0.5 rounded-full font-black text-gray-700">
              {node.children.length} {node.children.length === 1 ? 'Reportee' : 'Reportees'}
            </span>
          )}
        </div>

        {/* Expand/Collapse Trigger */}
        {hasChildren && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
            className="absolute -bottom-3 left-1/2 -translate-x-1/2 bg-white border border-gray-200 rounded-full p-0.5 shadow-sm text-gray-600 hover:text-black hover:border-gray-400 transition-colors"
          >
            {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        )}
      </div>

      {/* Children branches */}
      {hasChildren && isExpanded && (
        <div className="flex flex-col items-center mt-4">
          {/* Vertical connector from parent */}
          <div className="w-0.5 h-6 bg-gray-300" />

          {/* Children container with horizontal connector */}
          <div className="flex gap-8 relative pt-4">
            {/* Horizontal line across children */}
            {node.children.length > 1 && (
              <div 
                className="absolute top-0 h-0.5 bg-gray-300" 
                style={{ 
                  left: `${100 / (node.children.length * 2)}%`, 
                  right: `${100 / (node.children.length * 2)}%` 
                }} 
              />
            )}

            {node.children.map((child) => (
              <div key={child.id} className="flex flex-col items-center relative">
                {/* Vertical drop line to child */}
                <div className="w-0.5 h-4 bg-gray-300 -mt-4 mb-2" />
                <OrgNode
                  node={child}
                  onSelect={onSelect}
                  selectedId={selectedId}
                  level={level + 1}
                />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default function OrgChart({ staffList, warehouses }) {
  const [selectedStaff, setSelectedStaff] = useState(null);
  const [deptFilter, setDeptFilter] = useState("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const warehouseMap = (warehouses || []).reduce((acc, w) => {
    acc[w.id] = w.name;
    return acc;
  }, {});

  const enrichedStaff = (staffList || []).map(s => ({
    ...s,
    warehouseName: s.warehouseId ? (warehouseMap[s.warehouseId] || s.warehouseId) : "Global / Central Operations"
  }));

  const filteredStaff = enrichedStaff.filter(s => {
    const matchesDept = deptFilter === "ALL" || s.department === deptFilter;
    const matchesSearch = !searchQuery || 
      (s.name || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.designation || "").toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.email || "").toLowerCase().includes(searchQuery.toLowerCase());
    return matchesDept && matchesSearch;
  });

  const tree = buildOrgTree(filteredStaff);

  return (
    <div className="space-y-6">
      {/* Control bar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-black text-gray-500 uppercase tracking-wider mr-1 flex items-center gap-1.5">
            <Layers size={14} /> Department:
          </span>
          <button
            onClick={() => setDeptFilter("ALL")}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              deptFilter === "ALL"
                ? "bg-[#0B4D31] text-white shadow-sm"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            All Departments ({enrichedStaff.length})
          </button>
          {DEPARTMENTS.map(dept => (
            <button
              key={dept.id}
              onClick={() => setDeptFilter(dept.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                deptFilter === dept.id
                  ? "bg-[#0B4D31] text-white shadow-sm"
                  : "bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-200"
              }`}
            >
              {dept.name}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Search hierarchy..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-[#0B4D31] w-48"
          />
        </div>
      </div>

      {/* Org Chart Visual Board */}
      <div className="bg-gray-50/50 p-8 rounded-3xl border border-gray-200/80 min-h-[500px] overflow-x-auto custom-scrollbar flex flex-col items-center justify-start">
        {tree.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <Users size={48} className="mx-auto text-gray-300 mb-3" />
            <p className="font-bold text-sm text-gray-700">No organizational hierarchy nodes found</p>
            <p className="text-xs text-gray-400 mt-1">Assign reporting managers in staff settings to see the visual org tree.</p>
          </div>
        ) : (
          <div className="flex flex-wrap justify-center gap-12 pt-4">
            {tree.map(rootNode => (
              <OrgNode
                key={rootNode.id}
                node={rootNode}
                onSelect={(node) => setSelectedStaff(node)}
                selectedId={selectedStaff?.id}
              />
            ))}
          </div>
        )}
      </div>

      {/* Selected Staff Details Drawer / Inspector */}
      {selectedStaff && (
        <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm animate-in fade-in duration-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-[#0B4D31] text-white font-black text-lg flex items-center justify-center shadow-md shadow-[#0B4D31]/20">
              {(selectedStaff.name || "A").charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-black text-gray-900">{selectedStaff.name}</h3>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200">
                  {selectedStaff.role}
                </span>
              </div>
              <p className="text-xs font-bold text-gray-500 mt-0.5">
                {selectedStaff.designation || "Staff Member"} • {selectedStaff.department || "General"} • {selectedStaff.warehouseName}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-bold text-gray-600">
            <div className="flex items-center gap-1 bg-gray-50 px-3 py-2 rounded-xl border border-gray-100">
              <Mail size={14} className="text-gray-400" />
              <span>{selectedStaff.email}</span>
            </div>
            <div className="flex items-center gap-1 bg-gray-50 px-3 py-2 rounded-xl border border-gray-100">
              <UserCheck size={14} className="text-gray-400" />
              <span>Status: {selectedStaff.isActive !== false ? "Active" : "Blocked"}</span>
            </div>
            <button
              onClick={() => setSelectedStaff(null)}
              className="text-xs text-gray-400 hover:text-gray-700 font-bold"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
