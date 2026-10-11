/**
 * April 2026 CA Mock Audit Pack Seeder
 * KrishiVishal Private Limited (Bihar, FY 2026-27)
 * 
 * Sets up exact audit fixtures:
 * 1. ORD-TEST-001: DAP Fertilizer, 2 bags, ₹2,400 taxable + 5% GST (₹60 CGST + ₹60 SGST) = ₹2,520 (Prepaid Delivered)
 * 2. ORD-TEST-002: Cypermethrin 10EC, 4 bottles, ₹1,600 taxable + 18% GST (₹144 CGST + ₹144 SGST) = ₹1,888 (COD Delivered)
 * 3. ORD-TEST-003: Paddy Seeds Hybrid, 5 packets, ₹3,000 taxable (Exempt/0% GST) = ₹3,000 (COD Delivered)
 *    + Credit Note KVCN/26-27/00001: 1 packet returned (₹600 reversal)
 * 4. GRN-TEST-001: Deepak Fertilizers and Petrochemicals Corp, ₹85,000 gross purchase
 *    Sec 194Q TDS: 0.1% on purchase = ₹85 (or net vendor payable)
 * 5. Balanced Double-Entry Journal Entries for Period 2026-04
 */

const admin = require('firebase-admin');
const serviceAccount = require('C:/Users/visha/Downloads/krishivishal-a9ed7-firebase-adminsdk-fbsvc-2f631b8296.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: 'krishivishal-a9ed7'
  });
}

const db = admin.firestore();

async function seedAuditData() {
  console.log('--- SEEDING CA AUDIT DATA FOR PERIOD 2026-04 ---');

  const periodId = '2026-04';
  const fy = '26-27';

  // 1. ORDER 1: ORD-TEST-001 (Prepaid Delivered)
  // DAP Fertilizer: Taxable 2,400, CGST 60, SGST 60, Total 2,520, COGS: 1,800
  const order1Ref = db.collection('orders').doc('ORD-TEST-001');
  const order1Data = {
    orderId: 'ORD-TEST-001',
    orderNumber: 'ORD-TEST-001',
    status: 'DELIVERED',
    financialStatus: 'RECOGNIZED',
    paymentStatus: 'PAID',
    paymentMethod: 'PREPAID',
    paymentGateway: 'RAZORPAY',
    invoiceNumber: 'KV/26-27/00001',
    taxableAmount: 2400,
    cgst: 60,
    sgst: 60,
    igst: 0,
    totalTax: 120,
    grandTotal: 2520,
    totalCogs: 1800,
    totalSales: 2520,
    customerState: 'Bihar',
    shippingState: 'Bihar',
    customerName: 'Rameshwar Yadav',
    customerPhone: '+919876543210',
    hubCode: 'HUB-PAT-01',
    createdAt: admin.firestore.Timestamp.fromDate(new Date('2026-04-05T10:30:00Z')),
    deliveredAt: admin.firestore.Timestamp.fromDate(new Date('2026-04-06T14:15:00Z')),
    periodId: '2026-04',
    items: [
      {
        skuId: 'FERT-DAP-50KG',
        name: 'DAP Fertilizer 50kg',
        category: 'Fertilizers',
        hsnCode: '3105',
        quantity: 2,
        sellingPrice: 1200,
        taxablePrice: 1200,
        unitCost: 900,
        gstRate: 5
      }
    ]
  };
  await order1Ref.set(order1Data, { merge: true });

  // 2. ORDER 2: ORD-TEST-002 (COD Delivered)
  // Cypermethrin: Taxable 1,600, CGST 144, SGST 144, Total 1,888, COGS: 1,120
  const order2Ref = db.collection('orders').doc('ORD-TEST-002');
  const order2Data = {
    orderId: 'ORD-TEST-002',
    orderNumber: 'ORD-TEST-002',
    status: 'DELIVERED',
    financialStatus: 'RECOGNIZED',
    paymentStatus: 'PAID',
    paymentMethod: 'COD',
    invoiceNumber: 'KV/26-27/00002',
    taxableAmount: 1600,
    cgst: 144,
    sgst: 144,
    igst: 0,
    totalTax: 288,
    grandTotal: 1888,
    totalCogs: 1120,
    totalSales: 1888,
    customerState: 'Bihar',
    shippingState: 'Bihar',
    customerName: 'Suresh Kumar Singh',
    customerPhone: '+919835012345',
    hubCode: 'HUB-PAT-01',
    riderId: 'RIDER-001',
    riderName: 'Manoj Kumar',
    createdAt: admin.firestore.Timestamp.fromDate(new Date('2026-04-10T09:00:00Z')),
    deliveredAt: admin.firestore.Timestamp.fromDate(new Date('2026-04-11T12:30:00Z')),
    periodId: '2026-04',
    items: [
      {
        skuId: 'PEST-CYPER-1L',
        name: 'Cypermethrin 10% EC 1L',
        category: 'Pesticides',
        hsnCode: '3808',
        quantity: 4,
        sellingPrice: 400,
        taxablePrice: 400,
        unitCost: 280,
        gstRate: 18
      }
    ]
  };
  await order2Ref.set(order2Data, { merge: true });

  // 3. ORDER 3: ORD-TEST-003 (COD Delivered + Partial Return)
  // Paddy Seeds Hybrid: 5 units @ 600 = 3,000 (0% GST HSN 1209), COGS: 2,100
  const order3Ref = db.collection('orders').doc('ORD-TEST-003');
  const order3Data = {
    orderId: 'ORD-TEST-003',
    orderNumber: 'ORD-TEST-003',
    status: 'DELIVERED',
    financialStatus: 'RECOGNIZED',
    paymentStatus: 'PAID',
    paymentMethod: 'COD',
    invoiceNumber: 'KV/26-27/00003',
    taxableAmount: 3000,
    cgst: 0,
    sgst: 0,
    igst: 0,
    totalTax: 0,
    grandTotal: 3000,
    totalCogs: 2100,
    totalSales: 3000,
    customerState: 'Bihar',
    shippingState: 'Bihar',
    customerName: 'Anand Prakash Verma',
    customerPhone: '+919431098765',
    hubCode: 'HUB-PAT-01',
    riderId: 'RIDER-002',
    riderName: 'Vikash Sah',
    createdAt: admin.firestore.Timestamp.fromDate(new Date('2026-04-15T11:00:00Z')),
    deliveredAt: admin.firestore.Timestamp.fromDate(new Date('2026-04-16T16:00:00Z')),
    periodId: '2026-04',
    items: [
      {
        skuId: 'SEED-PADDY-HYB-5KG',
        name: 'Paddy Seeds Hybrid 5kg',
        category: 'Seeds',
        hsnCode: '1209',
        quantity: 5,
        sellingPrice: 600,
        taxablePrice: 600,
        unitCost: 420,
        gstRate: 0
      }
    ]
  };
  await order3Ref.set(order3Data, { merge: true });

  // 3b. Credit Note for ORD-TEST-003: 1 unit returned (₹600)
  const cnRef = db.collection('credit_notes').doc('KV_CN_26-27_00001');
  const cnData = {
    creditNoteNumber: 'KV/CN/26-27/00001',
    originalInvoiceNumber: 'KV/26-27/00003',
    orderId: 'ORD-TEST-003',
    periodId: '2026-04',
    date: admin.firestore.Timestamp.fromDate(new Date('2026-04-18T10:00:00Z')),
    reason: 'Defective packaging returned by customer',
    taxableReversal: 600,
    cgstReversal: 0,
    sgstReversal: 0,
    igstReversal: 0,
    totalReversal: 600,
    cogsReversal: 420,
    status: 'ISSUED',
    items: [
      {
        skuId: 'SEED-PADDY-HYB-5KG',
        name: 'Paddy Seeds Hybrid 5kg',
        quantity: 1,
        amount: 600
      }
    ]
  };
  await cnRef.set(cnData, { merge: true });

  // 4. GRN-TEST-001 (Supplier AP & Section 194Q)
  // Vendor: Deepak Fertilizers and Petrochemicals Corp
  // Gross: ₹85,000, 194Q TDS: ₹35 (0.1% on purchase over ₹50L or flat rate demo), Net Payable: ₹84,965
  const grnRef = db.collection('grn_records').doc('GRN-TEST-001');
  const grnData = {
    grnNumber: 'GRN-TEST-001',
    supplierId: 'SUP-DEEPAK-FERT',
    supplierName: 'Deepak Fertilizers & Petrochem Corp',
    supplierGstin: '10AAACD1234F1Z9',
    supplierPan: 'AAACD1234F',
    periodId: '2026-04',
    grnDate: admin.firestore.Timestamp.fromDate(new Date('2026-04-12T11:00:00Z')),
    invoiceNumber: 'DFPCL/PAT/2026/0412',
    invoiceDate: admin.firestore.Timestamp.fromDate(new Date('2026-04-10T00:00:00Z')),
    grossAmount: 85000,
    taxableAmount: 80952.38,
    gstAmount: 4047.62,
    tdsSection: '194Q',
    tdsRate: 0.1,
    tdsAmount: 35.00,
    netPayable: 84965.00,
    status: 'VERIFIED',
    paymentStatus: 'PENDING',
    hubCode: 'HUB-PAT-01'
  };
  await grnRef.set(grnData, { merge: true });

  // Also add supplier record
  await db.collection('suppliers').doc('SUP-DEEPAK-FERT').set({
    supplierId: 'SUP-DEEPAK-FERT',
    name: 'Deepak Fertilizers & Petrochem Corp',
    gstin: '10AAACD1234F1Z9',
    pan: 'AAACD1234F',
    panValid: true,
    msmeRegistered: false,
    fyTurnoverExceeds10Cr: true,
    fyPurchasesTotal: 85000,
    paymentTermsDays: 30
  }, { merge: true });

  // 5. POST DOUBLE-ENTRY JOURNAL ENTRIES FOR 2026-04
  const jeCollection = db.collection('journal_entries');

  // JE 1: ORD-TEST-001 Prepaid Delivery Recognition
  // Dr 2070_DEFERRED_REVENUE: 2520
  // Cr 4010_SALES_AGRI_INPUTS: 2400
  // Cr 2020_OUTPUT_CGST_PAYABLE: 60
  // Cr 2030_OUTPUT_SGST_PAYABLE: 60
  // Dr 5010_COGS: 1800
  // Cr 1020_INVENTORY_RAW_MATERIALS: 1800
  const je1Id = 'JE-2026-04-ORD-001';
  await jeCollection.doc(je1Id).set({
    id: je1Id,
    entryNumber: 'JE/26-27/00001',
    periodId: '2026-04',
    date: admin.firestore.Timestamp.fromDate(new Date('2026-04-06T14:15:00Z')),
    refType: 'SALES_DELIVERY',
    refNumber: 'KV/26-27/00001',
    orderId: 'ORD-TEST-001',
    description: 'Revenue & COGS recognition on delivered prepaid Order ORD-TEST-001',
    lines: [
      { accountCode: '2070_DEFERRED_REVENUE', accountName: 'Deferred Customer Revenue', debit: 2520, credit: 0 },
      { accountCode: '4010_SALES_AGRI_INPUTS', accountName: 'Agri Inputs Sales Revenue', debit: 0, credit: 2400 },
      { accountCode: '2020_OUTPUT_CGST_PAYABLE', accountName: 'Output CGST Payable', debit: 0, credit: 60 },
      { accountCode: '2030_OUTPUT_SGST_PAYABLE', accountName: 'Output SGST Payable', debit: 0, credit: 60 },
      { accountCode: '5010_COGS', accountName: 'Cost of Goods Sold', debit: 1800, credit: 0 },
      { accountCode: '1020_INVENTORY_RAW_MATERIALS', accountName: 'Finished Stock / Inventory', debit: 0, credit: 1800 }
    ],
    totalDebit: 4320,
    totalCredit: 4320,
    status: 'POSTED',
    createdAt: admin.firestore.Timestamp.fromDate(new Date('2026-04-06T14:15:00Z'))
  });

  // JE 2: ORD-TEST-002 COD Delivery Recognition
  // Dr 1010_CASH_IN_HAND: 1888
  // Cr 4010_SALES_AGRI_INPUTS: 1600
  // Cr 2020_OUTPUT_CGST_PAYABLE: 144
  // Cr 2030_OUTPUT_SGST_PAYABLE: 144
  // Dr 5010_COGS: 1120
  // Cr 1020_INVENTORY_RAW_MATERIALS: 1120
  const je2Id = 'JE-2026-04-ORD-002';
  await jeCollection.doc(je2Id).set({
    id: je2Id,
    entryNumber: 'JE/26-27/00002',
    periodId: '2026-04',
    date: admin.firestore.Timestamp.fromDate(new Date('2026-04-11T12:30:00Z')),
    refType: 'SALES_DELIVERY',
    refNumber: 'KV/26-27/00002',
    orderId: 'ORD-TEST-002',
    description: 'Revenue & COGS recognition on delivered COD Order ORD-TEST-002',
    lines: [
      { accountCode: '1010_CASH_IN_HAND', accountName: 'Cash in Hand (Riders/Vault)', debit: 1888, credit: 0 },
      { accountCode: '4010_SALES_AGRI_INPUTS', accountName: 'Agri Inputs Sales Revenue', debit: 0, credit: 1600 },
      { accountCode: '2020_OUTPUT_CGST_PAYABLE', accountName: 'Output CGST Payable', debit: 0, credit: 144 },
      { accountCode: '2030_OUTPUT_SGST_PAYABLE', accountName: 'Output SGST Payable', debit: 0, credit: 144 },
      { accountCode: '5010_COGS', accountName: 'Cost of Goods Sold', debit: 1120, credit: 0 },
      { accountCode: '1020_INVENTORY_RAW_MATERIALS', accountName: 'Finished Stock / Inventory', debit: 0, credit: 1120 }
    ],
    totalDebit: 3008,
    totalCredit: 3008,
    status: 'POSTED',
    createdAt: admin.firestore.Timestamp.fromDate(new Date('2026-04-11T12:30:00Z'))
  });

  // JE 3: ORD-TEST-003 COD Delivery Recognition
  // Dr 1010_CASH_IN_HAND: 3000
  // Cr 4010_SALES_AGRI_INPUTS: 3000
  // Dr 5010_COGS: 2100
  // Cr 1020_INVENTORY_RAW_MATERIALS: 2100
  const je3Id = 'JE-2026-04-ORD-003';
  await jeCollection.doc(je3Id).set({
    id: je3Id,
    entryNumber: 'JE/26-27/00003',
    periodId: '2026-04',
    date: admin.firestore.Timestamp.fromDate(new Date('2026-04-16T16:00:00Z')),
    refType: 'SALES_DELIVERY',
    refNumber: 'KV/26-27/00003',
    orderId: 'ORD-TEST-003',
    description: 'Revenue & COGS recognition on delivered COD Order ORD-TEST-003 (Exempt Seeds)',
    lines: [
      { accountCode: '1010_CASH_IN_HAND', accountName: 'Cash in Hand (Riders/Vault)', debit: 3000, credit: 0 },
      { accountCode: '4010_SALES_AGRI_INPUTS', accountName: 'Agri Inputs Sales Revenue', debit: 0, credit: 3000 },
      { accountCode: '5010_COGS', accountName: 'Cost of Goods Sold', debit: 2100, credit: 0 },
      { accountCode: '1020_INVENTORY_RAW_MATERIALS', accountName: 'Finished Stock / Inventory', debit: 0, credit: 2100 }
    ],
    totalDebit: 5100,
    totalCredit: 5100,
    status: 'POSTED',
    createdAt: admin.firestore.Timestamp.fromDate(new Date('2026-04-16T16:00:00Z'))
  });

  // JE 4: Credit Note KV/CN/26-27/00001 (Sales Return Reversal)
  // Dr 4010_SALES_AGRI_INPUTS: 600
  // Cr 1010_CASH_IN_HAND (Refund/Receivable reversal): 600
  // Dr 1020_INVENTORY_RAW_MATERIALS: 420
  // Cr 5010_COGS: 420
  const je4Id = 'JE-2026-04-CN-001';
  await jeCollection.doc(je4Id).set({
    id: je4Id,
    entryNumber: 'JE/26-27/00004',
    periodId: '2026-04',
    date: admin.firestore.Timestamp.fromDate(new Date('2026-04-18T10:00:00Z')),
    refType: 'CREDIT_NOTE',
    refNumber: 'KV/CN/26-27/00001',
    orderId: 'ORD-TEST-003',
    description: 'Sales return reversal against Order ORD-TEST-003 (Credit Note KV/CN/26-27/00001)',
    lines: [
      { accountCode: '4010_SALES_AGRI_INPUTS', accountName: 'Agri Inputs Sales Revenue', debit: 600, credit: 0 },
      { accountCode: '1010_CASH_IN_HAND', accountName: 'Cash in Hand / Customer Refund', debit: 0, credit: 600 },
      { accountCode: '1020_INVENTORY_RAW_MATERIALS', accountName: 'Finished Stock / Inventory', debit: 420, credit: 0 },
      { accountCode: '5010_COGS', accountName: 'Cost of Goods Sold', debit: 0, credit: 420 }
    ],
    totalDebit: 1020,
    totalCredit: 1020,
    status: 'POSTED',
    createdAt: admin.firestore.Timestamp.fromDate(new Date('2026-04-18T10:00:00Z'))
  });

  // JE 5: GRN-TEST-001 Purchase Entry (Deepak Fertilizers)
  // Dr 1020_INVENTORY_RAW_MATERIALS: 80952.38
  // Dr 1040_INPUT_CGST_RECOVERY: 2023.81
  // Dr 1041_INPUT_SGST_RECOVERY: 2023.81
  // Cr 2050_TDS_PAYABLE_194Q: 35.00
  // Cr 2010_ACCOUNTS_PAYABLE_SUPPLIERS: 84965.00
  const je5Id = 'JE-2026-04-GRN-001';
  await jeCollection.doc(je5Id).set({
    id: je5Id,
    entryNumber: 'JE/26-27/00005',
    periodId: '2026-04',
    date: admin.firestore.Timestamp.fromDate(new Date('2026-04-12T11:00:00Z')),
    refType: 'PURCHASE_GRN',
    refNumber: 'GRN-TEST-001',
    description: 'Inward goods receipt & Sec 194Q TDS deduction for Deepak Fertilizers',
    lines: [
      { accountCode: '1020_INVENTORY_RAW_MATERIALS', accountName: 'Raw Materials & Stock Inward', debit: 80952.38, credit: 0 },
      { accountCode: '1040_INPUT_CGST_RECOVERY', accountName: 'Input CGST Tax Credit', debit: 2023.81, credit: 0 },
      { accountCode: '1041_INPUT_SGST_RECOVERY', accountName: 'Input SGST Tax Credit', debit: 2023.81, credit: 0 },
      { accountCode: '2050_TDS_PAYABLE_194Q', accountName: 'TDS Payable u/s 194Q', debit: 0, credit: 35.00 },
      { accountCode: '2010_ACCOUNTS_PAYABLE_SUPPLIERS', accountName: 'Sundry Creditors (Deepak Fert)', debit: 0, credit: 84965.00 }
    ],
    totalDebit: 85000,
    totalCredit: 85000,
    status: 'POSTED',
    createdAt: admin.firestore.Timestamp.fromDate(new Date('2026-04-12T11:00:00Z'))
  });

  // 6. Ensure Fiscal Period document for 2026-04 exists
  await db.collection('fiscal_periods').doc('2026-04').set({
    periodId: '2026-04',
    fiscalYear: '2026-27',
    startDate: '2026-04-01',
    endDate: '2026-04-30',
    status: 'OPEN',
    closureChecklist: {
      trialBalanceBalanced: true,
      bankReconciled: true,
      inventoryValued: true,
      statutoryTaxCalculated: true
    },
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  }, { merge: true });

  console.log('✅ ALL AUDIT FIXTURES SUCCESSFULLY SEEDED IN FIRESTORE!');
}

seedAuditData().catch(err => {
  console.error('❌ SEEDING FAILED:', err);
  process.exit(1);
});
