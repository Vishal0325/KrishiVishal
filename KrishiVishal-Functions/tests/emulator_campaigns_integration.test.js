/**
 * Emulator Integration Tests for Phase 1 Broadcast Callables
 * Runs against local Firestore Emulator (FIRESTORE_EMULATOR_HOST)
 * Fully mocks FCM messaging (admin.messaging & admin.app().messaging) to prevent any network calls.
 */

const assert = require('assert');
process.env.GCLOUD_PROJECT = 'krishivishal-a9ed7';

const { admin, db } = require('../core/admin');
const campaigns = require('../messaging/campaigns');

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
let fcmMulticastSimulateError = null;

const mockMessaging = {
    send: async (msg) => {
        if (fcmSimulateError) {
            throw fcmSimulateError;
        }
        fcmSendCalls.push(msg);
        return `mock-msg-${Date.now()}-${Math.random().toString(36).substring(7)}`;
    },
    sendEachForMulticast: async (payload) => {
        if (fcmMulticastSimulateError) {
            throw fcmMulticastSimulateError;
        }
        fcmSendCalls.push(payload);
        return {
            successCount: payload.tokens.length,
            failureCount: 0,
            responses: payload.tokens.map(t => ({ success: true, messageId: `mock-multi-${t}` }))
        };
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
    // 2. createCampaign Tests
    // ---------------------------------------------------------------
    console.log("\n--- 2. Testing createCampaign ---");

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
        assert.strictEqual(data.createdBy, superAdminContext.uid);
        reportPass("2.1 createCampaign: Valid campaign created with status DRAFT in Firestore");
    } catch (e) {
        reportFail("2.1 createCampaign: Valid campaign creation failed", e);
    }

    // 2.2 Invalid Title (> 65 chars)
    try {
        await campaigns.createCampaign.run({
            data: {
                title: 'A'.repeat(66),
                body: 'Valid body text',
                deepLink: '/product/123'
            },
            auth: superAdminContext
        });
        reportFail("2.2 createCampaign: Should reject title > 65 characters");
    } catch (e) {
        if (e.message.includes("65 characters") || e.code === 'invalid-argument') {
            reportPass("2.2 createCampaign: Rejects title > 65 characters");
        } else {
            reportFail("2.2 createCampaign: Unexpected error for long title", e);
        }
    }

    // 2.3 Invalid Body (> 240 chars)
    try {
        await campaigns.createCampaign.run({
            data: {
                title: 'Valid Title',
                body: 'B'.repeat(241),
                deepLink: '/product/123'
            },
            auth: superAdminContext
        });
        reportFail("2.3 createCampaign: Should reject body > 240 characters");
    } catch (e) {
        if (e.message.includes("240 characters") || e.code === 'invalid-argument') {
            reportPass("2.3 createCampaign: Rejects body > 240 characters");
        } else {
            reportFail("2.3 createCampaign: Unexpected error for long body", e);
        }
    }

    // 2.4 Bad deepLink (not in allow-list)
    try {
        await campaigns.createCampaign.run({
            data: {
                title: 'Malicious Offer',
                body: 'Click here to visit phishing site',
                deepLink: 'https://evil.com/phishing'
            },
            auth: superAdminContext
        });
        reportFail("2.4 createCampaign: Should reject non-allow-listed deepLink");
    } catch (e) {
        if (e.message.includes("allow-list") || e.code === 'invalid-argument') {
            reportPass("2.4 createCampaign: Rejects non-allow-listed deepLink");
        } else {
            reportFail("2.4 createCampaign: Unexpected error for bad deepLink", e);
        }
    }

    // 2.5 isQuietHoursIST verification
    try {
        const morningTime = new Date('2026-10-13T04:30:00Z'); // 10:00 AM IST -> Not quiet
        const nightTime = new Date('2026-10-13T17:00:00Z');   // 10:30 PM IST -> Quiet
        assert.strictEqual(campaigns.isQuietHoursIST(morningTime), false);
        assert.strictEqual(campaigns.isQuietHoursIST(nightTime), true);
        reportPass("2.5 isQuietHoursIST: Correctly computes IST quiet hours window (22:00-07:00 IST)");
    } catch (e) {
        reportFail("2.5 isQuietHoursIST verification failed", e);
    }

    // 2.6 checkAdminRateLimit test
    try {
        const testAdminUid = "admin-rate-limit-test-uid";
        for (let i = 0; i < 15; i++) {
            await campaigns.checkAdminRateLimit(testAdminUid);
        }
        try {
            await campaigns.checkAdminRateLimit(testAdminUid);
            reportFail("2.6 checkAdminRateLimit: Should throw resource-exhausted after 15 calls");
        } catch (reErr) {
            assert(reErr.message.includes("Rate limit exceeded") || reErr.code === 'resource-exhausted');
            reportPass("2.6 checkAdminRateLimit: Correctly blocks admin after 15 campaign actions per hour");
        }
    } catch (e) {
        reportFail("2.6 checkAdminRateLimit test failed", e);
    }

    // ---------------------------------------------------------------
    // 3. sendTestNotification Tests (Topic & Task D testUserUid)
    // ---------------------------------------------------------------
    console.log("\n--- 3. Testing sendTestNotification ---");

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

    // 3.2 Task D: testUserUid NOT in allow-list -> rejected
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

    // 3.3 Task D: testUserUid in allow-list, but NO tokens in users/{uid}/fcm_tokens -> not-found
    try {
        const allowedUserNoTokens = 'allowed-tester-empty-tokens';
        await db.collection("notification_test_users").doc(allowedUserNoTokens).set({
            name: 'Tester No Tokens',
            enabled: true
        });

        await campaigns.sendTestNotification.run({
            data: {
                title: 'Test Target User',
                body: 'Testing direct device push',
                testUserUid: allowedUserNoTokens
            },
            auth: superAdminContext
        });
        reportFail("3.3 sendTestNotification: Should throw not-found when user has no tokens");
    } catch (e) {
        if (e.code === 'not-found' && e.message.includes("No active FCM tokens found")) {
            reportPass("3.3 sendTestNotification: Correctly throws not-found when allow-listed user has 0 tokens");
        } else {
            reportFail("3.3 sendTestNotification: Unexpected error when tokens missing", e);
        }
    }

    // 3.4 Task D: testUserUid in allow-list, WITH active tokens in users/{uid}/fcm_tokens -> SUCCESS
    try {
        fcmSendCalls = [];
        const allowedUserWithTokens = 'allowed-tester-active';
        await db.collection("notification_test_users").doc(allowedUserWithTokens).set({
            name: 'Active Tester',
            enabled: true
        });

        // Add 3 tokens to subcollection users/{uid}/fcm_tokens
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

        reportPass("3.4 sendTestNotification: Successfully dispatches to specific allow-listed testUserUid tokens & records audit log");
    } catch (e) {
        reportFail("3.4 sendTestNotification testUserUid flow failed", e);
    }

    async function resetRateLimits() {
        await db.collection("admin_rate_limits").doc("campaign_" + superAdminContext.uid).delete();
        await db.collection("admin_rate_limits").doc("campaign_" + marketingAdminContext.uid).delete();
    }

    // ---------------------------------------------------------------
    // 4. sendCampaign Quiet Hours & SuperAdmin Override Tests
    // ---------------------------------------------------------------
    console.log("\n--- 4. Testing sendCampaign Quiet Hours & Override Controls ---");
    await resetRateLimits();

    // Mock isQuietHoursIST for quiet hours testing
    const originalIsQuietHours = campaigns.isQuietHoursIST;

    // 4.1 Quiet Hours Active: Normal call without override is strictly BLOCKED
    try {
        campaigns.isQuietHoursIST = () => true; // Force quiet hours simulation

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
        campaigns.isQuietHoursIST = originalIsQuietHours; // Restore original function
    }

    // ---------------------------------------------------------------
    // 5. Parallel Idempotency Test
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
    // 7. resetStuckCampaign Recovery & Time Gate Tests
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

    // 7.2 Reset stuck > 5 minutes -> ALLOWED
    try {
        const matureStuckCampId = "camp-mature-stuck-test";
        const eightMinutesAgo = new Date(Date.now() - 8 * 60 * 1000);
        await db.collection("notification_campaigns").doc(matureStuckCampId).set({
            title: 'Mature Stuck Campaign',
            status: 'SENDING',
            sentAt: admin.firestore.Timestamp.fromDate(eightMinutesAgo),
            audience: { topic: 'all_customers' }
        });

        const resetRes = await campaigns.resetStuckCampaign.run({
            data: { campaignId: matureStuckCampId, newStatus: 'FAILED' },
            auth: superAdminContext
        });

        assert.strictEqual(resetRes.success, true);
        assert.strictEqual(resetRes.status, 'FAILED');
        assert(resetRes.elapsedMinutes >= 7);

        const snap = await db.collection("notification_campaigns").doc(matureStuckCampId).get();
        assert.strictEqual(snap.data().status, 'FAILED');
        reportPass("7.2 resetStuckCampaign: Successfully resets campaign stuck in SENDING > 5 minutes");
    } catch (e) {
        reportFail("7.2 resetStuckCampaign mature recovery failed", e);
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
