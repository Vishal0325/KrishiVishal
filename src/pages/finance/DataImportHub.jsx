import React, { useState } from 'react';
import {
  collection,
  writeBatch,
  doc,
  Timestamp,
  addDoc
} from 'firebase/firestore';
import { db } from '../../firebase/config';
import { useAuth } from '../../hooks/useAuth';
import Papa from 'papaparse';
import DataTable from '../../components/common/DataTable';
import { formatCurrency, formatDateTime } from '../../utils/formatters';
import {
  UploadCloud,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertCircle,
  FolderUp,
  FileCode2,
  Layers,
  Sparkles,
  Users,
  Building2,
  Wheat,
  Landmark,
  ShoppingCart,
  X,
  RefreshCw
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function DataImportHub() {
  const { user } = useAuth();
  const [importType, setImportType] = useState('TALLY_LEDGERS'); 
  // 'TALLY_LEDGERS' | 'FARMERS' | 'BANK_STATEMENT' | 'PRODUCTS'
  
  const [parsedData, setParsedData] = useState([]);
  const [validationErrors, setValidationErrors] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [fileName, setFileName] = useState('');

  // Sample CSV Templates for Users
  const sampleTemplates = {
    TALLY_LEDGERS: {
      filename: 'KrishiVishal_Sample_Tally_Ledgers.csv',
      headers: 'LedgerName,ParentGroup,Phone,GSTIN,PAN,OpeningBalance,State\n',
      sample: 'Ramesh Agro Traders,Sundry Creditors,9876543210,08AAAAA0000A1Z5,AAAAA0000A,150000,Rajasthan\nKisan Vikas FPO,Sundry Debtors,9823456789,08BBBBB1111B1Z2,BBBBB1111B,45000,Madhya Pradesh\nIndore Hub Warehouse Rent,Indirect Expenses,,,,-25000,Madhya Pradesh\n'
    },
    FARMERS: {
      filename: 'KrishiVishal_Sample_Farmers_CRM.csv',
      headers: 'FarmerName,Phone,Village,District,Acreage,SoilType,CropName,SowingDate\n',
      sample: 'Ramesh Patel,9876543210,Rampur,Indore,5,Loamy (दोमट),Wheat (गेहूँ),2026-08-20\nSuresh Choudhary,9823456781,Kisanpur,Ujjain,8,Black Cotton (काली मिट्टी),Mustard (सरसों),2026-08-15\nMohan Singh,9898989898,Shampur,Dewas,3.5,Sandy Loam (बलुई दोमट),Gram / Chana (चना),2026-08-25\n'
    },
    BANK_STATEMENT: {
      filename: 'KrishiVishal_Sample_Bank_Statement.csv',
      headers: 'TxnDate,Description,ChequeRefNo,DebitWithdrawal,CreditDeposit,Balance\n',
      sample: '2026-09-01,NEFT-RAZORPAY-PAYOUT-9821,REF982110,,245000,1245000\n2026-09-02,UPI-FERTILIZER-VENDOR-SETTLEMENT,UPI77329,45000,,1200000\n2026-09-03,ELECTRICITY-HUB-BILL-INDORE,CHQ0012,12500,,1187500\n'
    },
    PRODUCTS: {
      filename: 'KrishiVishal_Sample_Product_Catalog.csv',
      headers: 'ProductName,Category,Brand,HSNCode,GSTRate,BasePrice,StockQuantity,Unit\n',
      sample: 'DAP Fertilizer 50kg,Fertilizers,IFFCO,3105,5,1350,500,Bag\nMustard Hybrid Seeds Pioneer 45S46,Seeds,Corteva Pioneer,1209,0,850,200,Pack 1kg\nCoragen Insecticide 60ml,Pesticides,FMC,3808,18,1750,150,Bottle\n'
    }
  };

  // Download Sample Template CSV
  const handleDownloadTemplate = () => {
    const tpl = sampleTemplates[importType];
    const csvContent = tpl.headers + tpl.sample;
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', tpl.filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success(`Downloaded sample template for ${importType}!`);
  };

  // Parse Tally XML or CSV File
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setFileName(file.name);
    setValidationErrors([]);
    setParsedData([]);

    if (file.name.endsWith('.xml')) {
      // Parse Tally XML
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const parser = new DOMParser();
          const xmlDoc = parser.parseFromString(event.target.result, 'text/xml');
          const ledgers = xmlDoc.getElementsByTagName('LEDGER');
          
          const records = [];
          for (let i = 0; i < ledgers.length; i++) {
            const item = ledgers[i];
            const name = item.getAttribute('NAME') || item.getElementsByTagName('NAME')[0]?.textContent || `Ledger ${i+1}`;
            const parent = item.getElementsByTagName('PARENT')[0]?.textContent || 'Sundry Creditors';
            const phone = item.getElementsByTagName('LEDGERPHONE')[0]?.textContent || '';
            const gstin = item.getElementsByTagName('LEDGERGSTIN')[0]?.textContent || '';
            const balance = Number(item.getElementsByTagName('OPENINGBALANCE')[0]?.textContent || 0);

            records.push({
              LedgerName: name,
              ParentGroup: parent,
              Phone: phone,
              GSTIN: gstin,
              OpeningBalance: balance,
              status: 'VALID'
            });
          }

          if (records.length === 0) {
            toast.error('No <LEDGER> tags found in XML file.');
          } else {
            setParsedData(records);
            toast.success(`Extracted ${records.length} ledgers from Tally XML!`);
          }
        } catch (err) {
          console.error(err);
          toast.error('Failed to parse Tally XML file.');
        }
      };
      reader.readAsText(file);
    } else {
      // Parse CSV via PapaParse
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
        complete: (results) => {
          if (results.data.length === 0) {
            toast.error('Uploaded CSV file is empty.');
            return;
          }

          // Validate fields based on type
          const validated = results.data.map((row, idx) => {
            let isValid = true;
            let errorMsg = '';

            if (importType === 'TALLY_LEDGERS') {
              if (!row.LedgerName) { isValid = false; errorMsg = 'Missing LedgerName'; }
            } else if (importType === 'FARMERS') {
              if (!row.FarmerName || !row.Phone) { isValid = false; errorMsg = 'Missing Name or Phone'; }
            } else if (importType === 'BANK_STATEMENT') {
              if (!row.TxnDate || !row.Description) { isValid = false; errorMsg = 'Missing Date/Narration'; }
            } else if (importType === 'PRODUCTS') {
              if (!row.ProductName || !row.BasePrice) { isValid = false; errorMsg = 'Missing Product Name/Price'; }
            }

            return {
              ...row,
              _rowId: idx + 1,
              _isValid: isValid,
              _error: errorMsg
            };
          });

          setParsedData(validated);
          const errors = validated.filter(r => !r._isValid);
          setValidationErrors(errors);

          if (errors.length > 0) {
            toast.error(`${errors.length} invalid rows detected in file. Please review.`);
          } else {
            toast.success(`Successfully parsed ${validated.length} records! Ready to import.`);
          }
        },
        error: (err) => {
          console.error(err);
          toast.error('CSV Parsing Error: ' + err.message);
        }
      });
    }
  };

  // Bulk Write Records into Firestore
  const handleExecuteImport = async () => {
    if (parsedData.length === 0) {
      toast.error('No data to import.');
      return;
    }

    const validRows = parsedData.filter(r => r._isValid !== false);
    if (validRows.length === 0) {
      toast.error('All rows are marked invalid. Please fix file.');
      return;
    }

    setIsProcessing(true);
    setUploadProgress(10);

    try {
      const batch = writeBatch(db);
      const timestamp = Timestamp.now();
      const createdBy = user?.email || 'Admin';

      let targetCollection = 'suppliers';
      if (importType === 'TALLY_LEDGERS') targetCollection = 'tally_imported_ledgers';
      if (importType === 'FARMERS') targetCollection = 'farmer_crop_profiles';
      if (importType === 'BANK_STATEMENT') targetCollection = 'bank_statement_transactions';
      if (importType === 'PRODUCTS') targetCollection = 'products';

      validRows.forEach((row, i) => {
        const newDocRef = doc(collection(db, targetCollection));
        
        if (importType === 'TALLY_LEDGERS') {
          batch.set(newDocRef, {
            name: row.LedgerName,
            parentGroup: row.ParentGroup || 'Sundry Creditors',
            phone: String(row.Phone || ''),
            gstin: row.GSTIN || '',
            pan: row.PAN || '',
            openingBalance: Number(row.OpeningBalance || 0),
            state: row.State || '',
            importedAt: timestamp,
            importedBy: createdBy
          });
        } else if (importType === 'FARMERS') {
          batch.set(newDocRef, {
            farmerName: row.FarmerName,
            phone: String(row.Phone || ''),
            village: row.Village || '',
            district: row.District || '',
            acreage: Number(row.Acreage || 1),
            soilType: row.SoilType || 'Loamy (दोमट)',
            cropName: row.CropName || 'Wheat (गेहूँ)',
            sowingDate: row.SowingDate || new Date().toISOString().slice(0, 10),
            createdAt: timestamp,
            createdBy: createdBy
          });
        } else if (importType === 'BANK_STATEMENT') {
          batch.set(newDocRef, {
            txnDate: row.TxnDate,
            description: row.Description || '',
            reference: row.ChequeRefNo || '',
            debit: Number(row.DebitWithdrawal || 0),
            credit: Number(row.CreditDeposit || 0),
            balance: Number(row.Balance || 0),
            isReconciled: false,
            createdAt: timestamp
          });
        } else if (importType === 'PRODUCTS') {
          batch.set(newDocRef, {
            title: row.ProductName,
            category: row.Category || 'General',
            brand: row.Brand || 'KrishiVishal',
            hsnCode: String(row.HSNCode || ''),
            gstRate: Number(row.GSTRate || 5),
            price: Number(row.BasePrice || 0),
            stock: Number(row.StockQuantity || 100),
            unit: row.Unit || 'Piece',
            createdAt: timestamp,
            isActive: true
          });
        }
      });

      setUploadProgress(70);
      await batch.commit();
      setUploadProgress(100);

      toast.success(`Successfully imported ${validRows.length} records into KrishiVishal!`);
      setParsedData([]);
      setFileName('');
    } catch (err) {
      console.error(err);
      toast.error('Import failed: ' + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-[#1A365D] via-[#2B6CB0] to-[#2C5282] text-white p-6 rounded-3xl shadow-lg relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
              <FolderUp size={14} className="text-cyan-300" />
              Enterprise Data Migration & Inward Importer
            </div>
            <h2 className="text-2xl font-black">Data Import Hub & Tally Inward Migration</h2>
            <p className="text-white/80 text-sm max-w-2xl">
              Import Tally XML masters, bulk farmer agri-profiles, bank statements (for auto BRS matching), and product catalogs directly into KrishiVishal in 1-click.
            </p>
          </div>
          <button
            onClick={handleDownloadTemplate}
            className="flex items-center gap-2 bg-cyan-400 hover:bg-cyan-300 text-gray-900 font-extrabold px-6 py-3.5 rounded-2xl shadow-xl transition-transform active:scale-95 shrink-0 cursor-pointer"
          >
            <Download size={20} />
            Download Sample CSV Template
          </button>
        </div>
      </div>

      {/* Import Type Selector Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            id: 'TALLY_LEDGERS',
            title: 'Tally XML / Ledgers',
            desc: 'Creditors, Debtors & Opening Balances',
            icon: FileCode2,
            color: 'border-blue-200 bg-blue-50/40 text-blue-900'
          },
          {
            id: 'FARMERS',
            title: 'Bulk Farmers CRM',
            desc: 'Acreage, Crops, Sowing Dates & Soil',
            icon: Wheat,
            color: 'border-emerald-200 bg-emerald-50/40 text-emerald-900'
          },
          {
            id: 'BANK_STATEMENT',
            title: 'Bank Statement (BRS)',
            desc: 'CSV / Passbook debits & credits for auto-recon',
            icon: Landmark,
            color: 'border-purple-200 bg-purple-50/40 text-purple-900'
          },
          {
            id: 'PRODUCTS',
            title: 'Product Catalog & SKUs',
            desc: 'HSN Codes, GST %, Prices & Stock Lots',
            icon: ShoppingCart,
            color: 'border-amber-200 bg-amber-50/40 text-amber-900'
          }
        ].map((item) => {
          const Icon = item.icon;
          const isSelected = importType === item.id;
          return (
            <div
              key={item.id}
              onClick={() => {
                setImportType(item.id);
                setParsedData([]);
                setFileName('');
              }}
              className={`p-4 rounded-2xl border-2 transition-all cursor-pointer ${
                isSelected
                  ? 'border-[#1A365D] bg-white shadow-md scale-[1.02]'
                  : 'border-gray-200 bg-white hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className={`p-2.5 rounded-xl ${item.color}`}>
                  <Icon size={20} />
                </div>
                {isSelected && <CheckCircle2 className="text-[#1A365D]" size={20} />}
              </div>
              <h4 className="font-black text-sm text-gray-900 mt-3">{item.title}</h4>
              <p className="text-[11px] text-gray-500 mt-0.5">{item.desc}</p>
            </div>
          );
        })}
      </div>

      {/* Upload Drag & Drop Box */}
      <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-8 text-center space-y-4">
        <div className="max-w-xl mx-auto border-2 border-dashed border-gray-300 hover:border-[#1A365D] rounded-3xl p-8 bg-gray-50/60 transition-colors">
          <UploadCloud size={48} className="mx-auto text-gray-400 mb-3" />
          <h3 className="text-base font-black text-gray-900">
            Select or Drop your {importType === 'TALLY_LEDGERS' ? 'Tally XML / CSV' : 'CSV / Excel'} File
          </h3>
          <p className="text-xs text-gray-500 mt-1">
            Supports official Tally XML exports, CSV, and Excel formats up to 25MB
          </p>

          <label className="inline-block mt-4 px-6 py-3 bg-[#1A365D] hover:bg-[#2B6CB0] text-white font-extrabold text-xs rounded-xl cursor-pointer shadow-md transition-transform active:scale-95">
            Browse File on Computer
            <input
              type="file"
              accept=".csv,.xml,.xlsx,.txt"
              onChange={handleFileUpload}
              className="hidden"
            />
          </label>

          {fileName && (
            <div className="mt-4 inline-flex items-center gap-2 bg-emerald-50 text-emerald-800 px-4 py-2 rounded-xl text-xs font-bold border border-emerald-200">
              <FileSpreadsheet size={16} />
              <span>Loaded: {fileName}</span>
            </div>
          )}
        </div>
      </div>

      {/* Data Preview & Ingestion Grid */}
      {parsedData.length > 0 && (
        <div className="bg-white rounded-3xl border border-gray-100 shadow-sm p-6 space-y-6 animate-in fade-in">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-black text-gray-900 flex items-center gap-2">
                <Layers className="text-[#1A365D]" size={20} />
                Data Preview & Pre-Import Validation ({parsedData.length} records)
              </h3>
              <p className="text-xs text-gray-500 mt-0.5">
                Review data before committing to the KrishiVishal Firestore database
              </p>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => {
                  setParsedData([]);
                  setFileName('');
                }}
                className="px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold rounded-xl text-xs cursor-pointer"
              >
                Clear
              </button>
              <button
                onClick={handleExecuteImport}
                disabled={isProcessing}
                className="flex items-center gap-2 px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl text-xs shadow-lg transition-transform active:scale-95 cursor-pointer disabled:opacity-50"
              >
                {isProcessing ? <RefreshCw className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
                <span>Confirm & Import ({parsedData.filter(r => r._isValid !== false).length} Valid Records)</span>
              </button>
            </div>
          </div>

          {/* Validation Banner if errors exist */}
          {validationErrors.length > 0 && (
            <div className="bg-rose-50 border border-rose-200 p-4 rounded-2xl flex items-center gap-3 text-rose-900 text-xs font-semibold">
              <AlertCircle size={20} className="text-rose-600 shrink-0" />
              <div>
                <span className="font-black">Found {validationErrors.length} invalid rows!</span>
                <p className="text-rose-700 mt-0.5">These rows will be skipped during import. Please check missing required fields.</p>
              </div>
            </div>
          )}

          {/* Progress Bar when uploading */}
          {isProcessing && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs font-bold text-gray-700">
                <span>Ingesting into Firestore database...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                <div
                  className="bg-emerald-600 h-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Preview Table */}
          <DataTable
            data={parsedData.slice(0, 100)}
            columns={[
              {
                header: 'Row #',
                accessor: '_rowId',
                render: (row, idx) => <span className="font-mono text-xs font-bold text-gray-500">#{idx + 1}</span>
              },
              {
                header: 'Primary Name / Title',
                accessor: 'name',
                render: (row) => (
                  <span className="font-bold text-gray-900">
                    {row.LedgerName || row.FarmerName || row.Description || row.ProductName}
                  </span>
                )
              },
              {
                header: 'Group / Category / Details',
                accessor: 'details',
                render: (row) => (
                  <span className="text-xs text-gray-700">
                    {row.ParentGroup || `${row.Acreage || 1} Acres • ${row.CropName || ''}` || row.Category || row.TxnDate}
                  </span>
                )
              },
              {
                header: 'Contact / Ref',
                accessor: 'contact',
                render: (row) => (
                  <span className="font-mono text-xs text-gray-600">
                    {row.Phone || row.GSTIN || row.ChequeRefNo || row.HSNCode || '-'}
                  </span>
                )
              },
              {
                header: 'Amount / Balance / Price',
                accessor: 'val',
                render: (row) => (
                  <span className="font-black text-emerald-700">
                    {formatCurrency(Number(row.OpeningBalance || row.BasePrice || row.CreditDeposit || row.DebitWithdrawal || 0))}
                  </span>
                )
              },
              {
                header: 'Validation Status',
                accessor: '_isValid',
                render: (row) => (
                  row._isValid !== false ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-green-700 bg-green-50 px-2.5 py-1 rounded-md border border-green-200">
                      <CheckCircle2 size={12} /> Valid
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 bg-rose-50 px-2.5 py-1 rounded-md border border-rose-200">
                      <AlertCircle size={12} /> {row._error || 'Invalid'}
                    </span>
                  )
                )
              }
            ]}
          />
        </div>
      )}
    </div>
  );
}
