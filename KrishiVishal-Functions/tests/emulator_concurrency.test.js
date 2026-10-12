/**
 * Concurrent reservation test directly against Firestore Emulator
 * FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
 */
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
process.env.GCLOUD_PROJECT = 'krishivishal-test';

const assert = require('assert');
const admin = require('firebase-admin');

if (!admin.apps.length) {
    admin.initializeApp({ projectId: 'krishivishal-test' });
}
const db = admin.firestore();

// Point core/admin db to emulator instance
const coreAdmin = require('../core/admin');
coreAdmin.db = db;
coreAdmin.admin = admin;

const { reserveOrderStock } = require('../inventory/inventoryEngine');

async function runEmulatorTest() {
    console.log("=== RUNNING LIVE FIRESTORE EMULATOR CONCURRENCY TEST ===");
    console.log("FIRESTORE_EMULATOR_HOST:", process.env.FIRESTORE_EMULATOR_HOST);

    const skuCode = 'EMU-TEST-SKU-001';
    const warehouseId = 'HUB-EMU-01';

    // 1. Seed initial state in Emulator Firestore
    const skuRef = db.collection('skus').doc(skuCode);
    await skuRef.set({
        skuCode,
        isActive: true,
        inventory: { availableStock: 10, committedStock: 0, totalStock: 10 }
    });

    const batchRef = skuRef.collection('batches').doc('BAT_EMU_01');
    await batchRef.set({
        batchNumber: 'BAT-EMU-01',
        isActive: true,
        qualityStatus: 'PASSED',
        landingCost: 650,
        expiryDate: admin.firestore.Timestamp.fromMillis(Date.now() + 100 * 24 * 3600 * 1000)
    });

    const wsRef = db.collection('warehouse_stock').doc(`${skuCode}_BAT_EMU_01_${warehouseId}`);
    await wsRef.set({
        skuCode,
        batchId: 'BAT_EMU_01',
        warehouseId,
        availableStock: 10,
        committedStock: 0
    });

    console.log("Seeded initial stock: 10 available units in batch BAT_EMU_01");

    // 2. Launch two truly concurrent reserveOrderStock requests competing for the same 10 units
    const req1 = db.runTransaction(async (transaction) => {
        return await reserveOrderStock(transaction, {
            orderId: 'ORD_EMU_RACE_1',
            items: [{ skuCode, quantity: 10 }],
            userId: 'USER_RACE_1',
            idempotencyKey: 'race_emu_1',
            destinationHubId: warehouseId
        });
    });

    const req2 = db.runTransaction(async (transaction) => {
        return await reserveOrderStock(transaction, {
            orderId: 'ORD_EMU_RACE_2',
            items: [{ skuCode, quantity: 10 }],
            userId: 'USER_RACE_2',
            idempotencyKey: 'race_emu_2',
            destinationHubId: warehouseId
        });
    });

    const results = await Promise.allSettled([req1, req2]);

    const successes = results.filter(r => r.status === 'fulfilled');
    const failures = results.filter(r => r.status === 'rejected');

    console.log(`Results: ${successes.length} fulfilled, ${failures.length} rejected`);

    // Invariants check: Exactly one request MUST succeed, exactly one MUST be rejected
    assert.strictEqual(successes.length, 1, "Exactly one transaction must succeed");
    assert.strictEqual(failures.length, 1, "Exactly one transaction must fail due to stock depletion");

    const failedErr = failures[0].reason;
    console.log("Rejected error code:", failedErr.code || failedErr.message);
    assert.ok(
        failedErr.code === 'failed-precondition' || String(failedErr.message).includes('Insufficient stock'),
        "Failed request must throw failed-precondition / Insufficient stock"
    );

    // Verify final state in emulator
    const finalWs = (await wsRef.get()).data();
    const finalSku = (await skuRef.get()).data();

    console.log("Final warehouse_stock in Emulator:", finalWs);
    console.log("Final sku inventory in Emulator:", finalSku.inventory);

    assert.strictEqual(finalWs.availableStock, 0, "Warehouse availableStock must be 0");
    assert.strictEqual(finalWs.committedStock, 10, "Warehouse committedStock must be 10");
    assert.strictEqual(finalSku.inventory.availableStock, 0, "SKU aggregate availableStock must be 0");
    assert.strictEqual(finalSku.inventory.committedStock, 10, "SKU aggregate committedStock must be 10");

    console.log("✅ EMULATOR CONCURRENCY TEST PASSED: No negative stock, clean isolation and serialization!");
}

runEmulatorTest()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error("❌ EMULATOR TEST FAILED:", err);
        process.exit(1);
    });
