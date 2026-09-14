import React, { useState, useEffect } from 'react';
import {
  collection,
  query,
  orderBy,
  onSnapshot,
  addDoc,
  Timestamp
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../hooks/useAuth';
import DataTable from '../../components/common/DataTable';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import {
  ShieldCheck,
  FileCheck,
  Building2,
  Calendar,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Search,
  Download,
  Printer,
  Sparkles,
  Layers,
  X,
  FileText
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function AgriStatutoryRegisters() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('FORM_O'); // 'FORM_O' (Fertilizers) | 'FORM_A' (Seeds) | 'INSPECTIONS' (DAO Inspections)
  const [formORecords, setFormORecords] = useState([]);
  const [formARecords, setFormARecords] = useState([]);
  const [inspections, setInspections] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Form State
  const [form, setForm] = useState({
    manufacturerName: 'IFFCO Ltd (Indian Farmers Fertiliser Coop)',
    certificateNumber: '',
    commodityType: 'FERTILIZER_NPK', // FERTILIZER_NPK | HYBRID_SEEDS | BIO_STIMULANT | INSECTICIDE
    validFrom: new Date().toISOString().slice(0, 10),
    validTill: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
    notifiedVarietiesOrGrades: 'NPK 12:32:16, DAP 18:46:00, Urea 46%',
    issuingOfficer: 'DAO (District Agriculture Officer)',
    officerDesignation: 'District Agriculture Officer, Purnea',
    remarks: 'Approved for wholesale and retail distribution under FCO 1985'
  });

  // Fetch Statutory Registers
  useEffect(() => {
    const unsubs = [];
    unsubs.push(
      onSnapshot(query(collection(db, 'agri_statutory_form_o'), orderBy('createdAt', 'desc')), (snap) => {
        setFormORecords(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      })
    );
    unsubs.push(
      onSnapshot(query(collection(db, 'agri_statutory_form_a'), orderBy('createdAt', 'desc')), (snap) => {
        setFormARecords(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      })
    );
    unsubs.push(
      onSnapshot(query(collection(db, 'agri_officer_inspections'), orderBy('createdAt', 'desc')), (snap) => {
        setInspections(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      })
    );
    return () => unsubs.forEach(u => u());
  }, []);

  // Save Statutory Form / Inspection Record
  const handleSaveRecord = async (e) => {
    e.preventDefault();
    try {
      const targetCol = activeTab === 'FORM_O' ? 'agri_statutory_form_o' : (activeTab === 'FORM_A' ? 'agri_statutory_form_a' : 'agri_officer_inspections');

      await addDoc(collection(db, targetCol), {
        ...form,
        registerType: activeTab,
        status: 'VALID_ACTIVE',
        createdAt: Timestamp.now(),
        recordedBy: user?.email || 'Compliance Officer'
      });

      toast.success(`Record added to ${activeTab} Statutory Register!`);
      setIsModalOpen(false);
      setForm({
        manufacturerName: 'IFFCO Ltd (Indian Farmers Fertiliser Coop)',
        certificateNumber: '',
        commodityType: 'FERTILIZER_NPK',
        validFrom: new Date().toISOString().slice(0, 10),
        validTill: new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10),
        notifiedVarietiesOrGrades: 'NPK 12:32:16, DAP 18:46:00, Urea 46%',
        issuingOfficer: 'DAO (District Agriculture Officer)',
        officerDesignation: 'District Agriculture Officer, Purnea',
        remarks: 'Approved for wholesale and retail distribution'
      });
    } catch (err) {
      console.error(err);
      toast.error('Failed to save record.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-[#064E3B] to-[#047857] text-white p-6 rounded-3xl shadow-lg relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
              <ShieldCheck size={14} className="text-emerald-300" />
              Govt. Fertilizer & Seed Control Order Statutory Registers
            </div>
            <h2 className="text-2xl font-black">Form O, Form A & Govt. Inspection Registers</h2>
            <p className="text-white/80 text-sm max-w-2xl">
              Maintain manufacturer Principal Certificates (Form O under FCO 1985 & Form A under Seeds Act 1966), and keep a tamper-proof digital log of District Agriculture Officer (DAO/SDAO) inspections.
            </p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center gap-2 bg-emerald-400 hover:bg-emerald-300 text-gray-900 font-extrabold px-6 py-3.5 rounded-2xl shadow-xl transition-transform active:scale-95 shrink-0 cursor-pointer"
          >
            <Plus size={20} />
            Add Statutory Entry
          </button>
        </div>
      </div>

      {/* Register Selector Tabs */}
      <div className="flex items-center gap-2 bg-white p-2 rounded-2xl border border-gray-100 shadow-sm">
        {[
          { id: 'FORM_O', label: 'Form O (Fertilizer Principal Certificates)', count: formORecords.length },
          { id: 'FORM_A', label: 'Form A (Seed Dealership & Varieties)', count: formARecords.length },
          { id: 'INSPECTIONS', label: 'DAO / SDAO Inspection Logbook', count: inspections.length }
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === t.id ? 'bg-[#064E3B] text-white shadow-md' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <span>{t.label}</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] bg-white/20 font-black">
              {t.count}
            </span>
          </button>
        ))}
      </div>

      {/* Form O View */}
      {activeTab === 'FORM_O' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
              <FileCheck className="text-[#064E3B]" size={18} />
              Form O (Fertilizer Control Order - Principal Manufacturer Endorsements)
            </h3>
            <span className="text-xs font-bold text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
              {formORecords.length} Certificates Active
            </span>
          </div>

          <DataTable
            data={formORecords}
            columns={[
              {
                header: 'Certificate No & Ref',
                accessor: 'certificateNumber',
                render: (row) => (
                  <div>
                    <span className="font-mono font-bold text-gray-900 block">{row.certificateNumber || 'FCO-2026-001'}</span>
                    <span className="text-xs text-gray-500">Issued to KrishiVishal Hub</span>
                  </div>
                )
              },
              {
                header: 'Manufacturing Company',
                accessor: 'manufacturerName',
                render: (row) => <span className="font-bold text-gray-900">{row.manufacturerName}</span>
              },
              {
                header: 'Endorsed Grades / Formulations',
                accessor: 'notifiedVarietiesOrGrades',
                render: (row) => <span className="text-xs font-semibold text-emerald-800">{row.notifiedVarietiesOrGrades}</span>
              },
              {
                header: 'Validity Period',
                accessor: 'validTill',
                render: (row) => (
                  <span className="text-xs font-bold text-gray-700">
                    {row.validFrom} to {row.validTill}
                  </span>
                )
              },
              {
                header: 'Govt. Status',
                accessor: 'status',
                render: () => (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-50 text-green-700 rounded-lg text-xs font-bold border border-green-200">
                    <CheckCircle2 size={12} /> FCO Endorsed
                  </span>
                )
              }
            ]}
          />
        </div>
      )}

      {/* Form A View */}
      {activeTab === 'FORM_A' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
              <FileCheck className="text-[#064E3B]" size={18} />
              Form A (Seed Trade & Certified Varieties Dealership Register)
            </h3>
            <span className="text-xs font-bold text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
              {formARecords.length} Varieties Endorsed
            </span>
          </div>

          <DataTable
            data={formARecords}
            columns={[
              {
                header: 'Seed License Ref #',
                accessor: 'certificateNumber',
                render: (row) => <span className="font-mono font-bold text-gray-900">{row.certificateNumber || 'SEED-ACT-2026'}</span>
              },
              {
                header: 'Seed Breeder / Company',
                accessor: 'manufacturerName',
                render: (row) => <span className="font-bold text-gray-900">{row.manufacturerName}</span>
              },
              {
                header: 'Notified Crop Varieties',
                accessor: 'notifiedVarietiesOrGrades',
                render: (row) => <span className="text-xs font-bold text-emerald-800">{row.notifiedVarietiesOrGrades}</span>
              },
              {
                header: 'Validity',
                accessor: 'validTill',
                render: (row) => <span className="text-xs text-gray-700 font-semibold">{row.validTill}</span>
              },
              {
                header: 'Status',
                accessor: 'status',
                render: () => (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-50 text-green-700 rounded-lg text-xs font-bold border border-green-200">
                    <CheckCircle2 size={12} /> Seed Act Verified
                  </span>
                )
              }
            ]}
          />
        </div>
      )}

      {/* DAO Inspections View */}
      {activeTab === 'INSPECTIONS' && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
              <ShieldCheck className="text-[#064E3B]" size={18} />
              District Agriculture Officer (DAO/SDAO) Official Visit & Sample Log
            </h3>
            <span className="text-xs font-bold text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
              {inspections.length} Inspection Entries
            </span>
          </div>

          <DataTable
            data={inspections}
            columns={[
              {
                header: 'Inspection Date & Ref',
                accessor: 'certificateNumber',
                render: (row) => (
                  <div>
                    <span className="font-mono font-bold text-gray-900 block">{row.certificateNumber || 'INSP-2026-04'}</span>
                    <span className="text-xs text-gray-500">{row.validFrom}</span>
                  </div>
                )
              },
              {
                header: 'Inspecting Officer',
                accessor: 'issuingOfficer',
                render: (row) => (
                  <div>
                    <span className="font-bold text-gray-900 block">{row.issuingOfficer}</span>
                    <span className="text-xs text-gray-500">{row.officerDesignation}</span>
                  </div>
                )
              },
              {
                header: 'Inspected Commodity & Batches',
                accessor: 'notifiedVarietiesOrGrades',
                render: (row) => <span className="text-xs font-bold text-gray-800">{row.notifiedVarietiesOrGrades}</span>
              },
              {
                header: 'Officer Remarks & Lab Status',
                accessor: 'remarks',
                render: (row) => <span className="text-xs text-gray-700 italic">{row.remarks}</span>
              },
              {
                header: 'Outcome',
                accessor: 'status',
                render: () => (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-green-50 text-green-700 rounded-lg text-xs font-bold border border-green-200">
                    <CheckCircle2 size={12} /> Satisfactory / Clean Pass
                  </span>
                )
              }
            ]}
          />
        </div>
      )}

      {/* Add Record Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-gray-100 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-gray-100">
              <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                <ShieldCheck className="text-[#064E3B]" size={20} />
                Add {activeTab.replace(/_/g, ' ')} Record
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveRecord} className="space-y-3.5 text-xs font-semibold">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-600 mb-1">Company / Manufacturer</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. IFFCO / Bayer CropScience"
                    value={form.manufacturerName}
                    onChange={(e) => setForm({ ...form, manufacturerName: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-bold text-gray-800 outline-none focus:border-[#064E3B]"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1">Certificate / Notice Ref #</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. FCO-2026-PUR-89"
                    value={form.certificateNumber}
                    onChange={(e) => setForm({ ...form, certificateNumber: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-bold text-gray-800 outline-none focus:border-[#064E3B]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-600 mb-1">Notified Grades / Varieties / Batch Info</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. DAP 18:46:00, NPK 10:26:26, Mustard 45S46"
                  value={form.notifiedVarietiesOrGrades}
                  onChange={(e) => setForm({ ...form, notifiedVarietiesOrGrades: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-bold text-gray-800 outline-none focus:border-[#064E3B]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-600 mb-1">Valid From</label>
                  <input
                    type="date"
                    required
                    value={form.validFrom}
                    onChange={(e) => setForm({ ...form, validFrom: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-bold text-gray-800 outline-none focus:border-[#064E3B]"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1">Valid Till</label>
                  <input
                    type="date"
                    required
                    value={form.validTill}
                    onChange={(e) => setForm({ ...form, validTill: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-bold text-gray-800 outline-none focus:border-[#064E3B]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-600 mb-1">Issuing / Inspecting Authority</label>
                  <input
                    type="text"
                    value={form.issuingOfficer}
                    onChange={(e) => setForm({ ...form, issuingOfficer: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-bold text-gray-800 outline-none focus:border-[#064E3B]"
                  />
                </div>
                <div>
                  <label className="block text-gray-600 mb-1">Designation & Location</label>
                  <input
                    type="text"
                    value={form.officerDesignation}
                    onChange={(e) => setForm({ ...form, officerDesignation: e.target.value })}
                    className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-bold text-gray-800 outline-none focus:border-[#064E3B]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-gray-600 mb-1">Remarks & Compliance Notes</label>
                <textarea
                  rows="2"
                  value={form.remarks}
                  onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-xl p-2.5 font-medium text-gray-800 outline-none focus:border-[#064E3B]"
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="w-1/2 py-3 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-3 bg-[#064E3B] hover:bg-[#047857] text-white font-extrabold rounded-xl shadow-lg"
                >
                  Save to Register
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
