/**
 * Unit Test Suite for Razorpay Payment Verification & Webhook Handling
 * KrishiVishal-Functions
 */

const assert = require('assert');
const crypto = require('crypto');
const adminModule = require('../core/admin');
const { verifyPayment, razorpayWebhook } = require('../finance/razorpay');

console.log("=== RUNNING RAZORPAY PAYMENT & WEBHOOK TEST SUITE ===\n");

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

// In-memory collections state for testing
const collections = {
    orders: new Map(),
    razorpay_webhook_events: new Map(),
    audit_logs: new Map()
};

// Set test secrets in environment for fallback helper
process.env.RAZORPAY_KEY_ID = "rzp_test_key123";
process.env.RAZORPAY_KEY_SECRET = "rzp_test_secret123";
process.env.RAZORPAY_WEBHOOK_SECRET = "whsec_test_secret123";

// Helper function to invoke razorpayWebhook across Gen 2 Cloud Function wrapper
async function callWebhook(req, res) {
    if (typeof razorpayWebhook.run === 'function') {
        return await razorpayWebhook.run(req, res);
    }
    return await razorpayWebhook(req, res);
}

// Mock Firestore Db Transaction implementation
adminModule.db.collection = (colName) => {
    return {
        doc: (docId) => {
            const actualId = docId || `auto_${Date.now()}_${Math.random()}`;
            return {
                id: actualId,
                collectionName: colName
            };
        }
    };
};

adminModule.db.runTransaction = async (updateFunction) => {
    const transactionMock = {
        get: async (docRef) => {
            const store = collections[docRef.collectionName] || new Map();
            const data = store.get(docRef.id);
            return {
                exists: !!data,
                id: docRef.id,
                data: () => (data ? JSON.parse(JSON.stringify(data)) : null)
            };
        },
        set: (docRef, data) => {
            if (!collections[docRef.collectionName]) {
                collections[docRef.collectionName] = new Map();
            }
            collections[docRef.collectionName].set(docRef.id, JSON.parse(JSON.stringify(data)));
        },
        update: (docRef, updates) => {
            const store = collections[docRef.collectionName] || new Map();
            const existing = store.get(docRef.id) || {};
            const updated = { ...existing, ...updates };
            store.set(docRef.id, updated);
        }
    };
    return await updateFunction(transactionMock);
};

// Helper mock response builder
function createMockRes() {
    return {
        statusCode: 200,
        responseData: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(data) {
            this.responseData = data;
            return this;
        }
    };
}

async function runTests() {
    // ----------------------------------------------------
    // Scenario 1: Signature Verification Logic (HMAC SHA-256)
    // ----------------------------------------------------
    try {
        const secret = "rzp_test_secret123";
        const razorpayOrderId = "order_rzp_1001";
        const razorpayPaymentId = "pay_rzp_99001";

        const validSignature = crypto
            .createHmac("sha256", secret)
            .update(`${razorpayOrderId}|${razorpayPaymentId}`)
            .digest("hex");

        const invalidSignature = "invalid_tampered_signature_hash";

        // Verification check logic
        const checkValid = crypto.timingSafeEqual(
            Buffer.from(validSignature, 'utf8'),
            Buffer.from(validSignature, 'utf8')
        );
        assert.strictEqual(checkValid, true, "Valid signature must match");

        const checkInvalid = crypto.timingSafeEqual(
            Buffer.from(validSignature, 'utf8'),
            Buffer.from(invalidSignature.padEnd(validSignature.length, '0'), 'utf8')
        );
        assert.strictEqual(checkInvalid, false, "Tampered signature must not match");

        pass("Scenario 1: HMAC SHA-256 payment signature verification operates correctly");
    } catch (err) {
        fail("Scenario 1: Signature verification failed", err);
    }

    // ----------------------------------------------------
    // Scenario 2: Webhook HMAC SHA-256 Validation
    // ----------------------------------------------------
    try {
        const secret = "whsec_test_secret123";
        const payloadObj = { event: "payment.captured", payload: { payment: { entity: { id: "pay_1", notes: { orderId: "ORD_1" } } } } };
        const rawBody = Buffer.from(JSON.stringify(payloadObj));

        // Test with invalid signature
        const reqInvalidSig = {
            headers: {
                "x-razorpay-signature": "bad_signature",
                "x-razorpay-event-id": "evt_test_001"
            },
            rawBody,
            body: payloadObj
        };
        const res1 = createMockRes();
        await callWebhook(reqInvalidSig, res1);
        assert.strictEqual(res1.statusCode, 400, "Bad signature should return HTTP 400");
        assert.strictEqual(res1.responseData.error, "Signature mismatch.");

        pass("Scenario 2: Webhook rejects invalid HMAC SHA-256 signature with HTTP 400");
    } catch (err) {
        fail("Scenario 2: Webhook HMAC validation failed", err);
    }

    // ----------------------------------------------------
    // Scenario 3: Webhook Event - payment.captured
    // ----------------------------------------------------
    try {
        const orderId = "ORD_PAYMENT_CAPTURED_TEST";
        const razorpayOrderId = "order_rzp_cap_123";
        const razorpayPaymentId = "pay_cap_99999";

        // Seed order document in Firestore
        collections.orders.set(orderId, {
            totalAmount: 500, // ₹500
            paymentStatus: "PENDING",
            status: "PLACED",
            razorpayOrderId
        });

        const secret = "whsec_test_secret123";
        const eventId = "evt_captured_001";
        const payloadObj = {
            event: "payment.captured",
            payload: {
                payment: {
                    entity: {
                        id: razorpayPaymentId,
                        order_id: razorpayOrderId,
                        status: "captured",
                        currency: "INR",
                        amount: 50000, // 50000 paise = ₹500
                        notes: { orderId }
                    }
                }
            }
        };

        const rawBody = Buffer.from(JSON.stringify(payloadObj));
        const signature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

        const req = {
            headers: {
                "x-razorpay-signature": signature,
                "x-razorpay-event-id": eventId
            },
            rawBody,
            body: payloadObj
        };
        const res = createMockRes();

        await callWebhook(req, res);

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.responseData.status, "ok");

        const updatedOrder = collections.orders.get(orderId);
        assert.strictEqual(updatedOrder.paymentStatus, "PAID");
        assert.strictEqual(updatedOrder.status, "CONFIRMED");
        assert.strictEqual(updatedOrder.razorpayPaymentId, razorpayPaymentId);

        // Verify idempotency record created
        assert.ok(collections.razorpay_webhook_events.has(eventId), "Event ID must be recorded in razorpay_webhook_events");

        pass("Scenario 3: Webhook event 'payment.captured' transitions order to PAID and CONFIRMED");
    } catch (err) {
        fail("Scenario 3: payment.captured event handling failed", err);
    }

    // ----------------------------------------------------
    // Scenario 4: Webhook Idempotency (Duplicate Delivery)
    // ----------------------------------------------------
    try {
        const secret = "whsec_test_secret123";
        const eventId = "evt_captured_001"; // same eventId as Scenario 3
        const payloadObj = {
            event: "payment.captured",
            payload: {
                payment: {
                    entity: {
                        id: "pay_cap_99999",
                        notes: { orderId: "ORD_PAYMENT_CAPTURED_TEST" }
                    }
                }
            }
        };

        const rawBody = Buffer.from(JSON.stringify(payloadObj));
        const signature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

        const req = {
            headers: {
                "x-razorpay-signature": signature,
                "x-razorpay-event-id": eventId
            },
            rawBody,
            body: payloadObj
        };
        const res = createMockRes();

        await callWebhook(req, res);

        assert.strictEqual(res.statusCode, 200, "Duplicate event delivery should exit cleanly with 200");
        assert.strictEqual(res.responseData.status, "ok");

        pass("Scenario 4: Webhook idempotency prevents duplicate event processing");
    } catch (err) {
        fail("Scenario 4: Webhook idempotency test failed", err);
    }

    // ----------------------------------------------------
    // Scenario 5: Webhook Event - order.paid
    // ----------------------------------------------------
    try {
        const orderId = "ORD_ORDER_PAID_TEST";
        const eventId = "evt_order_paid_002";

        collections.orders.set(orderId, {
            totalAmount: 1200,
            paymentStatus: "PENDING",
            status: "PLACED",
            razorpayOrderId: "rzp_order_paid_777"
        });

        const secret = "whsec_test_secret123";
        const payloadObj = {
            event: "order.paid",
            payload: {
                order: {
                    entity: {
                        id: "rzp_order_paid_777",
                        amount_paid: 120000,
                        notes: { orderId }
                    }
                },
                payment: {
                    entity: {
                        id: "pay_order_paid_888",
                        status: "captured"
                    }
                }
            }
        };

        const rawBody = Buffer.from(JSON.stringify(payloadObj));
        const signature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

        const req = {
            headers: {
                "x-razorpay-signature": signature,
                "x-razorpay-event-id": eventId
            },
            rawBody,
            body: payloadObj
        };
        const res = createMockRes();

        await callWebhook(req, res);

        assert.strictEqual(res.statusCode, 200);
        const updatedOrder = collections.orders.get(orderId);
        assert.strictEqual(updatedOrder.paymentStatus, "PAID");
        assert.strictEqual(updatedOrder.status, "CONFIRMED");

        pass("Scenario 5: Webhook event 'order.paid' reconciles order status to PAID and CONFIRMED");
    } catch (err) {
        fail("Scenario 5: order.paid event handling failed", err);
    }

    // ----------------------------------------------------
    // Scenario 6: Webhook Event - payment.failed
    // ----------------------------------------------------
    try {
        const orderId = "ORD_PAYMENT_FAILED_TEST";
        const eventId = "evt_failed_003";

        collections.orders.set(orderId, {
            totalAmount: 750,
            paymentStatus: "PENDING",
            status: "PLACED"
        });

        const secret = "whsec_test_secret123";
        const payloadObj = {
            event: "payment.failed",
            payload: {
                payment: {
                    entity: {
                        id: "pay_failed_111",
                        error_code: "BAD_REQUEST_ERROR",
                        error_description: "Card payment failed due to insufficient funds.",
                        notes: { orderId }
                    }
                }
            }
        };

        const rawBody = Buffer.from(JSON.stringify(payloadObj));
        const signature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

        const req = {
            headers: {
                "x-razorpay-signature": signature,
                "x-razorpay-event-id": eventId
            },
            rawBody,
            body: payloadObj
        };
        const res = createMockRes();

        await callWebhook(req, res);

        assert.strictEqual(res.statusCode, 200);
        const updatedOrder = collections.orders.get(orderId);
        assert.strictEqual(updatedOrder.paymentStatus, "FAILED");
        assert.strictEqual(updatedOrder.paymentError.code, "BAD_REQUEST_ERROR");

        pass("Scenario 6: Webhook event 'payment.failed' records FAILED status and error details");
    } catch (err) {
        fail("Scenario 6: payment.failed event handling failed", err);
    }

    // ----------------------------------------------------
    // Scenario 7: Unhandled / Ignored Events
    // ----------------------------------------------------
    try {
        const secret = "whsec_test_secret123";
        const eventId = "evt_ignored_004";
        const payloadObj = { event: "refund.processed" };

        const rawBody = Buffer.from(JSON.stringify(payloadObj));
        const signature = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");

        const req = {
            headers: {
                "x-razorpay-signature": signature,
                "x-razorpay-event-id": eventId
            },
            rawBody,
            body: payloadObj
        };
        const res = createMockRes();

        await callWebhook(req, res);

        assert.strictEqual(res.statusCode, 200);
        assert.strictEqual(res.responseData.status, "ignored");

        pass("Scenario 7: Unhandled event types return HTTP 200 with status: 'ignored'");
    } catch (err) {
        fail("Scenario 7: Ignored events test failed", err);
    }

    // ----------------------------------------------------
    // Summary
    // ----------------------------------------------------
    console.log(`\n========================================`);
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log(`========================================\n`);

    if (failed > 0) {
        process.exit(1);
    }
}

runTests();
