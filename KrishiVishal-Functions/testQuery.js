const admin = require('firebase-admin');
const serviceAccount = require('C:/Users/visha/secrets/service-account-key.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();
db.collection('whitelisted_riders').where('phone', '==', '+919999999999').get().then(snap => {
    console.log('Docs with +919999999999:', snap.size);
    snap.forEach(d => console.log(d.id, d.data()));
    return db.collection('whitelisted_riders').where('phone', '==', '9999999999').get();
}).then(snap => {
    console.log('Docs with 9999999999:', snap.size);
    snap.forEach(d => console.log(d.id, d.data()));
    process.exit(0);
}).catch(console.error);
