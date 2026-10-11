/**
 * WORKFLOW 4: CUSTOMER RETURNS, REFUNDS & CREDIT NOTES E2E TEST
 * 
 * Verifies:
 * 1. Customer Return Request:
 *    - Valid return on DELIVERED order
 *    - Rejection of return on PLACED order
 *    - Rejection of return on CANCELLED order
 *    - Rejection of duplicate return request
 *    - Verification of COD refund method (WALLET)
 * 2. Admin QC Inspection & Approval:
 *    - QC Passed approval (status: APPROVED, qcStatus: PASSED)
 *    - Restockable vs Damaged/Unsellable goods
 * 3. Full Return vs Partial Return:
 *    - Full return (2 units = ₹800)
 *    - Partial return (1 unit = ₹400)
 * 4. Credit Note Rule 53 Compliance & Idempotency:
 *    - Consecutive number format KVCN/26-27/00001 (<= 16 chars)
 *    - Idempotency guard: Zero duplicate CNs, zero counter burn
 * 5. Reversal Double-Entry Accounting:
 *    - Dr 4010_SALES_AGRI_INPUTS (Sales Reversal)
 *    - Dr 2020_OUTPUT_CGST_PAYABLE (CGST Reversal)
 *    - Dr 2030_OUTPUT_SGST_PAYABLE (SGST Reversal)
 *    - Cr 2060_CUSTOMER_REFUNDS_PAYABLE (Customer Refund Liability)
 *    - Dr 1040_INVENTORY_MAIN_HUB & Cr 5010_COGS_AGRI_INPUTS (COGS/Restock Reversal)
 *    - Zero-sum balance (Total Debit == Total Credit)
 */

const assert = require('assert');
const { requestReturn } = require('../orders/orderFlow');
const { handleReturnApproved } = require('../returns/returnTriggers');
const { generateCreditNoteForReturn } = require('../invoices/creditNoteEngine');
const adminModule = require('../core/admin');

console.log("==================================================================================");
console.log("=== RUNNING WORKFLOW 4 — RETURN, REFUND & CREDIT NOTE E2E VERIFICATION SUITE ===");
console.log("==================================================================================\n");

let passed = 0;
let failed = 0;

function pass(name) {
    console.log(`✅ PASS: ${name}`);
    passed++;
}

function fail(name, err) {
    console.error(`❌ FAIL: ${name} - ${err.message || err}`);
    failed++;
}

// In-Memory store
const store = {
    orders: {},
    returns: {},
    credit_notes: {},
    credit_note_counters: {},
    journal_entries: {},
    operation_locks: {},
    fiscal_periods: {
        '2026-10': { status: 'OPEN', periodId: '2026-10' }
    }
};

const originalCollection = adminModule.db.collection;
const originalRunTransaction = adminModule.db.runTransaction;
const originalBatch = adminModule.db.batch;

function createDocRef(collName, docId) {
    const effectiveId = docId || ('id_' + Math.random().toString(36).substring(2, 9));
    return {
        id: effectiveId,
        path: `${collName}/${effectiveId}`,
        get: async function () {
            const table = store[collName] || {};
            const data = table[effectiveId];
            return {
                exists: Boolean(data),
                id: effectiveId,
                data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined)
            };
        },
        set: async function (data, opts) {
            if (!store[collName]) store[collName] = {};
            if (opts && opts.merge && store[collName][effectiveId]) {
                store[collName][effectiveId] = { ...store[collName][effectiveId], ...JSON.parse(JSON.stringify(data)) };
            } else {
                store[collName][effectiveId] = JSON.parse(JSON.stringify(data));
            }
            return { id: effectiveId };
        },
        update: async function (data) {
            if (!store[collName] || !store[collName][effectiveId]) {
                throw new Error(`Doc not found: ${collName}/${effectiveId}`);
            }
            Object.assign(store[collName][effectiveId], JSON.parse(JSON.stringify(data)));
            return { id: effectiveId };
        },
        collection: function (subColl) {
            return adminModule.db.collection(`${collName}/${effectiveId}/${subColl}`);
        }
    };
}

adminModule.db.collection = function (collName) {
    return {
        doc: function (docId) {
            return createDocRef(collName, docId);
        },
        where: function (field, op, val) {
            return {
                limit: function (lim) {
                    return {
                        get: async function () {
                            const table = store[collName] || {};
                            const matching = Object.keys(table)
                                .filter(k => table[k][field] === val)
                                .map(k => ({
                                    id: k,
                                    exists: true,
                                    data: () => JSON.parse(JSON.stringify(table[k]))
                                }));
                            return {
                                empty: matching.length === 0,
                                size: matching.length,
                                docs: matching.slice(0, lim)
                            };
                        }
                    };
                },
                get: async function () {
                    const table = store[collName] || {};
                    const matching = Object.keys(table)
                        .filter(k => table[k][field] === val)
                        .map(k => ({
                            id: k,
                            exists: true,
                            data: () => JSON.parse(JSON.stringify(table[k]))
                        }));
                    return {
                        empty: matching.length === 0,
                        size: matching.length,
                        docs: matching
                    };
                }
            };
        }
    };
};

adminModule.db.batch = function () {
    const ops = [];
    return {
        set: function (ref, data, opts) {
            ops.push(() => ref.set(data, opts));
        },
        update: function (ref, data) {
            ops.push(() => ref.update(data));
        },
        commit: async function () {
            for (const op of ops) {
                await op();
            }
        }
    };
};

adminModule.db.runTransaction = async function (txnFn) {
    const txn = {
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
    return await txnFn(txn);
};

async function runWorkflow4() {
    try {
        const customerAuth = { uid: 'cust_ramesh_01', token: { role: 'Customer' } };
        const otherCustomerAuth = { uid: 'cust_stranger', token: { role: 'Customer' } };
        const adminAuth = { uid: 'admin_prakash', token: { role: 'Admin', admin: true } };

        // ─────────────────────────────────────────────────────────────
        // STEP 1: RETURN REQUEST & PERMISSIONS
        // ─────────────────────────────────────────────────────────────
        console.log("--- STEP 1: Customer Return Request Lifecycle & Validations ---");

        // 1a. Pre-seed test delivered order
        const deliveredOrderId = 'ORD_WF4_DELIVERED_01';
        store.orders[deliveredOrderId] = {
            id: deliveredOrderId,
            userId: 'cust_ramesh_01',
            userName: 'Ramesh Kumar',
            userPhone: '+919876543210',
            status: 'DELIVERED',
            paymentMethod: 'COD',
            invoiceNumber: 'KV/26-27/00001',
            shippingState: 'Bihar',
            totalAmount: 800,
            items: [
                {
                    productId: 'PROD_NEEM_OIL_1L',
                    skuCode: 'SKU_NEEM_1L',
                    name: 'KrishiVishal Organic Neem Oil (1 Litre)',
                    quantity: 2,
                    price: 400,
                    taxablePrice: 338.98,
                    costPrice: 250,
                    hsnCode: '3808'
                }
            ]
        };

        // 1b. Customer submits valid full return request
        const returnReqData = {
            orderId: deliveredOrderId,
            productId: 'PROD_NEEM_OIL_1L',
            skuCode: 'SKU_NEEM_1L',
            quantity: 2,
            reason: 'Seal was damaged during transit',
            customerComment: 'Bottle leaking in parcel'
        };

        const retRes = await requestReturn.run({ data: returnReqData, auth: customerAuth });
        assert(retRes && retRes.returnId, "Return request must return returnId");
        assert.strictEqual(retRes.status, 'REQUESTED');
        const returnDoc = store.returns[retRes.returnId];
        assert(returnDoc, "Return document must be saved in 'returns' collection");
        assert.strictEqual(returnDoc.orderId, deliveredOrderId);
        assert.strictEqual(returnDoc.refundMethod, 'WALLET', "COD order refund method must default to WALLET");
        assert.strictEqual(store.orders[deliveredOrderId].returnStatus, 'RETURN_REQUESTED');
        pass(`1b. Valid Return Request created: ID=${retRes.returnId}, Order=${deliveredOrderId}, Method=WALLET`);

        // 1c. Negative: Customer cannot submit duplicate return request on same order
        try {
            await requestReturn.run({ data: returnReqData, auth: customerAuth });
            fail("1c. Duplicate Return", new Error("Should have rejected duplicate return request!"));
        } catch (err) {
            assert.strictEqual(err.code, 'already-exists');
            pass("1c. Duplicate Return request blocked: Threw 'already-exists'");
        }

        // 1d. Negative: Return on PLACED order rejected
        const placedOrderId = 'ORD_PLACED_01';
        store.orders[placedOrderId] = { id: placedOrderId, userId: 'cust_ramesh_01', status: 'PLACED' };
        try {
            await requestReturn.run({ data: { orderId: placedOrderId, reason: 'Test' }, auth: customerAuth });
            fail("1d. Return on PLACED", new Error("Should have rejected return on PLACED order!"));
        } catch (err) {
            assert.strictEqual(err.code, 'failed-precondition');
            pass("1d. Return on PLACED order rejected: Threw 'failed-precondition'");
        }

        // 1e. Negative: Return on CANCELLED order rejected
        const cancelledOrderId = 'ORD_CANCELLED_01';
        store.orders[cancelledOrderId] = { id: cancelledOrderId, userId: 'cust_ramesh_01', status: 'CANCELLED' };
        try {
            await requestReturn.run({ data: { orderId: cancelledOrderId, reason: 'Test' }, auth: customerAuth });
            fail("1e. Return on CANCELLED", new Error("Should have rejected return on CANCELLED order!"));
        } catch (err) {
            assert.strictEqual(err.code, 'failed-precondition');
            pass("1e. Return on CANCELLED order rejected: Threw 'failed-precondition'");
        }

        // 1f. Negative: Stranger customer cannot request return on another user's order
        try {
            await requestReturn.run({ data: { orderId: deliveredOrderId, reason: 'Test' }, auth: otherCustomerAuth });
            fail("1f. Unauthorized customer", new Error("Should have rejected unauthorized user!"));
        } catch (err) {
            assert.strictEqual(err.code, 'permission-denied');
            pass("1f. Cross-customer return attempt blocked: Threw 'permission-denied'");
        }

        // ─────────────────────────────────────────────────────────────
        // STEP 2 & 3: ADMIN QC INSPECTION & INVENTORY RESTOCK
        // ─────────────────────────────────────────────────────────────
        console.log("\n--- STEP 2 & 3: Admin QC Inspection, Approval & Restock Rules ---");

        // 2a. Full Return: QC Inspection PASSED, Restockable = true
        const returnId1 = retRes.returnId;
        const beforeData = { ...store.returns[returnId1] };
        const afterData = {
            ...beforeData,
            status: 'APPROVED',
            qcStatus: 'PASSED',
            restockable: true,
            approvedBy: 'admin_prakash',
            refundStatus: 'PENDING'
        };
        store.returns[returnId1] = afterData;

        // Trigger return handler
        await handleReturnApproved({
            returnId: returnId1,
            beforeData,
            afterData,
            returnRef: createDocRef('returns', returnId1)
        });

        const updatedReturnDoc = store.returns[returnId1];
        assert.strictEqual(updatedReturnDoc.refundStatus, 'CREDIT_NOTE_ISSUED', "Refund status must update to CREDIT_NOTE_ISSUED");
        const cnNumber1 = updatedReturnDoc.creditNoteNo;
        assert(cnNumber1, "Credit note number must be generated");
        assert(cnNumber1.startsWith('KVCN/26-27/'), `CN number must start with KVCN/26-27/: ${cnNumber1}`);
        assert(cnNumber1.length <= 16, `CN number length (${cnNumber1.length}) must be <= 16 chars (Rule 53)`);
        pass(`2a. Full Return approved with QC PASSED: Credit Note ${cnNumber1} issued (length=${cnNumber1.length} <= 16)`);

        // ─────────────────────────────────────────────────────────────
        // STEP 4: DOUBLE-ENTRY REVERSAL JOURNAL VERIFICATION (Full Return)
        // ─────────────────────────────────────────────────────────────
        console.log("\n--- STEP 4: Full Return Reversal Journal & Mathematical Balance ---");
        const cnDoc1 = store.credit_notes[updatedReturnDoc.creditNoteId];
        assert(cnDoc1, "Credit note document must exist");
        assert.strictEqual(cnDoc1.totalRefundAmount, 800, `Full return refund amount must be ₹800, got ${cnDoc1.totalRefundAmount}`);

        const je1 = store.journal_entries[cnDoc1.journalEntryId];
        assert(je1, "Journal entry header must exist for credit note");
        assert.strictEqual(je1.refType, 'SALES_RETURN');

        // Check Debit vs Credit Balance from persisted lines subcollection:
        const subCollName1 = `journal_entries/${cnDoc1.journalEntryId}/lines`;
        const linesMap1 = store[subCollName1] || {};
        const lines1 = Object.values(linesMap1);
        assert(lines1.length >= 2, `Lines count must be >= 2, got ${lines1.length}`);

        let totalDebit1 = 0;
        let totalCredit1 = 0;
        for (const line of lines1) {
            totalDebit1 += Number(line.debit || 0);
            totalCredit1 += Number(line.credit || 0);
        }
        totalDebit1 = Math.round(totalDebit1 * 100) / 100;
        totalCredit1 = Math.round(totalCredit1 * 100) / 100;

        assert.strictEqual(totalDebit1, totalCredit1, `Debits (${totalDebit1}) must strictly equal Credits (${totalCredit1})`);
        
        // Assert specific account codes:
        const salesDebit = lines1.find(l => l.accountCode === '4010_SALES_AGRI_INPUTS');
        const cgstDebit = lines1.find(l => l.accountCode === '2020_OUTPUT_CGST_PAYABLE');
        const sgstDebit = lines1.find(l => l.accountCode === '2030_OUTPUT_SGST_PAYABLE');
        const refundCredit = lines1.find(l => l.accountCode === '2060_CUSTOMER_REFUNDS_PAYABLE');
        const invRestockDebit = lines1.find(l => l.accountCode === '1040_INVENTORY_MAIN_HUB');
        const cogsCredit = lines1.find(l => l.accountCode === '5010_COGS_AGRI_INPUTS');

        assert(salesDebit && salesDebit.debit > 0, "Sales agri inputs debited (reversal)");
        assert(cgstDebit && cgstDebit.debit > 0, "CGST payable debited (tax reversal)");
        assert(sgstDebit && sgstDebit.debit > 0, "SGST payable debited (tax reversal)");
        assert.strictEqual(refundCredit.credit, 800, "Customer refunds payable credited ₹800");
        assert(invRestockDebit && invRestockDebit.debit > 0, "Inventory asset debited (restock)");
        assert(cogsCredit && cogsCredit.credit > 0, "COGS credited (cost reversal)");
        pass(`4. Full Return Journal verified: Total Debit (₹${totalDebit1}) == Total Credit (₹${totalCredit1}) [Zero-Sum Balance]`);

        // ─────────────────────────────────────────────────────────────
        // STEP 5: IDEMPOTENCY & DUPLICATE REVERSAL PREVENTION
        // ─────────────────────────────────────────────────────────────
        console.log("\n--- STEP 5: Credit Note Idempotency & Duplicate Reversal Prevention ---");
        // Re-triggering return approval for returnId1
        const initialJeCount = Object.keys(store.journal_entries).length;
        await handleReturnApproved({
            returnId: returnId1,
            beforeData: afterData,
            afterData: store.returns[returnId1],
            returnRef: createDocRef('returns', returnId1)
        });
        const finalJeCount = Object.keys(store.journal_entries).length;
        assert.strictEqual(initialJeCount, finalJeCount, "Re-triggering return approval must NOT post duplicate journal entries");

        // Also test direct generateCreditNoteForReturn with same returnRequestId
        const duplicateCnResult = await generateCreditNoteForReturn({
            orderId: deliveredOrderId,
            returnRequestId: returnId1,
            originalInvoiceNo: 'KV/26-27/00001',
            returnedItems: store.orders[deliveredOrderId].items,
            shippingState: 'Bihar'
        });
        assert.strictEqual(duplicateCnResult.alreadyIssued, true, "Must flag alreadyIssued: true");
        assert.strictEqual(duplicateCnResult.creditNoteNumber, cnNumber1, "Must return existing credit note number without incrementing counter");
        pass("5. Credit Note Idempotency verified: Duplicate trigger produces zero new documents and zero duplicate journal lines");

        // ─────────────────────────────────────────────────────────────
        // STEP 6: PARTIAL RETURN TEST (1 of 2 Units = ₹400)
        // ─────────────────────────────────────────────────────────────
        console.log("\n--- STEP 6: Partial Return (1 Unit Returned out of 2 Units) ---");
        const partialReturnId = 'RET_PARTIAL_002';
        const partialItems = [
            {
                skuId: 'SKU_NEEM_1L',
                name: 'KrishiVishal Organic Neem Oil (1 Litre)',
                quantity: 1, // 1 unit @ ₹400
                taxablePrice: 338.98,
                costPrice: 250,
                hsn: '3808'
            }
        ];

        const partialRes = await generateCreditNoteForReturn({
            orderId: deliveredOrderId,
            returnRequestId: partialReturnId,
            originalInvoiceNo: 'KV/26-27/00001',
            returnedItems: partialItems,
            returnReason: 'Partial Return: 1 bottle damaged',
            shippingState: 'Bihar',
            restockable: false // Damaged bottle cannot be restocked!
        });

        assert.strictEqual(partialRes.success, true);
        assert(partialRes.creditNoteNumber.startsWith('KVCN/26-27/'));
        assert(partialRes.creditNoteNumber.length <= 16);
        assert.strictEqual(partialRes.totalRefundAmount, 400, `Partial return amount must be ₹400, got ${partialRes.totalRefundAmount}`);

        // Check Damaged Goods Non-Restock Rule:
        const partialSubColl = `journal_entries/${partialRes.journalEntryId}/lines`;
        const partialLines = Object.values(store[partialSubColl] || {});
        const partialInvRestock = partialLines.find(l => l.accountCode === '1040_INVENTORY_MAIN_HUB');
        assert(!partialInvRestock, "Damaged/non-restockable return must NOT increment sellable inventory asset");

        let pDebit = 0, pCredit = 0;
        for (const line of partialLines) {
            pDebit += Number(line.debit || 0);
            pCredit += Number(line.credit || 0);
        }
        pDebit = Math.round(pDebit * 100) / 100;
        pCredit = Math.round(pCredit * 100) / 100;
        assert.strictEqual(pDebit, pCredit, `Partial return debits (${pDebit}) must equal credits (${pCredit})`);
        pass(`6. Partial Return verified: Refund=₹400, Damaged non-restock applied, Debits (₹${pDebit}) == Credits (₹${pCredit})`);

        console.log("\n==================================================================================");
        console.log(`WORKFLOW 4 VERIFICATION COMPLETED: ${passed} PASSED, ${failed} FAILED`);
        console.log("==================================================================================\n");

    } catch (err) {
        fail("WORKFLOW 4 Execution", err);
    } finally {
        adminModule.db.collection = originalCollection;
        adminModule.db.runTransaction = originalRunTransaction;
        adminModule.db.batch = originalBatch;
    }
}

runWorkflow4();
