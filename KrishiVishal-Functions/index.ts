import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

admin.initializeApp();

const db = admin.firestore();

/**
 * Triggered when a new Emergency SOS alert is created.
 * Sends a notification to the dispatch team topic.
 */
export const onEmergencyAlertCreated = functions.firestore
    .document("emergency_alerts/{alertId}")
    .onCreate(async (snapshot, context) => {
        const data = snapshot.data();
        if (!data) return;

        const riderName = data.riderName || "A Rider";
        const location = data.location;
        const mapsUrl = `https://www.google.com/maps?q=${location.latitude},${location.longitude}`;

        const payload = {
            notification: {
                title: "🚨 EMERGENCY SOS 🚨",
                body: `${riderName} has triggered an SOS! Click to see location.`,
                clickAction: "FLUTTER_NOTIFICATION_CLICK"
            },
            data: {
                riderId: data.riderId,
                locationUrl: mapsUrl,
                alertId: context.params.alertId
            },
            topic: "dispatch_team"
        };

        try {
            await admin.messaging().send(payload);
            console.log("FCM notification sent to dispatch_team");
        } catch (error) {
            console.error("Error sending FCM:", error);
        }
    });

/**
 * Syncs Firestore 'users' document to Auth Custom Claims.
 * This ensures security rules can use request.auth.token.admin
 */
export const onUserRoleUpdate = functions.firestore
    .document("users/{userId}")
    .onWrite(async (change, context) => {
        const data = change.after.exists ? change.after.data() : null;
        const userId = context.params.userId;

        if (!data || !data.isAdmin) {
            await admin.auth().setCustomUserClaims(userId, { role: null, admin: false });
            return null;
        }

        // Set custom claims: matches isAdmin() helper in firestore.rules
        await admin.auth().setCustomUserClaims(userId, {
            role: data.role || "Viewer",
            admin: true, // Used by firestore.rules
            isActive: data.isActive !== false
        });

        console.log(`Updated custom claims for user ${userId}: admin=true, role=${data.role}`);
        return null;
    });

/**
 * Automated Stock Watcher
 * Triggered when a product is updated.
 * Sends a notification/alert if stock falls below the threshold.
 */
export const onProductUpdate = functions.firestore
    .document("products/{productId}")
    .onUpdate(async (change, context) => {
        const before = change.before.data();
        const after = change.after.data();

        if (!before || !after) return null;

        // Fetch global settings for threshold and WhatsApp number
        const settingsSnap = await db.collection("settings").doc("config").get();
        const settings = settingsSnap.data();
        const threshold = settings?.lowStockThreshold || 10;
        const alertNumber = settings?.adminAlertWhatsApp;

        // Check if stock just fell below threshold
        const oldStock = before.stockQuantity || 0;
        const newStock = after.stockQuantity || 0;

        if (newStock <= threshold && oldStock > threshold) {
            console.log(`LOW STOCK ALERT: ${after.name} is down to ${newStock}`);

            if (alertNumber) {
                // Placeholder for real WhatsApp API call (e.g. Twilio)
                console.log(`Simulating WhatsApp Alert to ${alertNumber}: Item ${after.name} is low on stock (${newStock} left).`);

                // You can also send a system notification
                const payload = {
                    notification: {
                        title: "📦 LOW STOCK ALERT",
                        body: `${after.name} is low! Only ${newStock} units left.`,
                    },
                    topic: "admin_alerts"
                };
                await admin.messaging().send(payload);
            }
        }
        return null;
    });

/**
 * Simple Audit Logging for core resources
 */
export const auditProductChange = functions.firestore
    .document("products/{productId}")
    .onWrite(async (change, context) => {
        const action = !change.before.exists ? "CREATE" : !change.after.exists ? "DELETE" : "UPDATE";
        const data = change.after.exists ? change.after.data() : change.before.data();

        await db.collection("audit_logs").add({
            action: `${action}_PRODUCT`,
            resource: "Product",
            resourceId: context.params.productId,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            details: { name: data?.name }
        });
    });
