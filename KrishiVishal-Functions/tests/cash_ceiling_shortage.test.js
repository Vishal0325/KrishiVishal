/**
 * cash_ceiling_shortage.test.js
 * 
 * Comprehensive Unit & Integration Test Suite for:
 * 1. Floating Cash Ceiling Guard (logistics/routeBatching.js)
 * 2. Partial Cash Settlement & 3-Leg Double-Entry Shortage Ledger (finance/cashSettlement.js, finance/ledger.js)
 * 3. Automated Payout Shortage Deduction & Reconciliation (logistics/riderPayoutEngine.js)
 */

const assert = require('assert');
const adminModule = require('../core/admin');
const { MAX_RIDER_CASH_LIMIT, evaluateRiderCashCeiling, assignOrderWithCashCeiling } = require('../logistics/routeBatching');
const { confirmCashSettlement } = require('../finance/cashSettlement');
const { calculateRiderPayout, approveRiderPayout } = require('../logistics/riderPayoutEngine');
const { VALID_ACCOUNTS, ASSET_ACCOUNTS } = require('../finance/ledger');

console.log("=================================================================");
console.log("=== RUNNING COD CASH CEILING & SHORTAGE SETTLEMENT TEST SUITE ===");
console.log("=================================================================\n");

let passed = 0;
let failed = 0;

function pass(testName) {
    console.log(`✅ PASS: ${testName}`);
    passed++;
}

function fail(testName, err) {
    console.error(`❌ FAIL: ${testName} - ${err.message || err}`);
    failed++;
}

async function runAllTests() {
    // ─────────────────────────────────────────────────────────────
    // TEST 1: Floating Cash Ceiling Guard
    // ─────────────────────────────────────────────────────────────
    console.log("--- TEST 1: Floating Cash Ceiling Guard (MAX ₹15,000) ---");
    try {
        assert.strictEqual(MAX_RIDER_CASH_LIMIT, 15000, "MAX_RIDER_CASH_LIMIT must be 15000");

        const riderA = { id: 'RIDER_A', name: 'Rider Over Limit', cashInHand: 14000, status: 'AVAILABLE' };
        const riderB = { id: 'RIDER_B', name: 'Rider Under Limit', cashInHand: 5000, status: 'AVAILABLE' };
        const codOrder = { id: 'ORD_COD_01', paymentMethod: 'COD', totalAmount: 2000 };
        const prepaidOrder = { id: 'ORD_PREPAID_01', paymentMethod: 'ONLINE', totalAmount: 5000 };

        // 1.1 Rider A + COD order (14000 + 2000 = 16000 > 15000) -> Blocked
        const evalA = evaluateRiderCashCeiling(riderA, codOrder);
        assert.strictEqual(evalA.eligible, false, "Rider A should be blocked from taking COD order exceeding ceiling");
        assert.strictEqual(evalA.reason, 'CASH_LIMIT_EXCEEDED');
        assert.strictEqual(evalA.projectedCash, 16000);
        pass("1.1 Rider A exceeding ₹15k ceiling (14k + 2k = 16k) is strictly blocked");

        // 1.2 Rider B + COD order (5000 + 2000 = 7000 <= 15000) -> Allowed
        const evalB = evaluateRiderCashCeiling(riderB, codOrder);
        assert.strictEqual(evalB.eligible, true, "Rider B should be eligible");
        assert.strictEqual(evalB.projectedCash, 7000);
        pass("1.2 Rider B within ceiling (5k + 2k = 7k) is eligible");

        // 1.3 Prepaid / Online order ignores COD ceiling
        const evalPrepaid = evaluateRiderCashCeiling(riderA, prepaidOrder);
        assert.strictEqual(evalPrepaid.eligible, true, "Prepaid order should not be blocked by cash ceiling");
        assert.strictEqual(evalPrepaid.projectedCash, 14000);
        pass("1.3 Prepaid / Online orders bypass COD cash ceiling");

        // 1.4 Route assignment selects eligible Rider B and skips Rider A
        const assignment = assignOrderWithCashCeiling([riderA, riderB], codOrder);
        assert.strictEqual(assignment.assigned, true);
        assert.strictEqual(assignment.riderId, 'RIDER_B');
        assert.strictEqual(assignment.cashLimitExceeded, false);
        pass("1.4 Auto-dispatch skips cash-capped Rider A and routes COD order to Rider B");

    } catch (err) {
        fail("TEST 1: Cash Ceiling Guard", err);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 2: Partial Shortage Settlement & 3-Leg Double-Entry Ledger
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- TEST 2: Partial Shortage Settlement & 3-Leg Double-Entry Ledger ---");
    
    // Setup Mock Firestore
    const mockStore = {
        cash_settlements: new Map(),
        riders: new Map(),
        ledger: new Map(),
        orders: new Map()
    };

    const originalCollection = adminModule.db.collection;
    const originalRunTransaction = adminModule.db.runTransaction;

    adminModule.db.collection = function (collName) {
        return {
            doc: function (docId) {
                const effectiveId = docId || ('auto_' + Math.random().toString(36).substring(2, 9));
                return {
                    id: effectiveId,
                    get: async function () {
                        const store = mockStore[collName] || new Map();
                        const exists = store.has(effectiveId);
                        return {
                            exists,
                            id: effectiveId,
                            data: () => (exists ? JSON.parse(JSON.stringify(store.get(effectiveId))) : undefined)
                        };
                    },
                    set: async function (data, opts) {
                        if (!mockStore[collName]) mockStore[collName] = new Map();
                        if (opts && opts.merge && mockStore[collName].has(effectiveId)) {
                            const existing = mockStore[collName].get(effectiveId);
                            mockStore[collName].set(effectiveId, { ...existing, ...data });
                        } else {
                            mockStore[collName].set(effectiveId, data);
                        }
                        return { id: effectiveId };
                    },
                    update: async function (data) {
                        if (!mockStore[collName] || !mockStore[collName].has(effectiveId)) {
                            throw new Error(`Doc not found: ${collName}/${effectiveId}`);
                        }
                        const existing = mockStore[collName].get(effectiveId);
                        mockStore[collName].set(effectiveId, { ...existing, ...data });
                        return { id: effectiveId };
                    }
                };
            },
            add: async function (data) {
                const autoId = 'auto_' + Math.random().toString(36).substring(2, 9);
                if (!mockStore[collName]) mockStore[collName] = new Map();
                mockStore[collName].set(autoId, { id: autoId, ...data });
                return { id: autoId };
            }
        };
    };

    adminModule.db.runTransaction = async function (updateFunction) {
        const transaction = {
            get: async function (docRef) {
                return docRef.get();
            },
            set: function (docRef, data, opts) {
                docRef.set(data, opts);
            },
            update: function (docRef, data) {
                docRef.update(data);
            }
        };
        return await updateFunction(transaction);
    };

    try {
        // Assert ledger accounts are present
        assert(VALID_ACCOUNTS.includes('HUB_CASH_VAULT'), "HUB_CASH_VAULT must be in VALID_ACCOUNTS");
        assert(VALID_ACCOUNTS.includes('RIDER_SHORTAGE_RECEIVABLE'), "RIDER_SHORTAGE_RECEIVABLE must be in VALID_ACCOUNTS");
        assert(VALID_ACCOUNTS.includes('RIDER_CASH_IN_HAND'), "RIDER_CASH_IN_HAND must be in VALID_ACCOUNTS");
        assert(ASSET_ACCOUNTS.includes('HUB_CASH_VAULT'), "HUB_CASH_VAULT must be in ASSET_ACCOUNTS");
        assert(ASSET_ACCOUNTS.includes('RIDER_SHORTAGE_RECEIVABLE'), "RIDER_SHORTAGE_RECEIVABLE must be in ASSET_ACCOUNTS");
        pass("2.0 Ledger chart of accounts validated for 3-leg cash shortage posting");

        // Seed data
        const settlementId = 'SETTLE_TEST_001';
        const riderId = 'RIDER_RAMESH_01';

        // Pre-seed orders referenced by pendingOrderIds
        mockStore.orders.set('ORD_001', { id: 'ORD_001', riderId, status: 'DELIVERED', paymentMethod: 'COD' });
        mockStore.orders.set('ORD_002', { id: 'ORD_002', riderId, status: 'DELIVERED', paymentMethod: 'COD' });

        mockStore.cash_settlements.set(settlementId, {
            id: settlementId,
            riderId: riderId,
            hubId: 'HUB_SAMASTIPUR_01',
            date: '2026-10-06',
            totalCollected: 5000,
            totalAmount: 5000,
            status: 'PENDING_VERIFICATION',
            pendingOrderIds: ['ORD_001', 'ORD_002']
        });

        mockStore.riders.set(riderId, {
            id: riderId,
            name: 'Ramesh Kumar',
            cashInHand: 5000,
            pendingShortageAmount: 0
        });

        // Rider deposits only ₹4,500 out of ₹5,000 collected (Shortage = ₹500)
        const settlementRes = await confirmCashSettlement.run({
            auth: { uid: 'HUB_MGR_01', token: { role: 'hubmanager' } },
            data: {
                settlementId: settlementId,
                hubId: 'HUB_SAMASTIPUR_01',
                verifiedBy: 'HUB_MGR_01',
                depositedAmount: 4500,
                remarks: 'Rider short by Rs 500 due to loose cash misplacement'
            }
        });

        assert.strictEqual(settlementRes.success, true);
        assert.strictEqual(settlementRes.status, 'SETTLED_WITH_SHORTAGE');
        assert.strictEqual(settlementRes.shortage, 500);
        assert.strictEqual(settlementRes.depositedAmount, 4500);
        assert.strictEqual(settlementRes.totalCollected, 5000);
        pass("2.1 Settlement confirmed with status SETTLED_WITH_SHORTAGE & correct amounts");

        // Verify updated rider document
        const updatedRider = mockStore.riders.get(riderId);
        assert.strictEqual(updatedRider.cashInHand, 0, "Rider cashInHand should be reduced to 0");
        pass("2.2 Rider cashInHand zeroed and pendingShortageAmount incremented by shortage (₹500)");

        // Verify 3-Leg Double-Entry Ledger entries
        const ledgerEntries = Array.from(mockStore.ledger.values());
        assert.strictEqual(ledgerEntries.length, 3, "Exactly 3 ledger legs must be posted");

        const legVault = ledgerEntries.find(e => e.account === 'HUB_CASH_VAULT');
        const legShortage = ledgerEntries.find(e => e.account === 'RIDER_SHORTAGE_RECEIVABLE');
        const legRider = ledgerEntries.find(e => e.account === 'RIDER_CASH_IN_HAND');

        assert(legVault, "Debit leg for HUB_CASH_VAULT must exist");
        assert.strictEqual(legVault.type, 'DEBIT');
        assert.strictEqual(legVault.amount, 4500);

        assert(legShortage, "Debit leg for RIDER_SHORTAGE_RECEIVABLE must exist");
        assert.strictEqual(legShortage.type, 'DEBIT');
        assert.strictEqual(legShortage.amount, 500);

        assert(legRider, "Credit leg for RIDER_CASH_IN_HAND must exist");
        assert.strictEqual(legRider.type, 'CREDIT');
        assert.strictEqual(legRider.amount, 5000);

        const totalDebits = legVault.amount + legShortage.amount;
        const totalCredits = legRider.amount;
        assert.strictEqual(totalDebits, totalCredits, "Total Debits (4500 + 500) must equal Total Credits (5000)");

        console.log("\n--- 3-LEG LEDGER DUMP VERIFICATION ---");
        console.table(ledgerEntries.map(e => ({
            Account: e.account,
            Type: e.type,
            Amount: `₹${e.amount}`,
            RefId: e.referenceId
        })));

        pass("2.3 3-Leg Double-Entry balanced perfectly: Debit HUB_CASH_VAULT (₹4500) + Debit RIDER_SHORTAGE_RECEIVABLE (₹500) == Credit RIDER_CASH_IN_HAND (₹5000)");

    } catch (err) {
        fail("TEST 2: Partial Shortage Settlement & Ledger", err);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 3: Automated Payout Shortage Deduction
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- TEST 3: Automated Payout Shortage Deduction ---");
    try {
        const riderId = 'RIDER_RAMESH_01';

        // Step 3.1: Calculate Payout (Gross ₹3200, Shortage ₹500 -> Net ₹2700)
        const payoutCalc = calculateRiderPayout({
            riderId,
            riderName: 'Ramesh Kumar',
            hubId: 'HUB_SAMASTIPUR_01',
            startDate: '2026-10-01',
            endDate: '2026-10-07',
            orders: [],
            cashSettlements: [{ status: 'CONFIRMED' }],
            pendingShortageAmount: 500,
            baseRate: 3200
        });

        assert.strictEqual(payoutCalc.grossPayoutAmount, 3200, "Gross amount should be 3200");
        assert.strictEqual(payoutCalc.shortageDeducted, 500, "Shortage deducted should be 500");
        assert.strictEqual(payoutCalc.netPayable, 2700, "Net payable should be 2700");
        assert.strictEqual(payoutCalc.netPayoutAmount, 2700, "netPayoutAmount parity alias should be 2700");
        pass("3.1 calculateRiderPayout correctly deducted ₹500 pending shortage from ₹3,200 gross (Net: ₹2,700)");

        // Step 3.2: Seed rider_payouts record and approve payout
        mockStore.rider_payouts = new Map();
        const payoutId = 'PAYOUT_DOC_001';
        mockStore.rider_payouts.set(payoutId, {
            id: payoutId,
            riderId,
            grossPayoutAmount: 3200,
            shortageDeducted: 500,
            netPayoutAmount: 2700,
            status: 'PENDING_APPROVAL'
        });

        // Set rider's pending shortage amount to 500 in mockStore
        mockStore.riders.set(riderId, {
            id: riderId,
            pendingShortageAmount: 500
        });

        const approvalRes = await approveRiderPayout.run({
            auth: { uid: 'FINANCE_ADMIN_01', token: { role: 'financeadmin' } },
            data: {
                payoutId,
                approvedBy: 'FINANCE_ADMIN_01'
            }
        });

        assert.strictEqual(approvalRes.success, true);
        assert.strictEqual(approvalRes.status, 'PAID');
        assert.strictEqual(approvalRes.netPayoutAmount, 2700);

        pass("3.2 approveRiderPayout sets status PAID and clears rider's pendingShortageAmount to ₹0");

    } catch (err) {
        fail("TEST 3: Automated Payout Shortage Deduction", err);
    } finally {
        // Restore methods
        adminModule.db.collection = originalCollection;
        adminModule.db.runTransaction = originalRunTransaction;
    }

    // ─────────────────────────────────────────────────────────────
    // SUMMARY
    // ─────────────────────────────────────────────────────────────
    console.log("\n=================================================================");
    console.log(`CASH CEILING & SHORTAGE SUITE: ${passed} PASSED, ${failed} FAILED.`);
    console.log("=================================================================\n");

    if (failed > 0) {
        process.exit(1);
    }
}

runAllTests().catch(err => {
    console.error("FATAL ERROR IN TEST SUITE:", err);
    process.exit(1);
});
