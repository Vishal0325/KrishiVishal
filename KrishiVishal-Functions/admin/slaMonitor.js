const { onSchedule } = require("firebase-functions/v2/scheduler");
const { db, admin } = require("../core/admin");

const REGION = 'asia-south1';

/**
 * Scheduled function to monitor Order SLAs.
 */
exports.monitorOrderSLA = onSchedule({ schedule: "every 30 minutes", region: REGION }, async (event) => {
    const now = admin.firestore.Timestamp.now();
    const twoHoursAgo = new Date(now.toDate().getTime() - 2 * 60 * 60 * 1000);
    const oneHourAgo = new Date(now.toDate().getTime() - 1 * 60 * 60 * 1000);

    const batch = db.batch();
    const escalationsRef = db.collection("escalations");

    try {
        const delayedPacking = await db.collection("orders")
            .where("status", "in", ["PLACED", "CONFIRMED"])
            .where("createdAt", "<", twoHoursAgo)
            .limit(50)
            .get();

        delayedPacking.forEach(doc => {
            const escRef = escalationsRef.doc();
            batch.set(escRef, {
                orderId: doc.id,
                type: "DELAYED_PACKING",
                message: `Order #${doc.id.substring(0, 8)} delayed in packing (> 2h)`,
                severity: "HIGH",
                status: "OPEN",
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
        });

        const delayedPickup = await db.collection("orders")
            .where("status", "==", "ASSIGNED")
            .where("updatedAt", "<", oneHourAgo)
            .limit(50)
            .get();

        delayedPickup.forEach(doc => {
            const escRef = escalationsRef.doc();
            batch.set(escRef, {
                orderId: doc.id,
                type: "DELAYED_PICKUP",
                message: `Order #${doc.id.substring(0, 8)} assigned but not picked up (> 1h)`,
                severity: "MEDIUM",
                status: "OPEN",
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
        });

        await batch.commit();

        if (delayedPacking.size > 0 || delayedPickup.size > 0) {
            console.log(`Logged ${delayedPacking.size + delayedPickup.size} new escalations.`);
            const adminMessage = {
                notification: {
                    title: "SLA Alert",
                    body: `There are ${delayedPacking.size + delayedPickup.size} delayed orders requiring attention.`,
                },
                topic: "admin_alerts",
            };
            await admin.messaging().send(adminMessage);
        }

        return null;
    } catch (error) {
        console.error("Error monitoring SLA:", error);
        return null;
    }
});
