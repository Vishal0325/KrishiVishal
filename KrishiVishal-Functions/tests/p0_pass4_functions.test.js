/**
 * P0 PASS 4 FUNCTION-LEVEL TEST SUITE
 * Tests:
 * 1. serviceMarketplace callable functions (acceptBooking, rejectBooking, verifyStartOtp, verifyEndOtp)
 *    - Guest -> denied (unauthenticated)
 *    - Customer -> denied (permission-denied)
 *    - Wrong partner -> denied (permission-denied)
 *    - Assigned partner -> ok
 * 2. getSecretVal production vs emulator behavior
 *    - Throws in production when secret missing
 *    - Falls back to process.env in emulator/test mode
 * 3. updateOrderStatus role-based state machine
 *    - Customer only CANCEL from PLACED
 *    - Customer denied changing to other statuses
 *    - Assigned rider allowed valid rider transitions
 *    - Assigned rider denied DELIVERED (must use OTP)
 *    - Unassigned rider denied updating order
 *    - Admin allowed transitions
 */

const assert = require('assert');
const { getSecretVal } = require('../core/secrets');
const { acceptBooking, rejectBooking, verifyStartOtp, verifyEndOtp } = require('../src/services/serviceMarketplace');
const { updateOrderStatus, verifyScannedQR, generateSignedQRPayload } = require('../orders/orderFlow');
const { claimRiderRole, setUserRole } = require('../auth/roleProvisioning');
const { db, admin, auth } = require('../core/admin');

console.log("=== RUNNING P0 PASS 4 FUNCTION-LEVEL TESTS ===\n");

let passed = 0;
let failed = 0;

function pass(name) {
    console.log(`PASS: ${name}`);
    passed++;
}

function fail(name, err) {
    console.log(`FAIL: ${name} - ${err.message || err}`);
    failed++;
}

async function runTests() {
    // ── 1. getSecretVal Tests (Item D) ──
    console.log("--- 1. getSecretVal Production Throw vs Emulator Fallback ---");
    // Test 1.1: Production environment throws when secret is missing
    const origNodeEnv = process.env.NODE_ENV;
    const origEmulator = process.env.FUNCTIONS_EMULATOR;

    process.env.NODE_ENV = 'production';
    delete process.env.FUNCTIONS_EMULATOR;
    delete process.env.TEST_PROD_SECRET;

    try {
        getSecretVal(null, 'TEST_PROD_SECRET');
        fail("1.1 getSecretVal in production mode", new Error("Should have thrown in production!"));
    } catch (e) {
        if (e.message.includes("is missing or undefined in production environment")) {
            pass("1.1 getSecretVal in production mode throws on missing secret");
        } else {
            fail("1.1 getSecretVal in production mode", e);
        }
    }

    // Test 1.2: Emulator mode falls back to env
    process.env.FUNCTIONS_EMULATOR = 'true';
    process.env.TEST_EMULATOR_SECRET = 'sample_secret_value_123';
    try {
        const val = getSecretVal(null, 'TEST_EMULATOR_SECRET');
        assert.strictEqual(val, 'sample_secret_value_123');
        pass("1.2 getSecretVal in emulator mode correctly returns process.env fallback");
    } catch (e) {
        fail("1.2 getSecretVal in emulator mode", e);
    }

    // Restore test environment
    process.env.NODE_ENV = 'test';
    delete process.env.FUNCTIONS_EMULATOR;

    // ── 2. serviceMarketplace Authorization Tests (Item C) ──
    console.log("\n--- 2. serviceMarketplace Role Authorization Guards ---");

    // Test 2.1: acceptBooking: Guest -> denied
    try {
        await acceptBooking.run({ data: { bookingId: 'b1' }, auth: null });
        fail("2.1 acceptBooking guest", new Error("Allowed guest!"));
    } catch (e) {
        if (e.code === 'unauthenticated') {
            pass("2.1 acceptBooking correctly denied guest (unauthenticated)");
        } else {
            fail("2.1 acceptBooking guest", e);
        }
    }

    // Test 2.2: acceptBooking: Customer -> denied
    try {
        await acceptBooking.run({
            data: { bookingId: 'b1' },
            auth: { uid: 'cust1', token: { role: 'Customer' } }
        });
        fail("2.2 acceptBooking customer", new Error("Allowed customer!"));
    } catch (e) {
        if (e.code === 'permission-denied') {
            pass("2.2 acceptBooking correctly denied customer (permission-denied)");
        } else {
            fail("2.2 acceptBooking customer", e);
        }
    }

    // Test 2.3: rejectBooking: Guest -> denied
    try {
        await rejectBooking.run({ data: { bookingId: 'b1', reason: 'busy' }, auth: null });
        fail("2.3 rejectBooking guest", new Error("Allowed guest!"));
    } catch (e) {
        if (e.code === 'unauthenticated') {
            pass("2.3 rejectBooking correctly denied guest (unauthenticated)");
        } else {
            fail("2.3 rejectBooking guest", e);
        }
    }

    // Test 2.4: rejectBooking: Customer -> denied
    try {
        await rejectBooking.run({
            data: { bookingId: 'b1', reason: 'busy' },
            auth: { uid: 'cust1', token: { role: 'Customer' } }
        });
        fail("2.4 rejectBooking customer", new Error("Allowed customer!"));
    } catch (e) {
        if (e.code === 'permission-denied') {
            pass("2.4 rejectBooking correctly denied customer (permission-denied)");
        } else {
            fail("2.4 rejectBooking customer", e);
        }
    }

    // Test 2.5: verifyStartOtp: Guest -> denied
    try {
        await verifyStartOtp.run({ data: { bookingId: 'b1', otp: '1234' }, auth: null });
        fail("2.5 verifyStartOtp guest", new Error("Allowed guest!"));
    } catch (e) {
        if (e.code === 'unauthenticated') {
            pass("2.5 verifyStartOtp correctly denied guest (unauthenticated)");
        } else {
            fail("2.5 verifyStartOtp guest", e);
        }
    }

    // Test 2.6: verifyStartOtp: Customer -> denied
    try {
        await verifyStartOtp.run({
            data: { bookingId: 'b1', otp: '1234' },
            auth: { uid: 'cust1', token: { role: 'Customer' } }
        });
        fail("2.6 verifyStartOtp customer", new Error("Allowed customer!"));
    } catch (e) {
        if (e.code === 'permission-denied') {
            pass("2.6 verifyStartOtp correctly denied customer (permission-denied)");
        } else {
            fail("2.6 verifyStartOtp customer", e);
        }
    }

    // Test 2.7: verifyEndOtp: Guest -> denied
    try {
        await verifyEndOtp.run({ data: { bookingId: 'b1', otp: '1234' }, auth: null });
        fail("2.7 verifyEndOtp guest", new Error("Allowed guest!"));
    } catch (e) {
        if (e.code === 'unauthenticated') {
            pass("2.7 verifyEndOtp correctly denied guest (unauthenticated)");
        } else {
            fail("2.7 verifyEndOtp guest", e);
        }
    }

    // Test 2.8: verifyEndOtp: Customer -> denied
    try {
        await verifyEndOtp.run({
            data: { bookingId: 'b1', otp: '1234' },
            auth: { uid: 'cust1', token: { role: 'Customer' } }
        });
        fail("2.8 verifyEndOtp customer", new Error("Allowed customer!"));
    } catch (e) {
        if (e.code === 'permission-denied') {
            pass("2.8 verifyEndOtp correctly denied customer (permission-denied)");
        } else {
            fail("2.8 verifyEndOtp customer", e);
        }
    }

    // ── 3. Partner Assignment Verification for verifyStartOtp & verifyEndOtp ──
    console.log("\n--- 3. Partner Assignment Checks (Wrong Partner vs Assigned Partner) ---");
    const originalCollection = db.collection.bind(db);

    const mockBookingData = {
        id: 'booking_100',
        assignedPartnerId: 'partner_assigned_uid',
        status: 'ASSIGNED',
        startOtp: '5678',
        endOtp: '8765',
        farmerId: 'farmer_alice'
    };

    let updatedFields = {};
    db.collection = function (collName) {
        if (collName === 'service_bookings') {
            return {
                doc: (id) => ({
                    get: async () => ({
                        exists: id === 'booking_100',
                        data: () => ({ ...mockBookingData })
                    }),
                    update: async (fields) => {
                        Object.assign(updatedFields, fields);
                    }
                })
            };
        }
        return originalCollection(collName);
    };

    // Test 3.1: verifyStartOtp: Wrong Partner -> denied
    try {
        await verifyStartOtp.run({
            data: { bookingId: 'booking_100', otp: '5678' },
            auth: { uid: 'partner_wrong_uid', token: { role: 'Partner' } }
        });
        fail("3.1 verifyStartOtp wrong partner", new Error("Allowed wrong partner!"));
    } catch (e) {
        if (e.code === 'permission-denied' && e.message.includes('Not assigned')) {
            pass("3.1 verifyStartOtp denied wrong partner (Not assigned to this partner)");
        } else {
            fail("3.1 verifyStartOtp wrong partner", e);
        }
    }

    // Test 3.2: verifyStartOtp: Assigned Partner with valid OTP -> OK
    try {
        const res = await verifyStartOtp.run({
            data: { bookingId: 'booking_100', otp: '5678' },
            auth: { uid: 'partner_assigned_uid', token: { role: 'Partner' } }
        });
        if (res && res.status === 'IN_PROGRESS') {
            pass("3.2 verifyStartOtp allowed assigned partner with correct OTP (status -> IN_PROGRESS)");
        } else {
            fail("3.2 verifyStartOtp assigned partner", new Error("Did not return IN_PROGRESS"));
        }
    } catch (e) {
        fail("3.2 verifyStartOtp assigned partner", e);
    }

    // Test 3.3: verifyEndOtp: Wrong Partner -> denied
    mockBookingData.status = 'IN_PROGRESS';
    try {
        await verifyEndOtp.run({
            data: { bookingId: 'booking_100', otp: '8765' },
            auth: { uid: 'partner_wrong_uid', token: { role: 'Serviceman' } }
        });
        fail("3.3 verifyEndOtp wrong partner", new Error("Allowed wrong partner!"));
    } catch (e) {
        if (e.code === 'permission-denied' && e.message.includes('Not assigned')) {
            pass("3.3 verifyEndOtp denied wrong partner (Not assigned to this partner)");
        } else {
            fail("3.3 verifyEndOtp wrong partner", e);
        }
    }

    // Test 3.4: verifyEndOtp: Assigned Partner with valid OTP -> OK
    try {
        const res = await verifyEndOtp.run({
            data: { bookingId: 'booking_100', otp: '8765' },
            auth: { uid: 'partner_assigned_uid', token: { role: 'Serviceman' } }
        });
        if (res && res.status === 'COMPLETED') {
            pass("3.4 verifyEndOtp allowed assigned partner with correct OTP (status -> COMPLETED)");
        } else {
            fail("3.4 verifyEndOtp assigned partner", new Error("Did not return COMPLETED"));
        }
    } catch (e) {
        fail("3.4 verifyEndOtp assigned partner", e);
    }

    // ── 4. updateOrderStatus Role-Based Transitions (Item G) ──
    console.log("\n--- 4. updateOrderStatus Role-Based State Machine Tests ---");

    const mockOrderData = {
        id: 'ord_state_1',
        userId: 'customer_alice',
        riderId: 'rider_bob',
        status: 'PLACED'
    };

    db.collection = function (collName) {
        if (collName === 'orders') {
            return {
                doc: (id) => ({
                    get: async () => ({
                        exists: id === 'ord_state_1',
                        data: () => ({ ...mockOrderData })
                    }),
                    update: async (fields) => {
                        Object.assign(mockOrderData, fields);
                    }
                })
            };
        }
        if (collName === 'outbox') {
            return {
                doc: () => ({ set: async () => {} })
            };
        }
        return originalCollection(collName);
    };

    // Test 4.1: Customer can cancel own order from PLACED
    try {
        mockOrderData.status = 'PLACED';
        const res = await updateOrderStatus.run({
            data: { orderId: 'ord_state_1', targetStatus: 'CANCELLED' },
            auth: { uid: 'customer_alice', token: { role: 'Customer' } }
        });
        assert.strictEqual(res.to, 'CANCELLED');
        pass("4.1 Customer CAN cancel own order from PLACED");
    } catch (e) {
        fail("4.1 Customer CAN cancel own order from PLACED", e);
    }

    // Test 4.2: Customer CANNOT set order to READY_FOR_PACKING or DELIVERED
    try {
        mockOrderData.status = 'PLACED';
        await updateOrderStatus.run({
            data: { orderId: 'ord_state_1', targetStatus: 'READY_FOR_PACKING' },
            auth: { uid: 'customer_alice', token: { role: 'Customer' } }
        });
        fail("4.2 Customer set READY_FOR_PACKING", new Error("Allowed customer to advance order!"));
    } catch (e) {
        if (e.code === 'permission-denied') {
            pass("4.2 Customer CANNOT transition order to READY_FOR_PACKING (permission-denied)");
        } else {
            fail("4.2 Customer set READY_FOR_PACKING", e);
        }
    }

    // Test 4.3: Unassigned user CANNOT update order
    try {
        await updateOrderStatus.run({
            data: { orderId: 'ord_state_1', targetStatus: 'CANCELLED' },
            auth: { uid: 'stranger_charlie', token: { role: 'Customer' } }
        });
        fail("4.3 Stranger update order", new Error("Allowed stranger!"));
    } catch (e) {
        if (e.code === 'permission-denied') {
            pass("4.3 Unassigned user CANNOT update another user's order (permission-denied)");
        } else {
            fail("4.3 Stranger update order", e);
        }
    }

    // Test 4.4: Unassigned rider CANNOT update order
    try {
        mockOrderData.status = 'RIDER_ASSIGNED';
        await updateOrderStatus.run({
            data: { orderId: 'ord_state_1', targetStatus: 'RIDER_ACCEPTED' },
            auth: { uid: 'rider_wrong', token: { role: 'Rider' } }
        });
        fail("4.4 Unassigned rider update", new Error("Allowed unassigned rider!"));
    } catch (e) {
        if (e.code === 'permission-denied') {
            pass("4.4 Unassigned rider CANNOT update order (permission-denied)");
        } else {
            fail("4.4 Unassigned rider update", e);
        }
    }

    // Test 4.5: Assigned rider CAN accept assigned order
    try {
        mockOrderData.status = 'RIDER_ASSIGNED';
        const res = await updateOrderStatus.run({
            data: { orderId: 'ord_state_1', targetStatus: 'RIDER_ACCEPTED' },
            auth: { uid: 'rider_bob', token: { role: 'Rider' } }
        });
        assert.strictEqual(res.to, 'RIDER_ACCEPTED');
        pass("4.5 Assigned rider CAN accept order (RIDER_ASSIGNED -> RIDER_ACCEPTED)");
    } catch (e) {
        fail("4.5 Assigned rider CAN accept order", e);
    }

    // Test 4.6: Assigned rider CAN start delivery (RIDER_ACCEPTED -> OUT_FOR_DELIVERY)
    try {
        mockOrderData.status = 'RIDER_ACCEPTED';
        const res = await updateOrderStatus.run({
            data: { orderId: 'ord_state_1', targetStatus: 'OUT_FOR_DELIVERY' },
            auth: { uid: 'rider_bob', token: { role: 'Rider' } }
        });
        assert.strictEqual(res.to, 'OUT_FOR_DELIVERY');
        pass("4.6 Assigned rider CAN start delivery (RIDER_ACCEPTED -> OUT_FOR_DELIVERY)");
    } catch (e) {
        fail("4.6 Assigned rider start delivery", e);
    }

    // Test 4.7: Assigned rider CANNOT set DELIVERED via updateOrderStatus (must use verifyDeliveryOTP)
    try {
        mockOrderData.status = 'OUT_FOR_DELIVERY';
        await updateOrderStatus.run({
            data: { orderId: 'ord_state_1', targetStatus: 'DELIVERED' },
            auth: { uid: 'rider_bob', token: { role: 'Rider' } }
        });
        fail("4.7 Rider direct DELIVERED", new Error("Allowed rider direct DELIVERED!"));
    } catch (e) {
        if (e.code === 'permission-denied' && e.message.includes('verifyDeliveryOTP')) {
            pass("4.7 Assigned rider CANNOT directly set DELIVERED in updateOrderStatus (blocked: must use OTP)");
        } else {
            fail("4.7 Rider direct DELIVERED", e);
        }
    }

    // Test 4.8: Assigned rider CAN set DELIVERY_FAILED from OUT_FOR_DELIVERY
    try {
        mockOrderData.status = 'OUT_FOR_DELIVERY';
        const res = await updateOrderStatus.run({
            data: { orderId: 'ord_state_1', targetStatus: 'DELIVERY_FAILED' },
            auth: { uid: 'rider_bob', token: { role: 'Rider' } }
        });
        assert.strictEqual(res.to, 'DELIVERY_FAILED');
        pass("4.8 Assigned rider CAN set DELIVERY_FAILED from OUT_FOR_DELIVERY");
    } catch (e) {
        fail("4.8 Assigned rider DELIVERY_FAILED", e);
    }

    // Test 4.9: Admin CAN perform operational transitions
    try {
        mockOrderData.status = 'PACKING';
        const res = await updateOrderStatus.run({
            data: { orderId: 'ord_state_1', targetStatus: 'PACKED' },
            auth: { uid: 'admin_1', token: { role: 'OrderManager' } }
        });
        assert.strictEqual(res.to, 'PACKED');
        pass("4.9 Admin CAN perform operational transitions (PACKING -> PACKED)");
    } catch (e) {
        fail("4.9 Admin transition", e);
    }

    // Test 4.10: Assigned rider CAN transition ASSIGNED -> OUT_FOR_DELIVERY
    try {
        mockOrderData.status = 'ASSIGNED';
        const res = await updateOrderStatus.run({
            data: { orderId: 'ord_state_1', targetStatus: 'OUT_FOR_DELIVERY' },
            auth: { uid: 'rider_bob', token: { role: 'Rider' } }
        });
        assert.strictEqual(res.to, 'OUT_FOR_DELIVERY');
        pass("4.10 Assigned rider CAN transition ASSIGNED -> OUT_FOR_DELIVERY");
    } catch (e) {
        fail("4.10 Assigned rider ASSIGNED -> OUT_FOR_DELIVERY", e);
    }

    // Test 4.11: Assigned rider CAN transition ASSIGNED -> RIDER_ACCEPTED
    try {
        mockOrderData.status = 'ASSIGNED';
        const res = await updateOrderStatus.run({
            data: { orderId: 'ord_state_1', targetStatus: 'RIDER_ACCEPTED' },
            auth: { uid: 'rider_bob', token: { role: 'Rider' } }
        });
        assert.strictEqual(res.to, 'RIDER_ACCEPTED');
        pass("4.11 Assigned rider CAN transition ASSIGNED -> RIDER_ACCEPTED");
    } catch (e) {
        fail("4.11 Assigned rider ASSIGNED -> RIDER_ACCEPTED", e);
    }

    // Test 4.12: Admin CAN transition READY_FOR_PICKUP -> ASSIGNED
    try {
        mockOrderData.status = 'READY_FOR_PICKUP';
        const res = await updateOrderStatus.run({
            data: { orderId: 'ord_state_1', targetStatus: 'ASSIGNED' },
            auth: { uid: 'admin_1', token: { role: 'OrderManager' } }
        });
        assert.strictEqual(res.to, 'ASSIGNED');
        pass("4.12 Admin CAN transition READY_FOR_PICKUP -> ASSIGNED");
    } catch (e) {
        fail("4.12 Admin transition READY_FOR_PICKUP -> ASSIGNED", e);
    }

    // Restore collection for order tests
    db.collection = originalCollection;

    // ── 5. claimRiderRole Role Provisioning Tests (Pass 5 Item 1) ──
    console.log("\n--- 5. claimRiderRole Role Provisioning Guards ---");

    const originalAuthGetUser = auth.getUser;
    const originalAuthSetClaims = auth.setCustomUserClaims;

    let userClaimsStore = {
        'user_rider_1': { email: 'rider1@example.com' },
        'user_rider_2': {},
        'user_partner_1': { phone_verified: true }
    };

    auth.getUser = async (uid) => ({
        uid,
        customClaims: userClaimsStore[uid] || {}
    });
    auth.setCustomUserClaims = async (uid, claims) => {
        userClaimsStore[uid] = claims;
    };

    let whitelistStore = {
        '+919876543210': { phone: '+919876543210', name: 'Rider Ramesh', role: 'rider', status: 'PENDING' },
        '9876543211': { phone: '+919876543211', name: 'Rider Suresh', role: 'rider', status: 'PENDING' },
        '+919876543212': { phone: '+919876543212', name: 'Partner Mohan', role: 'service_man', status: 'PENDING' }
    };
    let ridersStore = {};
    let usersStore = {};

    db.collection = function (collName) {
        if (collName === 'whitelisted_riders') {
            return {
                doc: (id) => ({
                    get: async () => ({
                        exists: Boolean(whitelistStore[id]),
                        data: () => whitelistStore[id] || {}
                    }),
                    set: async (data, opts) => {
                        whitelistStore[id] = { ...(whitelistStore[id] || {}), ...data };
                    }
                }),
                where: (field, op, val) => ({
                    limit: () => ({
                        get: async () => {
                            const foundKey = Object.keys(whitelistStore).find(k => whitelistStore[k][field] === val);
                            if (foundKey) {
                                return {
                                    empty: false,
                                    docs: [{
                                        id: foundKey,
                                        data: () => whitelistStore[foundKey],
                                        ref: {
                                            set: async (data, opts) => {
                                                whitelistStore[foundKey] = { ...(whitelistStore[foundKey] || {}), ...data };
                                            }
                                        }
                                    }]
                                };
                            }
                            return { empty: true, docs: [] };
                        }
                    })
                })
            };
        }
        if (collName === 'riders') {
            return {
                doc: (id) => ({
                    set: async (data, opts) => {
                        ridersStore[id] = { ...(ridersStore[id] || {}), ...data };
                    },
                    get: async () => ({
                        exists: Boolean(ridersStore[id]),
                        data: () => ridersStore[id] || {}
                    })
                })
            };
        }
        if (collName === 'users') {
            return {
                doc: (id) => ({
                    set: async (data, opts) => {
                        usersStore[id] = { ...(usersStore[id] || {}), ...data };
                    },
                    get: async () => ({
                        exists: Boolean(usersStore[id]),
                        data: () => usersStore[id] || {}
                    })
                })
            };
        }
        return originalCollection(collName);
    };

    // Test 5.1: Guest -> denied
    try {
        await claimRiderRole.run({ auth: null });
        fail("5.1 claimRiderRole guest", new Error("Allowed guest!"));
    } catch (e) {
        if (e.code === 'unauthenticated') {
            pass("5.1 claimRiderRole correctly denied unauthenticated caller");
        } else {
            fail("5.1 claimRiderRole guest", e);
        }
    }

    // Test 5.2: Anonymous user -> denied
    try {
        await claimRiderRole.run({
            auth: { uid: 'anon_1', token: { firebase: { sign_in_provider: 'anonymous' } } }
        });
        fail("5.2 claimRiderRole anonymous", new Error("Allowed anonymous!"));
    } catch (e) {
        if (e.code === 'permission-denied') {
            pass("5.2 claimRiderRole correctly denied anonymous user");
        } else {
            fail("5.2 claimRiderRole anonymous", e);
        }
    }

    // Test 5.3: Missing phone number -> denied
    try {
        await claimRiderRole.run({
            auth: { uid: 'u_no_phone', token: { firebase: { sign_in_provider: 'password' } } }
        });
        fail("5.3 claimRiderRole missing phone", new Error("Allowed missing phone!"));
    } catch (e) {
        if (e.code === 'failed-precondition') {
            pass("5.3 claimRiderRole correctly denied token without phone_number");
        } else {
            fail("5.3 claimRiderRole missing phone", e);
        }
    }

    // Test 5.4: Phone not whitelisted -> denied
    try {
        await claimRiderRole.run({
            auth: { uid: 'u_not_whitelisted', token: { phone_number: '+919999999999', firebase: { sign_in_provider: 'phone' } } }
        });
        fail("5.4 claimRiderRole not whitelisted", new Error("Allowed non-whitelisted phone!"));
    } catch (e) {
        if (e.code === 'permission-denied') {
            pass("5.4 claimRiderRole correctly denied non-whitelisted phone number");
        } else {
            fail("5.4 claimRiderRole not whitelisted", e);
        }
    }

    // Test 5.5: Whitelisted rider with E.164 doc ID -> succeeds, sets custom claim role='Rider' & merges
    try {
        const res = await claimRiderRole.run({
            auth: { uid: 'user_rider_1', token: { phone_number: '+919876543210', firebase: { sign_in_provider: 'phone' } } }
        });
        assert.strictEqual(res.role, 'Rider');
        assert.strictEqual(res.status, 'REGISTERED');
        assert.strictEqual(userClaimsStore['user_rider_1'].role, 'Rider');
        assert.strictEqual(userClaimsStore['user_rider_1'].email, 'rider1@example.com'); // Proves merge!
        assert.strictEqual(whitelistStore['+919876543210'].status, 'REGISTERED');
        assert.strictEqual(whitelistStore['+919876543210'].uid, 'user_rider_1');
        assert.strictEqual(ridersStore['user_rider_1'].role, 'Rider');
        pass("5.5 claimRiderRole succeeded for E.164 phone, set role='Rider', merged claims, updated whitelist doc");
    } catch (e) {
        fail("5.5 claimRiderRole E.164 phone", e);
    }

    // Test 5.6: Whitelisted rider with 10-digit ID doc -> succeeds
    try {
        const res = await claimRiderRole.run({
            auth: { uid: 'user_rider_2', token: { phone_number: '+919876543211', firebase: { sign_in_provider: 'phone' } } }
        });
        assert.strictEqual(res.role, 'Rider');
        assert.strictEqual(res.status, 'REGISTERED');
        assert.strictEqual(userClaimsStore['user_rider_2'].role, 'Rider');
        assert.strictEqual(whitelistStore['9876543211'].status, 'REGISTERED');
        assert.strictEqual(whitelistStore['9876543211'].uid, 'user_rider_2');
        pass("5.6 claimRiderRole succeeded for 10-digit ID doc, set role='Rider'");
    } catch (e) {
        fail("5.6 claimRiderRole 10-digit ID", e);
    }

    // Test 5.7: Whitelisted role service_man -> assigns Serviceman role
    try {
        const res = await claimRiderRole.run({
            auth: { uid: 'user_partner_1', token: { phone_number: '+919876543212', firebase: { sign_in_provider: 'phone' } } }
        });
        assert.strictEqual(res.role, 'Serviceman');
        assert.strictEqual(userClaimsStore['user_partner_1'].role, 'Serviceman');
        assert.strictEqual(userClaimsStore['user_partner_1'].phone_verified, true); // Proves merge!
        pass("5.7 claimRiderRole assigned role='Serviceman' for service_man whitelist entry");
    } catch (e) {
        fail("5.7 claimRiderRole service_man", e);
    }

    // ── 6. setUserRole Admin Role Provisioning Tests (Pass 5 Item 1) ──
    console.log("\n--- 6. setUserRole Admin Role Provisioning Guards ---");

    // Test 6.1: Guest -> denied
    try {
        await setUserRole.run({ data: { targetUid: 'u1', role: 'Serviceman' }, auth: null });
        fail("6.1 setUserRole guest", new Error("Allowed guest!"));
    } catch (e) {
        if (e.code === 'unauthenticated') {
            pass("6.1 setUserRole correctly denied unauthenticated caller");
        } else {
            fail("6.1 setUserRole guest", e);
        }
    }

    // Test 6.2: Normal user / Rider -> denied
    try {
        await setUserRole.run({
            data: { targetUid: 'u1', role: 'Serviceman' },
            auth: { uid: 'rider_bob', token: { role: 'Rider' } }
        });
        fail("6.2 setUserRole non-admin", new Error("Allowed non-admin!"));
    } catch (e) {
        if (e.code === 'permission-denied') {
            pass("6.2 setUserRole correctly denied non-SuperAdmin user");
        } else {
            fail("6.2 setUserRole non-admin", e);
        }
    }

    // Test 6.3: Missing targetUid or invalid role -> denied
    try {
        await setUserRole.run({
            data: { targetUid: '', role: 'Serviceman' },
            auth: { uid: 'admin_1', token: { role: 'SuperAdmin' } }
        });
        fail("6.3 setUserRole missing targetUid", new Error("Allowed empty targetUid!"));
    } catch (e) {
        if (e.code === 'invalid-argument') {
            pass("6.3 setUserRole correctly rejected invalid targetUid / role");
        } else {
            fail("6.3 setUserRole invalid args", e);
        }
    }

    // Test 6.4: SuperAdmin -> succeeds, updates custom user claims and doc
    try {
        userClaimsStore['target_partner_uid'] = { prevClaim: 'keep_me' };
        const res = await setUserRole.run({
            data: { targetUid: 'target_partner_uid', role: 'Partner' },
            auth: { uid: 'admin_1', token: { role: 'SuperAdmin' } }
        });
        assert.strictEqual(res.role, 'Partner');
        assert.strictEqual(userClaimsStore['target_partner_uid'].role, 'Partner');
        assert.strictEqual(userClaimsStore['target_partner_uid'].prevClaim, 'keep_me'); // Proves merge!
        assert.strictEqual(usersStore['target_partner_uid'].role, 'Partner');
        pass("6.4 SuperAdmin CAN assign role via setUserRole, merging claims and updating users doc");
    } catch (e) {
        fail("6.4 SuperAdmin setUserRole", e);
    }

    // ── 7. verifyScannedQR HMAC Verification Tests ──
    console.log("\n--- 7. verifyScannedQR HMAC Signature Verification Guards ---");

    const mockOrderStore = {
        'order_qr_1': {
            id: 'order_qr_1',
            status: 'PACKED',
            totalAmount: 499,
            paymentMethod: 'COD',
            userName: 'Ramesh',
            userPhone: '+919876543210'
        }
    };
    const mockInternalStore = {
        'order_qr_1/internal/qrSecurity': null
    };

    db.collection = function (collName) {
        if (collName === 'orders') {
            return {
                doc: (orderId) => ({
                    get: async () => ({
                        exists: Boolean(mockOrderStore[orderId]),
                        data: () => mockOrderStore[orderId] || {}
                    }),
                    update: async (fields) => {
                        if (mockOrderStore[orderId]) Object.assign(mockOrderStore[orderId], fields);
                    },
                    collection: (subColl) => ({
                        doc: (docId) => ({
                            get: async () => ({
                                exists: Boolean(mockInternalStore[`${orderId}/${subColl}/${docId}`]),
                                data: () => mockInternalStore[`${orderId}/${subColl}/${docId}`] || {}
                            }),
                            set: async (data) => {
                                mockInternalStore[`${orderId}/${subColl}/${docId}`] = data;
                            }
                        })
                    })
                })
            };
        }
        return originalCollection(collName);
    };

    // Generate valid signed QR payload via generateSignedQRPayload as Admin
    const qrGenRes = await generateSignedQRPayload.run({
        data: { orderId: 'order_qr_1' },
        auth: { uid: 'admin_user', token: { role: 'ADMIN', admin: true } }
    });
    const validQrJson = qrGenRes.qrPayload;
    const parsedValidPayload = JSON.parse(validQrJson);

    // Test 7.1: Guest -> denied
    try {
        await verifyScannedQR.run({ data: { qrPayload: validQrJson }, auth: null });
        fail("7.1 verifyScannedQR guest", new Error("Allowed guest!"));
    } catch (e) {
        if (e.code === 'unauthenticated') {
            pass("7.1 verifyScannedQR correctly denied unauthenticated caller");
        } else {
            fail("7.1 verifyScannedQR guest", e);
        }
    }

    // Test 7.2: Customer -> denied
    try {
        await verifyScannedQR.run({
            data: { qrPayload: validQrJson },
            auth: { uid: 'cust_1', token: { role: 'Customer' } }
        });
        fail("7.2 verifyScannedQR customer", new Error("Allowed customer!"));
    } catch (e) {
        if (e.code === 'permission-denied') {
            pass("7.2 verifyScannedQR correctly denied customer role");
        } else {
            fail("7.2 verifyScannedQR customer", e);
        }
    }

    // Test 7.3: Tampered amount / signature -> denied
    try {
        const tamperedPayload = { ...parsedValidPayload, amount: 999 }; // Tampered amount
        await verifyScannedQR.run({
            data: { qrPayload: tamperedPayload },
            auth: { uid: 'rider_1', token: { role: 'Rider' } }
        });
        fail("7.3 verifyScannedQR tampered payload", new Error("Allowed tampered QR payload!"));
    } catch (e) {
        if (e.code === 'permission-denied' && e.message.includes('verification failed')) {
            pass("7.3 verifyScannedQR correctly rejected tampered QR payload signature");
        } else {
            fail("7.3 verifyScannedQR tampered payload", e);
        }
    }

    // Test 7.4: Valid QR signed payload verified by Rider -> Succeeded
    try {
        const verifyRes = await verifyScannedQR.run({
            data: { qrPayload: validQrJson },
            auth: { uid: 'rider_1', token: { role: 'Rider' } }
        });
        assert.strictEqual(verifyRes.success, true);
        assert.strictEqual(verifyRes.orderId, 'order_qr_1');
        assert.strictEqual(verifyRes.totalAmount, 499);
        pass("7.4 verifyScannedQR verified valid signed QR payload for Rider");
    } catch (e) {
        fail("7.4 verifyScannedQR valid payload", e);
    }

    // Cleanup mocks
    auth.getUser = originalAuthGetUser;
    auth.setCustomUserClaims = originalAuthSetClaims;
    db.collection = originalCollection;

    console.log(`\n==========================================`);
    console.log(`PASS 4 & 5 & 6 FUNCTION TESTS: ${passed} PASSED, ${failed} FAILED`);
    console.log(`==========================================\n`);

    if (failed > 0) {
        process.exit(1);
    }
}

runTests();
