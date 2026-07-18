const { initializeApp, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const path = require('path');

// 1. Path to your key
const serviceAccountPath = path.join(__dirname, 'service-account-key.json');

let authInstance;

try {
  // Check if file exists first
  const serviceAccount = require(serviceAccountPath);

  // Use Modular API for Firebase Admin v13/v14
  const app = initializeApp({
    credential: cert(serviceAccount)
  });

  authInstance = getAuth(app);
  console.log('✅ Firebase Admin Initialized (Modular API)');
} catch (error) {
  console.error('❌ ERROR loading key:', error.message);
  console.error('Try checking if service-account-key.json is valid JSON.');
  process.exit(1);
}

const email = process.argv[2];
if (!email) {
  console.log('Usage: node setAdminClaim.js <email>');
  process.exit(1);
}

async function setAdminClaim(userEmail) {
  try {
    // 2. Find user
    const user = await authInstance.getUserByEmail(userEmail);
    console.log(`🔍 Found user: ${user.email} (UID: ${user.uid})`);

    // 3. Set claim
    await authInstance.setCustomUserClaims(user.uid, { admin: true });

    console.log('✅ SUCCESS: Admin custom claim set successfully.');

    // 4. Verify
    const updatedUser = await authInstance.getUser(user.uid);
    console.log('Verification (Custom Claims):', updatedUser.customClaims);

    console.log('\n⚠️  ACTION REQUIRED: User must Log Out and Log In to the Admin Panel to refresh the token.');

    process.exit(0);
  } catch (error) {
    if (error.code === 'auth/user-not-found') {
      console.error(`❌ ERROR: No user found with email ${userEmail}. Check Firebase Console Auth.`);
    } else {
      console.error('❌ ERROR:', error.message);
    }
    process.exit(1);
  }
}

setAdminClaim(email);
