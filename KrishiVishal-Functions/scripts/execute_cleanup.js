const admin = require('firebase-admin');

const serviceAccount = require('C:\\Users\\visha\\secrets\\service-account-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'krishivishal-a9ed7'
});

const db = admin.firestore();

async function runCleanupAndBackfill() {
  console.log('====================================================');
  console.log('STARTING FIRESTORE BACKFILL & CLEANUP');
  console.log('====================================================\n');

  // STEP 1: Backfill orders missing routingStatus
  console.log('--- STEP 1: ORDERS BACKFILL ---');
  const ordersSnap = await db.collection('orders').get();
  console.log(`Fetched ${ordersSnap.size} total orders.`);

  let updatedOrdersCount = 0;
  const batch = db.batch();

  for (const doc of ordersSnap.docs) {
    const data = doc.data();
    if (!data.routingStatus) {
      console.log(`Updating order ${doc.id} with routingStatus: 'PRIMARY_HUB'`);
      batch.update(doc.ref, {
        routingStatus: 'PRIMARY_HUB',
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      updatedOrdersCount++;
    }
  }

  if (updatedOrdersCount > 0) {
    await batch.commit();
    console.log(`Successfully committed backfill for ${updatedOrdersCount} orders.`);
  } else {
    console.log('No orders required backfill.');
  }

  // STEP 2: Delete legacy test ledger records missing idempotencyKey
  console.log('\n--- STEP 2: CLEANUP LEGACY TEST LEDGER DOCS ---');
  const ledgerSnap = await db.collection('ledger').get();
  console.log(`Fetched ${ledgerSnap.size} total ledger records.`);

  let deletedLedgerCount = 0;
  const ledgerBatch = db.batch();

  for (const doc of ledgerSnap.docs) {
    const data = doc.data();
    if (!data.idempotencyKey) {
      console.log(`Marking legacy test ledger doc ${doc.id} for deletion (account: ${data.account}, refId: ${data.referenceId})`);
      ledgerBatch.delete(doc.ref);
      deletedLedgerCount++;
    } else {
      console.log(`Preserving valid ledger doc ${doc.id} (idempotencyKey: ${data.idempotencyKey})`);
    }
  }

  if (deletedLedgerCount > 0) {
    await ledgerBatch.commit();
    console.log(`Successfully deleted ${deletedLedgerCount} legacy test ledger records.`);
  } else {
    console.log('No legacy ledger records to delete.');
  }

  // STEP 3: Post-execution verification
  console.log('\n====================================================');
  console.log('RUNNING POST-EXECUTION VERIFICATION');
  console.log('====================================================\n');

  console.log('--- VERIFYING ORDERS ---');
  const postOrdersSnap = await db.collection('orders').get();
  const validRoutingStatuses = new Set(['PRIMARY_HUB', 'PINCODE_MATCH', 'NEEDS_MANUAL_ROUTING']);
  let invalidOrders = [];
  let statusSummary = {};

  postOrdersSnap.forEach(doc => {
    const data = doc.data();
    const status = data.routingStatus;
    if (!status || !validRoutingStatuses.has(status)) {
      invalidOrders.push({ id: doc.id, routingStatus: status });
    }
    statusSummary[status] = (statusSummary[status] || 0) + 1;
  });

  console.log(`Total orders in Firestore: ${postOrdersSnap.size}`);
  console.log('Routing status distribution:', statusSummary);
  const ordersAllValid = invalidOrders.length === 0;
  console.log(`Orders verification pass: ${ordersAllValid} (Invalid: ${invalidOrders.length})`);
  if (!ordersAllValid) {
    console.error('Invalid orders:', invalidOrders);
  }

  console.log('\n--- VERIFYING LEDGER ---');
  const postLedgerSnap = await db.collection('ledger').get();
  const requiredFields = ['account', 'type', 'amount', 'referenceId', 'idempotencyKey'];
  let invalidLedgerDocs = [];

  postLedgerSnap.forEach(doc => {
    const data = doc.data();
    const missing = requiredFields.filter(f => data[f] === undefined || data[f] === null);
    if (missing.length > 0) {
      invalidLedgerDocs.push({ id: doc.id, missing, data });
    }
  });

  console.log(`Total ledger records remaining in Firestore: ${postLedgerSnap.size}`);
  postLedgerSnap.forEach(doc => {
    const d = doc.data();
    console.log(` - Ledger Doc [${doc.id}]: account=${d.account}, type=${d.type}, amount=${d.amount}, refId=${d.referenceId}, key=${d.idempotencyKey}`);
  });

  const ledgerAllValid = invalidLedgerDocs.length === 0;
  console.log(`Ledger verification pass: ${ledgerAllValid} (Invalid: ${invalidLedgerDocs.length})`);
  if (!ledgerAllValid) {
    console.error('Invalid ledger docs:', invalidLedgerDocs);
  }

  console.log('\n====================================================');
  console.log('EXECUTION SUMMARY');
  console.log('====================================================');
  console.log(`Orders updated with routingStatus='PRIMARY_HUB': ${updatedOrdersCount}`);
  console.log(`Legacy test ledger documents deleted: ${deletedLedgerCount}`);
  console.log(`All orders valid: ${ordersAllValid}`);
  console.log(`All remaining ledger documents have 5 required fields: ${ledgerAllValid}`);
  console.log('====================================================\n');

  if (!ordersAllValid || !ledgerAllValid) {
    throw new Error('Verification failed!');
  }
}

runCleanupAndBackfill()
  .then(() => {
    console.log('Script completed successfully.');
    process.exit(0);
  })
  .catch(err => {
    console.error('Script failed:', err);
    process.exit(1);
  });
