const admin = require('firebase-admin');
const serviceAccount = require('C:/Users/visha/Downloads/krishivishal-a9ed7-firebase-adminsdk-fbsvc-2f631b8296.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'krishivishal-a9ed7'
});

const db = admin.firestore();

async function testConnection() {
  try {
    const cols = await db.listCollections();
    console.log('Successfully connected to Firestore! Collections:', cols.map(c => c.id));
  } catch (err) {
    console.error('Connection failed:', err.message);
  }
}

testConnection();
