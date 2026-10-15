const { onSchedule } = require("firebase-functions/v2/scheduler");
const { db, admin } = require("../core/admin");
const crypto = require("crypto");

const REGION = 'asia-south1';

/**
 * Scheduled function to monitor Order SLAs.
 */
exports.monitorOrderSLA = onSchedule({ schedule: "every 30 minutes", region: REGION }, async (event) => {
    const now = admin.firestore.Timestamp.now();
    const twoHoursAgo = new Date(now.toDate().getTime() - 2 * 60 * 60 * 1000);
    const oneHourAgo = new Date(now.toDate().getTime() - 1 * 60 * 60 * 1000);

    const escalationsRef = db.collection("escalations");

    try {
        const delayedPacking = await db.collection("orders")
            .where("status", "in", ["PLACED", "CONFIRMED"])
            .where("createdAt", "<", twoHoursAgo)
            .limit(50)
            .get();

        const delayedPickup = await db.collection("orders")
            .where("status", "==", "ASSIGNED")
            .where("updatedAt", "<", oneHourAgo)
            .limit(50)
            .get();

        const candidates = [
            ...delayedPacking.docs.map(doc => ({
                doc,
                type: "DELAYED_PACKING",
                message: `Order #${doc.id.substring(0, 8)} delayed in packing (> 2h)`,
                severity: "HIGH"
            })),
            ...delayedPickup.docs.map(doc => ({
                doc,
                type: "DELAYED_PICKUP",
                message: `Order #${doc.id.substring(0, 8)} assigned but not picked up (> 1h)`,
                severity: "MEDIUM"
            }))
        ];
        const createdFlags = await Promise.all(candidates.map(async ({ doc, type, message, severity }) => {
            const id = crypto.createHash('sha256').update(`${doc.id}:${type}`).digest('hex');
            const escalationRef = escalationsRef.doc(id);
            return db.runTransaction(async (transaction) => {
                const prior = await transaction.get(escalationRef);
                if (prior.exists) return false;
                transaction.create(escalationRef, {
                    orderId: doc.id,
                    type,
                    message,
                    severity,
                    status: "OPEN",
                    timestamp: admin.firestore.FieldValue.serverTimestamp()
                });
                return true;
            });
        }));
        const newlyCreated = createdFlags.filter(Boolean).length;

        if (newlyCreated > 0) {
            console.log(`Logged ${newlyCreated} new escalations.`);
            const adminMessage = {
                notification: {
                    title: "SLA Alert",
                    body: `There are ${newlyCreated} delayed orders requiring attention.`,
                },
                topic: "admin_alerts",
            };
            await admin.messaging().send(adminMessage);
        }

        return { created: newlyCreated };
    } catch (error) {
        console.error("Error monitoring SLA:", error);
        throw error;
    }
});
