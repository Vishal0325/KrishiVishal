/**
 * KrishiVishal - Abandoned Cart Detection (Scheduled + Manual Trigger)
 * 
 * Scheduled: Runs every 30 minutes automatically.
 * Manual: Admin can call `runAbandonedCartScan` from admin panel to trigger immediately.
 * 
 * Scans all users' Firestore cart subcollections.
 * If a user has items in cart for > 30 minutes without placing an order,
 * their cart is flagged as "abandoned" and written to the `abandoned_carts` collection
 * so the Admin panel can show it and send WhatsApp recovery offers.
 */

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { db, admin } = require("../core/admin");
const { isAdminRequest } = require("../core/utils");

const REGION = 'asia-south1';
const ABANDONED_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Core detection logic - shared between scheduled and manual trigger
 */
async function runDetection() {
    const now = Date.now();
    const thresholdTime = now - ABANDONED_THRESHOLD_MS;
    console.log(`[AbandonedCarts] Running detection. Threshold: items older than ${new Date(thresholdTime).toISOString()}`);

    const usersSnap = await db.collection("users").get();
    let processedCount = 0;
    let newAbandonedCount = 0;
    let updatedCount = 0;
    let skippedConverted = 0;

    for (const userDoc of usersSnap.docs) {
        try {
            const userId = userDoc.id;
            const userData = userDoc.data();

            // Skip rider/seller users - but allow ADMIN for testing
            const role = (userData.role || 'CUSTOMER').toUpperCase();
            if (['RIDER', 'SELLER'].includes(role)) continue;

            // Read user's cart subcollection
            const cartSnap = await db.collection("users").doc(userId).collection("cart").get();
            if (cartSnap.empty) continue;

            // Check if any cart item is older than threshold
            const cartItems = cartSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            
            // Find the NEWEST item timestamp in the cart
            const newestTimestamp = Math.max(
                ...cartItems.map(item => {
                    if (item.timestamp) return Number(item.timestamp);
                    if (item.createdAt && item.createdAt.toDate) return item.createdAt.toDate().getTime();
                    return now; // If no timestamp, treat as fresh
                })
            );

            // Skip if the newest item in cart is still fresh (< 5 min old)
            if (newestTimestamp > thresholdTime) continue;

            // Check if user has placed an order after the latest cart item was added
            const recentOrderSnap = await db.collection("orders")
                .where("userId", "==", userId)
                .orderBy("createdAt", "desc")
                .limit(1)
                .get();

            if (!recentOrderSnap.empty) {
                const lastOrder = recentOrderSnap.docs[0].data();
                const lastOrderTime = lastOrder.createdAt?.toDate?.()?.getTime() || 0;
                // If they placed an order AFTER adding the latest item, they converted.
                if (lastOrderTime > newestTimestamp) {
                    skippedConverted++;
                    continue;
                }
            }

            // Check if we already have an active abandoned_cart entry for this user
            const existingSnap = await db.collection("abandoned_carts")
                .where("userId", "==", userId)
                .get();
                
            const activeCarts = existingSnap.docs.filter(d => d.data().status !== "RECOVERED");

            if (activeCarts.length > 0) {
                // Update existing entry with latest cart data
                const existingDoc = activeCarts[0];
                await existingDoc.ref.update({
                    items: cartItems.map(item => ({
                        productId: item.productId || item.product_id || '',
                        name: item.productName || item.name || 'Product',
                        quantity: item.quantity || 1,
                        variantId: item.variantId || item.variant_id || null,
                        price: item.price || 0
                    })),
                    cartValue: cartItems.reduce((sum, item) => sum + ((item.price || 0) * (item.quantity || 1)), 0),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    itemCount: cartItems.length
                });
                updatedCount++;
                processedCount++;
                continue;
            }

        // Enrich cart items with product names & prices from products collection
        const enrichedItems = [];
        let totalCartValue = 0;

        for (const item of cartItems) {
            const productId = item.productId || item.product_id || '';
            let productName = 'Unknown Product';
            let productPrice = 0;
            let variantLabel = '';

            if (productId) {
                try {
                    const productSnap = await db.collection("products").doc(productId).get();
                    if (productSnap.exists) {
                        const pData = productSnap.data();
                        productName = pData.name || 'Product';
                        productPrice = pData.discountedPrice || pData.basePrice || 0;

                        // Try to get variant info
                        const vId = item.variantId || item.variant_id;
                        if (vId && pData.variants) {
                            const variant = (pData.variants || []).find(v => v.id === vId);
                            if (variant) {
                                productPrice = variant.discountedPrice || variant.price || productPrice;
                                variantLabel = variant.label || variant.size || '';
                            }
                        }
                    }
                } catch (e) {
                    console.warn(`[AbandonedCarts] Could not fetch product ${productId}:`, e.message);
                }
            }

            const itemTotal = productPrice * (item.quantity || 1);
            totalCartValue += itemTotal;

            enrichedItems.push({
                productId,
                name: productName,
                quantity: item.quantity || 1,
                price: productPrice,
                variantId: item.variantId || item.variant_id || null,
                variantLabel: variantLabel || null
            });
        }

        // Extract user address info
        const addressSnap = await db.collection("users").doc(userId).collection("addresses").limit(1).get();
        let village = userData.location || 'Bihar';
        let pincode = '';
        if (!addressSnap.empty) {
            const addr = addressSnap.docs[0].data();
            village = addr.village || addr.district || addr.city || village;
            pincode = addr.pincode || addr.zipCode || '';
        }

        // Calculate how long ago cart was abandoned
        const abandonedMinutesAgo = Math.round((now - oldestTimestamp) / (60 * 1000));

        // Create abandoned_carts document
        await db.collection("abandoned_carts").add({
            userId: userId,
            customerName: userData.name || 'Farmer',
            phone: userData.phone || '',
            village: village,
            pincode: pincode,
            items: enrichedItems,
            itemCount: enrichedItems.length,
            cartValue: totalCartValue,
            status: "PENDING",
            remindersSent: 0,
            abandonedMinutesAgo: abandonedMinutesAgo,
            cartCreatedAt: admin.firestore.Timestamp.fromMillis(oldestTimestamp),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        newAbandonedCount++;
        processedCount++;
        
        } catch (err) {
            console.error(`[AbandonedCarts] Error processing user ${userDoc.id}:`, err);
        }
    }

    const summary = {
        processedCount,
        newAbandonedCount,
        updatedCount,
        skippedConverted,
        totalUsersScanned: usersSnap.docs.length
    };

    console.log(`[AbandonedCarts] Done.`, JSON.stringify(summary));
    return summary;
}

/**
 * Scheduled function: Detect Abandoned Carts (auto every 30 min)
 */
exports.detectAbandonedCarts = onSchedule({ schedule: "every 30 minutes", region: REGION }, async (event) => {
    try {
        await runDetection();
    } catch (error) {
        console.error("[AbandonedCarts] Scheduled run fatal error:", error);
    }
    return null;
});

/**
 * Manual trigger: Admin can call this to scan immediately (e.g., first time setup)
 */
exports.runAbandonedCartScan = onCall({ region: REGION }, async (request) => {
    if (!(await isAdminRequest({ auth: request.auth }))) {
        throw new HttpsError('permission-denied', 'Admin only.');
    }

    try {
        const result = await runDetection();
        return { success: true, ...result };
    } catch (error) {
        console.error("[AbandonedCarts] Manual run error:", error);
        throw new HttpsError('internal', 'Scan failed: ' + error.message);
    }
});
