const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = 'C:\\Users\\visha\\secrets\\service-account-key.json';

const serviceAccount = require(path);
const app = initializeApp({
  credential: cert(serviceAccount)
});
const db = getFirestore(app);

const warehousePincodes = {
  'HUB-SAM-001': ["848101", "848102", "848103", "848104", "848105", "848106", "848107", "848108", "848109", "848110"],
  'REG-RAH-002': ["848117", "848118", "848119", "848120"],
  'REG-KHA-003': ["848114", "848115", "848116"],
  'REG-TAJ-004': ["848130", "848131", "848132"]
};

async function run() {
  console.log('--- Inspecting existing warehouses ---');
  const snapshot = await db.collection('warehouses').get();
  console.log(`Found ${snapshot.size} warehouse documents:`);
  snapshot.forEach(doc => {
    console.log(`ID: ${doc.id} =>`, JSON.stringify(doc.data()));
  });

  console.log('\n--- Updating warehouse pincodes ---');
  for (const [id, pincodes] of Object.entries(warehousePincodes)) {
    const docRef = db.collection('warehouses').doc(id);
    const docSnap = await docRef.get();
    if (docSnap.exists) {
      await docRef.update({ pincodes });
      console.log(`Updated existing document ${id} with pincodes:`, pincodes);
    } else {
      await docRef.set({ pincodes }, { merge: true });
      console.log(`Created/merged document ${id} with pincodes:`, pincodes);
    }
  }

  console.log('\n--- Verifying updated warehouses ---');
  for (const id of Object.keys(warehousePincodes)) {
    const docSnap = await db.collection('warehouses').doc(id).get();
    if (docSnap.exists) {
      console.log(`Verified ${id}:`, JSON.stringify(docSnap.data()));
    } else {
      console.error(`ERROR: Document ${id} does not exist!`);
    }
  }
}

run()
  .then(() => {
    console.log('\n✅ Warehouse pincodes update completed successfully.');
    process.exit(0);
  })
  .catch(err => {
    console.error('❌ Error updating warehouse pincodes:', err);
    process.exit(1);
  });
