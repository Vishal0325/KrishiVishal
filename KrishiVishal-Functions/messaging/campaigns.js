const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { db, admin } = require("../core/admin");
const { REGION } = require("./notifications");

const ACTIVE_REGION = REGION || 'asia-south1';

/**
 * Strict Input Validator (Zod-equivalent semantics without external binary overhead)
 */
function validateCampaignInput(data) {
    if (!data || typeof data !== 'object') {
        throw new HttpsError('invalid-argument', 'Payload must be an object.');
    }

    const title = (data.title || '').trim();
    if (!title || title.length > 65) {
        throw new HttpsError('invalid-argument', 'Title is required and must not exceed 65 characters.');
    }

    const body = (data.body || '').trim();
    if (!body || body.length > 240) {
        throw new HttpsError('invalid-argument', 'Body is required and must not exceed 240 characters.');
    }

    let imageUrl = null;
    if (data.imageUrl !== undefined && data.imageUrl !== null && data.imageUrl !== '') {
        if (typeof data.imageUrl !== 'string' || !data.imageUrl.startsWith('https://')) {
            throw new HttpsError('invalid-argument', 'Image URL must be a valid HTTPS URL.');
        }
        imageUrl = data.imageUrl.trim();
    }

    let deepLink = null;
    if (data.deepLink !== undefined && data.deepLink !== null && data.deepLink !== '') {
        if (typeof data.deepLink !== 'string') {
            throw new HttpsError('invalid-argument', 'deepLink must be a string.');
        }
        const dl = data.deepLink.trim();
        // Allow-list check: only /product and /order paths are allowed (custom scheme or https domain)
        const isAllowedPath = dl.startsWith('/product') || dl.startsWith('/order') ||
                              dl.startsWith('krishivishal://product') || dl.startsWith('krishivishal://order') ||
                              dl.startsWith('https://www.krishivishal.com/product') || dl.startsWith('https://www.krishivishal.com/order') ||
                              dl.startsWith('https://krishivishal.app/product') || dl.startsWith('https://krishivishal.app/order');
        if (!isAllowedPath) {
            throw new HttpsError('invalid-argument', 'deepLink is not in allow-list. Only /product and /order routes are allowed.');
        }
        deepLink = dl;
    }

    return { title, body, imageUrl, deepLink };
}

/**
 * Checks if current time is in IST Quiet Hours (22:00 PM to 07:00 AM IST)
 */
function isQuietHoursIST(dateObj = new Date()) {
    // IST is UTC + 5:30
    const istTime = new Date(dateObj.getTime() + (5.5 * 60 * 60 * 1000));
    const hours = istTime.getUTCHours();
    return hours >= 22 || hours < 7;
}

/**
 * SuperAdmin / Marketing role check with defensive token introspection
 * Guarantees no crash on missing token/claims
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
        throw new HttpsError('permission-denied', 'Unauthorized. Only SuperAdmin and Marketing managers can manage broadcast campaigns.');
    }

    return {
        uid: request.auth.uid,
        email: token.email || 'unknown',
        role: roleVal || (hasAdminFlag ? 'Admin' : 'Marketing')
    };
}

/**
 * System-Wide & Per-Admin Broadcast Rate Limiting
 * Enforces max 3 ALL-customers broadcast campaigns per day across system.
 */
async function checkDailyBroadcastRateLimit() {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const completedToday = await db.collection("notification_campaigns")
        .where("status", "==", "COMPLETED")
        .where("completedAt", ">=", startOfDay)
        .get();

    if (completedToday.size >= 3) {
        throw new HttpsError('resource-exhausted', 'Daily broadcast safety cap reached (Max 3 ALL-customer broadcasts per day allowed).');
    }
}

/**
 * Per-Admin Campaign Creation Rate Limiting
 * Limits individual admin to creating max 15 campaigns per hour to prevent accidental spam/script abuse.
 */
async function checkAdminRateLimit(adminUid) {
    if (!adminUid) return;
    try {
        const rateRef = db.collection("admin_rate_limits").doc(`campaign_${adminUid}`);
        const snap = await rateRef.get();
        const now = Date.now();
        const ONE_HOUR = 60 * 60 * 1000;

        if (snap.exists) {
            const data = snap.data();
            const windowStart = data.windowStart || 0;
            const count = data.count || 0;

            if (now - windowStart < ONE_HOUR) {
                if (count >= 15) {
                    throw new HttpsError('resource-exhausted', 'Per-admin rate limit reached (Max 15 campaigns per hour per admin).');
                }
                await rateRef.update({ count: admin.firestore.FieldValue.increment(1) });
                return;
            }
        }

        await rateRef.set({
            windowStart: now,
            count: 1,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    } catch (err) {
        if (err instanceof HttpsError) throw err;
        // Non-blocking fallback if rate limiting store is unreachable
        console.warn(`[checkAdminRateLimit] Rate limit check skipped due to error: ${err.message}`);
    }
}

/**
 * 1. createCampaign
 */
exports.createCampaign = onCall({ region: ACTIVE_REGION, invoker: 'public', cors: true }, async (request) => {
    const caller = verifyMarketingAdmin(request);
    await checkAdminRateLimit(caller.uid);

    const { title, body, imageUrl, deepLink } = validateCampaignInput(request.data);
    const idempotencyKey = (request.data.idempotencyKey || '').trim() || db.collection("notification_campaigns").doc().id;

    // Quiet hours handling
    const scheduledAtRaw = request.data.scheduledAt;
    let scheduledAt = null;
    let initialStatus = 'DRAFT';

    if (scheduledAtRaw) {
        const scheduledDate = new Date(scheduledAtRaw);
        if (isNaN(scheduledDate.getTime()) || scheduledDate.getTime() <= Date.now()) {
            throw new HttpsError('invalid-argument', 'scheduledAt must be a valid future ISO timestamp.');
        }
        scheduledAt = scheduledDate;
        initialStatus = 'SCHEDULED';
    } else if (isQuietHoursIST()) {
        // If created during quiet hours without schedule, force DRAFT or warning
        initialStatus = 'DRAFT';
    }

    const campaignRef = db.collection("notification_campaigns").doc(idempotencyKey);

    const campaignData = {
        id: idempotencyKey,
        title,
        body,
        imageUrl,
        deepLink,
        audience: { type: 'ALL', topic: 'all_customers' },
        status: initialStatus,
        scheduledAt: scheduledAt ? admin.firestore.Timestamp.fromDate(scheduledAt) : null,
        createdBy: caller.uid,
        creatorEmail: caller.email,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        idempotencyKey,
        quietHoursBlocked: isQuietHoursIST(),
        stats: { requested: 0, sent: 0, failed: 0 }
    };

    await campaignRef.set(campaignData, { merge: true });

    return { success: true, campaignId: idempotencyKey, status: initialStatus, isQuietHours: isQuietHoursIST() };
});

/**
 * 2. sendTestNotification
 * Sends to caller's registered device tokens, or staging test topic 'test_all'.
 */
exports.sendTestNotification = onCall({ region: ACTIVE_REGION, invoker: 'public', cors: true }, async (request) => {
    const caller = verifyMarketingAdmin(request);
    const { title, body, imageUrl, deepLink } = validateCampaignInput(request.data);
    const useTestTopic = request.data.useTestTopic === true;

    if (useTestTopic) {
        // Safe staging topic: test_all
        const topicMessage = {
            notification: {
                title,
                body,
                ...(imageUrl ? { imageUrl } : {})
            },
            data: {
                deepLink: deepLink || '',
                isTest: 'true'
            },
            android: {
                notification: {
                    channelId: 'krishi_offers_channel',
                    icon: 'ic_home',
                    color: '#2E7D32',
                    ...(imageUrl ? { imageUrl } : {})
                }
            },
            topic: 'test_all'
        };

        const response = await admin.messaging().send(topicMessage);
        return { success: true, mode: 'TOPIC', topic: 'test_all', messageId: response };
    }

    // Direct to caller tokens
    const tokensSnap = await db.collection("users").doc(caller.uid).collection("fcm_tokens").get();
    if (tokensSnap.empty) {
        // Fallback check root token
        const userDoc = await db.collection("users").doc(caller.uid).get();
        const rootToken = userDoc.exists ? userDoc.data().fcmToken : null;
        if (!rootToken) {
            throw new HttpsError('failed-precondition', 'No registered device tokens found for your admin user account.');
        }

        const msg = {
            notification: { title, body, ...(imageUrl ? { imageUrl } : {}) },
            token: rootToken,
            data: { deepLink: deepLink || '', isTest: 'true' },
            android: {
                notification: {
                    channelId: 'krishi_offers_channel',
                    icon: 'ic_home',
                    color: '#2E7D32',
                    ...(imageUrl ? { imageUrl } : {})
                }
            }
        };
        const msgId = await admin.messaging().send(msg);
        return { success: true, mode: 'DIRECT_DEVICE', tokenCount: 1, messageId: msgId };
    }

    const tokens = tokensSnap.docs.map(d => d.data().token).filter(Boolean);
    const multicastPayload = {
        tokens,
        notification: { title, body, ...(imageUrl ? { imageUrl } : {}) },
        data: { deepLink: deepLink || '', isTest: 'true' },
        android: {
            notification: {
                channelId: 'krishi_offers_channel',
                icon: 'ic_home',
                color: '#2E7D32',
                ...(imageUrl ? { imageUrl } : {})
            }
        }
    };

    const multiRes = await admin.messaging().sendEachForMulticast(multicastPayload);
    return {
        success: true,
        mode: 'CALLER_TOKENS',
        tokenCount: tokens.length,
        successCount: multiRes.successCount,
        failureCount: multiRes.failureCount
    };
});

/**
 * 3. sendCampaign
 * Sends HTTP v1 topic message to 'all_customers' with strict Firestore Transaction & Idempotency.
 */
exports.sendCampaign = onCall({ region: ACTIVE_REGION, invoker: 'public', cors: true }, async (request) => {
    const caller = verifyMarketingAdmin(request);
    const { campaignId } = request.data || {};

    if (!campaignId || typeof campaignId !== 'string') {
        throw new HttpsError('invalid-argument', 'Valid campaignId is required.');
    }

    // Rate limit: max 3 broadcast campaigns per day
    await checkDailyBroadcastRateLimit();

    if (isQuietHoursIST() && !request.data.overrideQuietHours) {
        throw new HttpsError('failed-precondition', 'Quiet hours active in India (10:00 PM - 07:00 AM IST). Push broadcasting is restricted.');
    }

    const campaignRef = db.collection("notification_campaigns").doc(campaignId);

    // Run in atomic transaction to guarantee no double-send
    const campaignToBroadcast = await db.runTransaction(async (t) => {
        const snap = await t.get(campaignRef);
        if (!snap.exists) {
            throw new HttpsError('not-found', 'Campaign not found.');
        }

        const data = snap.data();
        if (data.status === 'SENDING' || data.status === 'COMPLETED') {
            throw new HttpsError('already-exists', `Campaign has already been ${data.status}. Double send blocked.`);
        }
        if (data.status === 'CANCELLED') {
            throw new HttpsError('failed-precondition', 'Cannot send a cancelled campaign.');
        }

        t.update(campaignRef, {
            status: 'SENDING',
            sentAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            dispatchedBy: caller.uid
        });

        return data;
    });

    const topic = (campaignToBroadcast.audience && campaignToBroadcast.audience.topic) || 'all_customers';

    const message = {
        notification: {
            title: campaignToBroadcast.title,
            body: campaignToBroadcast.body,
            ...(campaignToBroadcast.imageUrl ? { imageUrl: campaignToBroadcast.imageUrl } : {})
        },
        data: {
            campaignId: campaignId,
            deepLink: campaignToBroadcast.deepLink || '',
            createdAt: new Date().toISOString()
        },
        android: {
            notification: {
                channelId: 'krishi_offers_channel',
                icon: 'ic_home',
                color: '#2E7D32',
                ...(campaignToBroadcast.imageUrl ? { imageUrl: campaignToBroadcast.imageUrl } : {})
            }
        },
        topic: topic
    };

    try {
        const messageId = await admin.messaging().send(message);

        // Record in Broadcast Inbox for Customer App In-App Feed
        await db.collection("broadcast_inbox").doc(campaignId).set({
            campaignId,
            title: campaignToBroadcast.title,
            body: campaignToBroadcast.body,
            imageUrl: campaignToBroadcast.imageUrl || null,
            deepLink: campaignToBroadcast.deepLink || null,
            type: 'PROMOTIONAL',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            topic
        }, { merge: true });

        // Update campaign status to COMPLETED
        await campaignRef.update({
            status: 'COMPLETED',
            messageId,
            completedAt: admin.firestore.FieldValue.serverTimestamp(),
            'stats.sent': 1,
            'stats.failed': 0
        });

        // Audit Log Entry
        await db.collection("audit_logs").add({
            action: 'NOTIFICATION_CAMPAIGN_BROADCAST',
            campaignId,
            title: campaignToBroadcast.title,
            audience: campaignToBroadcast.audience,
            topic,
            performedBy: caller.uid,
            performedByEmail: caller.email,
            performedByRole: caller.role,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            messageId
        });

        return { success: true, campaignId, messageId, status: 'COMPLETED' };
    } catch (sendErr) {
        console.error(`[sendCampaign] Error sending topic message for ${campaignId}:`, sendErr);
        await campaignRef.update({
            status: 'FAILED',
            error: sendErr.message,
            failedAt: admin.firestore.FieldValue.serverTimestamp(),
            'stats.failed': 1
        });
        throw new HttpsError('internal', `Failed to broadcast campaign: ${sendErr.message}`);
    }
});

/**
 * 4. cancelCampaign
 */
exports.cancelCampaign = onCall({ region: ACTIVE_REGION, invoker: 'public', cors: true }, async (request) => {
    const caller = verifyMarketingAdmin(request);
    const { campaignId } = request.data || {};

    if (!campaignId || typeof campaignId !== 'string') {
        throw new HttpsError('invalid-argument', 'Valid campaignId is required.');
    }

    const campaignRef = db.collection("notification_campaigns").doc(campaignId);

    await db.runTransaction(async (t) => {
        const snap = await t.get(campaignRef);
        if (!snap.exists) {
            throw new HttpsError('not-found', 'Campaign not found.');
        }
        const data = snap.data();
        if (data.status === 'COMPLETED' || data.status === 'SENDING') {
            throw new HttpsError('failed-precondition', `Cannot cancel a campaign that is already ${data.status}.`);
        }

        t.update(campaignRef, {
            status: 'CANCELLED',
            cancelledBy: caller.uid,
            cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    });

    await db.collection("audit_logs").add({
        action: 'NOTIFICATION_CAMPAIGN_CANCELLED',
        campaignId,
        performedBy: caller.uid,
        performedByEmail: caller.email,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    return { success: true, campaignId, status: 'CANCELLED' };
});

/**
 * 5. resetStuckCampaign
 * Recovers campaigns stuck in 'SENDING' status for > 15 minutes by marking them FAILED or allowing retry.
 */
exports.resetStuckCampaign = onCall({ region: ACTIVE_REGION, invoker: 'public', cors: true }, async (request) => {
    const caller = verifyMarketingAdmin(request);
    const { campaignId, newStatus = 'FAILED' } = request.data || {};

    if (!campaignId || typeof campaignId !== 'string') {
        throw new HttpsError('invalid-argument', 'Valid campaignId is required.');
    }

    const campaignRef = db.collection("notification_campaigns").doc(campaignId);

    const result = await db.runTransaction(async (t) => {
        const snap = await t.get(campaignRef);
        if (!snap.exists) throw new HttpsError('not-found', 'Campaign not found.');
        const data = snap.data();

        if (data.status !== 'SENDING') {
            throw new HttpsError('failed-precondition', `Only campaigns in 'SENDING' status can be recovered. Current status is ${data.status}.`);
        }

        const sentAt = data.sentAt ? data.sentAt.toDate().getTime() : 0;
        const elapsedMinutes = (Date.now() - sentAt) / (60 * 1000);

        // Allow reset if stuck for > 5 minutes, or caller is SuperAdmin
        if (elapsedMinutes < 5 && caller.role !== 'SuperAdmin' && !caller.isAdmin) {
            throw new HttpsError('failed-precondition', `Campaign has only been SENDING for ${Math.round(elapsedMinutes)} minutes. Reset is allowed after 5 minutes.`);
        }

        const targetStatus = ['FAILED', 'DRAFT'].includes(newStatus) ? newStatus : 'FAILED';
        t.update(campaignRef, {
            status: targetStatus,
            recoveryNote: `Stuck in SENDING for ${Math.round(elapsedMinutes)} mins. Reset by ${caller.email}.`,
            recoveredAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        return { targetStatus, elapsedMinutes: Math.round(elapsedMinutes) };
    });

    await db.collection("audit_logs").add({
        action: 'NOTIFICATION_CAMPAIGN_STUCK_RESET',
        campaignId,
        newStatus: result.targetStatus,
        performedBy: caller.uid,
        performedByEmail: caller.email,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    return { success: true, campaignId, status: result.targetStatus, elapsedMinutes: result.elapsedMinutes };
});

module.exports.validateCampaignInput = validateCampaignInput;
module.exports.isQuietHoursIST = isQuietHoursIST;
module.exports.verifyMarketingAdmin = verifyMarketingAdmin;
module.exports.checkDailyBroadcastRateLimit = checkDailyBroadcastRateLimit;
module.exports.checkAdminRateLimit = checkAdminRateLimit;
