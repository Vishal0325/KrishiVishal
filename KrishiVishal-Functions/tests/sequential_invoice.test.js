/**
 * E2E & Unit Test Suite for Multi-Hub Sequential Invoice Engine
 * Format: SAM-26-000000001 (16 characters max under GST Rule 46)
 */

const assert = require('assert');
const {
  getShortFinancialYear,
  extractHubCode,
  formatInvoiceNumber,
  getNextInvoiceNumber,
  getOrCreateInvoiceNumberForOrder
} = require('../invoices/sequentialInvoiceEngine');

async function runTests() {
  console.log('====================================================');
  console.log('🧪 Starting Step 3: Multi-Hub Invoice E2E Test Suite');
  console.log('====================================================\n');

  // Test 1: Financial Year computation (April 1st boundary)
  console.log('Test 1: Financial Year calculation logic...');
  const dateBeforeApril = new Date(2026, 2, 31, 12, 0, 0); // 31st March 2026
  const dateAfterApril = new Date(2026, 3, 1, 12, 0, 0);   // 1st April 2026
  const dateMidYear = new Date(2026, 9, 12, 12, 0, 0);    // 12th October 2026

  const fyBefore = getShortFinancialYear(dateBeforeApril);
  const fyAfter = getShortFinancialYear(dateAfterApril);
  const fyMid = getShortFinancialYear(dateMidYear);

  assert.strictEqual(fyBefore, '25', 'March 2026 belongs to FY 2025-26 (short: 25)');
  assert.strictEqual(fyAfter, '26', 'April 2026 belongs to FY 2026-27 (short: 26)');
  assert.strictEqual(fyMid, '26', 'October 2026 belongs to FY 2026-27 (short: 26)');
  console.log('  ✅ FY 2025-26 -> "25", FY 2026-27 -> "26" matched correctly.\n');

  // Test 2: Hub Code extraction & sanitization
  console.log('Test 2: Hub Code extraction & normalization...');
  assert.strictEqual(extractHubCode('HUB-SAM-001'), 'SAM');
  assert.strictEqual(extractHubCode('REG-TAJ-004'), 'TAJ');
  assert.strictEqual(extractHubCode('KHA'), 'KHA');
  assert.strictEqual(extractHubCode('bihar_patna_hub'), 'BIH');
  assert.strictEqual(extractHubCode(''), 'SAM');
  assert.strictEqual(extractHubCode(null), 'SAM');
  console.log('  ✅ Hub code extraction strictly produces 3 uppercase alphabetic characters.\n');

  // Test 3: Formatting & Strict 16-character rule
  console.log('Test 3: Formatting & GST Rule 46 16-character length enforcement...');
  const inv1 = formatInvoiceNumber('SAM', '26', 1);
  const invMax = formatInvoiceNumber('SAM', '26', 999999999);
  
  assert.strictEqual(inv1, 'SAM-26-000000001');
  assert.strictEqual(inv1.length, 16, `Length must be exactly 16 chars (got ${inv1.length})`);

  assert.strictEqual(invMax, 'SAM-26-999999999');
  assert.strictEqual(invMax.length, 16, `Length must be exactly 16 chars (got ${invMax.length})`);

  assert.throws(() => {
    formatInvoiceNumber('SAM', '26', 1000000000);
  }, /exceeds maximum allowed length of 16 characters/, 'Must throw if length exceeds 16 chars');

  console.log(`  ✅ ${inv1} -> Length = ${inv1.length} chars (Exact match)`);
  console.log(`  ✅ ${invMax} -> Max capacity 99,99,99,999 supported within 16 chars`);
  console.log('  ✅ Strict exception triggered if length exceeds 16 characters.\n');

  // Test 4: Mock Firestore Multi-Hub Parallel Atomic Increments & Idempotency
  console.log('Test 4: Multi-Hub Parallel Counter Isolation & Idempotency Simulation...');
  
  // Create an in-memory Firestore transaction simulator
  const mockDb = {
    counters: {},
    orders: {},
    runTransaction: async function(callback) {
      const transaction = {
        get: async (ref) => {
          if (ref.type === 'counter') {
            const data = mockDb.counters[ref.id];
            return {
              exists: !!data,
              data: () => data
            };
          }
          if (ref.type === 'order') {
            const data = mockDb.orders[ref.id];
            return {
              exists: !!data,
              data: () => data
            };
          }
        },
        set: (ref, data, opts) => {
          if (ref.type === 'counter') {
            mockDb.counters[ref.id] = { ...mockDb.counters[ref.id], ...data };
          }
          if (ref.type === 'order') {
            mockDb.orders[ref.id] = { ...mockDb.orders[ref.id], ...data };
          }
        },
        update: (ref, data) => {
          if (ref.type === 'order') {
            mockDb.orders[ref.id] = { ...mockDb.orders[ref.id], ...data };
          }
        }
      };
      return await callback(transaction);
    },
    collection: (colName) => ({
      doc: (id) => ({
        type: colName === 'invoice_counters' ? 'counter' : 'order',
        id: id
      })
    })
  };

  // Seed sample orders across Samastipur (SAM) and Tajpur (TAJ)
  mockDb.orders['ORDER_SAM_1'] = { id: 'ORDER_SAM_1', hubId: 'HUB-SAM-001' };
  mockDb.orders['ORDER_SAM_2'] = { id: 'ORDER_SAM_2', hubId: 'HUB-SAM-001' };
  mockDb.orders['ORDER_TAJ_1'] = { id: 'ORDER_TAJ_1', hubId: 'HUB-TAJ-002' };
  mockDb.orders['ORDER_SAM_3'] = { id: 'ORDER_SAM_3', hubId: 'HUB-SAM-001' };

  // Step 4.1: Order SAM 1
  const samRes1 = await getOrCreateInvoiceNumberForOrder('ORDER_SAM_1', 'SAM', '26', mockDb);
  assert.strictEqual(samRes1.invoiceNumber, 'SAM-26-000000001');
  assert.strictEqual(samRes1.sequence, 1);

  // Step 4.2: Order SAM 2
  const samRes2 = await getOrCreateInvoiceNumberForOrder('ORDER_SAM_2', 'SAM', '26', mockDb);
  assert.strictEqual(samRes2.invoiceNumber, 'SAM-26-000000002');
  assert.strictEqual(samRes2.sequence, 2);

  // Step 4.3: Order TAJ 1 (Independent Hub counter starts at 1)
  const tajRes1 = await getOrCreateInvoiceNumberForOrder('ORDER_TAJ_1', 'TAJ', '26', mockDb);
  assert.strictEqual(tajRes1.invoiceNumber, 'TAJ-26-000000001');
  assert.strictEqual(tajRes1.sequence, 1);

  // Step 4.4: Order SAM 3
  const samRes3 = await getOrCreateInvoiceNumberForOrder('ORDER_SAM_3', 'SAM', '26', mockDb);
  assert.strictEqual(samRes3.invoiceNumber, 'SAM-26-000000003');
  assert.strictEqual(samRes3.sequence, 3);

  // Step 4.5: Idempotency Check (re-running for ORDER_SAM_1 must return existing invoice without incrementing)
  const samRes1Duplicate = await getOrCreateInvoiceNumberForOrder('ORDER_SAM_1', 'SAM', '26', mockDb);
  assert.strictEqual(samRes1Duplicate.invoiceNumber, 'SAM-26-000000001');
  assert.strictEqual(samRes1Duplicate.isExisting, true);
  assert.strictEqual(mockDb.counters['SAM_26'].currentSequence, 3, 'Counter for SAM should stay 3');
  assert.strictEqual(mockDb.counters['TAJ_26'].currentSequence, 1, 'Counter for TAJ should stay 1');

  console.log(`  ✅ Hub SAM: ORDER_SAM_1 -> ${samRes1.invoiceNumber}`);
  console.log(`  ✅ Hub SAM: ORDER_SAM_2 -> ${samRes2.invoiceNumber}`);
  console.log(`  ✅ Hub TAJ: ORDER_TAJ_1 -> ${tajRes1.invoiceNumber} (Independent counter isolated to Tajpur hub)`);
  console.log(`  ✅ Hub SAM: ORDER_SAM_3 -> ${samRes3.invoiceNumber}`);
  console.log(`  ✅ Idempotency: Re-calling ORDER_SAM_1 returned ${samRes1Duplicate.invoiceNumber} without bumping counter.`);
  console.log('  ✅ No cross-hub collision, counters completely isolated.\n');

  console.log('====================================================');
  console.log('🎉 ALL 4 TESTS PASSED SUCCESSFULLY! (100% SUCCESS)');
  console.log('====================================================');
}

runTests().catch(err => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
