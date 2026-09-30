const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require('C:\\Users\\visha\\secrets\\service-account-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'krishivishal-a9ed7'
});

const db = admin.firestore();

async function inspect() {
  console.log('--- INSPECTING ORDERS ---');
  const ordersSnap = await db.collection('orders').get();
  console.log(`Total orders found: ${ordersSnap.size}`);
  
  let ordersWithoutRouting = [];
  let ordersWithRouting = {};

  ordersSnap.forEach(doc => {
    const data = doc.data();
    if (!data.routingStatus) {
      ordersWithoutRouting.push({ id: doc.id, orderNumber: data.orderNumber || data.id });
    } else {
      ordersWithRouting[data.routingStatus] = (ordersWithRouting[data.routingStatus] || 0) + 1;
    }
  });

  console.log('Orders with routingStatus:', ordersWithRouting);
  console.log(`Orders missing routingStatus: ${ordersWithoutRouting.length}`);
  ordersWithoutRouting.forEach(o => console.log(` - Order ID: ${o.id}, Number: ${o.orderNumber}`));

  console.log('\n--- INSPECTING LEDGER ---');
  const ledgerSnap = await db.collection('ledger').get();
  console.log(`Total ledger entries found: ${ledgerSnap.size}`);

  const requiredFields = ['account', 'type', 'amount', 'referenceId', 'idempotencyKey'];
  let testDocsToDelete = [];
  let validDocs = [];
  let incompleteDocs = [];

  ledgerSnap.forEach(doc => {
    const data = doc.data();
    const missing = requiredFields.filter(f => data[f] === undefined || data[f] === null);
    if (!data.idempotencyKey) {
      testDocsToDelete.push({ id: doc.id, data });
    } else if (missing.length > 0) {
      incompleteDocs.push({ id: doc.id, missing, data });
    } else {
      validDocs.push({ id: doc.id, key: data.idempotencyKey });
    }
  });

  console.log(`Ledger docs missing idempotencyKey (candidates for deletion): ${testDocsToDelete.length}`);
  testDocsToDelete.forEach(d => {
    console.log(` - Doc ID: ${d.id}, account: ${d.data.account}, type: ${d.data.type}, amount: ${d.data.amount}, refId: ${d.data.referenceId}`);
  });

  console.log(`Ledger docs with idempotencyKey: ${validDocs.length}`);
  validDocs.forEach(d => console.log(` - Valid Doc ID: ${d.id}, key: ${d.key}`));

  if (incompleteDocs.length > 0) {
    console.log(`Ledger docs with idempotencyKey but missing other fields: ${incompleteDocs.length}`);
    incompleteDocs.forEach(d => console.log(` - Incomplete Doc ID: ${d.id}, missing: ${d.missing.join(', ')}`));
  }
}

inspect().then(() => {
  console.log('\nInspection complete.');
  process.exit(0);
}).catch(err => {
  console.error('Inspection failed:', err);
  process.exit(1);
});
