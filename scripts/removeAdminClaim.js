const admin = require('firebase-admin');
const path = require('path');

const serviceAccountPath = path.join(__dirname, 'service-account-key.json');

try {
  const serviceAccount = require(serviceAccountPath);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
} catch (error) {
  console.error('❌ ERROR: service-account-key.json not found!');
  process.exit(1);
}

const email = process.argv[2];

if (!email) {
  console.log('Usage: node removeAdminClaim.js <email>');
  process.exit(1);
}

async function removeAdminClaim(userEmail) {
  try {
    const user = await admin.auth().getUserByEmail(userEmail);
    console.log(`🔍 Found user: ${user.email} (UID: ${user.uid})`);

    // Remove claim by setting it to null or { admin: false }
    await admin.auth().setCustomUserClaims(user.uid, { admin: false });

    console.log('✅ SUCCESS: Admin custom claim removed.');

    const updatedUser = await admin.auth().getUser(user.uid);
    console.log('Verification (Custom Claims):', updatedUser.customClaims);

    process.exit(0);
  } catch (error) {
    console.error('❌ ERROR removing admin claim:', error.message);
    process.exit(1);
  }
}

removeAdminClaim(email);
