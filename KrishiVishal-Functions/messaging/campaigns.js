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

    // Reject scheduling requests before consuming budget
    if (request.data && request.data.scheduledAt !== undefined && request.data.scheduledAt !== null) {
        throw new HttpsError('invalid-argument', 'Scheduling is not enabled yet.');
    }

    const { title, body, imageUrl, deepLink } = validateCampaignInput(request.data);

    // Consume management rate limit budget (15/hr) only after input/role validation
    await checkAdminRateLimit(caller.uid, 'mgmt');

    const idempotencyKey = (request.data.idempotencyKey || '').trim() || db.collection("notification_campaigns").doc().id;
    const isQuiet = isQuietHoursIST();
    const initialStatus = 'DRAFT'; // Status SCHEDULED is NEVER created

    const campaignRef = db.collection("notification_campaigns").doc(idempotencyKey);

    const campaignData = {
        id: idempotencyKey,
        title,
        body,
        imageUrl,
        deepLink,
        audience: { type: 'ALL', topic: 'all_customers' },
        status: initialStatus,
        scheduledAt: null,
        createdBy: caller.uid,
        creatorEmail: caller.email,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        idempotencyKey,
        quietHoursBlocked: isQuiet,
        stats: { requested: 0, sent: 0, failed: 0 }
    };

    await campaignRef.set(campaignData, { merge: true });

    return { success: true, campaignId: idempotencyKey, status: initialStatus, isQuietHours: isQuiet };
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

        // 2. Fetch tokens strictly from users/{uid}/fcm_tokens subcollection (no root fallback, strictly d.data().token)
        const tokensSnap = await db.collection("users").doc(testUserUid).collection("fcm_tokens").get();
        if (tokensSnap.empty) {
            throw new HttpsError('not-found', `No active FCM tokens found in users/${testUserUid}/fcm_tokens.`);
        }

        // 3. Extract tokens, limit to max 10 (no d.id fallback!)
        const rawTokens = tokensSnap.docs
            .map(d => d.data() && d.data().token)
            .filter(t => typeof t === 'string' && t.trim().length > 0);
        
        const tokens = Array.from(new Set(rawTokens)).slice(0, 10);
        if (tokens.length === 0) {
            throw new HttpsError('not-found', `No valid FCM token strings found for test user ${testUserUid}.`);
        }

        // Consume test rate limit budget (30/hr) only after validation passes
        await checkAdminRateLimit(caller.uid, 'test');

        // 4. Send via sendEachForMulticast
        const multicastMessage = {
            tokens,
            notification: {
                title,
                body,
                ...(imageUrl ? { imageUrl } : {})
            },
            data: {
                deepLink: deepLink || '',
                isTest: 'true',
                targetUid: testUserUid
            },
            android: {
                notification: {
                    channelId: 'krishi_offers_channel',
                    icon: 'ic_home',
                    color: '#2E7D32',
                    ...(imageUrl ? { imageUrl } : {})
                }
            }
        };

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

    const multicastPayload = {
        tokens: tokens.slice(0, 10),
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

module.exports.validateCampaignInput = validateCampaignInput;
module.exports.isQuietHoursIST = isQuietHoursIST;
module.exports.getNowIST = getNowIST;
module.exports.setClockProviderForTesting = setClockProviderForTesting;
module.exports.verifyMarketingAdmin = verifyMarketingAdmin;
module.exports.checkDailyBroadcastRateLimit = checkDailyBroadcastRateLimit;
module.exports.checkAdminRateLimit = checkAdminRateLimit;
