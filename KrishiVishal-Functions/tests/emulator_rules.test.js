/**
 * FIRESTORE RULES EMULATOR TEST SUITE
 * Uses @firebase/rules-unit-testing to verify allow and deny rules.
 * Run with: npx firebase emulators:exec "node tests/emulator_rules.test.js"
 */

const {
    initializeTestEnvironment,
    assertFails,
    assertSucceeds
} = require('@firebase/rules-unit-testing');
const fs = require('fs');
const path = require('path');

const PROJECT_ID = 'krishivishal-test-project';
const RULES_PATH = path.join(__dirname, '../../firestore.rules');

async function runEmulatorRulesTests() {
    console.log("=== RUNNING FIRESTORE EMULATOR RULES VERIFICATION SUITE ===\n");

    const rules = fs.readFileSync(RULES_PATH, 'utf8');
    const env = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        firestore: { rules }
    });

    let passed = 0;
    let failed = 0;

    async function testRule(description, testFn) {
        try {
            await testFn(env);
            console.log(`PASS: ${description}`);
            passed++;
        } catch (e) {
            console.log(`FAIL: ${description} - ${e.message}`);
            failed++;
        }
    }

    // 1. Client cannot create orders directly
    await testRule("1.1 Customer CANNOT create orders directly", async (env) => {
        const alice = env.authenticatedContext('alice');
        await assertFails(alice.firestore().collection('orders').doc('ord_1').set({
            userId: 'alice',
            totalAmount: 500,
            status: 'PLACED'
        }));
    });

    // 1.2 Client cannot create returns directly
    await testRule("1.2 Customer CANNOT create returns directly", async (env) => {
        const alice = env.authenticatedContext('alice');
        await assertFails(alice.firestore().collection('returns').doc('ret_1').set({
            userId: 'alice',
            orderId: 'ord_1',
            status: 'REQUESTED'
        }));
    });

    // 1.3 Client cannot create service_bookings directly
    await testRule("1.3 Customer CANNOT create service_bookings directly", async (env) => {
        const alice = env.authenticatedContext('alice');
        await assertFails(alice.firestore().collection('service_bookings').doc('sb_1').set({
            farmerId: 'alice',
            status: 'PENDING_ASSIGNMENT'
        }));
    });

    // 1.4 Client cannot write ledger
    await testRule("1.4 Customer CANNOT write ledger directly", async (env) => {
        const alice = env.authenticatedContext('alice');
        await assertFails(alice.firestore().collection('ledger').doc('led_1').set({
            amount: 1000,
            account: 'SALES'
        }));
    });

    // 1.5 Client cannot write skus
    await testRule("1.5 Customer CANNOT write skus directly", async (env) => {
        const alice = env.authenticatedContext('alice');
        await assertFails(alice.firestore().collection('skus').doc('sku_1').set({
            price: 10
        }));
    });

    // 1.6 Client cannot write warehouse_stock
    await testRule("1.6 Customer CANNOT write warehouse_stock directly", async (env) => {
        const alice = env.authenticatedContext('alice');
        await assertFails(alice.firestore().collection('warehouse_stock').doc('ws_1').set({
            quantity: 50
        }));
    });

    // 1.7 Client cannot write wallet_transactions
    await testRule("1.7 Customer CANNOT write wallet_transactions directly", async (env) => {
        const alice = env.authenticatedContext('alice');
        await assertFails(alice.firestore().collection('wallet_transactions').doc('wt_1').set({
            uid: 'alice',
            amount: 500
        }));
    });

    // 2. Client cannot change own users/{uid} role or walletBalance
    await testRule("2.1 Customer CANNOT change own role in users/{uid}", async (env) => {
        await env.withSecurityRulesDisabled(async (context) => {
            await context.firestore().collection('users').doc('alice').set({
                name: 'Alice',
                role: 'Customer',
                walletBalance: 0
            });
        });
        const alice = env.authenticatedContext('alice');
        await assertFails(alice.firestore().collection('users').doc('alice').update({
            role: 'Admin'
        }));
    });

    await testRule("2.2 Customer CANNOT change own walletBalance in users/{uid}", async (env) => {
        await env.withSecurityRulesDisabled(async (context) => {
            await context.firestore().collection('users').doc('alice').set({
                name: 'Alice',
                walletBalance: 0
            });
        });
        const alice = env.authenticatedContext('alice');
        await assertFails(alice.firestore().collection('users').doc('alice').update({
            walletBalance: 10000
        }));
    });

    // 3. Customer cannot update another user's order or status/amount
    await testRule("3.1 Customer CANNOT read or update another user's order", async (env) => {
        await env.withSecurityRulesDisabled(async (context) => {
            await context.firestore().collection('orders').doc('ord_bob').set({
                userId: 'bob',
                status: 'PLACED',
                totalAmount: 1000
            });
        });
        const alice = env.authenticatedContext('alice');
        await assertFails(alice.firestore().collection('orders').doc('ord_bob').get());
        await assertFails(alice.firestore().collection('orders').doc('ord_bob').update({
            status: 'CANCELLED'
        }));
    });

    // 4. Rider self-assign only
    await testRule("4.1 Rider CAN self-assign unassigned order", async (env) => {
        await env.withSecurityRulesDisabled(async (context) => {
            await context.firestore().collection('orders').doc('ord_unassigned').set({
                userId: 'bob',
                riderId: '',
                status: 'PACKED',
                totalAmount: 1000
            });
        });
        const rider1 = env.authenticatedContext('rider1', { role: 'Rider' });
        await assertSucceeds(rider1.firestore().collection('orders').doc('ord_unassigned').update({
            riderId: 'rider1',
            status: 'ASSIGNED',
            updatedAt: '2026-09-19'
        }));
    });

    await testRule("4.2 Rider CANNOT modify order price or userId during self-assign", async (env) => {
        await env.withSecurityRulesDisabled(async (context) => {
            await context.firestore().collection('orders').doc('ord_unassigned_2').set({
                userId: 'bob',
                riderId: '',
                status: 'PACKED',
                totalAmount: 1000
            });
        });
        const rider1 = env.authenticatedContext('rider1', { role: 'Rider' });
        await assertFails(rider1.firestore().collection('orders').doc('ord_unassigned_2').update({
            riderId: 'rider1',
            status: 'ASSIGNED',
            totalAmount: 0
        }));
    });

    // 5. Rider cash deposits
    await testRule("5.1 Rider CAN create own cash deposit", async (env) => {
        const rider1 = env.authenticatedContext('rider1', { role: 'Rider' });
        await assertSucceeds(rider1.firestore().collection('cash_deposits').doc('dep_1').set({
            riderId: 'rider1',
            amount: 1500,
            status: 'PENDING'
        }));
    });

    await testRule("5.2 Rider CANNOT update own cash deposit to VERIFIED", async (env) => {
        await env.withSecurityRulesDisabled(async (context) => {
            await context.firestore().collection('cash_deposits').doc('dep_1').set({
                riderId: 'rider1',
                amount: 1500,
                status: 'PENDING'
            });
        });
        const rider1 = env.authenticatedContext('rider1', { role: 'Rider' });
        await assertFails(rider1.firestore().collection('cash_deposits').doc('dep_1').update({
            status: 'VERIFIED'
        }));
    });

    // 6. Admin allow rules
    await testRule("6.1 Admin CAN create and update orders", async (env) => {
        const adminCtx = env.authenticatedContext('admin1', { admin: true });
        await assertSucceeds(adminCtx.firestore().collection('orders').doc('ord_admin').set({
            userId: 'alice',
            status: 'PACKED',
            totalAmount: 500
        }));
        await assertSucceeds(adminCtx.firestore().collection('orders').doc('ord_admin').update({
            status: 'CONFIRMED'
        }));
    });

    // 7. Advanced Security Restrictions
    await testRule("7.1 Unauthenticated CANNOT read whitelisted_riders", async (env) => {
        const unauth = env.unauthenticatedContext();
        await assertFails(unauth.firestore().collection('whitelisted_riders').doc('9999999999').get());
        await assertFails(unauth.firestore().collection('whitelisted_riders').get());
    });

    await testRule("7.2 User CANNOT self-create a riders doc", async (env) => {
        const charlie = env.authenticatedContext('charlie', { role: 'Customer' });
        await assertFails(charlie.firestore().collection('riders').doc('charlie').set({
            name: 'Charlie Rider',
            phone: '9876543210'
        }));
    });

    await testRule("7.3 Rider CANNOT directly set order status to DELIVERED in Firestore", async (env) => {
        await env.withSecurityRulesDisabled(async (context) => {
            await context.firestore().collection('orders').doc('ord_del_1').set({
                userId: 'alice',
                riderId: 'rider1',
                status: 'OUT_FOR_DELIVERY',
                totalAmount: 500
            });
        });
        const rider1 = env.authenticatedContext('rider1', { role: 'Rider' });
        // Direct write of status DELIVERED by rider is blocked in update rule (DELIVERED only via verifyDeliveryOTP Cloud Function)
        await assertFails(rider1.firestore().collection('orders').doc('ord_del_1').update({
            status: 'DELIVERED'
        }));
    });

    await testRule("7.4 Customer CANNOT read PENDING_ASSIGNMENT service_bookings", async (env) => {
        await env.withSecurityRulesDisabled(async (context) => {
            await context.firestore().collection('service_bookings').doc('sb_pending_1').set({
                farmerId: 'farmer_bob',
                assignedPartnerId: '',
                status: 'PENDING_ASSIGNMENT'
            });
        });
        const stranger = env.authenticatedContext('stranger', { role: 'Customer' });
        await assertFails(stranger.firestore().collection('service_bookings').doc('sb_pending_1').get());
    });

    // 8. New Security Pass 3 Rules Tests
    await testRule("8.1 Customer CANNOT change referralCode or rewardPoints on users/{uid}", async (env) => {
        await env.withSecurityRulesDisabled(async (context) => {
            await context.firestore().collection('users').doc('alice').set({
                name: 'Alice',
                rewardPoints: 100,
                referralCode: 'REF123'
            });
        });
        const alice = env.authenticatedContext('alice');
        await assertFails(alice.firestore().collection('users').doc('alice').update({
            rewardPoints: 5000
        }));
        await assertFails(alice.firestore().collection('users').doc('alice').update({
            referralCode: 'NEWREF'
        }));
    });

    // 8.2 Separate assertions: kycStatus:'VERIFIED', rating, role (each written ALONE, each denied)
    await testRule("8.2.a Rider CANNOT write kycStatus 'VERIFIED' alone on riders/{riderId}", async (env) => {
        await env.withSecurityRulesDisabled(async (context) => {
            await context.firestore().collection('riders').doc('rider_kyc_test').set({
                name: 'Test Rider',
                phone: '+919876543210',
                status: 'ACTIVE',
                kycStatus: 'PENDING_VERIFICATION'
            });
        });
        const riderCtx = env.authenticatedContext('rider_kyc_test', { role: 'Rider' });
        await assertFails(riderCtx.firestore().collection('riders').doc('rider_kyc_test').update({
            kycStatus: 'VERIFIED'
        }));
    });

    await testRule("8.2.b Rider CANNOT write rating alone on riders/{riderId}", async (env) => {
        const riderCtx = env.authenticatedContext('rider_kyc_test', { role: 'Rider' });
        await assertFails(riderCtx.firestore().collection('riders').doc('rider_kyc_test').update({
            rating: 5
        }));
    });

    await testRule("8.2.c Rider CANNOT write role alone on riders/{riderId}", async (env) => {
        const riderCtx = env.authenticatedContext('rider_kyc_test', { role: 'Rider' });
        await assertFails(riderCtx.firestore().collection('riders').doc('rider_kyc_test').update({
            role: 'SuperAdmin'
        }));
    });

    await testRule("8.2.d Anonymous user CANNOT read whitelisted_riders", async (env) => {
        const anon = env.authenticatedContext('anon_user', {
            firebase: { sign_in_provider: 'anonymous' }
        });
        await assertFails(anon.firestore().collection('whitelisted_riders').doc('9999999999').get());
    });

    await testRule("8.3 Non-owner non-admin CANNOT read riders/{riderId}", async (env) => {
        await env.withSecurityRulesDisabled(async (context) => {
            await context.firestore().collection('riders').doc('rider_secret').set({
                name: 'Secret Rider',
                phone: '1234567890'
            });
        });
        // 1. Normal customer denied
        const stranger = env.authenticatedContext('stranger', { role: 'Customer' });
        await assertFails(stranger.firestore().collection('riders').doc('rider_secret').get());

        // 2. Anonymous auth context denied
        const anon = env.authenticatedContext('anon_stranger', {
            firebase: { sign_in_provider: 'anonymous' }
        });
        await assertFails(anon.firestore().collection('riders').doc('rider_secret').get());
    });

    await testRule("8.4 Customer and Anonymous CANNOT read skus/{skuId}/batches", async (env) => {
        await env.withSecurityRulesDisabled(async (context) => {
            await context.firestore().collection('skus').doc('sku_1').collection('batches').doc('b_1').set({
                costPrice: 50
            });
        });
        // 1. Normal customer denied
        const alice = env.authenticatedContext('alice', { role: 'Customer' });
        await assertFails(alice.firestore().collection('skus').doc('sku_1').collection('batches').doc('b_1').get());

        // 2. Anonymous auth context denied
        const anon = env.authenticatedContext('anon_customer', {
            firebase: { sign_in_provider: 'anonymous' }
        });
        await assertFails(anon.firestore().collection('skus').doc('sku_1').collection('batches').doc('b_1').get());
    });

    await testRule("8.5 Serviceman CAN read PENDING_ASSIGNMENT service_bookings", async (env) => {
        await env.withSecurityRulesDisabled(async (context) => {
            await context.firestore().collection('service_bookings').doc('sb_pending_2').set({
                farmerId: 'farmer_bob',
                assignedPartnerId: '',
                status: 'PENDING_ASSIGNMENT'
            });
        });
        const serviceman = env.authenticatedContext('serviceman1', { role: 'Serviceman' });
        await assertSucceeds(serviceman.firestore().collection('service_bookings').doc('sb_pending_2').get());
    });

    // 9. Pass 4: Item B whitelisted_riders phone tests & Item E protected fields tests
    await testRule("9.1 Rider with matching phone CAN get own whitelisted_riders doc (E.164)", async (env) => {
        await env.withSecurityRulesDisabled(async (context) => {
            await context.firestore().collection('whitelisted_riders').doc('+919876543210').set({
                phone: '+919876543210',
                name: 'Rider Ramesh',
                status: 'PENDING_REGISTRATION'
            });
        });
        const riderCtx = env.authenticatedContext('rider_ramesh', {
            phone_number: '+919876543210'
        });
        await assertSucceeds(riderCtx.firestore().collection('whitelisted_riders').doc('+919876543210').get());
    });

    await testRule("9.2 Rider with matching phone CAN get own whitelisted_riders doc (10-digit ID)", async (env) => {
        await env.withSecurityRulesDisabled(async (context) => {
            await context.firestore().collection('whitelisted_riders').doc('9876543210').set({
                phone: '+919876543210',
                name: 'Rider Ramesh 2',
                status: 'PENDING_REGISTRATION'
            });
        });
        const riderCtx = env.authenticatedContext('rider_ramesh', {
            phone_number: '+919876543210'
        });
        await assertSucceeds(riderCtx.firestore().collection('whitelisted_riders').doc('9876543210').get());
    });

    await testRule("9.3 Rider CANNOT get another rider's whitelisted_riders doc", async (env) => {
        await env.withSecurityRulesDisabled(async (context) => {
            await context.firestore().collection('whitelisted_riders').doc('+919999999999').set({
                phone: '+919999999999',
                name: 'Other Rider',
                status: 'PENDING_REGISTRATION'
            });
        });
        const riderCtx = env.authenticatedContext('rider_ramesh', {
            phone_number: '+919876543210'
        });
        await assertFails(riderCtx.firestore().collection('whitelisted_riders').doc('+919999999999').get());
    });

    await testRule("9.4 Rider CANNOT list whitelisted_riders collection", async (env) => {
        const riderCtx = env.authenticatedContext('rider_ramesh', {
            phone_number: '+919876543210'
        });
        await assertFails(riderCtx.firestore().collection('whitelisted_riders').get());
    });

    // Item E: Protected fields on users/{uid} for create and update
    await testRule("9.5 User CANNOT set isAdmin, admin, referredBy, hasCompletedFirstOrder on users/{uid} during CREATE", async (env) => {
        const u1 = env.authenticatedContext('user_test_1');
        // isAdmin
        await assertFails(u1.firestore().collection('users').doc('user_test_1').set({
            name: 'User 1',
            isAdmin: true
        }));
        // admin
        await assertFails(u1.firestore().collection('users').doc('user_test_1').set({
            name: 'User 1',
            admin: true
        }));
        // referredBy
        await assertFails(u1.firestore().collection('users').doc('user_test_1').set({
            name: 'User 1',
            referredBy: 'some_ref'
        }));
        // hasCompletedFirstOrder
        await assertFails(u1.firestore().collection('users').doc('user_test_1').set({
            name: 'User 1',
            hasCompletedFirstOrder: true
        }));
        // Valid creation without protected fields should succeed
        await assertSucceeds(u1.firestore().collection('users').doc('user_test_1').set({
            name: 'User 1',
            phone: '+919111111111'
        }));
    });

    await testRule("9.6 User CANNOT update isAdmin, admin, referredBy, hasCompletedFirstOrder on users/{uid}", async (env) => {
        const u1 = env.authenticatedContext('user_test_1');
        // Attempt update isAdmin
        await assertFails(u1.firestore().collection('users').doc('user_test_1').update({
            isAdmin: true
        }));
        // Attempt update admin
        await assertFails(u1.firestore().collection('users').doc('user_test_1').update({
            admin: true
        }));
        // Attempt update referredBy
        await assertFails(u1.firestore().collection('users').doc('user_test_1').update({
            referredBy: 'hacker'
        }));
        // Attempt update hasCompletedFirstOrder
        await assertFails(u1.firestore().collection('users').doc('user_test_1').update({
            hasCompletedFirstOrder: true
        }));
    });

    // 10. Pass 5: whitelisted_riders admin-only, orders/{id}.riderLocation, rider self-assign status
    console.log("\n--- 10. Pass 5: Rules Hardening & Status Alignment ---");

    // 10.1: Non-admin CANNOT update whitelisted_riders
    await testRule("10.1 Rider/Customer CANNOT update whitelisted_riders (Admin-only)", async (env) => {
        await env.withSecurityRulesDisabled(async (context) => {
            await context.firestore().collection('whitelisted_riders').doc('+919876543210').set({
                phone: '+919876543210',
                status: 'PENDING'
            });
        });
        const riderCtx = env.authenticatedContext('rider_ramesh', {
            phone_number: '+919876543210',
            role: 'Rider'
        });
        await assertFails(riderCtx.firestore().collection('whitelisted_riders').doc('+919876543210').update({
            status: 'REGISTERED'
        }));
    });

    // 10.2: Admin CAN update whitelisted_riders
    await testRule("10.2 Admin CAN update whitelisted_riders", async (env) => {
        const adminCtx = env.authenticatedContext('admin_super', { role: 'SuperAdmin' });
        await assertSucceeds(adminCtx.firestore().collection('whitelisted_riders').doc('+919876543210').update({
            status: 'APPROVED'
        }));
    });

    // 10.3: Assigned rider CAN update riderLocation on own order
    await testRule("10.3 Assigned rider CAN update riderLocation on own assigned order", async (env) => {
        await env.withSecurityRulesDisabled(async (context) => {
            await context.firestore().collection('orders').doc('ord_rider_loc_1').set({
                userId: 'farmer_alice',
                riderId: 'rider_suresh',
                status: 'OUT_FOR_DELIVERY',
                totalAmount: 1000
            });
        });
        const riderCtx = env.authenticatedContext('rider_suresh', { role: 'Rider' });
        await assertSucceeds(riderCtx.firestore().collection('orders').doc('ord_rider_loc_1').update({
            riderLocation: { lat: 25.7711, lng: 87.4753 }
        }));
    });

    // 10.4: Assigned rider CANNOT update unauthorized fields on order (e.g. totalAmount)
    await testRule("10.4 Assigned rider CANNOT update totalAmount or protected fields", async (env) => {
        const riderCtx = env.authenticatedContext('rider_suresh', { role: 'Rider' });
        await assertFails(riderCtx.firestore().collection('orders').doc('ord_rider_loc_1').update({
            totalAmount: 0
        }));
    });

    // 10.5: Unassigned rider CANNOT update riderLocation on another rider's order
    await testRule("10.5 Unassigned rider CANNOT update riderLocation on another order", async (env) => {
        const otherRider = env.authenticatedContext('rider_other', { role: 'Rider' });
        await assertFails(otherRider.firestore().collection('orders').doc('ord_rider_loc_1').update({
            riderLocation: { lat: 25.7711, lng: 87.4753 }
        }));
    });

    // 10.6: Rider can self-assign unassigned order with status: 'ASSIGNED'
    await testRule("10.6 Rider can self-assign unassigned order with status: 'ASSIGNED'", async (env) => {
        await env.withSecurityRulesDisabled(async (context) => {
            await context.firestore().collection('orders').doc('ord_unassigned_1').set({
                userId: 'farmer_alice',
                riderId: '',
                status: 'PACKED',
                totalAmount: 1200
            });
        });
        const riderCtx = env.authenticatedContext('rider_suresh', { role: 'Rider' });
        await assertSucceeds(riderCtx.firestore().collection('orders').doc('ord_unassigned_1').update({
            status: 'ASSIGNED',
            riderId: 'rider_suresh'
        }));
    });

    // 10.7: Rider can self-assign unassigned order with status: 'RIDER_ASSIGNED'
    await testRule("10.7 Rider can self-assign unassigned order with status: 'RIDER_ASSIGNED'", async (env) => {
        await env.withSecurityRulesDisabled(async (context) => {
            await context.firestore().collection('orders').doc('ord_unassigned_2').set({
                userId: 'farmer_alice',
                riderId: '',
                status: 'PACKED',
                totalAmount: 1200
            });
        });
        const riderCtx = env.authenticatedContext('rider_suresh', { role: 'Rider' });
        await assertSucceeds(riderCtx.firestore().collection('orders').doc('ord_unassigned_2').update({
            status: 'RIDER_ASSIGNED',
            riderId: 'rider_suresh'
        }));
    });

    // 10.8: Rider CANNOT self-assign with unauthorized status (e.g. DELIVERED)
    await testRule("10.8 Rider CANNOT self-assign with status: 'DELIVERED'", async (env) => {
        await env.withSecurityRulesDisabled(async (context) => {
            await context.firestore().collection('orders').doc('ord_unassigned_3').set({
                userId: 'farmer_alice',
                riderId: '',
                status: 'PACKED',
                totalAmount: 1200
            });
        });
        const riderCtx = env.authenticatedContext('rider_suresh', { role: 'Rider' });
        await assertFails(riderCtx.firestore().collection('orders').doc('ord_unassigned_3').update({
            status: 'DELIVERED',
            riderId: 'rider_suresh'
        }));
    });

    // 10.9: Rider CANNOT take PLACED order
    await testRule("10.9 Rider CANNOT take PLACED order", async (env) => {
        await env.withSecurityRulesDisabled(async (context) => {
            await context.firestore().collection('orders').doc('ord_unassigned_placed').set({
                userId: 'farmer_alice',
                riderId: '',
                status: 'PLACED',
                totalAmount: 1200
            });
        });
        const riderCtx = env.authenticatedContext('rider_suresh', { role: 'Rider' });
        await assertFails(riderCtx.firestore().collection('orders').doc('ord_unassigned_placed').update({
            status: 'ASSIGNED',
            riderId: 'rider_suresh'
        }));
    });

    // 10.10: Rider CANNOT take CANCELLED order
    await testRule("10.10 Rider CANNOT take CANCELLED order", async (env) => {
        await env.withSecurityRulesDisabled(async (context) => {
            await context.firestore().collection('orders').doc('ord_unassigned_cancelled').set({
                userId: 'farmer_alice',
                riderId: '',
                status: 'CANCELLED',
                totalAmount: 1200
            });
        });
        const riderCtx = env.authenticatedContext('rider_suresh', { role: 'Rider' });
        await assertFails(riderCtx.firestore().collection('orders').doc('ord_unassigned_cancelled').update({
            status: 'ASSIGNED',
            riderId: 'rider_suresh'
        }));
    });

    // 10.11: Rider CANNOT take DELIVERED order
    await testRule("10.11 Rider CANNOT take DELIVERED order", async (env) => {
        await env.withSecurityRulesDisabled(async (context) => {
            await context.firestore().collection('orders').doc('ord_unassigned_delivered').set({
                userId: 'farmer_alice',
                riderId: '',
                status: 'DELIVERED',
                totalAmount: 1200
            });
        });
        const riderCtx = env.authenticatedContext('rider_suresh', { role: 'Rider' });
        await assertFails(riderCtx.firestore().collection('orders').doc('ord_unassigned_delivered').update({
            status: 'ASSIGNED',
            riderId: 'rider_suresh'
        }));
    });

    // 10.12: Rider CAN take READY_FOR_PICKUP order
    await testRule("10.12 Rider CAN take READY_FOR_PICKUP order", async (env) => {
        await env.withSecurityRulesDisabled(async (context) => {
            await context.firestore().collection('orders').doc('ord_unassigned_pickup').set({
                userId: 'farmer_alice',
                riderId: '',
                status: 'READY_FOR_PICKUP',
                totalAmount: 1200
            });
        });
        const riderCtx = env.authenticatedContext('rider_suresh', { role: 'Rider' });
        await assertSucceeds(riderCtx.firestore().collection('orders').doc('ord_unassigned_pickup').update({
            status: 'ASSIGNED',
            riderId: 'rider_suresh'
        }));
    });

    // 10.13: Rider CAN write own location and status fields on riders/{id}
    await testRule("10.13 Rider CAN write own location and status fields on riders/{id}", async (env) => {
        await env.withSecurityRulesDisabled(async (context) => {
            await context.firestore().collection('riders').doc('rider_suresh').set({
                name: 'Rider Suresh',
                phone: '+919876543210',
                status: 'ACTIVE'
            });
        });
        const riderCtx = env.authenticatedContext('rider_suresh', { role: 'Rider' });
        await assertSucceeds(riderCtx.firestore().collection('riders').doc('rider_suresh').update({
            currentLat: 25.7711,
            currentLng: 87.4753,
            lastLocationUpdate: 1726750000000,
            online: true,
            shiftStartTime: 1726750000000
        }));
    });

    // 10.14: Rider CANNOT write another rider's location fields
    await testRule("10.14 Rider CANNOT write another rider's riders/{id} document", async (env) => {
        const otherRider = env.authenticatedContext('rider_other', { role: 'Rider' });
        await assertFails(otherRider.firestore().collection('riders').doc('rider_suresh').update({
            currentLat: 25.7711,
            currentLng: 87.4753
        }));
    });

    // 10.15: Rider CANNOT write unapproved sensitive fields on riders/{id} (e.g. role, rating)
    await testRule("10.15 Rider CANNOT write unauthorized fields on riders/{id}", async (env) => {
        const riderCtx = env.authenticatedContext('rider_suresh', { role: 'Rider' });
        await assertFails(riderCtx.firestore().collection('riders').doc('rider_suresh').update({
            role: 'SuperAdmin'
        }));
    });

    // 10.16: Rider CAN update kycStatus to PENDING_VERIFICATION on riders/{id}
    await testRule("10.16 Rider CAN update kycStatus to PENDING_VERIFICATION on riders/{id}", async (env) => {
        const riderCtx = env.authenticatedContext('rider_suresh', { role: 'Rider' });
        await assertSucceeds(riderCtx.firestore().collection('riders').doc('rider_suresh').update({
            kycStatus: 'PENDING_VERIFICATION',
            lastKycSubmissionAt: Date.now()
        }));
    });

    // 10.17: Rider CANNOT write isCashDeposited on orders/{id}
    await testRule("10.17 Rider CANNOT write isCashDeposited on orders/{id}", async (env) => {
        await env.withSecurityRulesDisabled(async (context) => {
            await context.firestore().collection('orders').doc('ord_rider_cash_test').set({
                userId: 'farmer_alice',
                riderId: 'rider_suresh',
                status: 'OUT_FOR_DELIVERY',
                totalAmount: 1000,
                isCashDeposited: false
            });
        });
        const riderCtx = env.authenticatedContext('rider_suresh', { role: 'Rider' });
        await assertFails(riderCtx.firestore().collection('orders').doc('ord_rider_cash_test').update({
            isCashDeposited: true
        }));
    });

    // 10.18: Rider CANNOT write cashDepositedAt on orders/{id}
    await testRule("10.18 Rider CANNOT write cashDepositedAt on orders/{id}", async (env) => {
        const riderCtx = env.authenticatedContext('rider_suresh', { role: 'Rider' });
        await assertFails(riderCtx.firestore().collection('orders').doc('ord_rider_cash_test').update({
            cashDepositedAt: '2026-09-19T20:00:00Z'
        }));
    });

    // 10.19: Rider CAN write status 'RIDER_ACCEPTED', 'OUT_FOR_DELIVERY', 'DELIVERY_FAILED' on orders/{id}
    await testRule("10.19 Rider CAN write allowed status transitions on orders/{id}", async (env) => {
        const riderCtx = env.authenticatedContext('rider_suresh', { role: 'Rider' });

        // Step A: Update to RIDER_ACCEPTED from ASSIGNED
        await env.withSecurityRulesDisabled(async (context) => {
            await context.firestore().collection('orders').doc('ord_rider_status_flow').set({
                userId: 'farmer_alice',
                riderId: 'rider_suresh',
                status: 'ASSIGNED',
                totalAmount: 1000
            });
        });
        await assertSucceeds(riderCtx.firestore().collection('orders').doc('ord_rider_status_flow').update({
            status: 'RIDER_ACCEPTED'
        }));

        // Step B: Update to OUT_FOR_DELIVERY from RIDER_ACCEPTED
        await assertSucceeds(riderCtx.firestore().collection('orders').doc('ord_rider_status_flow').update({
            status: 'OUT_FOR_DELIVERY'
        }));

        // Step C: Update to DELIVERY_FAILED from OUT_FOR_DELIVERY
        await assertSucceeds(riderCtx.firestore().collection('orders').doc('ord_rider_status_flow').update({
            status: 'DELIVERY_FAILED'
        }));
    });

    // 10.20: Rider CANNOT write status 'DELIVERED', 'CONFIRMED', or 'CANCELLED' directly on orders/{id}
    await testRule("10.20 Rider CANNOT write DELIVERED, CONFIRMED, or CANCELLED status directly on orders/{id}", async (env) => {
        await env.withSecurityRulesDisabled(async (context) => {
            await context.firestore().collection('orders').doc('ord_rider_status_forbidden').set({
                userId: 'farmer_alice',
                riderId: 'rider_suresh',
                status: 'OUT_FOR_DELIVERY',
                totalAmount: 1000
            });
        });
        const riderCtx = env.authenticatedContext('rider_suresh', { role: 'Rider' });
        await assertFails(riderCtx.firestore().collection('orders').doc('ord_rider_status_forbidden').update({
            status: 'DELIVERED'
        }));
        await assertFails(riderCtx.firestore().collection('orders').doc('ord_rider_status_forbidden').update({
            status: 'CONFIRMED'
        }));
        await assertFails(riderCtx.firestore().collection('orders').doc('ord_rider_status_forbidden').update({
            status: 'CANCELLED'
        }));
    });

    // ============================================================
    // 11. SENSITIVE COLLECTIONS LOCKDOWN TESTS (P0 HOTFIX AUDIT)
    // ============================================================

    await env.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.collection('cash_deposits').doc('dep_suresh').set({
            riderId: 'rider_suresh',
            amount: 500,
            status: 'DEPOSITED_AT_WAREHOUSE'
        });
        await db.collection('cash_deposits').doc('dep_ramesh').set({
            riderId: 'rider_ramesh',
            amount: 1500,
            status: 'DEPOSITED_AT_WAREHOUSE'
        });
        await db.collection('hub_bank_deposits').doc('bank_dep_1').set({
            warehouseId: 'HUB-SAM-001',
            amount: 25000,
            status: 'DEPOSITED'
        });
        await db.collection('payout_requests').doc('payout_suresh').set({
            riderId: 'rider_suresh',
            amount: 200,
            status: 'PENDING'
        });
        await db.collection('payout_requests').doc('payout_ramesh').set({
            riderId: 'rider_ramesh',
            amount: 500,
            status: 'PENDING'
        });
        await db.collection('ledger').doc('led_test_1').set({
            amount: 5000,
            account: 'SALES'
        });
        await db.collection('accounts').doc('CASH_IN_HAND').set({
            balance: 10000
        });
        await db.collection('expenses').doc('exp_test_1').set({
            amount: 1200,
            category: 'OFFICE_RENT'
        });
    });

    const customerCharlie = env.authenticatedContext('customer_charlie', { role: 'Customer' });
    const riderRamesh = env.authenticatedContext('rider_ramesh', { role: 'Rider' });
    const adminVikash = env.authenticatedContext('admin_vikash', { role: 'SuperAdmin', isAdmin: true, admin: true });
    const financeUser = env.authenticatedContext('finance_user', { role: 'FinanceAdmin' });

    // 11.1: Customer CANNOT read or write cash_deposits
    await testRule("11.1 Customer CANNOT read or write cash_deposits", async (env) => {
        await assertFails(customerCharlie.firestore().collection('cash_deposits').doc('dep_suresh').get());
        await assertFails(customerCharlie.firestore().collection('cash_deposits').doc('dep_hack').set({
            riderId: 'customer_charlie',
            amount: 99999
        }));
    });

    // 11.2: Rider CAN read/create own cash_deposit, CANNOT access another rider's deposit
    await testRule("11.2 Rider CAN read/create own cash_deposit, CANNOT access another rider's deposit", async (env) => {
        const riderSuresh = env.authenticatedContext('rider_suresh', { role: 'Rider' });
        await assertSucceeds(riderSuresh.firestore().collection('cash_deposits').doc('dep_suresh').get());
        await assertSucceeds(riderSuresh.firestore().collection('cash_deposits').doc('dep_suresh_new').set({
            riderId: 'rider_suresh',
            amount: 300,
            status: 'DEPOSITED_AT_WAREHOUSE'
        }));
        await assertFails(riderSuresh.firestore().collection('cash_deposits').doc('dep_ramesh').get());
        await assertFails(riderSuresh.firestore().collection('cash_deposits').doc('dep_ramesh').update({
            amount: 0
        }));
    });

    // 11.3: Customer & Rider CANNOT read or write hub_bank_deposits
    await testRule("11.3 Customer and Rider CANNOT read or write hub_bank_deposits", async (env) => {
        const riderSuresh = env.authenticatedContext('rider_suresh', { role: 'Rider' });
        await assertFails(customerCharlie.firestore().collection('hub_bank_deposits').doc('bank_dep_1').get());
        await assertFails(customerCharlie.firestore().collection('hub_bank_deposits').doc('bank_hack').set({ amount: 1000 }));
        await assertFails(riderSuresh.firestore().collection('hub_bank_deposits').doc('bank_dep_1').get());
        await assertFails(riderSuresh.firestore().collection('hub_bank_deposits').doc('bank_hack').set({ amount: 1000 }));
    });

    // 11.4: Admin CAN read and write hub_bank_deposits
    await testRule("11.4 Admin CAN read and write hub_bank_deposits", async (env) => {
        await assertSucceeds(adminVikash.firestore().collection('hub_bank_deposits').doc('bank_dep_1').get());
        await assertSucceeds(adminVikash.firestore().collection('hub_bank_deposits').doc('bank_dep_new').set({
            warehouseId: 'HUB-SAM-001',
            amount: 50000,
            status: 'DEPOSITED'
        }));
    });

    // 11.5: Customer CANNOT read or write payout_requests
    await testRule("11.5 Customer CANNOT read or write payout_requests", async (env) => {
        await assertFails(customerCharlie.firestore().collection('payout_requests').doc('payout_suresh').get());
        await assertFails(customerCharlie.firestore().collection('payout_requests').doc('payout_hack').set({ amount: 5000 }));
    });

    // 11.6: Rider CAN read own payout_requests, CANNOT read other's or write directly
    await testRule("11.6 Rider CAN read own payout_requests, CANNOT read other's or write directly", async (env) => {
        const riderSuresh = env.authenticatedContext('rider_suresh', { role: 'Rider' });
        await assertSucceeds(riderSuresh.firestore().collection('payout_requests').doc('payout_suresh').get());
        await assertFails(riderSuresh.firestore().collection('payout_requests').doc('payout_ramesh').get());
        await assertFails(riderSuresh.firestore().collection('payout_requests').doc('payout_suresh').update({ status: 'TRANSFERRED' }));
        await assertFails(riderSuresh.firestore().collection('payout_requests').doc('payout_direct').set({ riderId: 'rider_suresh', amount: 500 }));
    });

    // 11.7: Customer & Rider CANNOT read or write ledger, finance, accounts, expenses
    await testRule("11.7 Customer & Rider CANNOT read or write ledger, finance, accounts, expenses", async (env) => {
        const riderSuresh = env.authenticatedContext('rider_suresh', { role: 'Rider' });
        await assertFails(customerCharlie.firestore().collection('ledger').doc('led_test_1').get());
        await assertFails(customerCharlie.firestore().collection('ledger').doc('led_test_1').set({ amount: 100 }));
        await assertFails(riderSuresh.firestore().collection('ledger').doc('led_test_1').get());
        await assertFails(riderSuresh.firestore().collection('accounts').doc('CASH_IN_HAND').get());
        await assertFails(riderSuresh.firestore().collection('expenses').doc('exp_test_1').get());
        await assertFails(customerCharlie.firestore().collection('expenses').doc('exp_test_1').get());
    });

    // 11.8: Admin & Finance CAN read ledger, accounts, expenses
    await testRule("11.8 Admin & Finance CAN read ledger, accounts, expenses", async (env) => {
        await assertSucceeds(adminVikash.firestore().collection('ledger').doc('led_test_1').get());
        await assertSucceeds(adminVikash.firestore().collection('accounts').doc('CASH_IN_HAND').get());
        await assertSucceeds(adminVikash.firestore().collection('expenses').doc('exp_test_1').get());
    });

    // ============================================================
    // 12. NEW 13 COLLECTIONS ACCESS CONTROL TESTS
    // ============================================================
    await env.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        const testDocs = [
            'expenseCategories', 'expense_categories', 'expenseVendors', 'expense_vendors',
            'corporate_capital', 'corporate_shareholders', 'corporate_loans', 'corporate_interest_ledger',
            'corporate_funding_rounds', 'corporate_simulations', 'journal_vouchers', 'system_summaries',
            'sales_stats'
        ];
        for (const col of testDocs) {
            await db.collection(col).doc('test_doc_1').set({ testField: 'value_123' });
        }
    });

    const corporateCollections = [
        'corporate_capital', 'corporate_shareholders', 'corporate_loans',
        'corporate_interest_ledger', 'corporate_funding_rounds', 'corporate_simulations'
    ];

    const financeCollections = [
        'expenseCategories', 'expense_categories', 'expenseVendors', 'expense_vendors',
        'journal_vouchers', 'system_summaries'
    ];

    const allThirteenCollections = [...corporateCollections, ...financeCollections, 'sales_stats'];

    // 12.1: Customer BLOCKED on all 13 collections
    await testRule("12.1 Customer BLOCKED from reading or writing all 13 financial/corporate collections", async (env) => {
        for (const col of allThirteenCollections) {
            await assertFails(customerCharlie.firestore().collection(col).doc('test_doc_1').get());
            await assertFails(customerCharlie.firestore().collection(col).doc('hack_doc').set({ hack: true }));
        }
    });

    // 12.2: Rider / Non-Finance staff BLOCKED on all 13 collections
    await testRule("12.2 Rider / Non-Finance staff BLOCKED on all 13 financial/corporate collections", async (env) => {
        const riderSuresh = env.authenticatedContext('rider_suresh', { role: 'Rider' });
        for (const col of allThirteenCollections) {
            await assertFails(riderSuresh.firestore().collection(col).doc('test_doc_1').get());
            await assertFails(riderSuresh.firestore().collection(col).doc('hack_doc').set({ hack: true }));
        }
    });

    // 12.3: FinanceAdmin ALLOWED on expense & accounting collections, BLOCKED on corporate_* collections
    await testRule("12.3 FinanceAdmin ALLOWED on finance collections, BLOCKED on corporate_* collections", async (env) => {
        for (const col of financeCollections) {
            await assertSucceeds(financeUser.firestore().collection(col).doc('test_doc_1').get());
            await assertSucceeds(financeUser.firestore().collection(col).doc(`finance_write_${col}`).set({ ok: true }));
        }
        for (const col of corporateCollections) {
            await assertFails(financeUser.firestore().collection(col).doc('test_doc_1').get());
            await assertFails(financeUser.firestore().collection(col).doc(`finance_hack_${col}`).set({ ok: true }));
        }
    });

    // 12.4: HubManager (opsRoles) ALLOWED to write journal_vouchers (PhysicalStockAudit & ReturnToVendor)
    await testRule("12.4 HubManager (opsRoles) ALLOWED to write journal_vouchers for stock audit & return to vendor", async (env) => {
        const hubManager = env.authenticatedContext('hub_manager_1', { role: 'HubManager' });
        await assertSucceeds(hubManager.firestore().collection('journal_vouchers').doc('jv_stock_audit').set({
            voucherNumber: 'JV-AUD-001',
            narration: 'Physical Stock Shortage Write-off',
            amount: 500
        }));
        // But HubManager is BLOCKED from corporate collections
        for (const col of corporateCollections) {
            await assertFails(hubManager.firestore().collection(col).doc('test_doc_1').get());
        }
    });

    // 12.5: SuperAdmin ALLOWED to read/write all 13 collections
    await testRule("12.5 SuperAdmin ALLOWED to read/write all 13 collections including corporate data", async (env) => {
        for (const col of [...corporateCollections, ...financeCollections]) {
            await assertSucceeds(adminVikash.firestore().collection(col).doc('test_doc_1').get());
            await assertSucceeds(adminVikash.firestore().collection(col).doc(`admin_write_${col}`).set({ ok: true }));
        }
        await assertSucceeds(adminVikash.firestore().collection('sales_stats').doc('test_doc_1').get());
        await assertSucceeds(adminVikash.firestore().collection('sales_stats').doc('admin_stat').set({ count: 1 }));
    });

    // 12.6: Prove non-SuperAdmin accounts with blanket admin:true claims are BLOCKED on corporate collections
    await testRule("12.6 Accounts with admin:true claims (FinanceAdmin, DeptManager, Viewer, Rider, LegacyAdmin) BLOCKED on corporate_* collections, Founder ALLOWED", async (env) => {
        const financeWithAdmin = env.authenticatedContext('user_finance', { role: 'FinanceAdmin', admin: true, isAdmin: true });
        const deptManagerWithAdmin = env.authenticatedContext('user_dept_mgr', { role: 'DepartmentManager', admin: true, isAdmin: true });
        const viewerWithAdmin = env.authenticatedContext('user_viewer', { role: 'Viewer', admin: true, isAdmin: true });
        const riderWithAdmin = env.authenticatedContext('user_rider', { role: 'RIDER', admin: true, isRider: true });
        const legacyAdmin = env.authenticatedContext('user_legacy', { admin: true });
        const founder = env.authenticatedContext('user_founder', { role: 'SuperAdmin', admin: true, isAdmin: true });

        const nonSuperAdminContexts = [
            { name: 'financeWithAdmin', ctx: financeWithAdmin },
            { name: 'deptManagerWithAdmin', ctx: deptManagerWithAdmin },
            { name: 'viewerWithAdmin', ctx: viewerWithAdmin },
            { name: 'riderWithAdmin', ctx: riderWithAdmin },
            { name: 'legacyAdmin', ctx: legacyAdmin }
        ];

        // Assert all 5 non-SuperAdmin contexts are BLOCKED (read and write) on all 6 corporate collections
        for (const { name, ctx } of nonSuperAdminContexts) {
            for (const col of corporateCollections) {
                await assertFails(ctx.firestore().collection(col).doc('test_doc_1').get());
                await assertFails(ctx.firestore().collection(col).doc(`hack_${name}_${col}`).set({ unauthorized: true }));
            }
        }

        // Assert founder is ALLOWED (read and write) on all 6 corporate collections
        for (const col of corporateCollections) {
            await assertSucceeds(founder.firestore().collection(col).doc('test_doc_1').get());
            await assertSucceeds(founder.firestore().collection(col).doc(`founder_doc_${col}`).set({ authorized: true }));
        }
    });

    await env.cleanup();

    console.log(`\n==========================================`);
    console.log(`EMULATOR RULES SUITE: ${passed} PASSED, ${failed} FAILED`);
    console.log(`==========================================\n`);

    if (failed > 0) {
        process.exit(1);
    }
}

runEmulatorRulesTests();
