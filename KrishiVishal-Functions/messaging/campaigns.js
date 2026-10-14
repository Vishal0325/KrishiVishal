const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const crypto = require("crypto");
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
        // Allow-list check: only /product, /order, and /cart paths are allowed (custom scheme or https domain)
        const isAllowedPath = dl.startsWith('/product') || dl.startsWith('/order') || dl.startsWith('/cart') ||
                              dl.startsWith('krishivishal://product') || dl.startsWith('krishivishal://order') || dl.startsWith('krishivishal://cart') ||
                              dl.startsWith('https://www.krishivishal.com/product') || dl.startsWith('https://www.krishivishal.com/order') || dl.startsWith('https://www.krishivishal.com/cart') ||
                              dl.startsWith('https://krishivishal.app/product') || dl.startsWith('https://krishivishal.app/order') || dl.startsWith('https://krishivishal.app/cart');
        if (!isAllowedPath) {
            throw new HttpsError('invalid-argument', 'deepLink is not in allow-list. Only /product, /order, and /cart routes are allowed.');
        }
        deepLink = dl;
    }

    let audience = { type: 'ALL', topic: 'all_customers' };
    if (data.audience && typeof data.audience === 'object') {
        const audType = (data.audience.type || 'ALL').toUpperCase();
        if (audType === 'CROP') {
            const crop = (data.audience.crop || '').trim();
            if (!crop || crop.length > 50) {
                throw new HttpsError('invalid-argument', 'Valid crop name is required for CROP audience.');
            }
            const safeCrop = crop.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
            audience = {
                type: 'CROP',
                crop,
                topic: `crop_${safeCrop}`
            };
        } else if (audType === 'PINCODE') {
            const pincode = String(data.audience.pincode || '').trim();
            if (!/^\d{6}$/.test(pincode)) {
                throw new HttpsError('invalid-argument', 'Valid 6-digit Indian pincode is required for PINCODE audience.');
            }
            audience = {
                type: 'PINCODE',
                pincode,
                topic: `pin_${pincode}`
            };
        } else if (audType === 'SEGMENT') {
            const rawSegment = String(data.audience.segment || '').trim().toUpperCase();
            if (rawSegment === 'ABANDONED_CART' || rawSegment === 'SEGMENT_ABANDONED_CART') {
                audience = {
                    type: 'SEGMENT',
                    segment: 'ABANDONED_CART',
                    topic: 'segment_abandoned_cart'
                };
            } else if (rawSegment === 'INACTIVE_30D' || rawSegment === 'SEGMENT_INACTIVE_30D') {
                audience = {
                    type: 'SEGMENT',
                    segment: 'INACTIVE_30D',
                    topic: 'segment_inactive_30d'
                };
            } else {
                throw new HttpsError('invalid-argument', `Unsupported segment: ${rawSegment}. Supported segments: ABANDONED_CART, INACTIVE_30D.`);
            }
        } else if (audType === 'ALL') {
            audience = { type: 'ALL', topic: 'all_customers' };
        } else {
            throw new HttpsError('invalid-argument', `Unsupported audience type: ${audType}. Must be ALL, CROP, PINCODE, or SEGMENT.`);
        }
    }

    return { title, body, imageUrl, deepLink, audience };
}

/**
 * Clock provider allowing deterministic time-injection for tests and quiet-hours auditing
 */
let clockProvider = () => new Date();

function setClockProviderForTesting(fn) {
    clockProvider = fn || (() => new Date());
}

function getNowIST(customDate = null) {
    const d = customDate || clockProvider();
    return new Date(d.getTime() + (5.5 * 60 * 60 * 1000));
}

/**
 * Checks if current time is in IST Quiet Hours (22:00 PM to 07:00 AM IST)
 */
function isQuietHoursIST(customDate = null) {
    const istTime = getNowIST(customDate);
    const hours = istTime.getUTCHours();
    return hours >= 22 || hours < 7;
}

/**
 * Shared FCM message builder for topics and multicast tokens.
 * Guarantees consistent channelId, Android styling, and data payload across topic broadcasts and test sends.
 */
function buildFcmMessage({ title, body, imageUrl, deepLink, topic, tokens, campaignId, isTest = false, extraData = {} }) {
    const notification = {
        title,
        body,
        ...(imageUrl ? { imageUrl } : {})
    };

    // Infer type and targetId from deepLink to support Android navigation without app updates
    let inferredType = 'GENERAL';
    let productId = null;
    let orderId = null;
    let targetId = null;

    if (deepLink) {
        const prodMatch = deepLink.match(/\/product\?id=([^&#]+)/) || deepLink.match(/\/product\/([^&#/?]+)/);
        const orderMatch = deepLink.match(/\/order\?id=([^&#]+)/) || deepLink.match(/\/order\/([^&#/?]+)/);
        if (prodMatch) {
            inferredType = 'PRODUCT';
            productId = prodMatch[1];
            targetId = prodMatch[1];
        } else if (orderMatch) {
            inferredType = 'ORDER';
            orderId = orderMatch[1];
            targetId = orderMatch[1];
        } else if (deepLink.startsWith('/cart') || deepLink.startsWith('krishivishal://cart') || deepLink.includes('/cart')) {
            inferredType = 'CART';
            targetId = '/cart';
        }
    }

    const data = {
        deepLink: deepLink || '',
        type: inferredType,
        ...(productId ? { productId } : {}),
        ...(orderId ? { orderId } : {}),
        ...(targetId ? { targetId } : {}),
        ...(campaignId ? { campaignId } : {}),
        ...(isTest ? { isTest: 'true' } : {}),
        createdAt: new Date().toISOString(),
        ...extraData
    };

    const android = {
        notification: {
            channelId: 'krishi_offers_channel',
            icon: 'ic_home',
            color: '#2E7D32',
            ...(imageUrl ? { imageUrl } : {})
        }
    };

    const payload = {
        notification,
        data,
        android
    };

    if (topic) {
        payload.topic = topic;
    }
    if (tokens && Array.isArray(tokens)) {
        payload.tokens = tokens;
    }

    return payload;
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

    const isSuperAdmin = (('isSuperAdmin' in token) && token.isSuperAdmin === true) || 
                         ["SuperAdmin", "SUPER_ADMIN"].includes(roleVal);

    return {
        uid: request.auth.uid,
        email: token.email || 'unknown',
        role: roleVal || (hasAdminFlag ? 'Admin' : 'Marketing'),
        isSuperAdmin,
        isAdmin: hasAdminFlag
    };
}

/**
 * System-Wide Broadcast Rate Limiting
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
 * Per-Admin Action Rate Limiting
 * Counters:
 * - 'mgmt': doc `campaign_mgmt_${adminUid}`, max 15/hr (createCampaign, cancelCampaign, resetStuckCampaign)
 * - 'test': doc `campaign_test_${adminUid}`, max 30/hr (sendTestNotification)
 */
async function checkAdminRateLimit(adminUid, type = 'mgmt') {
    if (!adminUid) return;
    const limit = type === 'test' ? 30 : 15;
    const docId = type === 'test' ? `campaign_test_${adminUid}` : `campaign_mgmt_${adminUid}`;
    const rateRef = db.collection("admin_rate_limits").doc(docId);
    const now = Date.now();
    const ONE_HOUR = 60 * 60 * 1000;

    await db.runTransaction(async (transaction) => {
        const snap = await transaction.get(rateRef);
        if (snap.exists) {
            const data = snap.data();
            const windowStart = data.windowStart || 0;
            const count = data.count || 0;

            if (now - windowStart < ONE_HOUR) {
                if (count >= limit) {
                    const actionName = type === 'test' ? 'test notification sends' : 'campaign management actions';
                    throw new HttpsError('resource-exhausted', `Rate limit exceeded. Max ${limit} ${actionName} per hour per admin.`);
                }
                transaction.update(rateRef, { count: admin.firestore.FieldValue.increment(1) });
                return;
            }
        }

        transaction.set(rateRef, {
            windowStart: now,
            count: 1,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    });
}

/**
 * 1. createCampaign
 */
exports.createCampaign = onCall({ region: ACTIVE_REGION, invoker: 'public', cors: true }, async (request) => {
    const caller = verifyMarketingAdmin(request);

    let scheduledTimestamp = null;
    let initialStatus = 'DRAFT';
    let quietHoursOverridden = false;

    // Validate scheduledAt if provided
    if (request.data && request.data.scheduledAt !== undefined && request.data.scheduledAt !== null && request.data.scheduledAt !== '') {
        const schedDate = new Date(request.data.scheduledAt);
        if (isNaN(schedDate.getTime())) {
            throw new HttpsError('invalid-argument', 'Invalid scheduledAt format. Must be a valid ISO date string.');
        }

        const now = clockProvider();
        // Must be at least 1 minute in the future
        if (schedDate.getTime() < now.getTime() + 60 * 1000) {
            throw new HttpsError('invalid-argument', 'scheduledAt must be at least 1 minute in the future.');
        }

        // Cannot schedule more than 30 days in advance
        if (schedDate.getTime() > now.getTime() + (30 * 24 * 60 * 60 * 1000)) {
            throw new HttpsError('invalid-argument', 'scheduledAt cannot be scheduled more than 30 days in advance.');
        }

        // Check quiet hours at scheduled execution time
        const isSchedInQuietHours = isQuietHoursIST(schedDate);
        const overrideRequested = Boolean(request.data.overrideQuietHours);

        if (isSchedInQuietHours) {
            if (!caller.isSuperAdmin || !overrideRequested) {
                throw new HttpsError('failed-precondition', 'Scheduled time falls within IST Quiet Hours (10:00 PM - 07:00 AM). Please schedule after 07:00 AM IST or enable SuperAdmin override.');
            }
            quietHoursOverridden = true;
        }

        initialStatus = 'SCHEDULED';
        scheduledTimestamp = admin.firestore.Timestamp.fromDate(schedDate);
    }

    const { title, body, imageUrl, deepLink, audience } = validateCampaignInput(request.data);

    // Consume management rate limit budget (15/hr) only after input/role validation
    await checkAdminRateLimit(caller.uid, 'mgmt');

    const idempotencyKey = (request.data.idempotencyKey || '').trim() || db.collection("notification_campaigns").doc().id;
    const isQuiet = isQuietHoursIST();

    const campaignRef = db.collection("notification_campaigns").doc(idempotencyKey);

    const campaignData = {
        id: idempotencyKey,
        title,
        body,
        imageUrl,
        deepLink,
        audience,
        status: initialStatus,
        scheduledAt: scheduledTimestamp,
        quietHoursOverridden: quietHoursOverridden || false,
        createdBy: caller.uid,
        creatorEmail: caller.email,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        idempotencyKey,
        quietHoursBlocked: isQuiet,
        stats: { 
            requested: 0, 
            sent: 0, 
            failed: 0,
            clicks: 0,
            uniqueClicks: 0,
            ctr: 0,
            conversions: 0,
            revenue: 0,
            conversionRate: 0
        }
    };

    await campaignRef.set(campaignData, { merge: true });

    return { 
        success: true, 
        campaignId: idempotencyKey, 
        status: initialStatus, 
        scheduledAt: scheduledTimestamp ? scheduledTimestamp.toDate().toISOString() : null, 
        isQuietHours: isQuiet 
    };
});

/**
 * 2. sendTestNotification
 * Sends to target testUserUid, caller device tokens, or staging topic 'test_all'.
 */
exports.sendTestNotification = onCall({ region: ACTIVE_REGION, invoker: 'public', cors: true }, async (request) => {
    const caller = verifyMarketingAdmin(request);
    const { title, body, imageUrl, deepLink } = validateCampaignInput(request.data);
    const testUserUid = request.data.testUserUid ? String(request.data.testUserUid).trim() : null;

    if (testUserUid) {
        // 1. Verify target in allow-list BEFORE charging rate limit budget
        const allowSnap = await db.collection("notification_test_users").doc(testUserUid).get();
        if (!allowSnap.exists) {
            throw new HttpsError('permission-denied', `Target UID '${testUserUid}' is not registered in notification_test_users allow-list.`);
        }

        // 2. Fetch tokens from users/{uid}/fcm_tokens subcollection, fallback to root fcmToken
        const tokensSnap = await db.collection("users").doc(testUserUid).collection("fcm_tokens").get();
        let rawTokens = [];
        if (!tokensSnap.empty) {
            rawTokens = tokensSnap.docs
                .map(d => d.data() && d.data().token)
                .filter(t => typeof t === 'string' && t.trim().length > 0);
        }
        if (rawTokens.length === 0) {
            const userDoc = await db.collection("users").doc(testUserUid).get();
            const rootToken = (userDoc.exists && typeof userDoc.data().fcmToken === 'string') ? userDoc.data().fcmToken.trim() : null;
            if (rootToken) rawTokens.push(rootToken);
        }

        const tokens = Array.from(new Set(rawTokens)).slice(0, 10);
        if (tokens.length === 0) {
            throw new HttpsError('not-found', `No active FCM tokens found for test user ${testUserUid}.`);
        }

        // Consume test rate limit budget (30/hr) only after validation passes
        await checkAdminRateLimit(caller.uid, 'test');

        // 4. Send via sendEachForMulticast
        const multicastMessage = buildFcmMessage({
            tokens,
            title,
            body,
            imageUrl,
            deepLink,
            isTest: true,
            extraData: { targetUid: testUserUid }
        });

        const multiRes = await admin.messaging().sendEachForMulticast(multicastMessage);

        // 5. Inspect responses for invalid tokens
        const invalidTokens = [];
        if (multiRes.responses) {
            multiRes.responses.forEach((resp, idx) => {
                if (!resp.success && resp.error) {
                    invalidTokens.push({
                        token: tokens[idx],
                        code: resp.error.code || 'unknown',
                        message: resp.error.message || ''
                    });
                }
            });
        }

        // 6. Audit log entry
        await db.collection("audit_logs").add({
            action: 'NOTIFICATION_TEST_SEND',
            callerUid: caller.uid,
            callerEmail: caller.email,
            callerRole: caller.role,
            targetUid: testUserUid,
            tokensAttempted: tokens.length,
            successCount: multiRes.successCount,
            failureCount: multiRes.failureCount,
            invalidTokensCount: invalidTokens.length,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        return {
            success: true,
            mode: 'TEST_USER',
            targetUid: testUserUid,
            tokensAttempted: tokens.length,
            successCount: multiRes.successCount,
            failureCount: multiRes.failureCount,
            invalidTokens
        };
    }

    const useTestTopic = request.data.useTestTopic === true;

    if (useTestTopic) {
        await checkAdminRateLimit(caller.uid, 'test');

        // Safe staging topic: test_all
        const topicMessage = buildFcmMessage({
            title,
            body,
            imageUrl,
            deepLink,
            topic: 'test_all',
            isTest: true
        });

        const response = await admin.messaging().send(topicMessage);
        return { success: true, mode: 'TOPIC', topic: 'test_all', messageId: response };
    }

    // Direct to caller tokens
    const tokensSnap = await db.collection("users").doc(caller.uid).collection("fcm_tokens").get();
    let tokens = [];
    if (!tokensSnap.empty) {
        tokens = tokensSnap.docs
            .map(d => d.data() && d.data().token)
            .filter(t => typeof t === 'string' && t.trim().length > 0);
    }
    if (tokens.length === 0) {
        const userDoc = await db.collection("users").doc(caller.uid).get();
        const rootToken = (userDoc.exists && typeof userDoc.data().fcmToken === 'string') ? userDoc.data().fcmToken.trim() : null;
        if (rootToken) tokens.push(rootToken);
    }

    if (tokens.length === 0) {
        throw new HttpsError('failed-precondition', 'No registered device tokens found for your admin user account.');
    }

    await checkAdminRateLimit(caller.uid, 'test');

    const multicastPayload = buildFcmMessage({
        tokens: tokens.slice(0, 10),
        title,
        body,
        imageUrl,
        deepLink,
        isTest: true
    });

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

    const isQuiet = isQuietHoursIST();
    const overrideRequested = request.data && request.data.overrideQuietHours === true;

    if (isQuiet) {
        if (!overrideRequested) {
            throw new HttpsError('failed-precondition', 'Quiet hours active in India (10:00 PM - 07:00 AM IST). Push broadcasting is restricted.');
        }
        if (!caller.isSuperAdmin) {
            throw new HttpsError('permission-denied', 'Only SuperAdmin role is authorized to override quiet hours.');
        }
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

    const message = buildFcmMessage({
        title: campaignToBroadcast.title,
        body: campaignToBroadcast.body,
        imageUrl: campaignToBroadcast.imageUrl,
        deepLink: campaignToBroadcast.deepLink,
        topic,
        campaignId
    });

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
            quietHoursOverridden: isQuiet && overrideRequested,
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
            quietHoursOverridden: isQuiet && overrideRequested,
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
        if (data.status === 'CANCELLED') {
            throw new HttpsError('failed-precondition', 'Campaign is already cancelled.');
        }

        t.update(campaignRef, {
            status: 'CANCELLED',
            cancelledBy: caller.uid,
            cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
    });

    // Consume management budget only after valid cancellation
    await checkAdminRateLimit(caller.uid, 'mgmt');

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
 * Recovers campaigns stuck in 'SENDING' status for > 5 minutes by marking them FAILED.
 */
exports.resetStuckCampaign = onCall({ region: ACTIVE_REGION, invoker: 'public', cors: true }, async (request) => {
    const caller = verifyMarketingAdmin(request);
    const { campaignId, newStatus = 'FAILED' } = request.data || {};

    if (!campaignId || typeof campaignId !== 'string') {
        throw new HttpsError('invalid-argument', 'Valid campaignId is required.');
    }

    if (newStatus !== 'FAILED') {
        throw new HttpsError('invalid-argument', "Only 'FAILED' status is allowed when resetting stuck campaigns.");
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

        // Allow reset strictly after 5 minutes
        if (elapsedMinutes < 5) {
            throw new HttpsError('failed-precondition', `Campaign has only been SENDING for ${Math.round(elapsedMinutes)} minutes. Reset is allowed after 5 minutes.`);
        }

        t.update(campaignRef, {
            status: 'FAILED',
            recoveryNote: `Stuck in SENDING for ${Math.round(elapsedMinutes)} mins. Reset by ${caller.email}.`,
            recoveredAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        return { elapsedMinutes: Math.round(elapsedMinutes) };
    });

    // Consume management budget only after valid reset
    await checkAdminRateLimit(caller.uid, 'mgmt');

    await db.collection("audit_logs").add({
        action: 'NOTIFICATION_CAMPAIGN_STUCK_RESET',
        campaignId,
        newStatus: 'FAILED',
        performedBy: caller.uid,
        performedByEmail: caller.email,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    return { 
        success: true, 
        campaignId, 
        status: 'FAILED', 
        elapsedMinutes: result.elapsedMinutes,
        warning: 'FCM ne message accept kiya ho sakta hai, dobara send karne se pehle admin verify kare.'
    };
});

/**
 * 6. processDueCampaigns
 * Atomically scans and dispatches campaigns due for broadcast.
 * Idempotent: uses Firestore transaction to transition SCHEDULED -> SENDING -> COMPLETED.
 */
async function processDueCampaigns(testNow = null) {
    const now = testNow || clockProvider();
    const nowTs = admin.firestore.Timestamp.fromDate(now);

    const dueSnap = await db.collection("notification_campaigns")
        .where("status", "==", "SCHEDULED")
        .where("scheduledAt", "<=", nowTs)
        .limit(10)
        .get();

    if (dueSnap.empty) {
        return { processed: 0, dispatched: [] };
    }

    const dispatched = [];
    for (const doc of dueSnap.docs) {
        const campaignId = doc.id;
        let campaignData = null;

        try {
            await db.runTransaction(async (t) => {
                const snap = await t.get(doc.ref);
                if (!snap.exists) return;
                const d = snap.data();
                if (d.status !== 'SCHEDULED') return;

                // Enforce quiet hours at execution time unless explicitly overridden
                const isQuiet = isQuietHoursIST(now);
                if (isQuiet && !d.quietHoursOverridden) {
                    console.warn(`[dispatchScheduledCampaigns] Postponing campaign ${campaignId} during IST quiet hours.`);
                    return;
                }

                campaignData = d;
                t.update(doc.ref, {
                    status: 'SENDING',
                    sentAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    dispatchedBy: 'SYSTEM_SCHEDULER'
                });
            });
        } catch (txErr) {
            console.warn(`[dispatchScheduledCampaigns] Lock acquisition error for ${campaignId}:`, txErr.message);
            continue;
        }

        if (!campaignData) continue;

        // Daily rate limit check for ALL-customer broadcasts
        const isAllCustomers = !campaignData.audience || campaignData.audience.type === 'ALL';
        if (isAllCustomers) {
            try {
                await checkDailyBroadcastRateLimit();
            } catch (rateErr) {
                console.error(`[dispatchScheduledCampaigns] Daily broadcast limit reached for ${campaignId}:`, rateErr.message);
                await doc.ref.update({
                    status: 'FAILED',
                    error: rateErr.message,
                    failedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                continue;
            }
        }

        const topic = (campaignData.audience && campaignData.audience.topic) || 'all_customers';
        const message = buildFcmMessage({
            title: campaignData.title,
            body: campaignData.body,
            imageUrl: campaignData.imageUrl,
            deepLink: campaignData.deepLink,
            topic,
            campaignId
        });

        try {
            const messageId = await admin.messaging().send(message);

            await db.collection("broadcast_inbox").doc(campaignId).set({
                campaignId,
                title: campaignData.title,
                body: campaignData.body,
                imageUrl: campaignData.imageUrl || null,
                deepLink: campaignData.deepLink || null,
                type: 'PROMOTIONAL',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                topic
            }, { merge: true });

            await doc.ref.update({
                status: 'COMPLETED',
                messageId,
                completedAt: admin.firestore.FieldValue.serverTimestamp(),
                'stats.sent': 1,
                'stats.failed': 0
            });

            await db.collection("audit_logs").add({
                action: 'NOTIFICATION_CAMPAIGN_SCHEDULED_DISPATCH',
                campaignId,
                title: campaignData.title,
                audience: campaignData.audience,
                topic,
                scheduledAt: campaignData.scheduledAt,
                performedBy: 'SYSTEM_SCHEDULER',
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
                messageId
            });

            dispatched.push(campaignId);
        } catch (sendErr) {
            console.error(`[dispatchScheduledCampaigns] Send failed for ${campaignId}:`, sendErr);
            await doc.ref.update({
                status: 'FAILED',
                error: sendErr.message,
                failedAt: admin.firestore.FieldValue.serverTimestamp(),
                'stats.failed': 1
            });
        }
    }

    return { processed: dispatched.length, dispatched };
}

/**
 * 7. dispatchScheduledCampaigns
 * Cloud Scheduler cron running every 1 minute in Asia/Kolkata
 */
exports.dispatchScheduledCampaigns = onSchedule({
    schedule: "every 1 minutes",
    region: ACTIVE_REGION,
    timeZone: "Asia/Kolkata"
}, async (event) => {
    try {
        const res = await processDueCampaigns();
        if (res.processed > 0) {
            console.log(`[dispatchScheduledCampaigns] Dispatched ${res.processed} scheduled campaigns:`, res.dispatched);
        }
    } catch (err) {
        console.error("[dispatchScheduledCampaigns] Error executing cron:", err);
    }
    return null;
});

/**
 * 8. recordCampaignClick
 * Callable function invoked when a farmer taps a push notification on Android or web.
 * Atomically updates clicks, unique clicks, and CTR in notification_campaigns/{campaignId}.
 */
exports.recordCampaignClick = onCall({ region: ACTIVE_REGION, invoker: 'public', cors: true }, async (request) => {
    const data = request.data || {};
    const campaignId = (data.campaignId || '').toString().trim();
    if (!campaignId) {
        throw new HttpsError('invalid-argument', 'Valid campaignId is required.');
    }

    const platform = (data.platform || 'android').toString().trim().toLowerCase();
    const callerUid = request.auth ? request.auth.uid : null;
    const clientKey = (data.clientSessionId || callerUid || 'anon_' + Math.random().toString(36).substring(2, 12)).trim();

    const campaignRef = db.collection("notification_campaigns").doc(campaignId);

    return await db.runTransaction(async (t) => {
        const campaignSnap = await t.get(campaignRef);
        if (!campaignSnap.exists) {
            throw new HttpsError('not-found', `Campaign ${campaignId} not found.`);
        }

        const campaign = campaignSnap.data();
        const currentStats = campaign.stats || { requested: 0, sent: 0, failed: 0 };
        const clicksSoFar = Number(currentStats.clicks) || 0;
        const uniqueClicksSoFar = Number(currentStats.uniqueClicks) || 0;
        const sentCount = Math.max(1, Number(currentStats.sent) || Number(campaign.targetAudienceCount) || 1);

        const clickDocRef = campaignRef.collection("clicks").doc(clientKey);
        const clickSnap = await t.get(clickDocRef);

        let isUnique = false;
        let newUniqueClicks = uniqueClicksSoFar;
        let newClicks = clicksSoFar + 1;

        if (!clickSnap.exists) {
            isUnique = true;
            newUniqueClicks = uniqueClicksSoFar + 1;
            t.set(clickDocRef, {
                clientKey,
                userId: callerUid || null,
                platform,
                firstClickedAt: admin.firestore.FieldValue.serverTimestamp(),
                lastClickedAt: admin.firestore.FieldValue.serverTimestamp(),
                clickCount: 1
            });
        } else {
            t.update(clickDocRef, {
                lastClickedAt: admin.firestore.FieldValue.serverTimestamp(),
                clickCount: admin.firestore.FieldValue.increment(1)
            });
        }

        // Compute CTR (%)
        const ctr = Math.round((newUniqueClicks / sentCount) * 1000) / 10;

        t.update(campaignRef, {
            'stats.clicks': newClicks,
            'stats.uniqueClicks': newUniqueClicks,
            'stats.ctr': ctr,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        return {
            success: true,
            campaignId,
            uniqueClick: isUnique,
            clicks: newClicks,
            uniqueClicks: newUniqueClicks,
            ctr
        };
    });
});

/**
 * 9. getCampaignAnalytics
 * Returns comprehensive performance analytics and converted orders for a campaign or overview.
 */
exports.getCampaignAnalytics = onCall({ region: ACTIVE_REGION, invoker: 'public', cors: true }, async (request) => {
    verifyMarketingAdmin(request);
    const campaignId = (request.data?.campaignId || '').toString().trim();

    if (campaignId) {
        const campaignDoc = await db.collection("notification_campaigns").doc(campaignId).get();
        if (!campaignDoc.exists) {
            throw new HttpsError('not-found', 'Campaign not found');
        }
        const data = campaignDoc.data();
        const stats = data.stats || {};

        // Fetch recent conversions
        const convSnap = await db.collection("notification_campaigns")
            .doc(campaignId)
            .collection("conversions")
            .orderBy("convertedAt", "desc")
            .limit(50)
            .get();

        const conversions = convSnap.docs.map(doc => {
            const cd = doc.data();
            return {
                orderId: doc.id,
                totalAmount: cd.totalAmount || 0,
                userName: cd.userName || 'Customer',
                userPhone: cd.userPhone || '',
                itemsCount: cd.itemsCount || 0,
                paymentMethod: cd.paymentMethod || 'COD',
                convertedAt: cd.convertedAt ? cd.convertedAt.toDate().toISOString() : null
            };
        });

        const sent = Math.max(1, Number(stats.sent) || Number(data.targetAudienceCount) || 1);
        const clicks = Number(stats.clicks) || 0;
        const uniqueClicks = Number(stats.uniqueClicks) || 0;
        const orderCount = Number(stats.conversions) || conversions.length;
        const revenue = Number(stats.revenue) || conversions.reduce((sum, c) => sum + (c.totalAmount || 0), 0);

        const ctr = Math.round((uniqueClicks / sent) * 1000) / 10;
        const conversionRate = Math.round((orderCount / Math.max(1, uniqueClicks || clicks || 1)) * 1000) / 10;
        const averageOrderValue = orderCount > 0 ? Math.round(revenue / orderCount) : 0;

        return {
            success: true,
            campaignId,
            title: data.title,
            body: data.body,
            audience: data.audience,
            status: data.status,
            createdAt: data.createdAt ? data.createdAt.toDate().toISOString() : null,
            completedAt: data.completedAt ? data.completedAt.toDate().toISOString() : null,
            metrics: {
                sent,
                clicks,
                uniqueClicks,
                ctr,
                conversions: orderCount,
                revenue,
                conversionRate,
                averageOrderValue
            },
            recentOrders: conversions
        };
    }

    // Overall summary across all campaigns
    const allCampaignsSnap = await db.collection("notification_campaigns")
        .where("status", "==", "COMPLETED")
        .limit(100)
        .get();

    let totalBroadcasts = allCampaignsSnap.size;
    let totalClicks = 0;
    let totalUniqueClicks = 0;
    let totalConversions = 0;
    let totalRevenue = 0;

    allCampaignsSnap.docs.forEach(doc => {
        const s = doc.data().stats || {};
        totalClicks += Number(s.clicks) || 0;
        totalUniqueClicks += Number(s.uniqueClicks) || 0;
        totalConversions += Number(s.conversions) || 0;
        totalRevenue += Number(s.revenue) || 0;
    });

    const overallConversionRate = totalUniqueClicks > 0 
        ? Math.round((totalConversions / totalUniqueClicks) * 1000) / 10 
        : 0;

    return {
        success: true,
        summary: {
            totalBroadcasts,
            totalClicks,
            totalUniqueClicks,
            totalConversions,
            totalRevenue,
            overallConversionRate
        }
    };
});

/**
 * 10. trackCampaignClick
 * Public HTTP endpoint for link tracking / web redirects.
 * Increments click statistics and redirects browser or app to target link.
 */
exports.trackCampaignClick = onRequest({ region: ACTIVE_REGION, cors: true }, async (req, res) => {
    const campaignId = (req.query.c || req.query.campaignId || '').toString().trim();
    const deepLink = (req.query.dl || req.query.deepLink || '/').toString().trim();

    if (campaignId) {
        try {
            const campaignRef = db.collection("notification_campaigns").doc(campaignId);
            const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'web';
            const clientKey = 'web_' + crypto.createHash('md5').update(clientIp).digest('hex').substring(0, 16);

            await db.runTransaction(async (t) => {
                const cSnap = await t.get(campaignRef);
                if (!cSnap.exists) return;
                const cData = cSnap.data();
                const curStats = cData.stats || {};
                const clicks = (Number(curStats.clicks) || 0) + 1;
                let uniqueClicks = Number(curStats.uniqueClicks) || 0;

                const clickRef = campaignRef.collection("clicks").doc(clientKey);
                const clickSnap = await t.get(clickRef);
                if (!clickSnap.exists) {
                    uniqueClicks += 1;
                    t.set(clickRef, {
                        clientKey,
                        platform: 'web',
                        firstClickedAt: admin.firestore.FieldValue.serverTimestamp(),
                        lastClickedAt: admin.firestore.FieldValue.serverTimestamp(),
                        clickCount: 1
                    });
                } else {
                    t.update(clickRef, {
                        lastClickedAt: admin.firestore.FieldValue.serverTimestamp(),
                        clickCount: admin.firestore.FieldValue.increment(1)
                    });
                }

                t.update(campaignRef, {
                    'stats.clicks': clicks,
                    'stats.uniqueClicks': uniqueClicks,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            });
        } catch (e) {
            console.warn('[trackCampaignClick] Click logging error:', e.message);
        }
    }

    const redirectUrl = deepLink.startsWith('http') 
        ? deepLink 
        : `https://krishivishal-a9ed7.web.app${deepLink.startsWith('/') ? deepLink : '/' + deepLink}`;
    
    res.redirect(302, redirectUrl);
});

module.exports.validateCampaignInput = validateCampaignInput;
module.exports.buildFcmMessage = buildFcmMessage;
module.exports.isQuietHoursIST = isQuietHoursIST;
module.exports.getNowIST = getNowIST;
module.exports.setClockProviderForTesting = setClockProviderForTesting;
module.exports.verifyMarketingAdmin = verifyMarketingAdmin;
module.exports.checkDailyBroadcastRateLimit = checkDailyBroadcastRateLimit;
module.exports.checkAdminRateLimit = checkAdminRateLimit;
module.exports.processDueCampaigns = processDueCampaigns;
module.exports.recordCampaignClick = exports.recordCampaignClick;
module.exports.getCampaignAnalytics = exports.getCampaignAnalytics;
module.exports.trackCampaignClick = exports.trackCampaignClick;
