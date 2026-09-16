const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const crypto = require("crypto");
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
                if (item.payload.userId) {
                    await sendNotificationToUser(
                        item.payload.userId,
                        "Order Confirmed!",
                        `Your order #${item.payload.orderId.substring(0, 8)} has been placed successfully.`,
                        { orderId: item.payload.orderId }
                    );
                }
                break;
            case "PAYMENT_CAPTURED":
                if (item.payload.userId) {
                    await sendNotificationToUser(
                        item.payload.userId,
                        "Payment Received",
                        `Payment for Order #${item.payload.orderId.substring(0, 8)} is successful.`,
                        { orderId: item.payload.orderId }
                    );
                } else if (item.payload.fcmToken) {
                    await admin.messaging().send({
                        notification: {
                            title: "Payment Received",
                            body: `Payment for Order #${item.payload.orderId.substring(0, 8)} is successful.`,
                        },
                        token: item.payload.fcmToken,
                    });
                }
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

/**
 * sendNotificationToUser: Multicast sender using users/{uid}/fcm_tokens registry.
 */
async function sendNotificationToUser(uid, title, body, customData = {}) {
    if (!uid) return;
    try {
        const tokensSnap = await db.collection("users").doc(uid).collection("fcm_tokens").get();
        if (tokensSnap.empty) return;

        const tokens = tokensSnap.docs.map(doc => doc.data().token).filter(Boolean);
        if (tokens.length === 0) return;

        const stringifiedData = {};
        for (const [key, value] of Object.entries(customData)) {
            stringifiedData[key] = String(value);
        }

        const response = await admin.messaging().sendEachForMulticast({
            tokens,
            notification: { title, body },
            data: stringifiedData,
            android: {
                notification: {
                    icon: "ic_home",
                    color: "#2E7D32"
                }
            }
        });

        // Clean up invalid or stale tokens automatically
        response.responses.forEach((resp, idx) => {
            if (!resp.success) {
                const errCode = resp.error?.code;
                if (errCode === 'messaging/invalid-registration-token' ||
                    errCode === 'messaging/registration-token-not-registered') {
                    tokensSnap.docs[idx].ref.delete().catch(() => {});
                }
            }
        });
    } catch (err) {
        console.warn(`[sendNotificationToUser] Failed to send push to uid ${uid}:`, err.message);
    }
}

/**
 * registerFcmToken: Callable endpoint to register or refresh device token in users/{uid}/fcm_tokens.
 * Inputs: { token: string, platform?: string, deviceModel?: string, appType?: "CUSTOMER" | "RIDER" | "ADMIN" }
 */
exports.registerFcmToken = onCall({ region: REGION }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User authentication required.');
    }

    const { token, platform, deviceModel, appType } = request.data || {};
    if (!token || typeof token !== 'string' || token.trim().length === 0) {
        throw new HttpsError('invalid-argument', 'Valid FCM token is required.');
    }

    const uid = request.auth.uid;
    const tokenId = crypto.createHash('sha256').update(token.trim()).digest('hex').substring(0, 32);

    try {
        await db.collection("users").doc(uid).collection("fcm_tokens").doc(tokenId).set({
            token: token.trim(),
            platform: platform || "ANDROID",
            deviceModel: deviceModel || "Unknown",
            appType: appType || "CUSTOMER",
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        return { success: true, tokenId };
    } catch (error) {
        console.error("[registerFcmToken] Error:", error);
        throw new HttpsError('internal', error.message);
    }
});

/**
 * deleteFcmToken: Callable endpoint to remove device token upon logout.
 * Inputs: { token: string }
 */
exports.deleteFcmToken = onCall({ region: REGION }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User authentication required.');
    }

    const { token } = request.data || {};
    if (!token || typeof token !== 'string') {
        throw new HttpsError('invalid-argument', 'Valid FCM token is required.');
    }

    const uid = request.auth.uid;
    const tokenId = crypto.createHash('sha256').update(token.trim()).digest('hex').substring(0, 32);

    try {
        await db.collection("users").doc(uid).collection("fcm_tokens").doc(tokenId).delete();
        return { success: true, tokenId };
    } catch (error) {
        console.error("[deleteFcmToken] Error:", error);
        throw new HttpsError('internal', error.message);
    }
});

exports.sendNotificationToUser = sendNotificationToUser;

