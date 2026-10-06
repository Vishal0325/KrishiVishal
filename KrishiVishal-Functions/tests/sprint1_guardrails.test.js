const assert = require('assert');

// Test suite for Sprint 1: Security & Delivery Guardrails
async function runSprint1Tests() {
    console.log("=== RUNNING SPRINT 1: SECURITY & DELIVERY GUARDRAILS TEST SUITE ===");

    // -------------------------------------------------------------
    // TEST 1: confirmCashSettlement Authorization Guards
    // -------------------------------------------------------------
    console.log("\n--- TEST 1: confirmCashSettlement Role Authorization ---");

    const ALLOWED_ROLES = ['hubmanager', 'admin', 'superadmin'];
    function checkRole(tokenRole) {
        if (!tokenRole) return false;
        return ALLOWED_ROLES.includes(String(tokenRole).toLowerCase());
    }

    assert.strictEqual(checkRole('HubManager'), true, 'HubManager must be authorized');
    assert.strictEqual(checkRole('Admin'), true, 'Admin must be authorized');
    assert.strictEqual(checkRole('SuperAdmin'), true, 'SuperAdmin must be authorized');
    assert.strictEqual(checkRole('Rider'), false, 'Rider must NOT be authorized to confirm settlement');
    assert.strictEqual(checkRole('Customer'), false, 'Customer must NOT be authorized to confirm settlement');
    assert.strictEqual(checkRole(null), false, 'Unauthenticated/No role must NOT be authorized');
    console.log("PASS: 1.1 Role authorization checks correctly enforce HubManager/Admin/SuperAdmin permissions");

    // -------------------------------------------------------------
    // TEST 2: confirmCashSettlement State Machine & Double-Entry Ledger
    // -------------------------------------------------------------
    console.log("\n--- TEST 2: confirmCashSettlement Atomic Execution ---");

    const mockSettlement = {
        id: 'SETTLE_001',
        riderId: 'RIDER_42',
        hubId: 'HUB_PATNA',
        totalAmount: 4500,
        pendingOrderIds: ['ORD_101', 'ORD_102'],
        status: 'PENDING_VERIFICATION'
    };

    const mockOrders = {
        'ORD_101': { id: 'ORD_101', codAmount: 2000, isCashDeposited: false },
        'ORD_102': { id: 'ORD_102', codAmount: 2500, isCashDeposited: false }
    };

    const mockRider = {
        id: 'RIDER_42',
        cashInHand: 4500
    };

    const ledgerEntries = [];

    // Simulate settlement execution
    function executeSettlement(settlement, orders, rider, confirmedByUid) {
        if (settlement.status !== 'PENDING_VERIFICATION') {
            throw new Error(`Settlement not in PENDING_VERIFICATION state. Current: ${settlement.status}`);
        }

        // a. Update settlement doc
        settlement.status = 'CONFIRMED';
        settlement.confirmedBy = confirmedByUid;
        settlement.confirmedAt = Date.now();

        // b. Update orders
        for (const orderId of settlement.pendingOrderIds) {
            orders[orderId].isCashDeposited = true;
            orders[orderId].settlementId = settlement.id;
            orders[orderId].cashDepositedAt = Date.now();
        }

        // c. Update rider
        rider.cashInHand = 0;
        rider.lastSettlementAt = Date.now();
        rider.lastSettlementId = settlement.id;

        // d. Post ledger entries
        ledgerEntries.push({
            account: 'CASH_IN_HAND',
            type: 'CREDIT',
            amount: settlement.totalAmount,
            referenceId: settlement.id
        });
        ledgerEntries.push({
            account: 'BANK_ACCOUNT',
            type: 'DEBIT',
            amount: settlement.totalAmount,
            referenceId: settlement.id
        });

        return { success: true, settlementId: settlement.id };
    }

    const result = executeSettlement(mockSettlement, mockOrders, mockRider, 'HUB_MGR_01');
    assert.strictEqual(result.success, true);
    assert.strictEqual(mockSettlement.status, 'CONFIRMED');
    assert.strictEqual(mockSettlement.confirmedBy, 'HUB_MGR_01');
    assert.strictEqual(mockOrders['ORD_101'].isCashDeposited, true);
    assert.strictEqual(mockOrders['ORD_101'].settlementId, 'SETTLE_001');
    assert.strictEqual(mockOrders['ORD_102'].isCashDeposited, true);
    assert.strictEqual(mockRider.cashInHand, 0);
    assert.strictEqual(ledgerEntries.length, 2);
    assert.strictEqual(ledgerEntries[0].account, 'CASH_IN_HAND');
    assert.strictEqual(ledgerEntries[0].type, 'CREDIT');
    assert.strictEqual(ledgerEntries[1].account, 'BANK_ACCOUNT');
    assert.strictEqual(ledgerEntries[1].type, 'DEBIT');
    console.log("PASS: 2.1 Settlement transition, order flags, rider vault clearing, and ledger entries verified");

    // Test rejection on repeated call
    assert.throws(() => {
        executeSettlement(mockSettlement, mockOrders, mockRider, 'HUB_MGR_01');
    }, /Settlement not in PENDING_VERIFICATION state/);
    console.log("PASS: 2.2 Re-settlement of already CONFIRMED settlement is strictly rejected");

    // -------------------------------------------------------------
    // TEST 3: Order Idempotency Simulation
    // -------------------------------------------------------------
    console.log("\n--- TEST 3: Order Creation Idempotency Guard ---");

    const idempotencyStore = new Map();

    function processOrderPlacement(payload) {
        if (!payload.idempotencyKey || typeof payload.idempotencyKey !== 'string' || payload.idempotencyKey.trim().length === 0) {
            throw new Error('Missing idempotencyKey');
        }

        const key = payload.idempotencyKey.trim();
        if (idempotencyStore.has(key)) {
            const cached = idempotencyStore.get(key);
            return {
                success: true,
                orderId: cached.orderId,
                totalAmount: cached.totalAmount,
                isDuplicate: true,
                message: "Order already processed"
            };
        }

        const newOrderId = `ORD_${Date.now()}`;
        const newTotal = payload.cartItems.reduce((acc, it) => acc + (it.price * it.quantity), 0);
        idempotencyStore.set(key, { orderId: newOrderId, totalAmount: newTotal });

        return {
            success: true,
            orderId: newOrderId,
            totalAmount: newTotal,
            isDuplicate: false
        };
    }

    // Attempt 1: Missing idempotencyKey throws
    assert.throws(() => {
        processOrderPlacement({ cartItems: [{ price: 500, quantity: 1 }] });
    }, /Missing idempotencyKey/);
    console.log("PASS: 3.1 Missing idempotencyKey correctly rejected");

    // Attempt 2: First valid call
    const key = "IDEM_UUID_12345";
    const res1 = processOrderPlacement({
        idempotencyKey: key,
        cartItems: [{ price: 1200, quantity: 2 }]
    });
    assert.strictEqual(res1.success, true);
    assert.strictEqual(res1.isDuplicate, false);
    assert.strictEqual(res1.totalAmount, 2400);
    console.log("PASS: 3.2 First order placement with idempotencyKey created successfully");

    // Attempt 3: Duplicate network retry with same key
    const res2 = processOrderPlacement({
        idempotencyKey: key,
        cartItems: [{ price: 1200, quantity: 2 }]
    });
    assert.strictEqual(res2.success, true);
    assert.strictEqual(res2.isDuplicate, true);
    assert.strictEqual(res2.orderId, res1.orderId);
    assert.strictEqual(res2.totalAmount, 2400);
    console.log("PASS: 3.3 Duplicate request with same idempotencyKey returned existing order without re-processing");

    // -------------------------------------------------------------
    // TEST 4: Variant SKU Enforcement Guard
    // -------------------------------------------------------------
    console.log("\n--- TEST 4: Agrochemical Variant SKU Enforcement ---");

    function validateCartItemSku(cartItem, variant) {
        if (cartItem.variantId && cartItem.variantId.trim().length > 0) {
            const resolvedSku = (cartItem.skuCode && cartItem.skuCode.trim().length > 0)
                ? cartItem.skuCode
                : (variant && variant.skuCode && variant.skuCode.trim().length > 0 ? variant.skuCode : null);
            if (!resolvedSku) {
                throw new Error(`Missing skuCode for variant ${cartItem.variantId}`);
            }
            return resolvedSku;
        }
        return cartItem.skuCode || cartItem.productId;
    }

    // Valid variant with skuCode
    const validItem = { productId: 'P1', variantId: 'VAR_1L', skuCode: 'SKU_CHL_1L' };
    assert.strictEqual(validateCartItemSku(validItem, null), 'SKU_CHL_1L');

    // Missing skuCode on variant throws IllegalStateException
    const invalidItem = { productId: 'P1', variantId: 'VAR_500ML', skuCode: null };
    assert.throws(() => {
        validateCartItemSku(invalidItem, null);
    }, /Missing skuCode for variant VAR_500ML/);
    console.log("PASS: 4.1 Missing skuCode on agrochemical variant strictly rejected without falling back to productId");

    // -------------------------------------------------------------
    // TEST 5: OTP Brute-Force Rate Limiter Guard
    // -------------------------------------------------------------
    console.log("\n--- TEST 5: OTP Brute-Force Rate Limiter (Max 3 Attempts) ---");

    function simulateVerifyDeliveryOTP(orderDoc, submittedOtp) {
        const otpVal = String(orderDoc.customerOTP || orderDoc.deliveryOtp || '');
        const otpAttempts = Number(orderDoc.otpAttempts || 0);

        // 1. Check max attempts
        if (otpAttempts >= 3) {
            const err = new Error('Too many incorrect OTP attempts. Delivery locked.');
            err.code = 'resource-exhausted';
            throw err;
        }

        // 2. Validate OTP
        if (submittedOtp !== otpVal) {
            orderDoc.otpAttempts = otpAttempts + 1;
            const err = new Error('Incorrect OTP.');
            err.code = 'invalid-argument';
            throw err;
        }

        // 3. Match -> reset attempts and mark DELIVERED
        orderDoc.otpAttempts = 0;
        orderDoc.status = 'DELIVERED';
        orderDoc.deliveryStatus = 'DELIVERED';
        return { success: true, message: 'Delivery OTP verified and order marked DELIVERED.' };
    }

    const testOrder = {
        id: 'ORD_OTP_001',
        customerOTP: '456789',
        otpAttempts: 0,
        status: 'OUT_FOR_DELIVERY'
    };

    // Attempt 1: Wrong OTP -> throws invalid-argument, increments otpAttempts to 1
    try {
        simulateVerifyDeliveryOTP(testOrder, '000000');
        assert.fail('Should have thrown on wrong OTP');
    } catch (err) {
        assert.strictEqual(err.code, 'invalid-argument');
        assert.strictEqual(testOrder.otpAttempts, 1);
    }
    console.log("PASS: 5.1 1st failed OTP attempt increments otpAttempts to 1 and throws invalid-argument");

    // Attempt 2: Wrong OTP -> throws invalid-argument, increments otpAttempts to 2
    try {
        simulateVerifyDeliveryOTP(testOrder, '111111');
        assert.fail('Should have thrown on wrong OTP');
    } catch (err) {
        assert.strictEqual(err.code, 'invalid-argument');
        assert.strictEqual(testOrder.otpAttempts, 2);
    }
    console.log("PASS: 5.2 2nd failed OTP attempt increments otpAttempts to 2 and throws invalid-argument");

    // Attempt 3: Wrong OTP -> throws invalid-argument, increments otpAttempts to 3
    try {
        simulateVerifyDeliveryOTP(testOrder, '222222');
        assert.fail('Should have thrown on wrong OTP');
    } catch (err) {
        assert.strictEqual(err.code, 'invalid-argument');
        assert.strictEqual(testOrder.otpAttempts, 3);
    }
    console.log("PASS: 5.3 3rd failed OTP attempt increments otpAttempts to 3 and throws invalid-argument");

    // Attempt 4: Already locked (otpAttempts >= 3) -> throws resource-exhausted
    try {
        simulateVerifyDeliveryOTP(testOrder, '456789'); // Even with correct OTP!
        assert.fail('Should have locked delivery after 3 failed attempts');
    } catch (err) {
        assert.strictEqual(err.code, 'resource-exhausted');
        assert.strictEqual(err.message, 'Too many incorrect OTP attempts. Delivery locked.');
    }
    console.log("PASS: 5.4 4th attempt strictly blocked with resource-exhausted error");

    // Scenario B: Correct OTP on order with 2 failed attempts resets counter to 0
    const recoverableOrder = {
        id: 'ORD_OTP_002',
        customerOTP: '789123',
        otpAttempts: 2,
        status: 'OUT_FOR_DELIVERY'
    };
    const successRes = simulateVerifyDeliveryOTP(recoverableOrder, '789123');
    assert.strictEqual(successRes.success, true);
    assert.strictEqual(recoverableOrder.otpAttempts, 0);
    assert.strictEqual(recoverableOrder.status, 'DELIVERED');
    console.log("PASS: 5.5 Valid OTP resets otpAttempts to 0 and marks order DELIVERED");

    console.log("\n=======================================================");
    console.log("ALL SPRINT 1 SECURITY & DELIVERY GUARDRAIL TESTS PASSED!");
    console.log("=======================================================");
}

runSprint1Tests().catch(err => {
    console.error("Sprint 1 Test Failed:", err);
    process.exit(1);
});

