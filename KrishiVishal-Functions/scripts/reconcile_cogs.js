/**
 * Admin Audit Script: COGS Reconciliation Breakdown
 * 
 * Computes line-by-line comparison between standard catalog cost (price list)
 * and FEFO batch landing cost for real delivered orders with ZERO database writes.
 * 
 * Usage:
 *   node scripts/reconcile_cogs.js <orderId>
 *   node scripts/reconcile_cogs.js --limit 10
 */

const { db } = require('../core/admin');
const { computeCogsReconciliationBreakdown } = require('../finance/salesLedger');

async function main() {
    const args = process.argv.slice(2);
    const targetOrderId = args.find(a => !a.startsWith('--'));
    const limitArg = args.indexOf('--limit') !== -1 ? Number(args[args.indexOf('--limit') + 1]) || 10 : 10;

    console.log("=== KRISHIVISHAL COGS RECONCILIATION AUDIT (READ-ONLY) ===");
    console.log("Mode: In-Memory Calculation (Strictly ZERO database mutations)\n");

    const orders = [];
    if (targetOrderId) {
        const snap = await db.collection('orders').doc(targetOrderId).get();
        if (!snap.exists) {
            console.error(`❌ Order '${targetOrderId}' not found in Firestore.`);
            process.exit(1);
        }
        orders.push(snap.data());
    } else {
        console.log(`Fetching latest ${limitArg} delivered orders from Firestore...`);
        const querySnap = await db.collection('orders')
            .where('status', 'in', ['DELIVERED', 'COMPLETED'])
            .limit(limitArg)
            .get();

        if (querySnap.empty) {
            // Fallback to any latest orders if none marked DELIVERED yet
            const anySnap = await db.collection('orders').limit(limitArg).get();
            anySnap.forEach(d => orders.push(d.data()));
        } else {
            querySnap.forEach(d => orders.push(d.data()));
        }
    }

    if (orders.length === 0) {
        console.log("No orders found to inspect.");
        process.exit(0);
    }

    let grandCatalogCogs = 0;
    let grandBatchCogs = 0;

    for (const ord of orders) {
        const report = computeCogsReconciliationBreakdown(ord);
        console.log(`\n------------------------------------------------------------`);
        console.log(`Order ID: ${report.orderId}`);
        console.log(`Total Items: ${report.items.length}`);
        console.log(`------------------------------------------------------------`);
        console.log(`SKU Code            | Qty | Catalog Cost | Batch Cost | Catalog COGS | Batch COGS | Variance`);
        console.log(`--------------------+-----+--------------+------------+--------------+------------+---------`);

        for (const it of report.items) {
            const sku = String(it.skuCode).padEnd(19).slice(0, 19);
            const qty = String(it.quantity).padStart(3);
            const catCost = `₹${it.catalogCost}`.padStart(12);
            const batchCost = `₹${it.batchCost || it.catalogCost}`.padStart(10);
            const catCogs = `₹${it.catalogCogs}`.padStart(12);
            const bCogs = `₹${it.batchCogs}`.padStart(10);
            const diffSign = it.variance >= 0 ? '+' : '';
            const diff = `${diffSign}₹${it.variance}`.padStart(8);

            console.log(`${sku} | ${qty} | ${catCost} | ${batchCost} | ${catCogs} | ${bCogs} | ${diff}`);
        }

        console.log(`--------------------+-----+--------------+------------+--------------+------------+---------`);
        const totalSign = report.totalVariance >= 0 ? '+' : '';
        console.log(`ORDER TOTAL: Catalog COGS: ₹${report.totalCatalogCogs} | Batch COGS: ₹${report.totalBatchCogs} | Variance: ${totalSign}₹${report.totalVariance}`);

        grandCatalogCogs += report.totalCatalogCogs;
        grandBatchCogs += report.totalBatchCogs;
    }

    const netVariance = grandBatchCogs - grandCatalogCogs;
    const netSign = netVariance >= 0 ? '+' : '';
    console.log(`\n============================================================`);
    console.log(`SUMMARY ACROSS ${orders.length} ORDER(S):`);
    console.log(`Grand Catalog COGS : ₹${grandCatalogCogs}`);
    console.log(`Grand Batch COGS   : ₹${grandBatchCogs}`);
    console.log(`Net COGS Variance  : ${netSign}₹${netVariance}`);
    console.log(`============================================================\n`);
}

main().then(() => process.exit(0)).catch(err => {
    console.error("Audit script failed:", err);
    process.exit(1);
});
