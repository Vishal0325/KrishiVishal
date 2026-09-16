const admin = require("firebase-admin");

if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'krishivishal-a9ed7'
    });
}

const db = admin.firestore();

async function fixOrderAddresses() {
    console.log("Checking orders in Firestore...");
    const ordersSnap = await db.collection("orders").get();
    let updatedCount = 0;

    for (const doc of ordersSnap.docs) {
        const data = doc.data();
        if (data.address && typeof data.address === "object" && !Array.isArray(data.address)) {
            const addrObj = data.address;
            const addressString = [
                addrObj.line1,
                addrObj.line2,
                addrObj.city,
                addrObj.state,
                addrObj.pincode
            ].filter(Boolean).join(", ");

            console.log(`Fixing order ${doc.id}: converting address object to string "${addressString}"`);
            await doc.ref.update({
                address: addressString,
                structuredAddress: addrObj,
                landmark: addrObj.landmark || data.landmark || ""
            });
            updatedCount++;
        }
    }

    console.log(`Finished. Updated ${updatedCount} orders.`);
}

fixOrderAddresses().catch(console.error);
