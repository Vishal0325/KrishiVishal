const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { db, admin } = require("../core/admin");

const REGION = 'asia-south1';

/**
 * Triggered when an order status is updated.
 */
exports.onOrderStatusUpdate = onDocumentUpdated({ document: "orders/{orderId}", region: REGION }, async (event) => {
    const change = event.data;
    const context = { params: event.params };
    const newData = change.after.data();
    const oldData = change.before.data();

    if (!newData || !oldData || newData.status === oldData.status) return null;

    const userId = newData.userId || newData.customerId;
    if (!userId) {
        console.error("No userId or customerId found for order:", context.params.orderId);
        return null;
    }

    try {
        const userDoc = await db.collection("users").doc(userId).get();
        const fcmToken = userDoc.data()?.fcmToken;

        if (!fcmToken) {
            console.log(`No FCM token for user: ${userId}`);
            return null;
        }

        const statusLabel = newData.status.replace(/_/g, " ");
        const message = {
            notification: {
                title: `Order Update: ${statusLabel}`,
                body: `Aapka order #${context.params.orderId.substring(0, 8)} ab ${statusLabel} hai.`,
            },
            data: {
                orderId: context.params.orderId,
                status: newData.status,
                click_action: "FLUTTER_NOTIFICATION_CLICK",
            },
            token: fcmToken,
            android: {
                priority: "high",
                notification: {
                    channel_id: "order_updates",
                    color: "#2E7D32",
                },
            },
        };

        await admin.messaging().send(message);
        console.log(`Notification sent for order ${context.params.orderId} to user ${userId}`);
        return null;
    } catch (error) {
        console.error("Error sending order status notification:", error);
        return null;
    }
});

/**
 * Triggered when a new return request is created.
 */
exports.onReturnRequestCreated = onDocumentCreated({ document: "returns/{returnId}", region: REGION }, async (event) => {
    const snap = event.data;
    const context = { params: event.params };
    if (!snap) return null;

    const returnData = snap.data();
    const orderId = returnData.orderId;

    if (!orderId) return null;

    try {
        const orderDoc = await db.collection("orders").doc(orderId).get();
        if (!orderDoc.exists) {
            console.error(`Order ${orderId} not found for return ${context.params.returnId}`);
            return null;
        }

        const orderData = orderDoc.data();
        const originalRiderId = orderData.riderId;

        if (originalRiderId) {
            await snap.ref.update({
                riderId: originalRiderId,
                status: "PICKUP_SCHEDULED",
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            const riderDoc = await db.collection("riders").doc(originalRiderId).get();
            const fcmToken = riderDoc.data()?.fcmToken;

            if (fcmToken) {
                await admin.messaging().send({
                    notification: {
                        title: "New Return Pickup",
                        body: `Return pickup assigned for Order #${orderId.substring(0, 8)}`,
                    },
                    data: {
                        type: "RETURN_ASSIGNED",
                        returnId: context.params.returnId
                    },
                    token: fcmToken,
                });
            }
            console.log(`Return ${context.params.returnId} auto-assigned to Rider ${originalRiderId}`);
        } else {
            console.log(`No original rider found for Order ${orderId}. Manual assignment required.`);
        }
        return null;
    } catch (error) {
        console.error("Error in onReturnRequestCreated:", error);
        return null;
    }
});
