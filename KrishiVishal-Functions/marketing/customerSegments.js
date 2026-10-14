/**
 * KrishiVishal - Customer Segments & Automated Topic Sync
 * Handles audience segments:
 * 1. Abandoned Cart: segment_abandoned_cart
 * 2. Inactive Farmers (30+ days): segment_inactive_30d
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { db, admin } = require("../core/admin");

const ACTIVE_REGION = 'asia-south1';

/**
 * SuperAdmin / Marketing role verification
 */
function verifyMarketingAdmin(request) {
    if (!request.auth || !request.auth.uid) {
        throw new HttpsError('unauthenticated', 'User authentication required.');
    }

    const token = (request.auth && typeof request.auth.token === 'object' && request.auth.token !== null) 
        ? request.auth.token 
        : {};

    const hasAdminFlag = (('admin' in token) && token.admin === true) || 
                         (('isAdmin' in token) && token.isAdmin === true);
    
    const hasRole = ('role' in token) && typeof token.role === 'string';
    const roleVal = hasRole ? token.role : '';

    const isAuthorizedRole = ["SuperAdmin", "SUPER_ADMIN", "Marketing", "MarketingManager", "MARKETING_ADMIN", "Admin", "ADMIN"].includes(roleVal);

    if (!hasAdminFlag && !isAuthorizedRole) {
        throw new HttpsError('permission-denied', 'Unauthorized. Only SuperAdmin and Marketing managers can manage customer segments.');
    }

    return {
        uid: request.auth.uid,
        email: token.email || 'unknown',
        role: roleVal || (hasAdminFlag ? 'Admin' : 'Marketing'),
        isSuperAdmin: (('isSuperAdmin' in token) && token.isSuperAdmin === true) || ["SuperAdmin", "SUPER_ADMIN"].includes(roleVal)
    };
}

/**
 * Helper: Retrieve all valid unique FCM tokens for a list of user IDs
 */
async function fetchTokensForUsers(userIds) {
    const tokens = new Set();
    if (!userIds || userIds.length === 0) return [];

    // Query in batches of 30 for Firestore 'in' limitation
    const userBatches = [];
    for (let i = 0; i < userIds.length; i += 30) {
        userBatches.push(userIds.slice(i, i + 30));
    }

    for (const batch of userBatches) {
        // 1. Check user docs for root fcmToken
        const usersSnap = await db.collection("users")
            .where(admin.firestore.FieldPath.documentId(), 'in', batch)
            .get();

        for (const doc of usersSnap.docs) {
            const data = doc.data();
            if (data && typeof data.fcmToken === 'string' && data.fcmToken.trim().length > 10) {
                tokens.add(data.fcmToken.trim());
            }
        }

        // 2. Also check users/{uid}/fcm_tokens subcollections
        for (const uid of batch) {
            try {
                const subSnap = await db.collection("users").doc(uid).collection("fcm_tokens").get();
                for (const subDoc of subSnap.docs) {
                    const tokenVal = subDoc.data() && subDoc.data().token;
                    if (typeof tokenVal === 'string' && tokenVal.trim().length > 10) {
                        tokens.add(tokenVal.trim());
                    }
                }
            } catch (err) {
                // Ignore per-user subcollection read error
            }
        }
    }

    return Array.from(tokens);
}

/**
 * Helper: Chunk array into slices of max size (FCM allows max 1000 tokens per subscribe/unsubscribe call)
 */
function chunkArray(arr, size = 1000) {
    const chunks = [];
    for (let i = 0; i < arr.length; i += size) {
        chunks.push(arr.slice(i, i + size));
    }
    return chunks;
}

/**
 * Core Segment Sync Engine
 * Synchronizes FCM topic memberships for:
 * - segment_abandoned_cart
 * - segment_inactive_30d
 */
async function syncCustomerSegmentsCore(customDb = null, customMessaging = null) {
    const firestore = customDb || db;
    const messaging = customMessaging || admin.messaging();

    const result = {
        abandonedCart: { subscribed: 0, unsubscribed: 0 },
        inactive30d: { subscribed: 0, unsubscribed: 0 },
        errors: []
    };

    // -------------------------------------------------------------
    // 1. Abandoned Cart Segment (topic: segment_abandoned_cart)
    // -------------------------------------------------------------
    try {
        // Active abandoned carts
        const pendingSnap = await firestore.collection("abandoned_carts")
            .where("status", "==", "PENDING")
            .get();

        const pendingUserIds = Array.from(new Set(
            pendingSnap.docs.map(d => d.data() && d.data().userId).filter(Boolean)
        ));

        const pendingTokens = await fetchTokensForUsers(pendingUserIds);
        if (pendingTokens.length > 0 && messaging && messaging.subscribeToTopic) {
            const chunks = chunkArray(pendingTokens, 1000);
            for (const chunk of chunks) {
                const res = await messaging.subscribeToTopic(chunk, 'segment_abandoned_cart');
                result.abandonedCart.subscribed += (res?.successCount ?? chunk.length);
            }
        }

        // Recovered carts — unsubscribe so they don't get recovery pushes
        const recoveredSnap = await firestore.collection("abandoned_carts")
            .where("status", "==", "RECOVERED")
            .limit(100)
            .get();

        const recoveredUserIds = Array.from(new Set(
            recoveredSnap.docs.map(d => d.data() && d.data().userId).filter(Boolean)
        ));

        // Filter out users who still have another pending cart
        const filteredRecoveredIds = recoveredUserIds.filter(id => !pendingUserIds.includes(id));
        const recoveredTokens = await fetchTokensForUsers(filteredRecoveredIds);

        if (recoveredTokens.length > 0 && messaging && messaging.unsubscribeFromTopic) {
            const chunks = chunkArray(recoveredTokens, 1000);
            for (const chunk of chunks) {
                const res = await messaging.unsubscribeFromTopic(chunk, 'segment_abandoned_cart');
                result.abandonedCart.unsubscribed += (res?.successCount ?? chunk.length);
            }
        }
    } catch (e) {
        console.error("[customerSegments] Error syncing abandoned cart segment:", e);
        result.errors.push(`Abandoned cart sync error: ${e.message}`);
    }

    // -------------------------------------------------------------
    // 2. Inactive Farmers Segment (topic: segment_inactive_30d)
    // -------------------------------------------------------------
    try {
        const now = Date.now();
        const thirtyDaysAgo = new Date(now - (30 * 24 * 60 * 60 * 1000));
        const thirtyDaysAgoTimestamp = admin.firestore.Timestamp.fromDate(thirtyDaysAgo);

        // Fetch users who haven't been active in 30 days
        const inactiveUsersSnap = await firestore.collection("users")
            .where("lastActiveAt", "<=", thirtyDaysAgoTimestamp)
            .limit(1000)
            .get();

        const inactiveUserIds = inactiveUsersSnap.docs.map(d => d.id);
        const inactiveTokens = await fetchTokensForUsers(inactiveUserIds);

        if (inactiveTokens.length > 0 && messaging && messaging.subscribeToTopic) {
            const chunks = chunkArray(inactiveTokens, 1000);
            for (const chunk of chunks) {
                const res = await messaging.subscribeToTopic(chunk, 'segment_inactive_30d');
                result.inactive30d.subscribed += (res?.successCount ?? chunk.length);
            }
        }

        // Active users in last 30 days — unsubscribe from inactive topic
        const activeUsersSnap = await firestore.collection("users")
            .where("lastActiveAt", ">", thirtyDaysAgoTimestamp)
            .limit(1000)
            .get();

        const activeUserIds = activeUsersSnap.docs.map(d => d.id);
        const activeTokens = await fetchTokensForUsers(activeUserIds);

        if (activeTokens.length > 0 && messaging && messaging.unsubscribeFromTopic) {
            const chunks = chunkArray(activeTokens, 1000);
            for (const chunk of chunks) {
                const res = await messaging.unsubscribeFromTopic(chunk, 'segment_inactive_30d');
                result.inactive30d.unsubscribed += (res?.successCount ?? chunk.length);
            }
        }
    } catch (e) {
        console.error("[customerSegments] Error syncing inactive farmers segment:", e);
        result.errors.push(`Inactive farmers sync error: ${e.message}`);
    }

    return result;
}

/**
 * 1. getSegmentCounts
 * Returns live customer segment counts for the Admin Notifications Hub
 */
exports.getSegmentCounts = onCall({ region: ACTIVE_REGION, invoker: 'public', cors: true }, async (request) => {
    verifyMarketingAdmin(request);

    let abandonedCartCount = 0;
    let inactive30dCount = 0;

    // 1. Abandoned Cart Count
    try {
        const snap = await db.collection("abandoned_carts")
            .where("status", "==", "PENDING")
            .count()
            .get();
        abandonedCartCount = snap.data().count;
    } catch (e) {
        console.warn("[getSegmentCounts] Error fetching abandoned_carts count:", e.message);
        // Fallback: regular query size
        const fallbackSnap = await db.collection("abandoned_carts")
            .where("status", "==", "PENDING")
            .limit(500)
            .get();
        abandonedCartCount = fallbackSnap.size;
    }

    // 2. Inactive Farmers (30d) Count
    try {
        const thirtyDaysAgo = new Date(Date.now() - (30 * 24 * 60 * 60 * 1000));
        const snap = await db.collection("users")
            .where("lastActiveAt", "<=", admin.firestore.Timestamp.fromDate(thirtyDaysAgo))
            .count()
            .get();
        inactive30dCount = snap.data().count;
    } catch (e) {
        console.warn("[getSegmentCounts] Error fetching inactive users count with index:", e.message);
        // Fallback: check users collection
        try {
            const fallbackUsers = await db.collection("users").limit(100).get();
            const thirtyDaysAgoMs = Date.now() - (30 * 24 * 60 * 60 * 1000);
            let count = 0;
            fallbackUsers.forEach(doc => {
                const d = doc.data();
                const activeTime = d.lastActiveAt?.toMillis?.() || d.updatedAt?.toMillis?.() || d.createdAt?.toMillis?.() || 0;
                if (activeTime > 0 && activeTime <= thirtyDaysAgoMs) {
                    count++;
                }
            });
            inactive30dCount = count;
        } catch (innerErr) {
            inactive30dCount = 0;
        }
    }

    return {
        success: true,
        abandonedCartCount,
        inactive30dCount,
        segments: {
            ABANDONED_CART: {
                topic: 'segment_abandoned_cart',
                label: 'Abandoned Cart',
                count: abandonedCartCount
            },
            INACTIVE_30D: {
                topic: 'segment_inactive_30d',
                label: 'Inactive Farmers (30+ Days)',
                count: inactive30dCount
            }
        },
        timestamp: new Date().toISOString()
    };
});

/**
 * 2. syncCustomerSegmentsNow
 * Admin-triggered immediate synchronization of customer segment tokens
 */
exports.syncCustomerSegmentsNow = onCall({ region: ACTIVE_REGION, invoker: 'public', cors: true }, async (request) => {
    verifyMarketingAdmin(request);
    const result = await syncCustomerSegmentsCore();
    return {
        success: true,
        ...result,
        timestamp: new Date().toISOString()
    };
});

/**
 * 3. syncCustomerSegmentsScheduled
 * Daily automated background sync of segment tokens (runs at 04:00 AM IST)
 */
exports.syncCustomerSegmentsScheduled = onSchedule({
    schedule: "0 4 * * *",
    region: ACTIVE_REGION,
    timeZone: "Asia/Kolkata"
}, async (event) => {
    console.log("[customerSegmentsScheduled] Starting automated daily segment sync at 04:00 AM IST...");
    try {
        const result = await syncCustomerSegmentsCore();
        console.log("[customerSegmentsScheduled] Completed successfully:", JSON.stringify(result));
    } catch (err) {
        console.error("[customerSegmentsScheduled] Fatal error during scheduled sync:", err);
    }
    return null;
});

// Export helper for integration tests
exports.syncCustomerSegmentsCore = syncCustomerSegmentsCore;
exports.fetchTokensForUsers = fetchTokensForUsers;
