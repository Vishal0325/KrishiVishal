/**
 * seed_samastipur_hub.cjs
 * Seeds or updates the primary Samastipur Pilot Central Hub in Firestore.
 */
const admin = require("firebase-admin");

if (!admin.apps.length) {
    admin.initializeApp({
        projectId: 'krishivishal-a9ed7'
    });
}

const db = admin.firestore();

async function seedSamastipurHub() {
    console.log("=== SEEDING SAMASTIPUR PILOT CENTRAL HUB ===");
    const hubId = "HUB_SAMASTIPUR";
    const hubRef = db.collection("hubs").doc(hubId);

    const hubData = {
        hubId: "HUB_SAMASTIPUR",
        hubName: "KrishiVishal Central Hub - Samastipur",
        district: "Samastipur",
        state: "Bihar",
        address: "Tajpur Road, Near Mohanpur Bridge, Samastipur, Bihar 848101",
        geoCoordinates: { latitude: 25.8633, longitude: 85.7818 },
        seedLicenseNo: "BR-SAM-SED-2024-098",
        pesticideLicenseNo: "BR-SAM-PEST-2024-441",
        fertilizerRegNo: "BR-SAM-FERT-2024-112",
        operatingRadiusKm: 35,
        isActive: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    await hubRef.set(hubData, { merge: true });
    console.log(`✅ Successfully seeded/updated hubs/${hubId}`);

    // Also ensure backward-compatible entry in 'warehouses' collection if admin queries it
    const whRef = db.collection("warehouses").doc(hubId);
    await whRef.set({
        id: hubId,
        code: "SAMASTIPUR",
        name: "KrishiVishal Central Hub - Samastipur",
        location: "Samastipur, Bihar",
        district: "Samastipur",
        isActive: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    console.log(`✅ Successfully synced warehouses/${hubId} for admin compatibility`);

    console.log("=== SEEDING COMPLETE ===");
}

seedSamastipurHub()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error("❌ Error seeding Samastipur Hub:", err);
        process.exit(1);
    });
