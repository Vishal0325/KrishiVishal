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
    }
};

admin.messaging = () => mockMessaging;
if (admin.apps.length > 0) {
    admin.app().messaging = () => mockMessaging;
}

// Mock Auth Contexts
const superAdminContext = {
    uid: 'mock-superadmin-01',
    token: { role: 'SuperAdmin', email: 'superadmin@krishivishal.com', admin: true, isAdmin: true }
};

const customerContext = {
    uid: 'mock-customer-01',
    token: { role: 'Customer', email: 'customer@gmail.com' }
};

let passed = 0;
let failed = 0;

function reportPass(name) {
    passed++;
    console.log(`✅ PASS: ${name}`);
}

function reportFail(name, err) {
    failed++;
    console.error(`❌ FAIL: ${name} ->`, err.message || err);
}

async function runIntegrationSuite() {
    console.log("\n============================================================");
    console.log("RUNNING EMULATOR INTEGRATION SUITE: Phase 1 Broadcast Callables");
    console.log(`Target: Firestore Emulator at ${process.env.FIRESTORE_EMULATOR_HOST}`);
    console.log("============================================================\n");

    // ---------------------------------------------------------------
    // 1. createCampaign Tests
    // ---------------------------------------------------------------
    console.log("--- 1. Testing createCampaign ---");

    // 1.1 Valid Campaign Creation
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

        // Verify doc in Firestore emulator
        const snap = await db.collection("notification_campaigns").doc(validCampaignId).get();
        assert.strictEqual(snap.exists, true);
        const data = snap.data();
        assert.strictEqual(data.title, 'Spring Mustard Seeds Offer');
        assert.strictEqual(data.status, 'DRAFT');
        assert.strictEqual(data.createdBy, superAdminContext.uid);
        reportPass("1.1 createCampaign: Valid campaign created with status DRAFT in Firestore");
    } catch (e) {
        reportFail("1.1 createCampaign: Valid campaign creation failed", e);
    }

    // 1.2 Invalid Title (> 65 chars)
    try {
        await campaigns.createCampaign.run({
            data: {
                title: 'A'.repeat(66),
                body: 'Valid body text',
                deepLink: '/product/123'
            },
            auth: superAdminContext
        });
        reportFail("1.2 createCampaign: Should reject title > 65 characters");
    } catch (e) {
        if (e.message.includes("65 characters") || e.code === 'invalid-argument') {
            reportPass("1.2 createCampaign: Rejects title > 65 characters");
        } else {
            reportFail("1.2 createCampaign: Unexpected error for long title", e);
        }
    }

    // 1.3 Bad deepLink (not /product or /order)
    try {
        await campaigns.createCampaign.run({
            data: {
                title: 'Malicious Offer',
                body: 'Click here to visit phishing site',
                deepLink: 'https://evil.com/phishing'
            },
            auth: superAdminContext
        });
        reportFail("1.3 createCampaign: Should reject non-allow-listed deepLink");
    } catch (e) {
        if (e.message.includes("allow-list") || e.code === 'invalid-argument') {
            reportPass("1.3 createCampaign: Rejects non-allow-listed deepLink");
        } else {
            reportFail("1.3 createCampaign: Unexpected error for bad deepLink", e);
        }
    }

    // 1.4 Quiet Hours validation logic
    try {
        const morningTime = new Date('2026-10-13T04:30:00Z'); // 10:00 AM IST -> Not quiet
        const nightTime = new Date('2026-10-13T17:00:00Z');   // 10:30 PM IST -> Quiet
        assert.strictEqual(campaigns.isQuietHoursIST(morningTime), false);
        assert.strictEqual(campaigns.isQuietHoursIST(nightTime), true);
        reportPass("1.4 isQuietHoursIST: Correctly computes IST quiet hours window (22:00-07:00 IST)");
    } catch (e) {
        reportFail("1.4 isQuietHoursIST verification failed", e);
    }

    // 1.5 checkAdminRateLimit test
    try {
        const testAdminUid = "admin-rate-limit-test-uid";
        for (let i = 0; i < 15; i++) {
            await campaigns.checkAdminRateLimit(testAdminUid);
        }
        try {
            await campaigns.checkAdminRateLimit(testAdminUid);
            reportFail("1.5 checkAdminRateLimit: Should throw resource-exhausted after 15 calls");
        } catch (reErr) {
            assert(reErr.message.includes("Per-admin rate limit reached") || reErr.code === 'resource-exhausted');
            reportPass("1.5 checkAdminRateLimit: Correctly blocks admin after 15 campaign creates per hour");
        }
    } catch (e) {
        reportFail("1.5 checkAdminRateLimit test failed", e);
    }

    // ---------------------------------------------------------------
    // 2. sendTestNotification Tests
    // ---------------------------------------------------------------
    console.log("\n--- 2. Testing sendTestNotification ---");

    // 2.1 Route to test_all topic
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
        reportPass("2.1 sendTestNotification: Dispatches exclusively to staging topic 'test_all'");
    } catch (e) {
        reportFail("2.1 sendTestNotification test_all route failed", e);
    }

    // ---------------------------------------------------------------
    // 3. sendCampaign Tests
    // ---------------------------------------------------------------
    console.log("\n--- 3. Testing sendCampaign ---");

    // 3.1 Successful Broadcast
    try {
        fcmSendCalls = [];
        const res = await campaigns.sendCampaign.run({
            data: {
                campaignId: validCampaignId,
                overrideQuietHours: true // Bypass quiet hours for testing
            },
            auth: superAdminContext
        });

        assert.strictEqual(res.success, true);
        assert.strictEqual(res.status, 'COMPLETED');
        assert(res.messageId, "Message ID must be returned");

        // Verify FCM call payload
        assert.strictEqual(fcmSendCalls.length, 1);
        assert.strictEqual(fcmSendCalls[0].topic, 'all_customers');
        assert.strictEqual(fcmSendCalls[0].notification.title, 'Spring Mustard Seeds Offer');
        assert.strictEqual(fcmSendCalls[0].data.campaignId, validCampaignId);

        // Verify Firestore Campaign Doc state & completedAt Timestamp
        const snap = await db.collection("notification_campaigns").doc(validCampaignId).get();
        const d = snap.data();
        assert.strictEqual(d.status, 'COMPLETED');
        assert(d.completedAt, "completedAt must exist");
        assert(typeof d.completedAt.toDate === 'function', "completedAt must be a Firestore Timestamp");
        assert.strictEqual(d.stats.sent, 1);
        assert.strictEqual(d.stats.failed, 0);

        // Verify broadcast_inbox document created
        const inboxSnap = await db.collection("broadcast_inbox").doc(validCampaignId).get();
        assert.strictEqual(inboxSnap.exists, true);
        assert.strictEqual(inboxSnap.data().title, 'Spring Mustard Seeds Offer');

        // Verify audit_logs entry recorded
        const auditSnap = await db.collection("audit_logs")
            .where("action", "==", "NOTIFICATION_CAMPAIGN_BROADCAST")
            .where("campaignId", "==", validCampaignId)
            .get();
        assert.strictEqual(auditSnap.size, 1);
        assert.strictEqual(auditSnap.docs[0].data().performedBy, superAdminContext.uid);

        reportPass("3.1 sendCampaign: Successfully broadcasts to 'all_customers', marks COMPLETED with Timestamp, creates broadcast_inbox & audit_logs");
    } catch (e) {
        reportFail("3.1 sendCampaign broadcast flow failed", e);
    }

    // 3.2 Duplicate Send Strictly Blocked (Idempotency)
    try {
        await campaigns.sendCampaign.run({
            data: { campaignId: validCampaignId, overrideQuietHours: true },
            auth: superAdminContext
        });
        reportFail("3.2 sendCampaign: Should strictly reject re-sending a COMPLETED campaign");
    } catch (e) {
        if (e.message.includes("Double send blocked") || e.code === 'already-exists') {
            reportPass("3.2 sendCampaign: Idempotency transaction strictly blocks double-send of COMPLETED campaign");
        } else {
            reportFail("3.2 sendCampaign: Unexpected error on double send", e);
        }
    }

    // 3.3 Daily Broadcast Safety Cap (Max 3 COMPLETED per day)
    try {
        // Create 2 additional completed campaigns today in emulator
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        await db.collection("notification_campaigns").doc("camp-dummy-2").set({
            title: 'Dummy 2',
            status: 'COMPLETED',
            completedAt: admin.firestore.Timestamp.fromDate(new Date()),
            audience: { topic: 'all_customers' }
        });
        await db.collection("notification_campaigns").doc("camp-dummy-3").set({
            title: 'Dummy 3',
            status: 'COMPLETED',
            completedAt: admin.firestore.Timestamp.fromDate(new Date()),
            audience: { topic: 'all_customers' }
        });

        // Now total completed today = 3. Attempting 4th must fail.
        const c4Res = await campaigns.createCampaign.run({
            data: { title: '4th Campaign Today', body: 'Should be rate limited', deepLink: '/product/1' },
            auth: superAdminContext
        });

        await campaigns.sendCampaign.run({
            data: { campaignId: c4Res.campaignId, overrideQuietHours: true },
            auth: superAdminContext
        });
        reportFail("3.3 sendCampaign: Should reject broadcast when daily safety cap is reached (>=3)");
    } catch (e) {
        if (e.message.includes("Daily broadcast safety cap reached") || e.code === 'resource-exhausted') {
            reportPass("3.3 sendCampaign: Correctly enforces system safety cap (max 3 ALL-customer broadcasts per day)");
        } else {
            reportFail("3.3 sendCampaign: Unexpected error for rate limit", e);
        }
    } finally {
        // Clean up dummy campaigns so subsequent tests are not blocked by daily cap
        await db.collection("notification_campaigns").doc("camp-dummy-2").delete();
        await db.collection("notification_campaigns").doc("camp-dummy-3").delete();
    }

    // 3.4 FCM Dispatch Failure Handled -> Status FAILED
    try {
        // Create a separate campaign to test failure
        const failCampaignRef = db.collection("notification_campaigns").doc("camp-fcm-failure-test");
        await failCampaignRef.set({
            id: "camp-fcm-failure-test",
            title: 'FCM Failure Test',
            body: 'Testing FCM error resilience',
            deepLink: '/order/123',
            status: 'DRAFT',
            audience: { topic: 'all_customers' },
            createdBy: superAdminContext.uid,
            creatorEmail: superAdminContext.token.email
        });

        // Inject simulated FCM failure
        fcmSimulateError = new Error("FCM Gateway Unavailable (503 Service Unavailable)");

        try {
            await campaigns.sendCampaign.run({
                data: { campaignId: "camp-fcm-failure-test", overrideQuietHours: true },
                auth: superAdminContext
            });
            reportFail("3.4 sendCampaign: Should throw when FCM fails");
        } catch (callErr) {
            // Verify campaign doc marked as FAILED in Firestore
            const failSnap = await db.collection("notification_campaigns").doc("camp-fcm-failure-test").get();
            assert.strictEqual(failSnap.data().status, 'FAILED');
            assert(failSnap.data().error.includes("FCM Gateway Unavailable"));
            assert.strictEqual(failSnap.data().stats.failed, 1);
            reportPass("3.4 sendCampaign: FCM dispatch failure gracefully updates status to FAILED with error details");
        } finally {
            fcmSimulateError = null; // Reset error injection
        }
    } catch (e) {
        reportFail("3.4 FCM error handling test failed", e);
    }

    // ---------------------------------------------------------------
    // 4. cancelCampaign & resetStuckCampaign Tests
    // ---------------------------------------------------------------
    console.log("\n--- 4. Testing cancelCampaign & resetStuckCampaign ---");

    // 4.1 cancelCampaign on DRAFT
    try {
        const draftRes = await campaigns.createCampaign.run({
            data: { title: 'To Be Cancelled', body: 'Draft to cancel', deepLink: '/product/cancel' },
            auth: superAdminContext
        });

        const cancelRes = await campaigns.cancelCampaign.run({
            data: { campaignId: draftRes.campaignId },
            auth: superAdminContext
        });

        assert.strictEqual(cancelRes.success, true);
        assert.strictEqual(cancelRes.status, 'CANCELLED');

        const cancelledSnap = await db.collection("notification_campaigns").doc(draftRes.campaignId).get();
        assert.strictEqual(cancelledSnap.data().status, 'CANCELLED');
        assert.strictEqual(cancelledSnap.data().cancelledBy, superAdminContext.uid);
        reportPass("4.1 cancelCampaign: Successfully transitions DRAFT campaign to CANCELLED");
    } catch (e) {
        reportFail("4.1 cancelCampaign on DRAFT failed", e);
    }

    // 4.2 cancelCampaign on COMPLETED (Blocked)
    try {
        await campaigns.cancelCampaign.run({
            data: { campaignId: validCampaignId }, // validCampaignId was completed in test 3.1
            auth: superAdminContext
        });
        reportFail("4.2 cancelCampaign: Should reject cancelling COMPLETED campaign");
    } catch (e) {
        if (e.message.includes("Cannot cancel a campaign that is already COMPLETED") || e.code === 'failed-precondition') {
            reportPass("4.2 cancelCampaign: Blocks cancelling already COMPLETED campaign");
        } else {
            reportFail("4.2 cancelCampaign: Unexpected error for completed campaign cancel", e);
        }
    }

    // 4.3 resetStuckCampaign (Stuck in SENDING > 5 mins)
    try {
        const stuckCampId = "camp-stuck-test";
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        await db.collection("notification_campaigns").doc(stuckCampId).set({
            title: 'Stuck Campaign',
            status: 'SENDING',
            sentAt: admin.firestore.Timestamp.fromDate(tenMinutesAgo),
            audience: { topic: 'all_customers' }
        });

        const resetRes = await campaigns.resetStuckCampaign.run({
            data: { campaignId: stuckCampId, newStatus: 'FAILED' },
            auth: superAdminContext
        });

        assert.strictEqual(resetRes.success, true);
        assert.strictEqual(resetRes.status, 'FAILED');
        assert(resetRes.elapsedMinutes >= 9, "Elapsed minutes should be >= 9");

        const resetSnap = await db.collection("notification_campaigns").doc(stuckCampId).get();
        assert.strictEqual(resetSnap.data().status, 'FAILED');
        assert(resetSnap.data().recoveryNote.includes("Stuck in SENDING"));
        reportPass("4.3 resetStuckCampaign: Successfully resets campaign stuck in SENDING (>5 mins) to FAILED");
    } catch (e) {
        reportFail("4.3 resetStuckCampaign test failed", e);
    }

    // 4.4 resetStuckCampaign on Non-SENDING Campaign (Blocked)
    try {
        await campaigns.resetStuckCampaign.run({
            data: { campaignId: validCampaignId }, // status is COMPLETED
            auth: superAdminContext
        });
        reportFail("4.4 resetStuckCampaign: Should block reset on non-SENDING campaign");
    } catch (e) {
        if (e.message.includes("Only campaigns in 'SENDING' status can be recovered") || e.code === 'failed-precondition') {
            reportPass("4.4 resetStuckCampaign: Strictly blocks reset on campaigns not in SENDING status");
        } else {
            reportFail("4.4 resetStuckCampaign: Unexpected error for non-SENDING reset", e);
        }
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
