const { initializeApp } = require("firebase/app");
const { getAuth, signInWithCustomToken } = require("firebase/auth");
const { getFunctions, httpsCallable } = require("firebase/functions");
const admin = require('C:\\Users\\visha\\AndroidStudioProjects_Backup\\KrishiVishal\\KrishiVishal-Functions\\node_modules\\firebase-admin');

const serviceAccount = require('C:\\Users\\visha\\AndroidStudioProjects_Backup\\KrishiVishal\\scripts\\service-account-key.json');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const firebaseConfig = {
  apiKey: 'AIzaSyDVCaQ1Q2LQ8SZk3pxDjFkjTOwrQzqGBBg',
  authDomain: "krishivishal-a9ed7.firebaseapp.com",
  projectId: "krishivishal-a9ed7",
  storageBucket: "krishivishal-a9ed7.firebasestorage.app",
  messagingSenderId: "409780110248",
  appId: "1:409780110248:web:b21086831ccca59d31139d"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

async function testRegion(regionName) {
  console.log(`\n=== Testing searchUsers on [${regionName}] ===`);
  try {
    const fnInstance = getFunctions(app, regionName);
    const searchFn = httpsCallable(fnInstance, 'searchUsers');
    const customToken = await admin.auth().createCustomToken('GqgzP80yj9hz2ZjCqP8tP9CfeSP2');
    await signInWithCustomToken(auth, customToken);

    const start = Date.now();
    const res = await searchFn({ query: '9999999999' });
    const duration = Date.now() - start;
    console.log(`[${regionName}] Success (${duration}ms)! Found ${res.data?.users?.length || 0} users.`);
    return { ok: true, duration, data: res.data };
  } catch (e) {
    console.log(`[${regionName}] Error: ${e.code || e.message}`);
    return { ok: false, error: e.message, code: e.code };
  }
}

async function run() {
  const resAsia = await testRegion('asia-south1');
  const resUS = await testRegion('us-central1');
  console.log('\n=== Summary ===');
  console.log('asia-south1:', resAsia.ok ? 'WORKING' : resAsia.error);
  console.log('us-central1:', resUS.ok ? 'WORKING' : resUS.error);
  process.exit(0);
}

run();
