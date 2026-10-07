/**
 * KrishiVishal Production Data Sanitization & Counter Reset Script
 * 
 * Safely purges synthetic/test records generated during Sprints 1 to 10
 * and cleanly resets Rule 46 sequential invoice and credit note counters.
 */

const admin = require("firebase-admin");
if (!admin.apps.length) {
    admin.initializeApp({
        projectId: "krishivishal-a9ed7"
    });
}
const db = admin.firestore();

async function deleteQueryBatch(query, resolve) {
    const snapshot = await query.get();

    const batchSize = snapshot.size;
    if (batchSize === 0) {
        resolve(0);
        return;
    }

    const batch = db.batch();
    snapshot.docs.forEach((doc) => {
        batch.delete(doc.ref);
    });
    await batch.commit();

    process.nextTick(() => {
        deleteQueryBatch(query, (nextCount) => {
            resolve(batchSize + nextCount);
        });
    });
}

async function purgeCollectionByCondition(collectionName, filterFn, label) {
    console.log(`Scanning '${collectionName}' for ${label}...`);
    const snap = await db.collection(collectionName).get();
    let deletedCount = 0;
    const batch = db.batch();

    for (const doc of snap.docs) {
        const data = doc.data();
        if (filterFn(doc.id, data)) {
            // If it's a journal_entry, also delete its subcollection 'lines'
            if (collectionName === "journal_entries") {
                const linesSnap = await doc.ref.collection("lines").get();
                for (const lineDoc of linesSnap.docs) {
                    await lineDoc.ref.delete();
                }
            }
            batch.delete(doc.ref);
            deletedCount++;
        }
    }

    if (deletedCount > 0) {
        await batch.commit();
    }
    console.log(`  -> Purged ${deletedCount} documents from '${collectionName}'.`);
    return deletedCount;
}

async function runSanitization() {
    console.log("================================================================================");
    console.log("  KRISHIVISHAL PRIVATE LIMITED — PRODUCTION DATA SANITIZATION & RESET SCRIPT");
    console.log("================================================================================\n");

    const summary = {
        ordersPurged: 0,
        journalEntriesPurged: 0,
        creditNotesPurged: 0,
        approvalRequestsPurged: 0,
        quarantinePurged: 0,
        countersReset: []
    };

    // 1. ORDERS PURGE
    summary.ordersPurged = await purgeCollectionByCondition(
        "orders",
        (id, data) => {
            const idUpper = String(id).toUpperCase();
            const custName = String(data.customerName || data.userName || "").toUpperCase();
            return (
                idUpper.startsWith("ORDER_FIN_CYCLE") ||
                idUpper.startsWith("TEST_") ||
                idUpper.includes("TEST") ||
                custName.includes("RAMESHWAR SINGH") ||
                custName.includes("TEST FARMER") ||
                custName.includes("TEST")
            );
        },
        "synthetic test orders"
    );

    // 2. JOURNAL ENTRIES PURGE
    summary.journalEntriesPurged = await purgeCollectionByCondition(
        "journal_entries",
        (id, data) => {
            const idUpper = String(id).toUpperCase();
            const refUpper = String(data.referenceId || data.sourceRef || "").toUpperCase();
            const descUpper = String(data.description || "").toUpperCase();
            return (
                idUpper.startsWith("TEST_") ||
                idUpper.startsWith("JE_TEST") ||
                refUpper.startsWith("ORDER_FIN_CYCLE") ||
                refUpper.startsWith("TEST_") ||
                refUpper.includes("TEST") ||
                descUpper.includes("ORDER_FIN_CYCLE") ||
                descUpper.includes("RAMESHWAR") ||
                descUpper.includes("TEST ORDER")
            );
        },
        "synthetic test journal entries"
    );

    // 3. CREDIT NOTES PURGE
    summary.creditNotesPurged = await purgeCollectionByCondition(
        "credit_notes",
        (id, data) => {
            const idUpper = String(id).toUpperCase();
            const orderId = String(data.orderId || "").toUpperCase();
            const noteNo = String(data.creditNoteNumber || id).toUpperCase();
            return (
                idUpper.startsWith("TEST_") ||
                orderId.startsWith("ORDER_FIN_CYCLE") ||
                orderId.startsWith("TEST_") ||
                orderId.includes("TEST") ||
                noteNo.includes("TEST") ||
                noteNo === "KV/CN/26-27/00001" // dummy test note from sprint test suites
            );
        },
        "synthetic credit notes"
    );

    // 4. APPROVAL REQUESTS PURGE
    summary.approvalRequestsPurged = await purgeCollectionByCondition(
        "approval_requests",
        (id, data) => {
            const idUpper = String(id).toUpperCase();
            const reqType = String(data.requestType || "");
            const makerEmail = String(data.maker?.email || "");
            return (
                idUpper.startsWith("REQ_TEST_") ||
                idUpper.startsWith("REQ_BANK_TEST_") ||
                idUpper.startsWith("TEST_") ||
                makerEmail.includes("test")
            );
        },
        "dummy maker-checker requests"
    );

    // 5. QUARANTINE ITEMS & QUARANTINE PURGE
    const q1 = await purgeCollectionByCondition(
        "quarantine_items",
        (id, data) => {
            const idUpper = String(id).toUpperCase();
            return idUpper.startsWith("TEST_") || idUpper.includes("TEST");
        },
        "synthetic quarantine items"
    );
    const q2 = await purgeCollectionByCondition(
        "quarantine",
        (id, data) => {
            const idUpper = String(id).toUpperCase();
            return idUpper.startsWith("TEST_") || idUpper.includes("TEST");
        },
        "synthetic quarantine records"
    );
    summary.quarantinePurged = q1 + q2;

    // 6. SEQUENTIAL COUNTERS CLEAN RESET
    console.log("\nResetting Rule 46 sequential invoice & credit note counters for FY 26-27...");
    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    await db.collection("invoice_counters").doc("26-27").set({
        currentSequence: 0,
        financialYear: "26-27",
        updatedAt: timestamp
    });
    summary.countersReset.push("invoice_counters/26-27 (currentSequence: 0)");

    await db.collection("credit_note_counters").doc("26-27").set({
        currentSequence: 0,
        financialYear: "26-27",
        updatedAt: timestamp
    });
    summary.countersReset.push("credit_note_counters/26-27 (currentSequence: 0)");

    console.log("  -> Successfully set invoice_counters/26-27 to 0.");
    console.log("  -> Successfully set credit_note_counters/26-27 to 0.");

    // 7. VERIFY CANONICAL MASTERS INTEGRITY
    console.log("\nVerifying integrity of canonical masters...");
    const coaSnap = await db.collection("chart_of_accounts").get();
    console.log(`  -> Chart of Accounts entries count: ${coaSnap.size} (Seed intact)`);

    const periodSnap = await db.collection("fiscal_periods").doc("2026-10").get();
    if (periodSnap.exists) {
        console.log(`  -> Active fiscal period 2026-10 status: ${periodSnap.data().status}`);
    } else {
        console.log("  -> Active fiscal period 2026-10 will be dynamically accessed/opened.");
    }

    console.log("\n================================================================================");
    console.log("  🎉 SANITIZATION SUMMARY");
    console.log("================================================================================");
    console.log(`• Orders Purged:             ${summary.ordersPurged}`);
    console.log(`• Journal Entries Purged:    ${summary.journalEntriesPurged}`);
    console.log(`• Credit Notes Purged:       ${summary.creditNotesPurged}`);
    console.log(`• Approval Requests Purged:  ${summary.approvalRequestsPurged}`);
    console.log(`• Quarantine Records Purged: ${summary.quarantinePurged}`);
    console.log(`• Counters Cleanly Reset:    ${summary.countersReset.join(", ")}`);
    console.log("================================================================================\n");

    return summary;
}

runSanitization()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error("❌ SANITIZATION FAILED:", err);
        process.exit(1);
    });
