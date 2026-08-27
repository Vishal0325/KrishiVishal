const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { db, admin } = require("../core/admin");

const REGION = 'asia-south1';

/**
 * processOutbox: Triggered when a new event is added to the outbox.
 */
exports.processOutbox = onDocumentCreated({ document: "outbox/{eventId}", region: REGION }, async (event) => {
    const snap = event.data;
    if (!snap) return null;
    const item = snap.data();
    const eventId = event.params.eventId;

    if (item.status !== "PENDING") return null;

    try {
        console.log(`Processing outbox event: ${item.type} (${eventId})`);

        switch (item.type) {
            case "ORDER_CREATED":
                await admin.messaging().send({
                    notification: {
                        title: "New Order",
                        body: `Order #${item.payload.orderId.substring(0, 8)} has been placed.`,
                    },
                    topic: "admin_alerts",
                });
                break;
            case "PAYMENT_CAPTURED":
                await admin.messaging().send({
                    notification: {
                        title: "Payment Received",
                        body: `Payment for Order #${item.payload.orderId.substring(0, 8)} is successful.`,
                    },
                    token: item.payload.fcmToken,
                });
                break;
            default:
                console.warn(`Unknown event type: ${item.type}`);
        }

        return snap.ref.update({
            status: "COMPLETED",
            processedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    } catch (error) {
        console.error(`Error processing outbox event ${eventId}:`, error);
        const retryCount = (item.retryCount || 0) + 1;
        if (retryCount >= 5) {
            return snap.ref.update({ status: "FAILED", error: error.message });
        }
        return snap.ref.update({ retryCount: retryCount });
    }
});

/**
 * Triggered when a new document is added to 'broadcast_notifications'.
 */
exports.sendBroadcastNotification = onDocumentCreated({ document: "broadcast_notifications/{id}", region: REGION }, async (event) => {
    const snap = event.data;
    if (!snap) return null;
    const data = snap.data();
    const title = data.title;
    const body = data.body;
    const topic = data.topic || "all";

    const message = {
        notification: {
            title: title,
            body: body,
        },
        topic: topic,
        android: {
            notification: {
                icon: "ic_home",
                color: "#2E7D32",
            },
        },
    };

    try {
        await admin.messaging().send(message);
        console.log(`Successfully sent broadcast: ${title}`);
        return snap.ref.update({ sent: true, sentAt: admin.firestore.FieldValue.serverTimestamp() });
    } catch (error) {
        console.error("Error sending broadcast:", error);
        return snap.ref.update({ error: error.message });
    }
});
