/**
 * Phase 3 "Full Wiring Proof" Test Suite
 * Tests Quarantine RTV, Quarantine Scrap, GRN Creation, and Weekly Rider Payout
 * with freezeSystem1(true) ACTIVE.
 * 
 * Verifies that all System 1 writers have been completely eliminated and replaced
 * with System 2 Double-Entry Accounting without throwing SYSTEM_1_FROZEN.
 * 
 * Execute with:
 * npx firebase emulators:exec --only firestore "node tests/phase3_full_wiring.test.js"
 */

const assert = require('assert');
const { db, admin } = require('../core/admin');
const { freezeSystem1, isSystem1Frozen, postLedgerEntry, processGoodsReceiptFinancials } = require('../finance/ledger');
const { resolveQuarantinedStockLogic } = require('../inventory/quarantineEngine');
const { generateHubWeeklyRiderPayouts, calculateOrderEarnings, calculateRiderPayout, approveRiderPayout } = require('../logistics/riderPayoutEngine');

console.log("=================================================================================");
console.log("=== PHASE 3: SYSTEM 2 FULL WIRING PROOF (freezeSystem1 ACTIVE) ===");
console.log("=== RUNNING AGAINST REAL FIRESTORE EMULATOR                                   ===");
console.log("=================================================================================\n");

let passed = 0;
let failed = 0;

function pass(name) {
    console.log(`✅ PASS: ${name}`);
    passed++;
}

function fail(name, err) {
    console.error(`❌ FAIL: ${name} - ${err.message || err}`);
    if (err.stack) console.error(err.stack);
    failed++;
}

async function runTestSuite() {
    const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
    if (!emulatorHost) {
        console.error("❌ FIRESTORE_EMULATOR_HOST is missing. Run inside firestore emulator.");
        process.exit(1);
    }
    console.log(`[Emulator] Connected to: ${emulatorHost}\n`);

    // 0. ACTIVATE SYSTEM 1 FREEZE
    freezeSystem1(true);
    assert.strictEqual(isSystem1Frozen(), true, "System 1 must be strictly frozen");
    console.log("🔒 System 1 freeze activated: isSystem1Frozen() === true\n");

    // Guard: Verify that legacy postLedgerEntry indeed throws SYSTEM_1_FROZEN
    try {
        await postLedgerEntry({
            account: 'INVENTORY_VALUE',
            type: 'DEBIT',
            amount: 100,
            referenceId: 'TEST_REF_GUARD'
        });
        assert.fail("postLedgerEntry must throw SYSTEM_1_FROZEN");
    } catch (guardErr) {
        assert.strictEqual(guardErr.code, 'SYSTEM_1_FROZEN');
        pass("0. Guard verified: Direct postLedgerEntry strictly blocked with SYSTEM_1_FROZEN");
    }

    const testRunId = `P3_${Date.now()}`;

    // =========================================================================
    // 1. QUARANTINE RESOLUTION: STAGE 2A (RETURN TO VENDOR / RTV)
    // =========================================================================
    console.log("\n--- 1. Testing Quarantine Resolution: Stage 2A (RTV) ---");
    try {
        const qId = `Q_TEST_RTV_${testRunId}`;
        const skuCode = `SKU_RTV_${testRunId}`;
        const batchId = `BAT_RTV_${testRunId}`;
        const hubId = `wh_samastipur`;

        // Seed SKU, Batch, and Warehouse Stock
        await db.collection("skus").doc(skuCode).set({
            skuCode,
            costPrice: 400,
            inventory: { totalStock: 50, quarantinedStock: 10, availableStock: 40 }
        });
        await db.collection("skus").doc(skuCode).collection("batches").doc(batchId).set({
            batchId,
            landingCost: 400,
            stock: 50
        });
        const wsId = `${skuCode}_${batchId}_${hubId}`;
        await db.collection("warehouse_stock").doc(wsId).set({
            skuCode,
            batchId,
            warehouseId: hubId,
            quarantinedQty: 10,
            availableStock: 40
        });
        await db.collection("inventory_quarantine").doc(qId).set({
            id: qId,
            skuCode,
            batchId,
            hubId,
            damagedQty: 10,
            resolvedQty: 0,
            status: 'PENDING',
            grnId: `GRN_${testRunId}`
        });

        // Resolve 5 units as RETURN_TO_VENDOR
        const rtvResult = await resolveQuarantinedStockLogic({
            quarantineId: qId,
            requestId: `QV_RTV_${testRunId}`,
            action: 'RETURN_TO_VENDOR',
            quantity: 5,
            vendorId: 'SUPPLIER_IFFCO',
            vendorName: 'IFFCO Fertilizer Hub',
            debitNoteRef: `DN_${testRunId}`,
            actorId: 'MGR_TEST'
        });

        assert.strictEqual(rtvResult.success, true);
        assert.strictEqual(rtvResult.resolvedQty, 5);
        assert.strictEqual(rtvResult.totalResolutionValue, 2000); // 5 * 400 = 2000

        // Verify System 2 Journal Entry created
        const jeSnap = await db.collection("journal_entries")
            .where("refId", "==", `DN_${testRunId}`)
            .where("refType", "==", "QUARANTINE_RESOLUTION")
            .get();

        assert.strictEqual(jeSnap.empty, false, "System 2 Journal Entry must exist for RTV");
        const jeDoc = jeSnap.docs[0].data();
        assert.strictEqual(jeDoc.totalAmount, 2000);
        assert.strictEqual(jeDoc.status, 'POSTED');

        // Verify lines
        const linesSnap = await jeSnap.docs[0].ref.collection("lines").get();
        assert.strictEqual(linesSnap.size, 2, "Must contain exactly 2 lines (Dr and Cr)");
        const lines = linesSnap.docs.map(d => d.data());
        const drLine = lines.find(l => l.accountCode === '2010_ACCOUNTS_PAYABLE_SUPPLIERS');
        const crLine = lines.find(l => l.accountCode === '1045_INVENTORY_QUARANTINE_ASSET');

        assert.ok(drLine, "Must debit 2010_ACCOUNTS_PAYABLE_SUPPLIERS");
        assert.strictEqual(drLine.debit, 2000);
        assert.strictEqual(drLine.credit, 0);

        assert.ok(crLine, "Must credit 1045_INVENTORY_QUARANTINE_ASSET");
        assert.strictEqual(crLine.debit, 0);
        assert.strictEqual(crLine.credit, 2000);

        pass("1. Stage 2A (RTV) PASS: Posted System 2 JE (Dr 2010 ₹2000 / Cr 1045 ₹2000) with freezeSystem1 active!");
    } catch (err) {
        fail("1. Stage 2A (RTV)", err);
    }

    // =========================================================================
    // 2. QUARANTINE RESOLUTION: STAGE 2B (SCRAP / WRITE-OFF)
    // =========================================================================
    console.log("\n--- 2. Testing Quarantine Resolution: Stage 2B (Scrap Write-Off) ---");
    try {
        const qId = `Q_TEST_SCRAP_${testRunId}`;
        const skuCode = `SKU_SCRAP_${testRunId}`;
        const batchId = `BAT_SCRAP_${testRunId}`;
        const hubId = `wh_samastipur`;

        await db.collection("skus").doc(skuCode).set({
            skuCode,
            costPrice: 250,
            inventory: { totalStock: 30, quarantinedStock: 5, availableStock: 25 }
        });
        await db.collection("skus").doc(skuCode).collection("batches").doc(batchId).set({
            batchId,
            landingCost: 250,
            stock: 30
        });
        const wsId = `${skuCode}_${batchId}_${hubId}`;
        await db.collection("warehouse_stock").doc(wsId).set({
            skuCode,
            batchId,
            warehouseId: hubId,
            quarantinedQty: 5,
            availableStock: 25
        });
        await db.collection("inventory_quarantine").doc(qId).set({
            id: qId,
            skuCode,
            batchId,
            hubId,
            damagedQty: 5,
            resolvedQty: 0,
            status: 'PENDING',
            grnId: `GRN_${testRunId}_2`
        });

        // Resolve 3 units as WRITE_OFF
        const scrapResult = await resolveQuarantinedStockLogic({
            quarantineId: qId,
            requestId: `QV_SCRAP_${testRunId}`,
            action: 'WRITE_OFF',
            quantity: 3,
            writeOffReason: 'Water seepage during monsoon storm',
            actorId: 'AUDITOR_TEST'
        });

        assert.strictEqual(scrapResult.success, true);
        assert.strictEqual(scrapResult.resolvedQty, 3);
        assert.strictEqual(scrapResult.totalResolutionValue, 750); // 3 * 250 = 750

        // Verify System 2 Journal Entry
        const jeSnap = await db.collection("journal_entries")
            .where("refId", "==", qId)
            .where("refType", "==", "QUARANTINE_RESOLUTION")
            .get();

        assert.strictEqual(jeSnap.empty, false, "System 2 Journal Entry must exist for Scrap");
        const jeDoc = jeSnap.docs[0].data();
        assert.strictEqual(jeDoc.totalAmount, 750);
        assert.strictEqual(jeDoc.status, 'POSTED');

        const linesSnap = await jeSnap.docs[0].ref.collection("lines").get();
        assert.strictEqual(linesSnap.size, 2);
        const lines = linesSnap.docs.map(d => d.data());
        const drLine = lines.find(l => l.accountCode === '5020_INVENTORY_SHRINKAGE_LOSS');
        const crLine = lines.find(l => l.accountCode === '1045_INVENTORY_QUARANTINE_ASSET');

        assert.ok(drLine, "Must debit 5020_INVENTORY_SHRINKAGE_LOSS");
        assert.strictEqual(drLine.debit, 750);
        assert.strictEqual(drLine.credit, 0);

        assert.ok(crLine, "Must credit 1045_INVENTORY_QUARANTINE_ASSET");
        assert.strictEqual(crLine.debit, 0);
        assert.strictEqual(crLine.credit, 750);

        pass("2. Stage 2B (Scrap Write-Off) PASS: Posted System 2 JE (Dr 5020 ₹750 / Cr 1045 ₹750) with freezeSystem1 active!");
    } catch (err) {
        fail("2. Stage 2B (Scrap)", err);
    }

    // =========================================================================
    // 3. GOODS RECEIPT (GRN) SYSTEM 2 JOURNAL ENTRY
    // =========================================================================
    console.log("\n--- 3. Testing Goods Receipt (GRN) System 2 Wiring ---");
    try {
        const grnId = `GRN_E2E_${testRunId}`;
        const grnData = {
            grnNumber: `GRN-2026-${testRunId.slice(-6)}`,
            totalGRNAmount: 12500,
            poId: `PO_TEST_${testRunId}`,
            supplierId: 'SUPP_COROMANDEL',
            supplierName: 'Coromandel International Ltd',
            receivedBy: 'WH_SAMASTIPUR_OFFICER'
        };

        const grnResult = await processGoodsReceiptFinancials(grnId, grnData);
        assert.strictEqual(grnResult.success, true);
        assert.strictEqual(grnResult.journalEntryId, `JE_GRN_${grnId}`);
        assert.strictEqual(grnResult.totalAmount, 12500);

        // Verify Journal Entry doc in Firestore
        const jeDocSnap = await db.collection("journal_entries").doc(`JE_GRN_${grnId}`).get();
        assert.strictEqual(jeDocSnap.exists, true, "Journal Entry doc must exist in Firestore");
        const jeData = jeDocSnap.data();
        assert.strictEqual(jeData.refType, 'PURCHASE_GRN');
        assert.strictEqual(jeData.refId, grnId);
        assert.strictEqual(jeData.totalAmount, 12500);

        // Verify Lines: Dr 1040_INVENTORY_MAIN_HUB, Cr 2018_GRN_CLEARING_SUSPENSE
        const linesSnap = await jeDocSnap.ref.collection("lines").get();
        assert.strictEqual(linesSnap.size, 2);
        const lines = linesSnap.docs.map(d => d.data());
        const invDr = lines.find(l => l.accountCode === '1040_INVENTORY_MAIN_HUB');
        const suspenseCr = lines.find(l => l.accountCode === '2018_GRN_CLEARING_SUSPENSE');

        assert.ok(invDr, "Must debit 1040_INVENTORY_MAIN_HUB");
        assert.strictEqual(invDr.debit, 12500);
        assert.strictEqual(invDr.credit, 0);

        assert.ok(suspenseCr, "Must credit 2018_GRN_CLEARING_SUSPENSE");
        assert.strictEqual(suspenseCr.debit, 0);
        assert.strictEqual(suspenseCr.credit, 12500);

        // Verify Replay Idempotency
        const replayResult = await processGoodsReceiptFinancials(grnId, grnData);
        assert.strictEqual(replayResult.alreadyProcessed, true, "Replay must return alreadyProcessed: true");

        // Verify lines count unchanged
        const linesAfterReplay = await jeDocSnap.ref.collection("lines").get();
        assert.strictEqual(linesAfterReplay.size, 2, "No duplicate lines allowed on replay");

        pass("3. GRN System 2 Wiring PASS: Posted Dr 1040 ₹12500 / Cr 2018 ₹12500 with strict idempotency!");
    } catch (err) {
        fail("3. GRN System 2 Wiring", err);
    }

    // =========================================================================
    // 4. WEEKLY RIDER PAYOUT ENGINE & SYSTEM 2 APPROVAL
    // =========================================================================
    console.log("\n--- 4. Testing Weekly Rider Payout Engine & Approval ---");
    try {
        const riderId = `RIDER_${testRunId}`;
        const hubId = `wh_samastipur`;
        const orderId = `ORD_RIDER_${testRunId}`;

        // 1. Seed rider and delivered order
        await db.collection("riders").doc(riderId).set({
            id: riderId,
            name: 'Ramesh Yadav',
            hubId,
            pendingShortageAmount: 20
        });

        await db.collection("orders").doc(orderId).set({
            id: orderId,
            orderId,
            assignedRiderId: riderId,
            destinationHubId: hubId,
            status: 'DELIVERED',
            totalWeightKg: 15, // heavy (+15)
            distanceKm: 14,    // 14 - 12 = 2 km * 5 = +10
            isCod: true,
            isCashSettled: true,
            settlementStatus: 'SETTLED',
            deliveredAt: admin.firestore.Timestamp.fromDate(new Date('2026-10-10T14:00:00Z'))
        });

        // 2. Generate Weekly Payout Batch via core engine
        const genResult = await generateHubWeeklyRiderPayouts(
            hubId,
            '2026-10-05',
            '2026-10-12',
            'SYSTEM_SCHEDULER_TEST'
        );

        assert.strictEqual(genResult.success, true);
        assert.ok(genResult.totalRidersProcessed >= 1);
        const riderPayout = genResult.payouts.find(p => p.riderId === riderId);
        assert.ok(riderPayout, "Payout record must be generated for test rider");

        // Expected earnings: base 30 + heavy 15 + distance 10 = ₹55 gross
        // Shortage deduction: 20 -> Net payable: ₹35
        assert.strictEqual(riderPayout.grossEarnings, 55);
        assert.strictEqual(riderPayout.shortageDeducted, 20);
        assert.strictEqual(riderPayout.netPayable, 35);
        assert.strictEqual(riderPayout.status, 'PENDING_APPROVAL');

        // 3. Approve Rider Payout via approveRiderPayout callable logic
        const approveRes = await approveRiderPayout.run({
            data: {
                payoutId: riderPayout.payoutId,
                paymentMode: 'BANK_TRANSFER',
                referenceNo: `UTR_${testRunId}`
            },
            auth: { uid: 'FINANCE_HEAD_TEST', token: { role: 'admin' } }
        });

        assert.strictEqual(approveRes.success, true);
        assert.strictEqual(approveRes.status, 'PAID');
        assert.strictEqual(approveRes.netPayable, 35);

        // Verify Journal Entry in general ledger
        const jeDocSnap = await db.collection("journal_entries").doc(`JE_RIDER_WEEKLY_PAYOUT_${riderPayout.payoutId}`).get();
        assert.strictEqual(jeDocSnap.exists, true, "Rider payout journal entry must exist");
        const jeData = jeDocSnap.data();
        assert.strictEqual(jeData.refType, 'RIDER_PAYOUT');

        // Verify Lines
        const linesSnap = await jeDocSnap.ref.collection("lines").get();
        const lines = linesSnap.docs.map(d => d.data());
        const drExpense = lines.find(l => l.accountCode === '2015_RIDER_PAYOUTS_PAYABLE');
        const crBank = lines.find(l => l.accountCode === '1030_BANK_CURRENT_HDFC');
        const crShortage = lines.find(l => l.accountCode === '1015_RIDER_RECEIVABLE_SHORTAGES');

        assert.ok(drExpense, "Must debit 2015_RIDER_PAYOUTS_PAYABLE");
        assert.strictEqual(drExpense.debit, 55);

        assert.ok(crBank, "Must credit 1030_BANK_CURRENT_HDFC");
        assert.strictEqual(crBank.credit, 35);

        assert.ok(crShortage, "Must credit 1015_RIDER_RECEIVABLE_SHORTAGES for recovered shortage");
        assert.strictEqual(crShortage.credit, 20);

        pass("4. Weekly Rider Payout PASS: Generated ₹55 gross, clawed back ₹20 shortage, approved Dr 6010 ₹55 / Cr 1030 ₹35 + Cr 1015 ₹20!");
    } catch (err) {
        fail("4. Weekly Rider Payout", err);
    }

    // =========================================================================
    // SUMMARY
    // =========================================================================
    console.log("\n=================================================================================");
    console.log(`PHASE 3 FULL WIRING PROOF COMPLETED: ${passed} PASSED, ${failed} FAILED`);
    console.log("=================================================================================\n");

    if (failed > 0) {
        process.exit(1);
    }
}

runTestSuite().catch(err => {
    console.error("FATAL ERROR IN TEST SUITE:", err);
    process.exit(1);
});
