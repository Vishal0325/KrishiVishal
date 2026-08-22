const admin = require('firebase-admin');

// Initialize with your Project ID
if (admin.apps.length === 0) {
    admin.initializeApp({
        projectId: 'krishivishal-a9ed7'
    });
}

const db = admin.firestore();

async function fixRiderAccount() {
    const phoneToFix = "+919955653413";
    const riderName = "Shankar Sahni";
    const uniqueId = Math.floor(10000 + Math.random() * 90000).toString();
    const displayId = `KV-${uniqueId}`;

    console.log(`Starting fix for ${phoneToFix}...`);

    try {
        // 1. Search for user with this phone number
        const usersRef = db.collection('users');
        const snapshot = await usersRef.where('phone', '==', phoneToFix).get();

        let userUid = null;

        if (snapshot.empty) {
            console.log("No user found with phone number in Firestore. Let's try searching by Name or just checking recent users...");
            // Fallback: If phone field is missing but name matches
            const nameSnapshot = await usersRef.where('name', '==', 'New Rider').get();
            if (!nameSnapshot.empty) {
                userUid = nameSnapshot.docs[0].id;
                console.log(`Found a 'New Rider' with UID: ${userUid}. Applying fix here.`);
            } else {
                console.error("CRITICAL: User document not found. Please ensure the rider has logged in once.");
                return;
            }
        } else {
            userUid = snapshot.docs[0].id;
        }

        // 2. Update User Document
        await db.collection('users').doc(userUid).update({
            role: 'RIDER',
            isAdmin: true,
            whitelisted: true,
            name: riderName,
            phone: phoneToFix,
            riderSerialId: uniqueId,
            riderIdDisplay: displayId,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log("✅ User document updated with Rider roles.");

        // 3. Create/Update Rider Document
        await db.collection('riders').doc(userUid).set({
            name: riderName,
            phone: phoneToFix,
            riderSerialId: uniqueId,
            riderIdDisplay: displayId,
            status: 'ACTIVE',
            online: false,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        console.log("✅ Riders collection document created.");

        console.log("\n--- SUCCESS ---");
        console.log(`Rider ID Assigned: ${displayId}`);
        console.log("Now ask the rider to RE-LOG or REFRESH the app.");

    } catch (e) {
        console.error("Error during fix:", e.message);
    }
}

fixRiderAccount();
