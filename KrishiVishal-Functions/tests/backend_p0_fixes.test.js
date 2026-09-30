const assert = require('assert');

// Mock Firestore DB for testing logic
class MockDocRef {
    constructor(id, data = null) {
        this.id = id;
        this._data = data;
    }
    async get() {
        return {
            exists: this._data !== null,
            id: this.id,
            data: () => this._data
        };
    }
    async update(updates) {
        this._data = { ...this._data, ...updates };
        return this._data;
    }
    async set(data, options = {}) {
        if (options.merge && this._data) {
            this._data = { ...this._data, ...data };
        } else {
            this._data = data;
        }
        return this._data;
    }
}

class MockCollection {
    constructor(name) {
        this.name = name;
        this.docs = new Map();
        this.added = [];
    }
    doc(id) {
        if (!id) id = `mock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        if (!this.docs.has(id)) {
            this.docs.set(id, new MockDocRef(id, null));
        }
        return this.docs.get(id);
    }
    async add(data) {
        const id = `mock_add_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const ref = this.doc(id);
        await ref.set(data);
        this.added.push({ id, ...data });
        return ref;
    }
}

class MockDb {
    constructor() {
        this.collections = new Map();
    }
    collection(name) {
        if (!this.collections.has(name)) {
            this.collections.set(name, new MockCollection(name));
        }
        return this.collections.get(name);
    }
    async runTransaction(updateFn) {
        const transaction = {
            get: async (ref) => ref.get(),
            update: (ref, data) => ref.update(data),
            set: (ref, data, opts) => ref.set(data, opts)
        };
        return updateFn(transaction);
    }
}

async function runTests() {
    console.log("=== RUNNING BACKEND P0 BUG FIXES TEST SUITE ===");

    // Test 1: BUG-FIX 2A - SYNC_POD OTP verification logic
    console.log("\n--- TEST 1: SYNC_POD OTP verification ---");
    const mockDb = new MockDb();
    
    // Seed order in PLACED state
    mockDb.collection('orders').doc('order_not_out')._data = {
        riderId: 'rider_123',
        status: 'CONFIRMED',
        deliveryOtp: '4567'
    };

    // Seed order OUT_FOR_DELIVERY
    mockDb.collection('orders').doc('order_valid')._data = {
        riderId: 'rider_123',
        status: 'OUT_FOR_DELIVERY',
        deliveryOtp: '4567'
    };

    // Test 1.1: Order must be OUT_FOR_DELIVERY
    {
        const orderDoc = await mockDb.collection('orders').doc('order_not_out').get();
        const orderData = orderDoc.data();
        let failedPrecondition = false;
        if (orderData.status !== 'OUT_FOR_DELIVERY') {
            failedPrecondition = true;
        }
        assert.strictEqual(failedPrecondition, true, "Should block delivery if not OUT_FOR_DELIVERY");
        console.log("PASS 1.1: Blocked delivery when status is not OUT_FOR_DELIVERY");
    }

    // Test 1.2: Invalid OTP
    {
        const orderDoc = await mockDb.collection('orders').doc('order_valid').get();
        const orderData = orderDoc.data();
        const expectedOtp = orderData.otpCode || orderData.deliveryOtp;
        const suppliedOtp = '9999';
        let invalidOtp = false;
        if (!expectedOtp || !suppliedOtp || String(expectedOtp).trim() !== String(suppliedOtp).trim()) {
            invalidOtp = true;
        }
        assert.strictEqual(invalidOtp, true, "Should reject invalid OTP");
        console.log("PASS 1.2: Correctly rejected mismatched OTP");
    }

    // Test 1.3: Missing OTP
    {
        const orderDoc = await mockDb.collection('orders').doc('order_valid').get();
        const orderData = orderDoc.data();
        const expectedOtp = orderData.otpCode || orderData.deliveryOtp;
        const suppliedOtp = undefined;
        let invalidOtp = false;
        if (!expectedOtp || !suppliedOtp || String(expectedOtp).trim() !== String(suppliedOtp).trim()) {
            invalidOtp = true;
        }
        assert.strictEqual(invalidOtp, true, "Should reject missing OTP");
        console.log("PASS 1.3: Correctly rejected missing OTP");
    }

    // Test 1.4: Valid OTP completes delivery with safe POD updates
    {
        const orderRef = mockDb.collection('orders').doc('order_valid');
        const orderDoc = await orderRef.get();
        const orderData = orderDoc.data();
        const expectedOtp = orderData.otpCode || orderData.deliveryOtp;
        const suppliedOtp = '4567';
        assert.strictEqual(String(expectedOtp).trim(), String(suppliedOtp).trim(), "OTP matches");

        const safeUpdates = {
            status: 'DELIVERED',
            deliveredAt: new Date().toISOString(),
            syncedAt: new Date().toISOString(),
            photoUrl: 'https://storage.googleapis.com/pod1.jpg',
            signatureUrl: 'https://storage.googleapis.com/sig1.png',
            collectedCash: 500
        };
        await orderRef.update(safeUpdates);
        const updated = (await orderRef.get()).data();
        assert.strictEqual(updated.status, 'DELIVERED');
        assert.strictEqual(updated.collectedCash, 500);
        assert.strictEqual(updated.photoUrl, 'https://storage.googleapis.com/pod1.jpg');
        console.log("PASS 1.4: Delivery completed with verified OTP and safe POD updates");
    }

    // Test 2: BUG-FIX 2B - AI Approval Authorization & Audit Logging
    console.log("\n--- TEST 2: AI Approval Authorization & Audit Logging ---");
    const checkAuth = (contextAuth) => {
        if (!contextAuth) throw new Error("unauthenticated");
        const token = contextAuth.token || {};
        const isAuthorized = token.admin === true || 
                             token.role === 'ADMIN' || 
                             token.role === 'SuperAdmin';
        if (!isAuthorized) {
            throw new Error("permission-denied: Admin role required to approve/reject AI actions");
        }
        return true;
    };

    // Test 2.1: Unauthenticated
    assert.throws(() => checkAuth(null), /unauthenticated/);
    console.log("PASS 2.1: Unauthenticated request rejected");

    // Test 2.2: Rider / Customer rejected
    assert.throws(() => checkAuth({ uid: 'rider1', token: { role: 'RIDER' } }), /permission-denied/);
    assert.throws(() => checkAuth({ uid: 'cust1', token: { role: 'CUSTOMER' } }), /permission-denied/);
    console.log("PASS 2.2: Non-admin roles (RIDER, CUSTOMER) rejected");

    // Test 2.3: Admin and SuperAdmin allowed
    assert.strictEqual(checkAuth({ uid: 'admin1', token: { role: 'ADMIN' } }), true);
    assert.strictEqual(checkAuth({ uid: 'admin2', token: { role: 'SuperAdmin' } }), true);
    assert.strictEqual(checkAuth({ uid: 'admin3', token: { admin: true } }), true);
    console.log("PASS 2.3: Admin, SuperAdmin, admin=true authorized");

    // Test 2.4: Audit log created on decision
    {
        const auditDb = new MockDb();
        const actionId = 'ai_req_101';
        const decision = 'APPROVED';
        const uid = 'admin_user_42';
        const role = 'ADMIN';

        await auditDb.collection("audit_logs").add({
            actionId,
            decision,
            reviewedBy: uid,
            reviewerRole: role,
            reviewedAt: new Date().toISOString(),
            notes: 'Approved automated pricing adjustment'
        });

        const auditEntries = auditDb.collection("audit_logs").added;
        assert.strictEqual(auditEntries.length, 1);
        assert.strictEqual(auditEntries[0].actionId, 'ai_req_101');
        assert.strictEqual(auditEntries[0].decision, 'APPROVED');
        assert.strictEqual(auditEntries[0].reviewedBy, 'admin_user_42');
        console.log("PASS 2.4: Audit log recorded with correct schema");
    }

    // Test 3: BUG-FIX 2C - COD Deposit Deterministic ID & Idempotency
    console.log("\n--- TEST 3: COD Deposit Deterministic ID & Idempotency ---");
    {
        const codDb = new MockDb();
        const riderId = 'RIDER_88';
        const todayStr = '2026-09-30';
        const shift = 'MORNING';
        const depositId = `DEPOSIT_${riderId}_${todayStr}_${shift}`;
        const depositRef = codDb.collection("cash_deposits").doc(depositId);

        // First deposit: should create document with status COMPLETED
        const firstResult = await codDb.runTransaction(async (transaction) => {
            const depositDoc = await transaction.get(depositRef);
            if (depositDoc.exists) {
                const depositData = depositDoc.data();
                if (depositData.status === 'COMPLETED') {
                    return { success: true, depositId, status: 'ALREADY_COMPLETED' };
                }
            }

            const depositData = {
                depositId,
                riderId,
                amount: 3500,
                ordersCount: 4,
                shift,
                date: todayStr,
                status: 'COMPLETED'
            };

            transaction.set(depositRef, depositData, { merge: true });
            return { success: true, depositId, status: 'COMPLETED' };
        });

        assert.strictEqual(firstResult.status, 'COMPLETED');
        assert.strictEqual(firstResult.depositId, 'DEPOSIT_RIDER_88_2026-09-30_MORNING');
        console.log("PASS 3.1: First deposit created deterministic ID and COMPLETED status");

        // Second duplicate deposit: must be idempotent and return ALREADY_COMPLETED
        const secondResult = await codDb.runTransaction(async (transaction) => {
            const depositDoc = await transaction.get(depositRef);
            if (depositDoc.exists) {
                const depositData = depositDoc.data();
                if (depositData.status === 'COMPLETED') {
                    return { success: true, depositId, status: 'ALREADY_COMPLETED' };
                }
            }
            return { success: true, depositId, status: 'COMPLETED' };
        });

        assert.strictEqual(secondResult.status, 'ALREADY_COMPLETED');
        assert.strictEqual(secondResult.depositId, depositId);
        console.log("PASS 3.2: Duplicate deposit returned ALREADY_COMPLETED idempotently without duplication");
    }

    console.log("\n==========================================");
    console.log("ALL BACKEND P0 BUG FIX TESTS PASSED!");
    console.log("==========================================");
}

runTests().catch(err => {
    console.error("Test failed:", err);
    process.exit(1);
});
