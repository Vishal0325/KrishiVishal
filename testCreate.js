import { initializeApp } from "firebase/app";
import { getAuth, signInWithCustomToken } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import * as admin from 'firebase-admin';

// Initialize Admin to get custom token
const serviceAccount = require('../../KrishiVishal/scripts/service-account-key.json');
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || 'AIzaSyDVCaQ1Q2LQ8SZk3pxDjFkjTOwrQzqGBBg',
  authDomain: "krishivishal-a9ed7.firebaseapp.com",
  projectId: "krishivishal-a9ed7",
  storageBucket: "krishivishal-a9ed7.firebasestorage.app",
  messagingSenderId: "409780110248",
  appId: "1:409780110248:web:b21086831ccca59d31139d"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const functions = getFunctions(app, 'us-central1');
const SMOKE_EMAIL = 'smoke_test_viewer@test.com';

async function run() {
  let testUid = null;
  try {
    try {
      const existing = await admin.auth().getUserByEmail(SMOKE_EMAIL);
      await admin.auth().deleteUser(existing.uid);
    } catch(e) {}

    console.log("1. Signing in as SuperAdmin...");
    const customToken = await admin.auth().createCustomToken('GqgzP80yj9hz2ZjCqP8tP9CfeSP2');
    await signInWithCustomToken(auth, customToken);
    
    console.log("2. Calling createStaffMember...");
    const createStaff = httpsCallable(functions, 'createStaffMember');
    const result = await createStaff({
      email: SMOKE_EMAIL,
      password: 'SmokePassword123!',
      name: 'Smoke Test Viewer',
      role: 'Viewer'
    });
    
    testUid = result.data.uid || result.data.data?.uid;
    if (!testUid) {
      const ur = await admin.auth().getUserByEmail(SMOKE_EMAIL);
      testUid = ur.uid;
    }
    
    console.log(`\n3. Verifying Custom Claims for UID: ${testUid}...`);
    const user = await admin.auth().getUser(testUid);
    console.log(`   Claims assigned:`, JSON.stringify(user.customClaims, null, 2));

    const claims = user.customClaims || {};
    if (claims.isAdmin === false && claims.admin === false && claims.role === 'Viewer') {
      console.log(`\n✅ SUCCESS: Blanket claims correctly stripped!`);
    } else {
      console.log(`\n❌ FAILED: Claims are incorrect!`);
    }

  } catch(e) {
    console.error(e);
  } finally {
    if (testUid) {
      console.log(`\n4. Cleaning up...`);
      await admin.auth().deleteUser(testUid);
    }
    process.exit(0);
  }
}

run();
