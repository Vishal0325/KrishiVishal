/**
 * Emulator Integration Tests for Phase 1 Broadcast Callables
 * Runs against local Firestore Emulator (FIRESTORE_EMULATOR_HOST)
 * Fully mocks FCM messaging (admin.messaging & admin.app().messaging) to prevent any network calls.
 */

const assert = require('assert');
process.env.GCLOUD_PROJECT = 'krishivishal-a9ed7';

const { admin, db } = require('../core/admin');
const campaigns = require('../messaging/campaigns');
const customerSegments = require('../marketing/customerSegments');

// Safety Check: Verify we are running against the Emulator, NEVER production
if (!process.env.FIRESTORE_EMULATOR_HOST) {
    console.error("FATAL: FIRESTORE_EMULATOR_HOST is NOT set. Tests must run inside emulator:exec!");
    process.exit(1);
}

// -------------------------------------------------------------------
// Robust FCM Mock Engine
// -------------------------------------------------------------------
let fcmSendCalls = [];
let fcmSimulateError = null;

const mockMessaging = {
    send: async (msg) => {
        if (fcmSimulateError) {
            throw fcmSimulateError;
        }
        fcmSendCalls.push(msg);
        return `mock-msg-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    },
    sendEachForMulticast: async (payload) => {
        if (fcmSimulateError) {
            throw fcmSimulateError;
        }
        fcmSendCalls.push(payload);
        return {
            successCount: payload.tokens.length,
            failureCount: 0,
            responses: payload.tokens.map(t => ({ success: true, messageId: `mock-multi-${t}` }))
        };
    },
    subscribeToTopic: async (tokens, topic) => {
        return { successCount: tokens.length, failureCount: 0, errors: [] };
    },
    unsubscribeFromTopic: async (tokens, topic) => {
        return { successCount: tokens.length, failureCount: 0, errors: [] };
    }
};

admin.messaging = () => mockMessaging;
if (admin.apps.length > 0) {
    admin.app().messaging = () => mockMessaging;
}

// Mock Auth Contexts
const superAdminContext = {
    uid: 'mock-superadmin-01',
    token: { role: 'SuperAdmin', email: 'superadmin@krishivishal.com', admin: true, isAdmin: true, isSuperAdmin: true }
};

const marketingAdminContext = {
    uid: 'mock-marketing-01',
    token: { role: 'Marketing', email: 'marketing@krishivishal.com', admin: false, isAdmin: false }
};

const customerContext = {
    uid: 'mock-customer-01',
    token: { role: 'Customer', email: 'customer@gmail.com' }
};

const missingRoleContext = {
    uid: 'mock-no-role-user',
    token: { email: 'norole@gmail.com' } // No role claim
};

let passed = 0;
let failed = 0;

function reportPass(name) {
    passed++;
    console.log(`✅ PASS: ${name}`);
}

function reportFail(name, err) {
    failed++;
    console.error(`❌ FAIL: ${name} ->`, (err && (err.message || err.toString())) || err);
}

async function runIntegrationSuite() {
    console.log("\n============================================================");
    console.log("RUNNING EMULATOR INTEGRATION SUITE: Phase 1 Broadcast Callables");
    console.log(`Target: Firestore Emulator at ${process.env.FIRESTORE_EMULATOR_HOST}`);
    console.log("============================================================\n");

    async function resetRateLimits() {
        await db.collection("admin_rate_limits").doc("campaign_mgmt_" + superAdminContext.uid).delete();
        await db.collection("admin_rate_limits").doc("campaign_test_" + superAdminContext.uid).delete();
        await db.collection("admin_rate_limits").doc("campaign_mgmt_" + marketingAdminContext.uid).delete();
        await db.collection("admin_rate_limits").doc("campaign_test_" + marketingAdminContext.uid).delete();
    }

    // ---------------------------------------------------------------
    // 1. Role Lockdown & Permission Tests across all 5 Callables
    // ---------------------------------------------------------------
    console.log("--- 1. Testing Role Lockdown across all Callables ---");

    const unauthCallables = [
        { name: 'createCampaign', fn: campaigns.createCampaign, data: { title: 'T', body: 'B' } },
        { name: 'sendTestNotification', fn: campaigns.sendTestNotification, data: { title: 'T', body: 'B', useTestTopic: true } },
        { name: 'sendCampaign', fn: campaigns.sendCampaign, data: { campaignId: 'c1' } },
        { name: 'cancelCampaign', fn: campaigns.cancelCampaign, data: { campaignId: 'c1' } },
        { name: 'resetStuckCampaign', fn: campaigns.resetStuckCampaign, data: { campaignId: 'c1' } }
    ];

    for (const item of unauthCallables) {
        // Customer Context -> permission-denied
        try {
            await item.fn.run({ data: item.data, auth: customerContext });
            reportFail(`1.0 Customer rejection: ${item.name} should reject customer`);
        } catch (e) {
            if (e.code === 'permission-denied') {
                reportPass(`1.0 Customer rejection: ${item.name} correctly returns permission-denied`);
            } else {
                reportFail(`1.0 Customer rejection: ${item.name} unexpected code: ${e.code}`, e);
            }
        }

        // Missing Role Context -> permission-denied
        try {
            await item.fn.run({ data: item.data, auth: missingRoleContext });
            reportFail(`1.0 Missing-role rejection: ${item.name} should reject missing role`);
        } catch (e) {
            if (e.code === 'permission-denied') {
                reportPass(`1.0 Missing-role rejection: ${item.name} correctly returns permission-denied`);
            } else {
                reportFail(`1.0 Missing-role rejection: ${item.name} unexpected code: ${e.code}`, e);
            }
        }

        // Unauthenticated Context -> unauthenticated
        try {
            await item.fn.run({ data: item.data, auth: null });
            reportFail(`1.0 Unauth rejection: ${item.name} should reject unauthenticated`);
        } catch (e) {
            if (e.code === 'unauthenticated') {
                reportPass(`1.0 Unauth rejection: ${item.name} correctly returns unauthenticated`);
            } else {
                reportFail(`1.0 Unauth rejection: ${item.name} unexpected code: ${e.code}`, e);
            }
        }
    }

    // ---------------------------------------------------------------
    // 2. createCampaign Tests & Scheduling Rejection
    // ---------------------------------------------------------------
    console.log("\n--- 2. Testing createCampaign ---");
    await resetRateLimits();

    // 2.1 Valid Campaign Creation
    let validCampaignId = null;
    try {
        const res = await campaigns.createCampaign.run({
            data: {
                title: 'Spring Mustard Seeds Offer',
                body: 'Get 20% discount on hybrid mustard seeds this week.',
                deepLink: '/product/mustard-seeds-500g'
            },
            auth: superAdminContext
        });

        assert.strictEqual(res.success, true);
        assert.strictEqual(res.status, 'DRAFT');
        assert(res.campaignId, "campaignId must be returned");
        validCampaignId = res.campaignId;

        const snap = await db.collection("notification_campaigns").doc(validCampaignId).get();
        assert.strictEqual(snap.exists, true);
        const data = snap.data();
        assert.strictEqual(data.title, 'Spring Mustard Seeds Offer');
        assert.strictEqual(data.status, 'DRAFT');
        assert.strictEqual(data.scheduledAt, null);
        assert.strictEqual(data.createdBy, superAdminContext.uid);
        reportPass("2.1 createCampaign: Valid campaign created with status DRAFT in Firestore");
    } catch (e) {
        reportFail("2.1 createCampaign: Valid campaign creation failed", e);
    }

    // 2.2a Reject scheduledAt in the past
    try {
        await campaigns.createCampaign.run({
            data: {
                title: 'Past Scheduled Campaign',
                body: 'Valid message body text',
                deepLink: '/product/123',
                scheduledAt: new Date(Date.now() - 3600000).toISOString()
            },
            auth: superAdminContext
        });
        reportFail("2.2a createCampaign: Should reject past scheduledAt");
    } catch (e) {
        if (e.code === 'invalid-argument' && e.message.includes("at least 1 minute in the future")) {
            reportPass("2.2a createCampaign: Correctly rejects past scheduledAt");
        } else {
            reportFail("2.2a createCampaign: Unexpected error for past scheduledAt", e);
        }
    }

    // 2.2b Reject scheduledAt in Quiet Hours without override
    try {
        const tomorrowQuietUTC = new Date(Date.now() + 24 * 3600 * 1000);
        tomorrowQuietUTC.setUTCHours(18, 0, 0, 0); // 18:00 UTC = 23:30 IST (Quiet hours)
        await campaigns.createCampaign.run({
            data: {
                title: 'Quiet Hours Scheduled Campaign',
                body: 'Valid message body text',
                deepLink: '/product/123',
                scheduledAt: tomorrowQuietUTC.toISOString(),
                overrideQuietHours: false
            },
            auth: marketingAdminContext
        });
        reportFail("2.2b createCampaign: Should reject quiet hours scheduledAt for marketing");
    } catch (e) {
        if (e.code === 'failed-precondition' && e.message.includes("Quiet Hours")) {
            reportPass("2.2b createCampaign: Correctly rejects quiet hours scheduledAt without SuperAdmin override");
        } else {
            reportFail("2.2b createCampaign: Unexpected error for quiet hours scheduledAt", e);
        }
    }

    // 2.2c Successfully create SCHEDULED campaign for future daytime
    try {
        const tomorrowDayUTC = new Date(Date.now() + 24 * 3600 * 1000);
        tomorrowDayUTC.setUTCHours(4, 30, 0, 0); // 10:00 AM IST
        const schedRes = await campaigns.createCampaign.run({
            data: {
                idempotencyKey: 'camp-future-sched-test',
                title: 'Future Scheduled Morning Alert',
                body: 'Good morning farmers! Check latest crop advice.',
                deepLink: '/product',
                scheduledAt: tomorrowDayUTC.toISOString()
            },
            auth: superAdminContext
        });

        assert.strictEqual(schedRes.success, true);
        assert.strictEqual(schedRes.status, 'SCHEDULED');
        const snap = await db.collection("notification_campaigns").doc('camp-future-sched-test').get();
        assert.strictEqual(snap.data().status, 'SCHEDULED');
        assert(snap.data().scheduledAt !== null);
        reportPass("2.2c createCampaign: Valid campaign created with status SCHEDULED and persisted scheduledAt");
    } catch (e) {
        reportFail("2.2c createCampaign: Valid scheduled campaign creation failed", e);
    }

    // 2.3 Invalid Title (> 65 chars)
    try {
        await campaigns.createCampaign.run({
            data: {
                title: 'A'.repeat(66),
                body: 'Valid body text',
                deepLink: '/product/123'
            },
            auth: superAdminContext
        });
        reportFail("2.3 createCampaign: Should reject title > 65 characters");
    } catch (e) {
        if (e.message.includes("65 characters") || e.code === 'invalid-argument') {
            reportPass("2.3 createCampaign: Rejects title > 65 characters");
        } else {
            reportFail("2.3 createCampaign: Unexpected error for long title", e);
        }
    }

    // 2.4 Invalid Body (> 240 chars)
    try {
        await campaigns.createCampaign.run({
            data: {
                title: 'Valid Title',
                body: 'B'.repeat(241),
                deepLink: '/product/123'
            },
            auth: superAdminContext
        });
        reportFail("2.4 createCampaign: Should reject body > 240 characters");
    } catch (e) {
        if (e.message.includes("240 characters") || e.code === 'invalid-argument') {
            reportPass("2.4 createCampaign: Rejects body > 240 characters");
        } else {
            reportFail("2.4 createCampaign: Unexpected error for long body", e);
        }
    }

    // 2.5 Bad deepLink (not in allow-list)
    try {
        await campaigns.createCampaign.run({
            data: {
                title: 'Malicious Offer',
                body: 'Click here to visit phishing site',
                deepLink: 'https://evil.com/phishing'
            },
            auth: superAdminContext
        });
        reportFail("2.5 createCampaign: Should reject non-allow-listed deepLink");
    } catch (e) {
        if (e.message.includes("allow-list") || e.code === 'invalid-argument') {
            reportPass("2.5 createCampaign: Rejects non-allow-listed deepLink");
        } else {
            reportFail("2.5 createCampaign: Unexpected error for bad deepLink", e);
        }
    }

    // 2.5a Valid CROP audience creates campaign with formatted crop topic
    try {
        const cropRes = await campaigns.createCampaign.run({
            data: {
                title: 'Dhan Crop Advisory',
                body: 'Kitnashak offer for paddy farmers',
                deepLink: '/product/123',
                audience: { type: 'CROP', crop: 'धान (Paddy)' }
            },
            auth: superAdminContext
        });
        const cropSnap = await db.collection("notification_campaigns").doc(cropRes.campaignId).get();
        assert.strictEqual(cropSnap.data().audience.type, 'CROP');
        assert.strictEqual(cropSnap.data().audience.crop, 'धान (Paddy)');
        assert.strictEqual(cropSnap.data().audience.topic, 'crop_paddy');
        reportPass("2.5a createCampaign: Successfully formats and sets CROP topic 'crop_paddy'");
    } catch (e) {
        reportFail("2.5a createCampaign CROP audience failed", e);
    }

    // 2.5b Valid PINCODE audience creates campaign with pin topic
    try {
        const pinRes = await campaigns.createCampaign.run({
            data: {
                title: 'Vaishali Special Offer',
                body: 'Free delivery for 844101',
                deepLink: '/order',
                audience: { type: 'PINCODE', pincode: '844101' }
            },
            auth: superAdminContext
        });
        const pinSnap = await db.collection("notification_campaigns").doc(pinRes.campaignId).get();
        assert.strictEqual(pinSnap.data().audience.type, 'PINCODE');
        assert.strictEqual(pinSnap.data().audience.pincode, '844101');
        assert.strictEqual(pinSnap.data().audience.topic, 'pin_844101');
        reportPass("2.5b createCampaign: Successfully formats and sets PINCODE topic 'pin_844101'");
    } catch (e) {
        reportFail("2.5b createCampaign PINCODE audience failed", e);
    }

    // 2.6 isQuietHoursIST verification with clean getNowIST clock injection
    try {
        const morningTime = new Date('2026-10-13T04:30:00Z'); // 10:00 AM IST -> Not quiet
        const nightTime = new Date('2026-10-13T17:00:00Z');   // 10:30 PM IST -> Quiet
        assert.strictEqual(campaigns.isQuietHoursIST(morningTime), false);
        assert.strictEqual(campaigns.isQuietHoursIST(nightTime), true);

        // Test clockProvider injection
        campaigns.setClockProviderForTesting(() => nightTime);
        assert.strictEqual(campaigns.isQuietHoursIST(), true);
        campaigns.setClockProviderForTesting(() => morningTime);
        assert.strictEqual(campaigns.isQuietHoursIST(), false);
        campaigns.setClockProviderForTesting(null); // Reset

        reportPass("2.6 isQuietHoursIST: Correctly computes IST quiet hours window via clean clock helper");
    } catch (e) {
        reportFail("2.6 isQuietHoursIST verification failed", e);
    }

    // 2.7 Dual Rate Limiting (mgmt counter: 15/hr, test counter: 30/hr)
    try {
        const testAdminUid = "admin-dual-rate-test-uid";
        
        // Test mgmt counter (max 15/hr)
        for (let i = 0; i < 15; i++) {
            await campaigns.checkAdminRateLimit(testAdminUid, 'mgmt');
        }
        try {
            await campaigns.checkAdminRateLimit(testAdminUid, 'mgmt');
            reportFail("2.7 checkAdminRateLimit: Should block 16th mgmt call");
        } catch (reErr) {
            assert(reErr.message.includes("campaign management actions") || reErr.code === 'resource-exhausted');
            reportPass("2.7 checkAdminRateLimit: Correctly limits mgmt actions to 15/hr (campaign_mgmt)");
        }

        // Test test counter (max 30/hr)
        for (let i = 0; i < 30; i++) {
            await campaigns.checkAdminRateLimit(testAdminUid, 'test');
        }
        try {
            await campaigns.checkAdminRateLimit(testAdminUid, 'test');
            reportFail("2.7 checkAdminRateLimit: Should block 31st test call");
        } catch (reErr) {
            assert(reErr.message.includes("test notification sends") || reErr.code === 'resource-exhausted');
            reportPass("2.7 checkAdminRateLimit: Correctly limits test notifications to 30/hr (campaign_test)");
        }
    } catch (e) {
        reportFail("2.7 checkAdminRateLimit dual counter test failed", e);
    }

    // ---------------------------------------------------------------
    // 3. sendTestNotification Tests (Topic & Task D testUserUid)
    // ---------------------------------------------------------------
    console.log("\n--- 3. Testing sendTestNotification ---");
    await resetRateLimits();

    // 3.1 Topic send: test_all
    try {
        fcmSendCalls = [];
        const res = await campaigns.sendTestNotification.run({
            data: {
                title: 'Test Notification Preview',
                body: 'Testing notification layout and links',
                deepLink: '/product/test-prod',
                useTestTopic: true
            },
            auth: superAdminContext
        });

        assert.strictEqual(res.success, true);
        assert.strictEqual(res.mode, 'TOPIC');
        assert.strictEqual(res.topic, 'test_all');
        assert.strictEqual(fcmSendCalls.length, 1);
        assert.strictEqual(fcmSendCalls[0].topic, 'test_all');
        assert.strictEqual(fcmSendCalls[0].notification.title, 'Test Notification Preview');
        assert.strictEqual(fcmSendCalls[0].data.isTest, 'true');
        reportPass("3.1 sendTestNotification: Dispatches to staging topic 'test_all'");
    } catch (e) {
        reportFail("3.1 sendTestNotification test_all route failed", e);
    }

    // 3.2 Task D: testUserUid NOT in allow-list -> rejected BEFORE charging budget
    try {
        await campaigns.sendTestNotification.run({
            data: {
                title: 'Test Target User',
                body: 'Testing direct device push',
                testUserUid: 'unregistered-test-user-01'
            },
            auth: superAdminContext
        });
        reportFail("3.2 sendTestNotification: Should reject testUserUid not in notification_test_users");
    } catch (e) {
        if (e.code === 'permission-denied' && e.message.includes("notification_test_users allow-list")) {
            reportPass("3.2 sendTestNotification: Rejects testUserUid not in notification_test_users allow-list");
        } else {
            reportFail("3.2 sendTestNotification: Unexpected error for non-allow-listed user", e);
        }
    }

    // 3.3 Task D: testUserUid with empty/invalid token docs (no d.data().token) -> throws not-found
    try {
        const allowedUserNoTokens = 'allowed-tester-empty-tokens';
        await db.collection("notification_test_users").doc(allowedUserNoTokens).set({
            name: 'Tester No Valid Tokens',
            enabled: true
        });

        // Subcollection with doc missing 'token' string field (only id)
        await db.collection("users").doc(allowedUserNoTokens).collection("fcm_tokens").doc("fake_id_without_token_field").set({
            platform: "android"
            // token field omitted!
        });

        await campaigns.sendTestNotification.run({
            data: {
                title: 'Test Target User',
                body: 'Testing direct device push',
                testUserUid: allowedUserNoTokens
            },
            auth: superAdminContext
        });
        reportFail("3.3 sendTestNotification: Should throw not-found when doc lacks token string");
    } catch (e) {
        if (e.code === 'not-found' && (e.message.includes("No valid FCM token strings found") || e.message.includes("No active FCM tokens found"))) {
            reportPass("3.3 sendTestNotification: Correctly rejects token docs that lack token string (no d.id fallback)");
        } else {
            reportFail("3.3 sendTestNotification: Unexpected error when tokens missing string", e);
        }
    }

    // 3.4 Task D: testUserUid with active string tokens -> SUCCESS
    try {
        fcmSendCalls = [];
        const allowedUserWithTokens = 'allowed-tester-active';
        await db.collection("notification_test_users").doc(allowedUserWithTokens).set({
            name: 'Active Tester',
            enabled: true
        });

        // Add 3 valid token docs
        const userTokensCol = db.collection("users").doc(allowedUserWithTokens).collection("fcm_tokens");
        await userTokensCol.doc("token_dev_1").set({ token: "fcm_token_dev_1", platform: "android" });
        await userTokensCol.doc("token_dev_2").set({ token: "fcm_token_dev_2", platform: "android" });
        await userTokensCol.doc("token_dev_3").set({ token: "fcm_token_dev_3", platform: "android" });

        const res = await campaigns.sendTestNotification.run({
            data: {
                title: 'Exclusive Device Test',
                body: 'This notification targets specific tester devices',
                deepLink: '/product/bio-npk-500ml',
                testUserUid: allowedUserWithTokens
            },
            auth: superAdminContext
        });

        assert.strictEqual(res.success, true);
        assert.strictEqual(res.mode, 'TEST_USER');
        assert.strictEqual(res.targetUid, allowedUserWithTokens);
        assert.strictEqual(res.tokensAttempted, 3);
        assert.strictEqual(res.successCount, 3);
        assert.strictEqual(fcmSendCalls.length, 1);
        assert.strictEqual(fcmSendCalls[0].tokens.length, 3);

        // Verify audit_logs entry
        const auditSnap = await db.collection("audit_logs")
            .where("action", "==", "NOTIFICATION_TEST_SEND")
            .where("targetUid", "==", allowedUserWithTokens)
            .get();
        assert.strictEqual(auditSnap.size, 1);
        assert.strictEqual(auditSnap.docs[0].data().callerUid, superAdminContext.uid);

        reportPass("3.4 sendTestNotification: Successfully dispatches to allow-listed testUserUid using strictly d.data().token");
    } catch (e) {
        reportFail("3.4 sendTestNotification testUserUid flow failed", e);
    }

    // ---------------------------------------------------------------
    // 4. sendCampaign Quiet Hours & SuperAdmin Override Tests
    // ---------------------------------------------------------------
    console.log("\n--- 4. Testing sendCampaign Quiet Hours & Override Controls ---");
    await resetRateLimits();

    const nightTimeIST = new Date('2026-10-13T17:00:00Z'); // 10:30 PM IST

    // 4.1 Quiet Hours Active: Normal call without override is strictly BLOCKED
    try {
        campaigns.setClockProviderForTesting(() => nightTimeIST);

        const quietCampRef = db.collection("notification_campaigns").doc("camp-quiet-block-test");
        await quietCampRef.set({
            title: 'Quiet Campaign',
            body: 'Should be blocked',
            status: 'DRAFT',
            audience: { topic: 'all_customers' }
        });

        await campaigns.sendCampaign.run({
            data: { campaignId: "camp-quiet-block-test" },
            auth: superAdminContext
        });
        reportFail("4.1 sendCampaign: Should block push during quiet hours without override");
    } catch (e) {
        if (e.code === 'failed-precondition' && e.message.includes("Quiet hours active in India")) {
            reportPass("4.1 sendCampaign: Blocks push during quiet hours when override is omitted");
        } else {
            reportFail("4.1 sendCampaign: Unexpected error for quiet hours block", e);
        }
    }

    // 4.2 Quiet Hours Active: Marketing manager tries override -> strictly REJECTED
    try {
        await campaigns.sendCampaign.run({
            data: { campaignId: "camp-quiet-block-test", overrideQuietHours: true },
            auth: marketingAdminContext
        });
        reportFail("4.2 sendCampaign: Marketing role should be rejected from overriding quiet hours");
    } catch (e) {
        if (e.code === 'permission-denied' && e.message.includes("Only SuperAdmin role is authorized to override quiet hours")) {
            reportPass("4.2 sendCampaign: Strictly rejects Marketing role from overriding quiet hours");
        } else {
            reportFail("4.2 sendCampaign: Unexpected error for Marketing quiet hours override", e);
        }
    }

    // 4.3 Quiet Hours Active: SuperAdmin passes override -> ALLOWED & AUDITED
    try {
        fcmSendCalls = [];
        const res = await campaigns.sendCampaign.run({
            data: { campaignId: "camp-quiet-block-test", overrideQuietHours: true },
            auth: superAdminContext
        });

        assert.strictEqual(res.success, true);
        assert.strictEqual(res.status, 'COMPLETED');

        // Verify quietHoursOverridden written to doc & audit_logs
        const docSnap = await db.collection("notification_campaigns").doc("camp-quiet-block-test").get();
        assert.strictEqual(docSnap.data().quietHoursOverridden, true);

        const auditSnap = await db.collection("audit_logs")
            .where("action", "==", "NOTIFICATION_CAMPAIGN_BROADCAST")
            .where("campaignId", "==", "camp-quiet-block-test")
            .get();
        assert.strictEqual(auditSnap.size, 1);
        assert.strictEqual(auditSnap.docs[0].data().quietHoursOverridden, true);

        reportPass("4.3 sendCampaign: SuperAdmin override allows broadcast during quiet hours and records audit log");
    } catch (e) {
        reportFail("4.3 sendCampaign: SuperAdmin quiet hours override failed", e);
    } finally {
        campaigns.setClockProviderForTesting(null); // Reset clock provider
    }

    // ---------------------------------------------------------------
    // 5. Parallel Idempotency Test on sendCampaign
    // ---------------------------------------------------------------
    console.log("\n--- 5. Testing Parallel Idempotency on sendCampaign ---");
    await resetRateLimits();

    try {
        fcmSendCalls = [];
        const parallelCampId = "camp-parallel-idempotency-test";
        await db.collection("notification_campaigns").doc(parallelCampId).set({
            title: 'Parallel Race Test',
            body: 'Two admins click send at same time',
            status: 'DRAFT',
            audience: { topic: 'all_customers' }
        });

        // Fire both concurrently
        const [res1, res2] = await Promise.allSettled([
            campaigns.sendCampaign.run({
                data: { campaignId: parallelCampId, overrideQuietHours: true },
                auth: superAdminContext
            }),
            campaigns.sendCampaign.run({
                data: { campaignId: parallelCampId, overrideQuietHours: true },
                auth: superAdminContext
            })
        ]);

        const successes = [res1, res2].filter(r => r.status === 'fulfilled');
        const rejections = [res1, res2].filter(r => r.status === 'rejected');

        assert.strictEqual(successes.length, 1, "Exactly one parallel request must succeed");
        assert.strictEqual(rejections.length, 1, "Exactly one parallel request must be rejected");
        assert(rejections[0].reason.message.includes("Double send blocked") || rejections[0].reason.code === 'already-exists');

        // Verify FCM was called exactly ONCE
        assert.strictEqual(fcmSendCalls.length, 1, "FCM topic broadcast must be dispatched exactly ONCE");
        reportPass("5.1 sendCampaign: Concurrent Promise.all calls resolve to exactly 1 FCM send and 1 double-send block");
    } catch (e) {
        reportFail("5.1 Parallel idempotency test failed", e);
    }

    // ---------------------------------------------------------------
    // 6. Campaign State Constraints (CANCELLED & COMPLETED Rejections)
    // ---------------------------------------------------------------
    console.log("\n--- 6. Testing Campaign State Constraints ---");
    await resetRateLimits();

    // 6.1 Cannot send CANCELLED campaign
    try {
        const cancelledCampId = "camp-state-cancelled-test";
        await db.collection("notification_campaigns").doc(cancelledCampId).set({
            title: 'Cancelled Campaign',
            body: 'Should not send',
            status: 'CANCELLED',
            audience: { topic: 'all_customers' }
        });

        await campaigns.sendCampaign.run({
            data: { campaignId: cancelledCampId, overrideQuietHours: true },
            auth: superAdminContext
        });
        reportFail("6.1 sendCampaign: Should reject sending a CANCELLED campaign");
    } catch (e) {
        if (e.code === 'failed-precondition' && e.message.includes("Cannot send a cancelled campaign")) {
            reportPass("6.1 sendCampaign: Strictly rejects sending a CANCELLED campaign");
        } else {
            reportFail("6.1 sendCampaign: Unexpected error on cancelled send", e);
        }
    }

    // 6.2 Cannot cancel already CANCELLED campaign
    try {
        await campaigns.cancelCampaign.run({
            data: { campaignId: "camp-state-cancelled-test" },
            auth: superAdminContext
        });
        reportFail("6.2 cancelCampaign: Should reject cancelling an already CANCELLED campaign");
    } catch (e) {
        if (e.code === 'failed-precondition' && e.message.includes("already cancelled")) {
            reportPass("6.2 cancelCampaign: Strictly rejects cancelling an already CANCELLED campaign");
        } else {
            reportFail("6.2 cancelCampaign: Unexpected error on duplicate cancel", e);
        }
    }

    // 6.3 Cannot cancel COMPLETED campaign
    try {
        await campaigns.cancelCampaign.run({
            data: { campaignId: "camp-parallel-idempotency-test" }, // status is COMPLETED
            auth: superAdminContext
        });
        reportFail("6.3 cancelCampaign: Should reject cancelling a COMPLETED campaign");
    } catch (e) {
        if (e.code === 'failed-precondition' && e.message.includes("Cannot cancel a campaign that is already COMPLETED")) {
            reportPass("6.3 cancelCampaign: Strictly rejects cancelling a COMPLETED campaign");
        } else {
            reportFail("6.3 cancelCampaign: Unexpected error on completed cancel", e);
        }
    }

    // ---------------------------------------------------------------
    // 7. resetStuckCampaign Recovery, FAILED-only validation, & Warning
    // ---------------------------------------------------------------
    console.log("\n--- 7. Testing resetStuckCampaign ---");
    await resetRateLimits();

    // 7.1 Reset stuck < 5 minutes -> strictly REJECTED (even for SuperAdmin)
    try {
        const earlyStuckCampId = "camp-early-stuck-test";
        const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
        await db.collection("notification_campaigns").doc(earlyStuckCampId).set({
            title: 'Early Stuck Campaign',
            status: 'SENDING',
            sentAt: admin.firestore.Timestamp.fromDate(twoMinutesAgo),
            audience: { topic: 'all_customers' }
        });

        await campaigns.resetStuckCampaign.run({
            data: { campaignId: earlyStuckCampId, newStatus: 'FAILED' },
            auth: superAdminContext
        });
        reportFail("7.1 resetStuckCampaign: Should reject reset when elapsed time < 5 minutes");
    } catch (e) {
        if (e.code === 'failed-precondition' && e.message.includes("Reset is allowed after 5 minutes")) {
            reportPass("7.1 resetStuckCampaign: Strictly rejects reset when SENDING elapsed time < 5 minutes");
        } else {
            reportFail("7.1 resetStuckCampaign: Unexpected error for early reset", e);
        }
    }

    // 7.2 Reject newStatus other than 'FAILED' (e.g. 'DRAFT')
    try {
        const matureStuckCampId = "camp-mature-stuck-test";
        const eightMinutesAgo = new Date(Date.now() - 8 * 60 * 1000);
        await db.collection("notification_campaigns").doc(matureStuckCampId).set({
            title: 'Mature Stuck Campaign',
            status: 'SENDING',
            sentAt: admin.firestore.Timestamp.fromDate(eightMinutesAgo),
            audience: { topic: 'all_customers' }
        });

        await campaigns.resetStuckCampaign.run({
            data: { campaignId: matureStuckCampId, newStatus: 'DRAFT' },
            auth: superAdminContext
        });
        reportFail("7.2 resetStuckCampaign: Should reject newStatus 'DRAFT'");
    } catch (e) {
        if (e.code === 'invalid-argument' && e.message.includes("Only 'FAILED' status is allowed")) {
            reportPass("7.2 resetStuckCampaign: Correctly rejects non-FAILED target status (DRAFT rejected)");
        } else {
            reportFail("7.2 resetStuckCampaign: Unexpected error for non-FAILED status", e);
        }
    }

    // 7.3 Reset stuck > 5 minutes to FAILED -> ALLOWED & returns warning
    try {
        const resetRes = await campaigns.resetStuckCampaign.run({
            data: { campaignId: "camp-mature-stuck-test", newStatus: 'FAILED' },
            auth: superAdminContext
        });

        assert.strictEqual(resetRes.success, true);
        assert.strictEqual(resetRes.status, 'FAILED');
        assert(resetRes.elapsedMinutes >= 7);
        assert(resetRes.warning && resetRes.warning.includes("FCM ne message accept kiya ho sakta hai"), "Warning message must be present");

        const snap = await db.collection("notification_campaigns").doc("camp-mature-stuck-test").get();
        assert.strictEqual(snap.data().status, 'FAILED');
        reportPass("7.3 resetStuckCampaign: Successfully resets campaign to FAILED with warning message returned");
    } catch (e) {
        reportFail("7.3 resetStuckCampaign mature recovery failed", e);
    }

    // ---------------------------------------------------------------
    // 8. Testing processDueCampaigns (Scheduled Push Dispatch)
    // ---------------------------------------------------------------
    console.log("\n--- 8. Testing processDueCampaigns (Scheduled Push Dispatch) ---");

    // 8.1 processDueCampaigns: Dispatches due campaign and marks COMPLETED
    try {
        const dueSchedTime = new Date(Date.now() - 5 * 60 * 1000);
        await db.collection("notification_campaigns").doc("camp-due-for-dispatch").set({
            id: "camp-due-for-dispatch",
            title: "Scheduled Alert Due Now",
            body: "This alert is scheduled and due for dispatch",
            deepLink: "/product",
            audience: { type: 'ALL', topic: 'all_customers' },
            status: 'SCHEDULED',
            scheduledAt: admin.firestore.Timestamp.fromDate(dueSchedTime),
            quietHoursOverridden: true,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        const dispatchRes = await campaigns.processDueCampaigns();
        assert(dispatchRes.processed >= 1, "Should have processed at least 1 due campaign");
        assert(dispatchRes.dispatched.includes("camp-due-for-dispatch"), "camp-due-for-dispatch should be dispatched");

        const snap = await db.collection("notification_campaigns").doc("camp-due-for-dispatch").get();
        assert.strictEqual(snap.data().status, 'COMPLETED');
        assert(snap.data().messageId && snap.data().messageId.startsWith('mock-msg-'), "MessageId should start with mock-msg-");

        // Check broadcast_inbox
        const inboxSnap = await db.collection("broadcast_inbox").doc("camp-due-for-dispatch").get();
        assert.strictEqual(inboxSnap.exists, true);
        assert.strictEqual(inboxSnap.data().title, "Scheduled Alert Due Now");

        reportPass("8.1 processDueCampaigns: Successfully dispatches due scheduled campaign and sets COMPLETED");
    } catch (e) {
        reportFail("8.1 processDueCampaigns: Failed to dispatch due campaign", e);
    }

    // 8.2 processDueCampaigns: Does NOT dispatch future campaign
    try {
        const farFuture = new Date(Date.now() + 48 * 3600 * 1000);
        await db.collection("notification_campaigns").doc("camp-far-future").set({
            id: "camp-far-future",
            title: "Far Future Alert",
            body: "Not due yet",
            status: 'SCHEDULED',
            scheduledAt: admin.firestore.Timestamp.fromDate(farFuture),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        const dispatchRes = await campaigns.processDueCampaigns();
        assert(!dispatchRes.dispatched.includes("camp-far-future"), "Future campaign must not be dispatched");

        const snap = await db.collection("notification_campaigns").doc("camp-far-future").get();
        assert.strictEqual(snap.data().status, 'SCHEDULED');
        reportPass("8.2 processDueCampaigns: Correctly ignores future scheduled campaigns");
    } catch (e) {
        reportFail("8.2 processDueCampaigns: Erroneously touched future campaign", e);
    }

    // 8.3 cancelCampaign: Successfully cancels SCHEDULED campaign
    try {
        const cancelRes = await campaigns.cancelCampaign.run({
            data: { campaignId: "camp-far-future" },
            auth: superAdminContext
        });

        assert.strictEqual(cancelRes.success, true);
        const snap = await db.collection("notification_campaigns").doc("camp-far-future").get();
        assert.strictEqual(snap.data().status, 'CANCELLED');
        reportPass("8.3 cancelCampaign: Successfully cancels a SCHEDULED campaign");
    } catch (e) {
        reportFail("8.3 cancelCampaign: Failed to cancel SCHEDULED campaign", e);
    }

    // ---------------------------------------------------------------
    // 9. Testing Feature 2: Customer Segments (Abandoned Cart & Inactive Users)
    // ---------------------------------------------------------------
    console.log("\n--- 9. Testing Customer Segments (Abandoned Cart & Inactive Users) ---");

    // 9.1 createCampaign: Support SEGMENT audience for ABANDONED_CART
    try {
        const segRes = await campaigns.createCampaign.run({
            data: {
                idempotencyKey: 'camp-seg-abandoned-test',
                title: 'Cart Recovery Alert',
                body: 'Your cart items are waiting. Complete order for 10% off!',
                deepLink: '/cart',
                audience: { type: 'SEGMENT', segment: 'ABANDONED_CART' }
            },
            auth: marketingAdminContext
        });

        assert.strictEqual(segRes.success, true);
        const snap = await db.collection("notification_campaigns").doc('camp-seg-abandoned-test').get();
        const data = snap.data();
        assert.strictEqual(data.audience.type, 'SEGMENT');
        assert.strictEqual(data.audience.segment, 'ABANDONED_CART');
        assert.strictEqual(data.audience.topic, 'segment_abandoned_cart');
        assert.strictEqual(data.deepLink, '/cart');
        reportPass("9.1 createCampaign: Successfully creates campaign targeted to ABANDONED_CART segment (topic: segment_abandoned_cart)");
    } catch (e) {
        reportFail("9.1 createCampaign: Failed to create ABANDONED_CART segment campaign", e);
    }

    // 9.2 createCampaign: Support SEGMENT audience for INACTIVE_30D
    try {
        const segRes = await campaigns.createCampaign.run({
            data: {
                idempotencyKey: 'camp-seg-inactive-test',
                title: 'We Miss You!',
                body: 'New harvest supplies have arrived at Krishi Vishal.',
                deepLink: '/product',
                audience: { type: 'SEGMENT', segment: 'INACTIVE_30D' }
            },
            auth: marketingAdminContext
        });

        assert.strictEqual(segRes.success, true);
        const snap = await db.collection("notification_campaigns").doc('camp-seg-inactive-test').get();
        const data = snap.data();
        assert.strictEqual(data.audience.type, 'SEGMENT');
        assert.strictEqual(data.audience.segment, 'INACTIVE_30D');
        assert.strictEqual(data.audience.topic, 'segment_inactive_30d');
        reportPass("9.2 createCampaign: Successfully creates campaign targeted to INACTIVE_30D segment (topic: segment_inactive_30d)");
    } catch (e) {
        reportFail("9.2 createCampaign: Failed to create INACTIVE_30D segment campaign", e);
    }

    // 9.3 createCampaign: Reject unsupported segment
    try {
        await campaigns.createCampaign.run({
            data: {
                title: 'Invalid Segment Test',
                body: 'This should fail validation',
                deepLink: '/product',
                audience: { type: 'SEGMENT', segment: 'INVALID_SEGMENT_NAME' }
            },
            auth: marketingAdminContext
        });
        reportFail("9.3 createCampaign: Should reject unsupported segment");
    } catch (e) {
        if (e.code === 'invalid-argument' && e.message.includes('Unsupported segment')) {
            reportPass("9.3 createCampaign: Correctly rejects unsupported segment with invalid-argument error");
        } else {
            reportFail("9.3 createCampaign: Unexpected error for unsupported segment", e);
        }
    }

    // 9.4 getSegmentCounts: Returns live counts for segments
    try {
        // Seed 2 abandoned cart docs
        await db.collection("abandoned_carts").doc("ac-test-01").set({
            userId: "user-ac-01",
            status: "PENDING",
            cartValue: 1200,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        await db.collection("abandoned_carts").doc("ac-test-02").set({
            userId: "user-ac-02",
            status: "PENDING",
            cartValue: 450,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        const countsRes = await customerSegments.getSegmentCounts.run({
            data: {},
            auth: marketingAdminContext
        });

        assert.strictEqual(countsRes.success, true);
        assert(countsRes.abandonedCartCount >= 2, "abandonedCartCount should be at least 2");
        assert(typeof countsRes.inactive30dCount === 'number', "inactive30dCount should be a number");
        assert.strictEqual(countsRes.segments.ABANDONED_CART.topic, 'segment_abandoned_cart');
        assert.strictEqual(countsRes.segments.INACTIVE_30D.topic, 'segment_inactive_30d');
        reportPass("9.4 getSegmentCounts: Successfully retrieves live segment counts and metadata");
    } catch (e) {
        reportFail("9.4 getSegmentCounts: Failed to get segment counts", e);
    }

    // 9.5 syncCustomerSegmentsCore: Syncs tokens and manages topic subscriptions
    try {
        // Seed an active user with FCM token
        await db.collection("users").doc("user-ac-01").set({
            fcmToken: "mock-token-ac-user-01",
            name: "Farmer Ramesh",
            lastActiveAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Seed an inactive user (>30 days ago) with token
        const fortyDaysAgo = new Date(Date.now() - (40 * 24 * 60 * 60 * 1000));
        await db.collection("users").doc("user-inactive-01").set({
            fcmToken: "mock-token-inactive-user-01",
            name: "Farmer Suresh",
            lastActiveAt: admin.firestore.Timestamp.fromDate(fortyDaysAgo)
        });

        const syncResult = await customerSegments.syncCustomerSegmentsCore(db, mockMessaging);
        assert(typeof syncResult.abandonedCart.subscribed === 'number');
        assert(typeof syncResult.inactive30d.subscribed === 'number');
        reportPass("9.5 syncCustomerSegmentsCore: Successfully executes segment topic token synchronization");
    } catch (e) {
        reportFail("9.5 syncCustomerSegmentsCore: Failed to sync customer segments", e);
    }

    // ---------------------------------------------------------------
    // Summary
    // ---------------------------------------------------------------
    console.log("\n============================================================");
    console.log(`EMULATOR INTEGRATION SUITE SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log("============================================================\n");

    if (failed > 0) process.exit(1);
    process.exit(0);
}

runIntegrationSuite().catch(err => {
    console.error("Test runner crashed:", err);
    process.exit(1);
});
