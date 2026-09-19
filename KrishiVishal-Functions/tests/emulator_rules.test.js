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
                status: 'PLACED',
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
                status: 'PLACED',
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
    });

    // 7. Advanced Security Restrictions
    await testRule("7.1 Unauthenticated user CANNOT read whitelisted_riders", async (env) => {
        const unauth = env.unauthenticatedContext();
        await assertFails(unauth.firestore().collection('whitelisted_riders').doc('9999999999').get());
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

    await testRule("8.2 Anonymous user CANNOT read whitelisted_riders", async (env) => {
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
        const stranger = env.authenticatedContext('stranger', { role: 'Customer' });
        await assertFails(stranger.firestore().collection('riders').doc('rider_secret').get());
    });

    await testRule("8.4 Customer CANNOT read skus/{skuId}/batches", async (env) => {
        await env.withSecurityRulesDisabled(async (context) => {
            await context.firestore().collection('skus').doc('sku_1').collection('batches').doc('b_1').set({
                costPrice: 50
            });
        });
        const alice = env.authenticatedContext('alice', { role: 'Customer' });
        await assertFails(alice.firestore().collection('skus').doc('sku_1').collection('batches').doc('b_1').get());
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

    await env.cleanup();

    console.log(`\n==========================================`);
    console.log(`EMULATOR RULES SUITE: ${passed} PASSED, ${failed} FAILED`);
    console.log(`==========================================\n`);

    if (failed > 0) {
        process.exit(1);
    }
}

runEmulatorRulesTests();
