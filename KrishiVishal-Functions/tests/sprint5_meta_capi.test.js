const assert = require('assert');
const crypto = require('crypto');
const {
    hashData,
    normalizePhone,
    hashPhone,
    sendCapiEvent
} = require('../marketing/metaCapiClient');
const {
    verifyWebhookChallenge,
    parseLeadPayload
} = require('../marketing/metaLeadWebhook');
const {
    shouldTriggerPurchaseCapi,
    buildPurchaseCapiPayload,
    handleOrderCapiTrigger
} = require('../marketing/marketingTriggers');

console.log("=== RUNNING SPRINT 5: META CONVERSIONS API & DIGITAL LEAD INGESTION TEST SUITE ===\n");

let passed = 0;
let failed = 0;

function pass(name) {
    console.log(`PASS: ${name}`);
    passed++;
}

function fail(name, err) {
    console.error(`FAIL: ${name} - ${err.message || err}`);
    failed++;
}

async function runSprint5Tests() {
    // ─────────────────────────────────────────────────────────────
    // TEST 1: Data Normalization and SHA-256 Hashing
    // ─────────────────────────────────────────────────────────────
    console.log("--- TEST 1: Meta PII Data Normalization & SHA-256 Hashing ---");
    try {
        // 1.1 Phone number normalization
        const phone1 = "9876543210";
        assert.strictEqual(normalizePhone(phone1), "919876543210", "10-digit number must have country code 91 prepended");

        const phone2 = "+91 98765 43210";
        assert.strictEqual(normalizePhone(phone2), "919876543210", "Formatted phone must be stripped of + and spaces");

        const phone3 = "09876543210";
        assert.strictEqual(normalizePhone(phone3), "919876543210", "Leading 0 must be stripped and replaced with 91");

        const phone4 = "919876543210";
        assert.strictEqual(normalizePhone(phone4), "919876543210", "Already normalized phone must remain intact");

        pass("1.1 Phone numbers accurately stripped of spaces, prefixes, and formatted with 91 country code");

        // 1.2 SHA-256 Hashing Verification
        const expectedPhoneHash = crypto.createHash('sha256').update('919876543210').digest('hex');
        assert.strictEqual(hashPhone("+91 98765-43210"), expectedPhoneHash, "hashPhone must match direct SHA-256 of normalized phone");

        const expectedNameHash = crypto.createHash('sha256').update('ramesh').digest('hex');
        assert.strictEqual(hashData("  Ramesh  "), expectedNameHash, "hashData must trim and lowercase before hashing");

        assert.strictEqual(hashData(""), null, "Empty string should return null");
        assert.strictEqual(hashData(null), null, "Null should return null");

        pass("1.2 SHA-256 hashing strictly conforms to Meta CAPI lowercase trimmed hex specification");

    } catch (err) {
        fail("TEST 1 Data Normalization & Hashing", err);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 2: CAPI Client Graceful Credential Guard
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- TEST 2: CAPI Client Credential Guard ---");
    try {
        // Ensure credentials are empty for this test
        const originalToken = process.env.META_ACCESS_TOKEN;
        const originalPixel = process.env.META_PIXEL_ID;
        delete process.env.META_ACCESS_TOKEN;
        delete process.env.META_PIXEL_ID;

        const result = await sendCapiEvent({
            eventName: 'Purchase',
            eventId: 'PURCHASE_TEST_001',
            userData: { phone: '9876543210', firstName: 'Ramesh' },
            customData: { value: 1250, currency: 'INR' }
        });

        assert.strictEqual(result.success, false);
        assert.strictEqual(result.skipped, true);
        assert.strictEqual(result.reason, 'MISSING_CREDENTIALS');
        pass("2.1 sendCapiEvent gracefully resolves with skipped: true when credentials are unconfigured");

        // Restore if were set
        if (originalToken) process.env.META_ACCESS_TOKEN = originalToken;
        if (originalPixel) process.env.META_PIXEL_ID = originalPixel;

    } catch (err) {
        fail("TEST 2 CAPI Client Credential Guard", err);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 3: Meta Webhook GET Challenge Verification
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- TEST 3: Webhook GET Challenge Verification ---");
    try {
        const validQuery = {
            'hub.mode': 'subscribe',
            'hub.verify_token': 'KRISHIVISHAL_LEAD_SECRET',
            'hub.challenge': 'CHALLENGE_ACCEPTED_998877'
        };

        const resValid = verifyWebhookChallenge(validQuery, 'KRISHIVISHAL_LEAD_SECRET');
        assert.strictEqual(resValid.isValid, true);
        assert.strictEqual(resValid.challenge, 'CHALLENGE_ACCEPTED_998877');
        pass("3.1 Valid hub.mode and verify_token correctly verified and challenge returned");

        const invalidQuery = {
            'hub.mode': 'subscribe',
            'hub.verify_token': 'WRONG_TOKEN',
            'hub.challenge': 'CHALLENGE_123'
        };
        const resInvalid = verifyWebhookChallenge(invalidQuery, 'KRISHIVISHAL_LEAD_SECRET');
        assert.strictEqual(resInvalid.isValid, false);
        assert.strictEqual(resInvalid.challenge, null);
        pass("3.2 Invalid verify_token strictly rejected with isValid: false");

        const nonSubscribeQuery = {
            'hub.mode': 'publish',
            'hub.verify_token': 'KRISHIVISHAL_LEAD_SECRET',
            'hub.challenge': 'CHALLENGE_123'
        };
        const resNonSub = verifyWebhookChallenge(nonSubscribeQuery, 'KRISHIVISHAL_LEAD_SECRET');
        assert.strictEqual(resNonSub.isValid, false);
        pass("3.3 Non-subscribe hub.mode correctly rejected");

    } catch (err) {
        fail("TEST 3 Webhook Challenge Verification", err);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 4: Meta Lead Webhook Payload Extraction
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- TEST 4: Lead Document Payload Construction ---");
    try {
        const mockWebhookBody = {
            object: 'page',
            entry: [
                {
                    id: '100200300',
                    time: 1727800000,
                    changes: [
                        {
                            field: 'leadgen',
                            value: {
                                ad_id: 'AD_META_9901',
                                form_id: 'FORM_KHARIF_2026',
                                leadgen_id: 'LEAD_GEN_88776655',
                                page_id: 'PAGE_KRISHI_BIHAR',
                                created_time: 1727800000
                            }
                        }
                    ]
                }
            ]
        };

        const parsedLeads = parseLeadPayload(mockWebhookBody);
        assert.strictEqual(parsedLeads.length, 1);
        const lead = parsedLeads[0];
        assert.strictEqual(lead.leadgenId, 'LEAD_GEN_88776655');
        assert.strictEqual(lead.formId, 'FORM_KHARIF_2026');
        assert.strictEqual(lead.adId, 'AD_META_9901');
        assert.strictEqual(lead.pageId, 'PAGE_KRISHI_BIHAR');
        assert.strictEqual(lead.rawPayload.leadgen_id, 'LEAD_GEN_88776655');

        pass("4.1 Meta leadgen webhook body parsed and extracted lead fields accurately");

        const emptyBody = { object: 'page', entry: [] };
        assert.strictEqual(parseLeadPayload(emptyBody).length, 0);
        pass("4.2 Empty or non-leadgen payloads safely return empty array without throwing");

    } catch (err) {
        fail("TEST 4 Lead Document Payload Construction", err);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 5: Purchase CAPI Trigger & Idempotency Guard
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- TEST 5: Order Lifecycle CAPI Trigger & Idempotency Guard ---");
    try {
        // Scenario 5.1: Order transitions to DELIVERED -> Triggers CAPI
        const oldOrderConfirmed = { status: 'CONFIRMED', paymentStatus: 'PENDING' };
        const newOrderDelivered = {
            status: 'DELIVERED',
            paymentStatus: 'PAID',
            customerPhone: '9876543210',
            customerName: 'Suresh Kumar',
            totalAmount: 1850,
            city: 'Samastipur'
        };

        const shouldTrigger = shouldTriggerPurchaseCapi(newOrderDelivered, oldOrderConfirmed);
        assert.strictEqual(shouldTrigger, true, "Order transitioning to DELIVERED must trigger CAPI");

        // Payload check
        const payload = buildPurchaseCapiPayload('ORD_TEST_99', newOrderDelivered);
        assert.strictEqual(payload.eventName, 'Purchase');
        assert.strictEqual(payload.eventId, 'PURCHASE_ORD_TEST_99');
        assert.strictEqual(payload.userData.phone, '9876543210');
        assert.strictEqual(payload.userData.firstName, 'Suresh Kumar');
        assert.strictEqual(payload.customData.value, 1850);
        assert.strictEqual(payload.customData.currency, 'INR');
        pass("5.1 Order transition to DELIVERED triggers CAPI Purchase payload with unique eventId");

        // Scenario 5.2: Idempotency Guard blocks repeat trigger
        const orderAlreadySent = {
            ...newOrderDelivered,
            metaPurchaseEventSent: true // Flag already set!
        };
        const shouldTriggerAgain = shouldTriggerPurchaseCapi(orderAlreadySent, oldOrderConfirmed);
        assert.strictEqual(shouldTriggerAgain, false, "Idempotency flag metaPurchaseEventSent must strictly block duplicate CAPI calls");
        pass("5.2 Idempotency guard strictly prevents duplicate Purchase event dispatch");

        // Scenario 5.3: Status unchanged does not trigger
        const orderUnchangedOld = { status: 'DELIVERED', paymentStatus: 'PAID' };
        const orderUnchangedNew = { status: 'DELIVERED', paymentStatus: 'PAID' };
        assert.strictEqual(shouldTriggerPurchaseCapi(orderUnchangedNew, orderUnchangedOld), false);
        pass("5.3 Non-transitional order updates do not trigger duplicate CAPI calls");

        // Scenario 5.4: Online payment transition triggers CAPI
        const oldPrepaidOrder = { status: 'PENDING', paymentStatus: 'INITIATED' };
        const newPrepaidOrder = { status: 'CONFIRMED', paymentStatus: 'PAID', totalAmount: 750 };
        assert.strictEqual(shouldTriggerPurchaseCapi(newPrepaidOrder, oldPrepaidOrder), true);
        pass("5.4 Online order payment transition to PAID triggers CAPI conversion");

    } catch (err) {
        fail("TEST 5 Purchase CAPI Trigger & Idempotency Guard", err);
    }

    console.log("\n=======================================================");
    console.log(`SPRINT 5 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log("=======================================================\n");

    if (failed > 0) {
        process.exit(1);
    }
}

runSprint5Tests().catch(err => {
    console.error("Sprint 5 test suite failed unhandled:", err);
    process.exit(1);
});
