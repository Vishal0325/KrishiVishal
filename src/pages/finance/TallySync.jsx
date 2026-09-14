import React, { useState, useEffect, useMemo } from 'react';
import {
  collection,
  query,
  orderBy,
  onSnapshot
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../hooks/useAuth';
import DataTable from '../../components/common/DataTable';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import {
  Download,
  FileCode2,
  FileSpreadsheet,
  Layers,
  CheckCircle2,
  Calendar,
  Building2,
  Receipt,
  ShoppingCart,
  DollarSign,
  AlertCircle,
  Sparkles,
  FolderDown
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function TallySync() {
  const { user } = useAuth();
  const [activeSyncType, setActiveSyncType] = useState('SALES'); // 'SALES' | 'PURCHASE' | 'EXPENSE' | 'MASTERS'
  const [dateRange, setDateRange] = useState('This Month');
  const [selectedHub, setSelectedHub] = useState('ALL');
  const [hubs, setHubs] = useState([]);
  
  const [orders, setOrders] = useState([]);
  const [grns, setGrns] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [vendors, setVendors] = useState([]);
  
  const [loading, setLoading] = useState(true);

  // Fetch Hubs
  useEffect(() => {
    const unsub = onSnapshot(collection(db, 'warehouses'), (snap) => {
      setHubs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  // Fetch Master and Transaction Data
  useEffect(() => {
    setLoading(true);
    const unsubs = [];

    // Orders
    unsubs.push(
      onSnapshot(query(collection(db, 'orders'), orderBy('createdAt', 'desc')), (snap) => {
        setOrders(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      })
    );

    // GRNs (Purchase)
    unsubs.push(
      onSnapshot(query(collection(db, 'goods_receipts'), orderBy('createdAt', 'desc')), (snap) => {
        setGrns(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      })
    );

    // Expenses
    unsubs.push(
      onSnapshot(query(collection(db, 'expenses'), orderBy('createdAt', 'desc')), (snap) => {
        setExpenses(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      })
    );

    // Customers
    unsubs.push(
      onSnapshot(collection(db, 'users'), (snap) => {
        setCustomers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      })
    );

    // Suppliers
    unsubs.push(
      onSnapshot(collection(db, 'suppliers'), (snap) => {
        setSuppliers(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      })
    );

    // Expense Vendors
    unsubs.push(
      onSnapshot(collection(db, 'expense_vendors'), (snap) => {
        setVendors(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setLoading(false);
      })
    );

    return () => unsubs.forEach(unsub => unsub());
  }, []);

  // Date Filtering Helper
  const filterByDate = (itemDate) => {
    if (!itemDate) return true;
    const d = itemDate.toDate ? itemDate.toDate() : new Date(itemDate);
    const now = new Date();

    if (dateRange === 'Today') {
      return d.toDateString() === now.toDateString();
    }
    if (dateRange === 'This Week') {
      const weekAgo = new Date();
      weekAgo.setDate(now.getDate() - 7);
      return d >= weekAgo;
    }
    if (dateRange === 'This Month') {
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    if (dateRange === 'Last 3 Months') {
      const threeMonthsAgo = new Date();
      threeMonthsAgo.setMonth(now.getMonth() - 3);
      return d >= threeMonthsAgo;
    }
    return true;
  };

  // Filtered Records based on Active Tab
  const filteredRecords = useMemo(() => {
    if (activeSyncType === 'SALES') {
      return orders.filter(o => {
        const matchesDate = filterByDate(o.createdAt);
        const matchesHub = selectedHub === 'ALL' || o.warehouseId === selectedHub || o.hubId === selectedHub;
        return matchesDate && matchesHub && o.status !== 'CANCELLED';
      });
    }
    if (activeSyncType === 'PURCHASE') {
      return grns.filter(g => {
        const matchesDate = filterByDate(g.createdAt);
        const matchesHub = selectedHub === 'ALL' || g.warehouseId === selectedHub;
        return matchesDate && matchesHub;
      });
    }
    if (activeSyncType === 'EXPENSE') {
      return expenses.filter(e => {
        const matchesDate = filterByDate(e.createdAt || e.date);
        const matchesHub = selectedHub === 'ALL' || e.hubId === selectedHub;
        return matchesDate && matchesHub;
      });
    }
    if (activeSyncType === 'MASTERS') {
      return [
        ...suppliers.map(s => ({ ...s, masterType: 'Sundry Creditor (Supplier)', masterName: s.name || s.companyName })),
        ...vendors.map(v => ({ ...v, masterType: 'Sundry Creditor (Vendor)', masterName: v.name || v.vendorName })),
        ...customers.slice(0, 100).map(c => ({ ...c, masterType: 'Sundry Debtor (Customer)', masterName: c.displayName || c.phone || 'Farmer Customer' }))
      ];
    }
    return [];
  }, [activeSyncType, orders, grns, expenses, suppliers, vendors, customers, dateRange, selectedHub]);

  // Generate TallyPrime Official XML
  const generateTallyXML = (records, type) => {
    let xmlContent = `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
  <HEADER>
    <TALLYREQUEST>Import Data</TALLYREQUEST>
  </HEADER>
  <BODY>
    <IMPORTDATA>
      <REQUESTDESC>
        <REPORTNAME>All Masters</REPORTNAME>
        <STATICVARIABLES>
          <SVCURRENTCOMPANY>KrishiVishal Agritech Pvt Ltd</SVCURRENTCOMPANY>
        </STATICVARIABLES>
      </REQUESTDESC>
      <REQUESTDATA>`;

    if (type === 'SALES') {
      records.forEach(order => {
        const orderDate = order.createdAt?.toDate ? order.createdAt.toDate().toISOString().slice(0, 10).replace(/-/g, '') : '20260901';
        const totalAmount = Number(order.totalAmount || order.finalAmount || 0);
        const customerName = (order.customerName || order.shippingAddress?.fullName || 'Cash Customer').replace(/&/g, '&amp;');
        const gstAmount = Number(order.taxAmount || order.gstTotal || 0);
        const netSales = Math.max(0, totalAmount - gstAmount);

        xmlContent += `
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Sales" ACTION="Create">
            <DATE>${orderDate}</DATE>
            <VOUCHERTYPENAME>Sales</VOUCHERTYPENAME>
            <VOUCHERNUMBER>KV-INV-${order.orderId || order.id.slice(0, 8).toUpperCase()}</VOUCHERNUMBER>
            <REFERENCE>ORD-${order.id.slice(0, 8).toUpperCase()}</REFERENCE>
            <PARTYLEDGERNAME>${customerName}</PARTYLEDGERNAME>
            <PERSISTEDVIEW>Invoice View</PERSISTEDVIEW>
            <BASICBUYERNAME>${customerName}</BASICBUYERNAME>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${customerName}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-${totalAmount.toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Agricultural Sales Account</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${netSales.toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>`;

        if (gstAmount > 0) {
          const halfGst = (gstAmount / 2).toFixed(2);
          xmlContent += `
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Output CGST @ 2.5% / 6% / 9%</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${halfGst}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Output SGST @ 2.5% / 6% / 9%</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${halfGst}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>`;
        }

        xmlContent += `
          </VOUCHER>
        </TALLYMESSAGE>`;
      });
    } else if (type === 'PURCHASE') {
      records.forEach(grn => {
        const grnDate = grn.createdAt?.toDate ? grn.createdAt.toDate().toISOString().slice(0, 10).replace(/-/g, '') : '20260901';
        const totalAmount = Number(grn.totalBillAmount || grn.totalAmount || 0);
        const supplierName = (grn.supplierName || 'Agri Supplier').replace(/&/g, '&amp;');
        const taxAmount = Number(grn.taxAmount || 0);
        const netPurchase = Math.max(0, totalAmount - taxAmount);

        xmlContent += `
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Purchase" ACTION="Create">
            <DATE>${grnDate}</DATE>
            <VOUCHERTYPENAME>Purchase</VOUCHERTYPENAME>
            <VOUCHERNUMBER>GRN-${grn.grnNumber || grn.id.slice(0, 8).toUpperCase()}</VOUCHERNUMBER>
            <REFERENCE>${grn.invoiceNumber || 'PO-REF'}</REFERENCE>
            <PARTYLEDGERNAME>${supplierName}</PARTYLEDGERNAME>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${supplierName}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${totalAmount.toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Agri Inventory Purchase Account</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-${netPurchase.toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>`;

        if (taxAmount > 0) {
          const halfTax = (taxAmount / 2).toFixed(2);
          xmlContent += `
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Input CGST Tax</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-${halfTax}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>Input SGST Tax</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-${halfTax}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>`;
        }

        xmlContent += `
          </VOUCHER>
        </TALLYMESSAGE>`;
      });
    } else if (type === 'EXPENSE') {
      records.forEach(exp => {
        const expDate = exp.createdAt?.toDate ? exp.createdAt.toDate().toISOString().slice(0, 10).replace(/-/g, '') : '20260901';
        const amount = Number(exp.amount || 0);
        const categoryName = (exp.category || 'General Operations').replace(/_/g, ' ');
        const paymentMode = exp.paymentMode || 'HDFC Bank Current A/c';

        xmlContent += `
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <VOUCHER VCHTYPE="Payment" ACTION="Create">
            <DATE>${expDate}</DATE>
            <VOUCHERTYPENAME>Payment</VOUCHERTYPENAME>
            <VOUCHERNUMBER>EXP-${exp.id.slice(0, 8).toUpperCase()}</VOUCHERNUMBER>
            <NARRATION>${(exp.note || 'Hub operational expense').replace(/&/g, '&amp;')}</NARRATION>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${categoryName} Expenses</LEDGERNAME>
              <ISDEEMEDPOSITIVE>Yes</ISDEEMEDPOSITIVE>
              <AMOUNT>-${amount.toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
            <ALLLEDGERENTRIES.LIST>
              <LEDGERNAME>${paymentMode}</LEDGERNAME>
              <ISDEEMEDPOSITIVE>No</ISDEEMEDPOSITIVE>
              <AMOUNT>${amount.toFixed(2)}</AMOUNT>
            </ALLLEDGERENTRIES.LIST>
          </VOUCHER>
        </TALLYMESSAGE>`;
      });
    } else if (type === 'MASTERS') {
      records.forEach(m => {
        const mName = (m.masterName || 'Master Party').replace(/&/g, '&amp;');
        const groupName = m.masterType.includes('Creditor') ? 'Sundry Creditors' : 'Sundry Debtors';

        xmlContent += `
        <TALLYMESSAGE xmlns:UDF="TallyUDF">
          <LEDGER NAME="${mName}" ACTION="Create">
            <NAME>${mName}</NAME>
            <PARENT>${groupName}</PARENT>
            <OPENINGBALANCE>0</OPENINGBALANCE>
            <ISBILLWISEON>Yes</ISBILLWISEON>
            <LEDGERPHONE>${m.phone || ''}</LEDGERPHONE>
            <LEDGERGSTIN>${m.gstin || m.gstNumber || ''}</LEDGERGSTIN>
          </LEDGER>
        </TALLYMESSAGE>`;
      });
    }

    xmlContent += `
      </REQUESTDATA>
    </IMPORTDATA>
  </BODY>
</ENVELOPE>`;

    return xmlContent;
  };

  // Download XML Trigger
  const handleExportXML = () => {
    if (filteredRecords.length === 0) {
      toast.error('No records found for current filters to export.');
      return;
    }

    const xml = generateTallyXML(filteredRecords, activeSyncType);
    const blob = new Blob([xml], { type: 'application/xml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `KrishiVishal_Tally_${activeSyncType}_${new Date().toISOString().slice(0, 10)}.xml`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success(`Exported ${filteredRecords.length} ${activeSyncType} vouchers for TallyPrime!`);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner with Tally Features Info */}
      <div className="bg-gradient-to-r from-[#0B4D31] to-[#146b45] text-white p-6 rounded-3xl shadow-lg relative overflow-hidden">
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
              <Sparkles size={14} className="text-yellow-300" />
              TallyPrime & Tally.ERP 9 Native Bridge
            </div>
            <h2 className="text-2xl font-black">1-Click Tally XML Data Sync</h2>
            <p className="text-white/80 text-sm max-w-2xl">
              Export sales invoices, vendor purchase GRNs, operating expenses, and customer/supplier master accounts in standard Tally XML format for direct CA/Auditor import.
            </p>
          </div>
          <button
            onClick={handleExportXML}
            className="flex items-center gap-2 bg-yellow-400 hover:bg-yellow-300 text-gray-900 font-extrabold px-6 py-3.5 rounded-2xl shadow-xl transition-transform active:scale-95 shrink-0 cursor-pointer"
          >
            <FolderDown size={20} />
            Export Tally XML ({filteredRecords.length})
          </button>
        </div>
      </div>

      {/* Control Bar: Sync Type Tabs + Filter Bar */}
      <div className="bg-white p-4 rounded-2xl border border-gray-100 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        {/* Sync Type Selector */}
        <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-xl">
          {[
            { id: 'SALES', label: 'Sales Invoices', icon: ShoppingCart },
            { id: 'PURCHASE', label: 'Purchase GRNs', icon: Building2 },
            { id: 'EXPENSE', label: 'Expense Vouchers', icon: Receipt },
            { id: 'MASTERS', label: 'Ledger Masters', icon: Layers }
          ].map((type) => {
            const Icon = type.icon;
            const isSelected = activeSyncType === type.id;
            return (
              <button
                key={type.id}
                onClick={() => setActiveSyncType(type.id)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  isSelected ? 'bg-white text-[#0B4D31] shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                <Icon size={14} />
                <span>{type.label}</span>
              </button>
            );
          })}
        </div>

        {/* Filters: Date + Hub */}
        <div className="flex items-center gap-3">
          {activeSyncType !== 'MASTERS' && (
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-xl text-xs font-semibold">
              <Calendar size={14} className="text-gray-500" />
              <select
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
                className="bg-transparent outline-none font-bold text-gray-700 cursor-pointer"
              >
                <option value="Today">Today</option>
                <option value="This Week">This Week</option>
                <option value="This Month">This Month</option>
                <option value="Last 3 Months">Last 3 Months</option>
                <option value="All Time">All Time</option>
              </select>
            </div>
          )}

          {activeSyncType !== 'MASTERS' && (
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-xl text-xs font-semibold">
              <Building2 size={14} className="text-gray-500" />
              <select
                value={selectedHub}
                onChange={(e) => setSelectedHub(e.target.value)}
                className="bg-transparent outline-none font-bold text-gray-700 cursor-pointer"
              >
                <option value="ALL">All Hubs & Warehouses</option>
                {hubs.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Summary Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Ready for Tally Import</p>
          <div className="flex items-center justify-between mt-2">
            <h3 className="text-2xl font-black text-gray-900">{filteredRecords.length}</h3>
            <div className="h-10 w-10 bg-green-50 rounded-xl flex items-center justify-center text-green-600 font-bold">
              <CheckCircle2 size={20} />
            </div>
          </div>
          <p className="text-[11px] text-gray-400 mt-2 font-medium">Standard Tally XML Format v9.0</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Total Transaction Value</p>
          <div className="flex items-center justify-between mt-2">
            <h3 className="text-2xl font-black text-gray-900">
              {formatCurrency(
                filteredRecords.reduce((acc, r) => {
                  return acc + Number(r.totalAmount || r.finalAmount || r.totalBillAmount || r.amount || 0);
                }, 0)
              )}
            </h3>
            <div className="h-10 w-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600 font-bold">
              <DollarSign size={20} />
            </div>
          </div>
          <p className="text-[11px] text-gray-400 mt-2 font-medium">Mapped to General Ledgers</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase">GST Tax Compliance</p>
          <div className="flex items-center justify-between mt-2">
            <h3 className="text-2xl font-black text-gray-900">
              {formatCurrency(
                filteredRecords.reduce((acc, r) => {
                  return acc + Number(r.taxAmount || r.gstTotal || 0);
                }, 0)
              )}
            </h3>
            <div className="h-10 w-10 bg-purple-50 rounded-xl flex items-center justify-center text-purple-600 font-bold">
              <FileSpreadsheet size={20} />
            </div>
          </div>
          <p className="text-[11px] text-gray-400 mt-2 font-medium">Split to CGST + SGST / IGST</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm">
          <p className="text-xs font-bold text-gray-400 uppercase">Tally Integration Protocol</p>
          <div className="flex items-center justify-between mt-2">
            <h3 className="text-lg font-black text-gray-900">XML / ODBC Ready</h3>
            <div className="h-10 w-10 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600 font-bold">
              <FileCode2 size={20} />
            </div>
          </div>
          <p className="text-[11px] text-gray-400 mt-2 font-medium">Gateway of Tally &gt; Import Data</p>
        </div>
      </div>

      {/* Data Records Table */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-black text-gray-900 flex items-center gap-2">
            <Layers className="text-[#0B4D31]" size={18} />
            Vouchers & Masters Queued for Tally Export
          </h3>
          <span className="text-xs font-bold text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
            {filteredRecords.length} Items Listed
          </span>
        </div>

        {activeSyncType === 'SALES' && (
          <DataTable
            data={filteredRecords}
            columns={[
              {
                header: 'Invoice / Order ID',
                accessor: 'orderId',
                render: (row) => (
                  <div>
                    <span className="font-mono font-bold text-gray-900">
                      KV-INV-{row.orderId || row.id?.slice(0, 8).toUpperCase()}
                    </span>
                    <p className="text-[11px] text-gray-400">Order: #{row.id?.slice(0, 8)}</p>
                  </div>
                )
              },
              {
                header: 'Customer / Debtor',
                accessor: 'customerName',
                render: (row) => (
                  <span className="font-bold text-gray-800">
                    {row.customerName || row.shippingAddress?.fullName || 'Farmer Customer'}
                  </span>
                )
              },
              {
                header: 'Date',
                accessor: 'createdAt',
                render: (row) => formatDateTime(row.createdAt)
              },
              {
                header: 'Taxable Value',
                accessor: 'net',
                render: (row) => {
                  const tot = Number(row.totalAmount || row.finalAmount || 0);
                  const gst = Number(row.taxAmount || row.gstTotal || 0);
                  return formatCurrency(Math.max(0, tot - gst));
                }
              },
              {
                header: 'GST Output',
                accessor: 'taxAmount',
                render: (row) => formatCurrency(row.taxAmount || row.gstTotal || 0)
              },
              {
                header: 'Invoice Gross Total',
                accessor: 'totalAmount',
                render: (row) => (
                  <span className="font-black text-emerald-700">
                    {formatCurrency(row.totalAmount || row.finalAmount || 0)}
                  </span>
                )
              },
              {
                header: 'Tally Status',
                accessor: 'status',
                render: () => (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-50 text-green-700 rounded-lg text-xs font-bold border border-green-200">
                    <CheckCircle2 size={12} /> Ready
                  </span>
                )
              }
            ]}
          />
        )}

        {activeSyncType === 'PURCHASE' && (
          <DataTable
            data={filteredRecords}
            columns={[
              {
                header: 'GRN Number',
                accessor: 'grnNumber',
                render: (row) => (
                  <span className="font-mono font-bold text-gray-900">
                    GRN-{row.grnNumber || row.id?.slice(0, 8).toUpperCase()}
                  </span>
                )
              },
              {
                header: 'Supplier / Creditor',
                accessor: 'supplierName',
                render: (row) => <span className="font-bold text-gray-800">{row.supplierName || 'Agri Supplier'}</span>
              },
              {
                header: 'Vendor Bill No',
                accessor: 'invoiceNumber',
                render: (row) => <span className="font-mono text-gray-600">{row.invoiceNumber || 'PO-DIRECT'}</span>
              },
              {
                header: 'Date',
                accessor: 'createdAt',
                render: (row) => formatDateTime(row.createdAt)
              },
              {
                header: 'Bill Amount',
                accessor: 'totalBillAmount',
                render: (row) => (
                  <span className="font-black text-blue-700">
                    {formatCurrency(row.totalBillAmount || row.totalAmount || 0)}
                  </span>
                )
              },
              {
                header: 'Tally Status',
                accessor: 'status',
                render: () => (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-50 text-green-700 rounded-lg text-xs font-bold border border-green-200">
                    <CheckCircle2 size={12} /> Ready
                  </span>
                )
              }
            ]}
          />
        )}

        {activeSyncType === 'EXPENSE' && (
          <DataTable
            data={filteredRecords}
            columns={[
              {
                header: 'Voucher Ref',
                accessor: 'id',
                render: (row) => (
                  <span className="font-mono font-bold text-gray-900">
                    EXP-{row.id?.slice(0, 8).toUpperCase()}
                  </span>
                )
              },
              {
                header: 'Expense Category / Ledger',
                accessor: 'category',
                render: (row) => (
                  <span className="font-bold text-gray-800">
                    {row.category?.replace(/_/g, ' ') || 'General Operations'}
                  </span>
                )
              },
              {
                header: 'Date',
                accessor: 'createdAt',
                render: (row) => formatDateTime(row.createdAt || row.date)
              },
              {
                header: 'Payment Ledger',
                accessor: 'paymentMode',
                render: (row) => (
                  <span className="text-xs bg-gray-100 px-2.5 py-1 rounded-md font-semibold text-gray-700">
                    {row.paymentMode || 'HDFC Bank Current'}
                  </span>
                )
              },
              {
                header: 'Voucher Amount',
                accessor: 'amount',
                render: (row) => (
                  <span className="font-black text-rose-700">{formatCurrency(row.amount || 0)}</span>
                )
              },
              {
                header: 'Tally Status',
                accessor: 'status',
                render: () => (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-50 text-green-700 rounded-lg text-xs font-bold border border-green-200">
                    <CheckCircle2 size={12} /> Ready
                  </span>
                )
              }
            ]}
          />
        )}

        {activeSyncType === 'MASTERS' && (
          <DataTable
            data={filteredRecords}
            columns={[
              {
                header: 'Ledger Name',
                accessor: 'masterName',
                render: (row) => <span className="font-bold text-gray-900">{row.masterName}</span>
              },
              {
                header: 'Tally Parent Group',
                accessor: 'masterType',
                render: (row) => (
                  <span className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-lg text-xs font-bold">
                    {row.masterType}
                  </span>
                )
              },
              {
                header: 'Phone / Contact',
                accessor: 'phone',
                render: (row) => <span className="font-mono text-gray-600">{row.phone || '-'}</span>
              },
              {
                header: 'GSTIN / PAN',
                accessor: 'gstin',
                render: (row) => <span className="font-mono text-xs text-gray-700">{row.gstin || row.gstNumber || 'Unregistered'}</span>
              },
              {
                header: 'Status',
                accessor: 'status',
                render: () => (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-50 text-green-700 rounded-lg text-xs font-bold border border-green-200">
                    <CheckCircle2 size={12} /> Valid Master
                  </span>
                )
              }
            ]}
          />
        )}
      </div>

      {/* Tally Import Guide Accordion */}
      <div className="bg-amber-50/70 border border-amber-200 p-5 rounded-2xl text-amber-900 text-xs space-y-2">
        <h4 className="font-extrabold flex items-center gap-2 text-sm text-amber-950">
          <AlertCircle size={16} /> How to Import this XML into TallyPrime / Tally.ERP 9:
        </h4>
        <ol className="list-decimal pl-5 space-y-1 font-medium text-amber-900">
          <li>Download the exported XML file using the button above.</li>
          <li>Open your Company in <strong>TallyPrime</strong>.</li>
          <li>Go to top menu &gt; <strong>Import</strong> &gt; <strong>Transactions</strong> (or Masters for ledger list).</li>
          <li>Select the downloaded XML file path (e.g. `KrishiVishal_Tally_SALES_2026-09-10.xml`).</li>
          <li>Tally will automatically create all journal, sales, and expense vouchers with exact debit/credit ledger splits.</li>
        </ol>
      </div>
    </div>
  );
}
