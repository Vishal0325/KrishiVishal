const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const path = require('path');

const serviceAccountPath = path.join(__dirname, 'service-account-key.json');

try {
  const serviceAccount = require(serviceAccountPath);
  const app = initializeApp({
    credential: cert(serviceAccount)
  });
  const db = getFirestore(app);
  console.log('✅ Firebase Admin Initialized');

  async function check() {
    const collections = ['products', 'categories', 'crops', 'brands', 'banners'];
    for (const col of collections) {
      const snap = await db.collection(col).get();
      console.log(`Collection "${col}": ${snap.size} documents`);
      if (snap.size > 0) {
        console.log(`  Sample from "${col}":`, snap.docs[0].data());
      }
    }
    process.exit(0);
  }
  check();
} catch (error) {
  console.error('❌ Error:', error);
  process.exit(1);
}
