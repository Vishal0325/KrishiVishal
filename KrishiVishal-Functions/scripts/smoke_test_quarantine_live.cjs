const admin = require("firebase-admin");
if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'krishivishal-a9ed7'
    });
}
const db = admin.firestore();
const { resolveQuarantinedStockLogic } = require("../inventory/quarantineEngine.js");

async function runSmokeTest() {
    console.log("=== STARTING LIVE QUARANTINE & LEDGER SMOKE TEST ===");

    const quarantineId = "SMOKE_TEST_Q_" + Date.now();
    const skuCode = "SKU_SMOKE_TEST";
    const batchId = "BATCH_SMOKE_001";
    const hubId = "HUB_SAMASTIPUR";
    const wsId = `${skuCode}_${batchId}_${hubId}`;

    const quarantineRef = db.collection("inventory_quarantine").doc(quarantineId);
    const wsRef = db.collection("warehouse_stock").doc(wsId);
    const skuRef = db.collection("skus").doc(skuCode);
    const batchRef = skuRef.collection("batches").doc(batchId);

    console.log(`[1] Creating synthetic quarantine entry: ${quarantineId}`);
    
    // Seed SKU and Batch (for pricing lookup and aggregate logic)
    await skuRef.set({
        code: skuCode,
        name: "Smoke Test Pesticide",
        costPrice: 500,
        "inventory": {
            quarantinedStock: 10,
            totalStock: 10
        },
        isSmokeTest: true
    }, { merge: true });
    
    await batchRef.set({
        batchId: batchId,
        landingCost: 500,
        isSmokeTest: true
    }, { merge: true });

    // Seed Warehouse Stock
    await wsRef.set({
        skuCode,
        batchId,
        hubId,
        quarantinedQty: 10,
        availableStock: 0,
        isSmokeTest: true
    }, { merge: true });

    // Seed Quarantine Doc
    await quarantineRef.set({
        skuCode,
        batchId,
        hubId,
        damagedQty: 10,
        resolvedQty: 0,
        damageReason: "BAG_TORN_IN_TRANSIT",
        status: "PENDING",
        isSmokeTest: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    console.log(`✅ Test docs created. Initial quarantinedQty: 10`);

    console.log(`\n[2] Executing RTV Resolution (5 units)...`);
    const rtvPayload = {
        quarantineId,
        action: 'RETURN_TO_VENDOR',
        quantity: 5,
        vendorId: 'VEND_TEST_BIHAR',
        debitNoteRef: 'DN-SMOKE-01',
        actorId: 'SMOKE_RUNNER'
    };
    const rtvResult = await resolveQuarantinedStockLogic(rtvPayload);
    console.log(`✅ RTV Result:`, rtvResult);

    console.log(`\n[3] Executing Write-Off Resolution (5 units)...`);
    const scrapPayload = {
        quarantineId,
        action: 'WRITE_OFF',
        quantity: 5,
        writeOffReason: 'UNSALVAGEABLE_MOISTURE',
        actorId: 'SMOKE_RUNNER'
    };
    const scrapResult = await resolveQuarantinedStockLogic(scrapPayload);
    console.log(`✅ Write-Off Result:`, scrapResult);

    // Assertions & Verification
    console.log(`\n[4] Verifying Final Balances...`);
    const finalWs = await wsRef.get();
    const finalWsData = finalWs.data();
    console.log(`Final ws quarantinedQty: ${finalWsData.quarantinedQty}`);
    
    if (finalWsData.quarantinedQty === 0) {
        console.log(`✅ SUCCESS: quarantinedQty is correctly 0.`);
    } else {
        console.error(`❌ FAILURE: expected quarantinedQty to be 0, got ${finalWsData.quarantinedQty}`);
    }

    const finalQ = await quarantineRef.get();
    const finalQData = finalQ.data();
    if (finalQData.status === 'WRITTEN_OFF') {
         console.log(`✅ SUCCESS: Quarantine status is WRITTEN_OFF.`);
    } else {
         console.error(`❌ FAILURE: expected status WRITTEN_OFF, got ${finalQData.status}`);
    }

    // Ledger Dump
    console.log(`\n=== LEDGER DUMP ===`);
    const rtvLedgers = await db.collection("ledger").where("referenceId", "in", ["DN-SMOKE-01", quarantineId]).get();
    const ledgerTable = [];
    rtvLedgers.forEach(doc => {
        const d = doc.data();
        if (d.referenceId === 'DN-SMOKE-01' || d.referenceId === quarantineId) {
             ledgerTable.push({
                 Account: d.account,
                 Type: d.type,
                 Amount: d.amount,
                 Ref: d.referenceId,
                 RefType: d.referenceType
             });
        }
    });
    console.table(ledgerTable);

    console.log(`\n[5] Automated Cleanup...`);
    await quarantineRef.delete();
    await wsRef.delete();
    await batchRef.delete();
    await skuRef.delete();
    
    // Cleanup ledgers and movements
    const movements = await db.collection("inventory_movements").where("referenceId", "in", ["DN-SMOKE-01", quarantineId]).get();
    for (const doc of movements.docs) await doc.ref.delete();
    for (const doc of rtvLedgers.docs) await doc.ref.delete();

    console.log(`✅ Cleanup complete.`);
    console.log("=== SMOKE TEST FINISHED SUCCESSFULLY ===");
}

runSmokeTest()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error("❌ Error during smoke test:", err);
        process.exit(1);
    });
