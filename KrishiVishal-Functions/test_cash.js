const admin = require('firebase-admin');
const fs = require('fs');

if (fs.existsSync('./serviceAccountKey.json')) {
  admin.initializeApp({
    credential: admin.credential.cert(require('./serviceAccountKey.json'))
  });
} else {
  admin.initializeApp();
}

const db = admin.firestore();

async function checkOrders() {
  try {
    const ordersSnap = await db.collection('orders').limit(1).get();
    if (!ordersSnap.empty) {
      console.log(ordersSnap.docs[0].data());
    } else {
      console.log("No orders");
    }
  } catch(e) {
    console.error(e);
  }
}

checkOrders();
