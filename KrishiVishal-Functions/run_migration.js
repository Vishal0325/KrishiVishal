const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'krishivishal-a9ed7' });

const accounts = [
  {
    uid: 'LFVaaTvaVaelYmA6HyJB9PWqzFu1', // Vikaram Kumar
    claims: { role: "HubManager", hubAccess: "SINGLE", hubId: "HUB-SAM-001", isStaff: true }
  },
  {
    uid: 'Q7pOFTToUjeOuXrgEzBGA0glDwx2', // Hub Mgr Khanpur
    claims: { hubAccess: "SINGLE", isStaff: true }
  },
  {
    uid: 'hW9REOeZXZQa7kZeRsvst8NSQ8R2', // Hub Mgr Tajpur
    claims: { hubAccess: "SINGLE", isStaff: true }
  },
  {
    uid: 'syQf3oLzq9V3mzCvic0MiaaI3HH2', // Hub Mgr Rahthuli
    claims: { hubAccess: "SINGLE", isStaff: true }
  },
  {
    email: 'sanjaysmt05@gmail.com', // Ritu
    claims: { role: "DepartmentManager", hubAccess: "SINGLE", hubId: "HUB-SAM-001", isStaff: true }
  }
];

async function runMigration() {
  console.log("Starting Claims Migration...");
  for (const acc of accounts) {
    let uid = acc.uid;
    try {
      if (!uid && acc.email) {
        const userRec = await admin.auth().getUserByEmail(acc.email);
        uid = userRec.uid;
      }
      
      const user = await admin.auth().getUser(uid);
      const currentClaims = user.customClaims || {};
      const newClaims = { ...currentClaims, ...acc.claims };
      
      console.log(`\n--- Migrating ${user.displayName || user.email || uid} ---`);
      console.log('Before:', currentClaims);
      
      await admin.auth().setCustomUserClaims(uid, newClaims);
      await admin.auth().revokeRefreshTokens(uid);
      
      const updatedUser = await admin.auth().getUser(uid);
      console.log('After:', updatedUser.customClaims);
      console.log('Tokens revoked successfully.');
    } catch (e) {
      console.error(`Error processing ${uid || acc.email}:`, e);
    }
  }
  console.log("\nMigration completed.");
}

runMigration();
