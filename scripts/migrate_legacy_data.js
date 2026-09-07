const admin = require('firebase-admin');

// IMPORTANT: Initialize with your service account credentials when running locally
// const serviceAccount = require('./serviceAccountKey.json');
// admin.initializeApp({
//   credential: admin.credential.cert(serviceAccount)
// });

// Assuming this runs in an environment where admin is already initialized (e.g. cloud shell)
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();
const DEFAULT_HUB = 'WH-PURNEA-01';

async function migrateLegacyOrders() {
  console.log('--- Starting Legacy Orders Migration ---');
  let count = 0;
  
  // Use pagination if DB is large, this is a basic script
  const ordersSnapshot = await db.collection('orders').get();
  
  const batch = db.batch();
  let operations = 0;

  for (const doc of ordersSnapshot.docs) {
    const data = doc.data();
    // If order doesn't have a warehouse assigned, default it to Purnea
    if (!data.fulfillmentWarehouseId) {
      batch.update(doc.ref, {
        fulfillmentWarehouseId: DEFAULT_HUB,
        fulfillmentAssignmentType: 'MIGRATION',
        fulfillmentAssignedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      operations++;
      count++;
      
      if (operations >= 400) {
        await batch.commit();
        console.log(`Committed ${operations} updates...`);
        operations = 0;
      }
    }
  }

  if (operations > 0) {
    await batch.commit();
  }
  
  console.log(`--- Migration Complete: Updated ${count} Orders ---`);
}

async function migrateLegacyInventory() {
    console.log('--- Starting Legacy Inventory Migration ---');
    // For every product, we need to create a warehouse_inventory document for Purnea
    const productsSnapshot = await db.collection('products').get();
    
    const batch = db.batch();
    let operations = 0;
    let count = 0;
  
    for (const doc of productsSnapshot.docs) {
      const data = doc.data();
      const stock = data.stock || 0;
      const skuCode = doc.id;
      const batchNumber = 'LEGACY-BATCH'; // Default batch
  
      const inventoryId = `${DEFAULT_HUB}_${skuCode}_${batchNumber}`;
      const inventoryRef = db.collection('warehouse_inventory').doc(inventoryId);
      
      const invDoc = await inventoryRef.get();
      if (!invDoc.exists) {
        batch.set(inventoryRef, {
            warehouseId: DEFAULT_HUB,
            skuId: skuCode,
            batchId: batchNumber,
            availableQty: stock,
            reservedQty: 0,
            transferReservedQty: 0,
            damagedQty: 0,
            expiredQty: 0,
            unitCost: data.costPrice || 0,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            lastMovementAt: admin.firestore.FieldValue.serverTimestamp(),
            migratedFromLegacy: true
        });
        operations++;
        count++;
        
        if (operations >= 400) {
          await batch.commit();
          console.log(`Committed ${operations} inventory records...`);
          operations = 0;
        }
      }
    }
  
    if (operations > 0) {
      await batch.commit();
    }
    
    console.log(`--- Migration Complete: Created ${count} Inventory Records ---`);
}

async function run() {
  try {
    await migrateLegacyOrders();
    await migrateLegacyInventory();
    console.log('All migrations completed successfully.');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// run(); // Uncomment to execute
