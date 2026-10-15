const admin = require("firebase-admin");
if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'krishivishal-a9ed7'
    });
}
const db = admin.firestore();
const { resolveQuarantinedStockLogic } = require("../inventory/quarantineEngine.js");

async function runStagingVerification() {
    console.log("==================================================================");
    console.log("=== STAGING VERIFICATION: QUARANTINE RESOLUTION LIVE TEST ===");
    console.log("==================================================================\n");

    const testId = Date.now();
    const quarantineId = `STAGING_Q_${testId}`;
    const skuCode = `SKU_STAGING_${testId}`;
    const batchId = `BATCH_STAGING_001`;
    const hubId = "HUB_SAMASTIPUR";
    const wsId = `${skuCode}_${batchId}_${hubId}`;
    const requestId = `REQ_STAGING_IDEM_${testId}`;

    const quarantineRef = db.collection("inventory_quarantine").doc(quarantineId);
    const wsRef = db.collection("warehouse_stock").doc(wsId);
    const skuRef = db.collection("skus").doc(skuCode);
    const batchRef = skuRef.collection("batches").doc(batchId);
    const reqRef = db.collection("quarantine_resolution_requests").doc(requestId);

    let createdDocs = [];

    try {
        console.log(`[SETUP] Seeding synthetic test data...`);
        // 1. SKU & Batch
        await skuRef.set({
            code: skuCode,
            name: "Staging Test Nutrient",
            costPrice: 400,
            inventory: { quarantinedStock: 10, totalStock: 10 },
            isTest: true
        });
        createdDocs.push(skuRef);

        await batchRef.set({
            batchId,
            landingCost: 400,
            isTest: true
        });
        createdDocs.push(batchRef);

        // 2. Warehouse Stock: 10 units quarantined
        await wsRef.set({
            skuCode,
            batchId,
            hubId,
            quarantinedQty: 10,
            availableStock: 0,
            isTest: true
        });
        createdDocs.push(wsRef);

        // 3. Quarantine Record: 10 units damaged
        await quarantineRef.set({
            skuCode,
            batchId,
            hubId,
            damagedQty: 10,
            resolvedQty: 0,
            damageReason: "PACKAGING_DEFECT",
            status: "PENDING",
            isTest: true,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        createdDocs.push(quarantineRef);

        console.log(`✅ Seed complete. Initial Quarantined Stock: 10 units at ${hubId}\n`);

        // -------------------------------------------------------------
        // TEST 1: Successful Request (Resolve 5 units RTV)
        // -------------------------------------------------------------
        console.log(`--- TEST 1: Successful Quarantine Resolution (5 units RTV) ---`);
        const rtvPayload = {
            quarantineId,
            requestId,
            action: 'RETURN_TO_VENDOR',
            quantity: 5,
            vendorId: 'VEND_BIHAR_AGRI',
            vendorName: 'Bihar Agri Supplies',
            debitNoteRef: `DN_STAGING_${testId}`,
            unitCost: 400,
            actorId: 'STAGING_RUNNER'
        };

        const result1 = await resolveQuarantinedStockLogic(rtvPayload);
        console.log(`Response:`, result1);

        const wsSnap1 = await wsRef.get();
        const wsQty1 = wsSnap1.data().quarantinedQty;
        console.log(`Warehouse Stock after resolution: ${wsQty1} (expected 5)`);
        if (wsQty1 !== 5) throw new Error(`TEST 1 FAILED: Expected stock 5, got ${wsQty1}`);

        const qSnap1 = await quarantineRef.get();
        const qStatus1 = qSnap1.data().status;
        console.log(`Quarantine Doc status: ${qStatus1} (expected PARTIALLY_RESOLVED)`);
        if (qStatus1 !== 'PARTIALLY_RESOLVED') throw new Error(`TEST 1 FAILED: Expected status PARTIALLY_RESOLVED, got ${qStatus1}`);

        const ledgers1 = await db.collection("ledger").where("referenceId", "==", `DN_STAGING_${testId}`).get();
        console.log(`Ledger entries posted: ${ledgers1.size} (expected 2: 1 DEBIT + 1 CREDIT)`);
        if (ledgers1.size !== 2) throw new Error(`TEST 1 FAILED: Expected 2 ledger entries, got ${ledgers1.size}`);
        console.log(`✅ TEST 1 PASSED: Resolution succeeded, stock decremented, balanced ledger posted.\n`);

        // -------------------------------------------------------------
        // TEST 2: Same Request Retry (Idempotency Guard)
        // -------------------------------------------------------------
        console.log(`--- TEST 2: Replaying Same Request with Identical requestId ---`);
        const result2 = await resolveQuarantinedStockLogic(rtvPayload);
        console.log(`Replay Response:`, result2);

        const wsSnap2 = await wsRef.get();
        const wsQty2 = wsSnap2.data().quarantinedQty;
        console.log(`Warehouse Stock after replay: ${wsQty2} (MUST STILL BE 5, NOT 0)`);
        if (wsQty2 !== 5) throw new Error(`TEST 2 FAILED: Double stock deduction occurred! Stock is ${wsQty2}`);

        const ledgers2 = await db.collection("ledger").where("referenceId", "==", `DN_STAGING_${testId}`).get();
        console.log(`Ledger entries after replay: ${ledgers2.size} (MUST STILL BE 2, NOT 4)`);
        if (ledgers2.size !== 2) throw new Error(`TEST 2 FAILED: Duplicate ledger entries created! Count is ${ledgers2.size}`);
        console.log(`✅ TEST 2 PASSED: Idempotent replay safely returned prior result without double deduction or duplicate ledgers.\n`);

        // -------------------------------------------------------------
        // TEST 3: Wrong-Hub Access Denial Guard
        // -------------------------------------------------------------
        console.log(`--- TEST 3: Cross-Hub Access Denial Guard ---`);
        let crossHubBlocked = false;
        try {
            await resolveQuarantinedStockLogic({
                quarantineId,
                requestId: `REQ_WRONG_HUB_${testId}`,
                action: 'RETURN_TO_VENDOR',
                quantity: 2,
                actorId: 'HUB_MGR_PATNA',
                allowedHubId: 'HUB_PATNA' // Item is at HUB_SAMASTIPUR!
            });
        } catch (err) {
            console.log(`Caught expected error: ${err.message || err.code}`);
            if ((err.code === 'permission-denied') || (err.message && err.message.includes('permission-denied')) || (err.message && err.message.includes('only resolve quarantine stock assigned to their hub'))) {
                crossHubBlocked = true;
            }
        }

        if (!crossHubBlocked) throw new Error(`TEST 3 FAILED: Cross-hub resolution was NOT blocked!`);
        console.log(`✅ TEST 3 PASSED: Cross-hub access strictly denied with permission-denied.\n`);

        console.log("==================================================================");
        console.log("🎉 ALL 3 STAGING CHECKS PASSED: SUCCESS, RETRY IDEMPOTENCY, HUB SCOPING");
        console.log("==================================================================\n");

    } finally {
        console.log(`[CLEANUP] Cleaning up staging test documents...`);
        for (const docRef of createdDocs) {
            try { await docRef.delete(); } catch (_) {}
        }
        try { await reqRef.delete(); } catch (_) {}
        try { await db.collection("quarantine_resolution_requests").doc(`REQ_WRONG_HUB_${testId}`).delete(); } catch (_) {}

        // Cleanup test ledger entries & inventory movements
        const ledgers = await db.collection("ledger").where("referenceId", "==", `DN_STAGING_${testId}`).get();
        for (const doc of ledgers.docs) await doc.ref.delete();

        const movements = await db.collection("inventory_movements").where("referenceId", "==", `DN_STAGING_${testId}`).get();
        for (const doc of movements.docs) await doc.ref.delete();

        console.log(`✅ Cleanup finished successfully.`);
    }
}

runStagingVerification()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error("❌ Staging Verification Error:", err);
        process.exit(1);
    });
