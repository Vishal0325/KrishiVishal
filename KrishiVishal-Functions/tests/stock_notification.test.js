const assert = require('assert');
const adminModule = require('../core/admin');

console.log("=== RUNNING NOTIFY ME / STOCK RESTORATION TEST SUITE ===\n");

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
    skus: new Map(),
    products: new Map(),
    stock_notification_requests: new Map()
};

let fcmMulticastCalls = [];
let queryLogs = [];

// Mock Query class to handle chained .where().where().get()
class MockQuery {
    constructor(collectionName, filters = []) {
        this.collectionName = collectionName;
        this.filters = filters;
    }

    where(field, op, val) {
        queryLogs.push({ collection: this.collectionName, field, op, val });
        return new MockQuery(this.collectionName, [...this.filters, { field, op, val }]);
    }

    async get() {
        const store = collections[this.collectionName] || new Map();
        const matching = Array.from(store.values()).filter(docData => {
            return this.filters.every(f => {
                if (f.op === '==') {
                    return docData[f.field] === f.val;
                }
                return true;
            });
        });

        const docSnapshots = matching.map(docData => ({
            id: docData._id,
            data: () => docData,
            ref: {
                _collection: this.collectionName,
                _id: docData._id
            }
        }));

        return {
            empty: docSnapshots.length === 0,
            size: docSnapshots.length,
            docs: docSnapshots
        };
    }
}

// Setup Admin & Firestore Mocks
const originalCollection = adminModule.db.collection;
const originalBatch = adminModule.db.batch;
const originalMessaging = adminModule.admin.messaging;

adminModule.db.collection = function (collName) {
    const store = collections[collName] || new Map();
    collections[collName] = store;

    return {
        _collection: collName,
        doc: function (docId) {
            return {
                _collection: collName,
                _id: docId,
                get: async function () {
                    const exists = store.has(docId);
                    const data = exists ? store.get(docId) : null;
                    return {
                        exists,
                        id: docId,
                        data: () => data
                    };
                },
                update: async function (updates) {
                    if (!store.has(docId)) {
                        throw new Error(`Document ${docId} does not exist in ${collName}`);
                    }
                    const current = store.get(docId);
                    const merged = { ...current, ...updates };
                    store.set(docId, merged);
                    return merged;
                },
                set: async function (data) {
                    const docObj = { ...data, _id: docId };
                    store.set(docId, docObj);
                    return docObj;
                }
            };
        },
        where: function (field, op, val) {
            return new MockQuery(collName).where(field, op, val);
        }
    };
};

adminModule.db.batch = function () {
    const operations = [];
    return {
        update: function (ref, updates) {
            operations.push({ ref, updates });
        },
        commit: async function () {
            for (const op of operations) {
                const store = collections[op.ref._collection];
                if (store && store.has(op.ref._id)) {
                    const current = store.get(op.ref._id);
                    store.set(op.ref._id, { ...current, ...op.updates });
                }
            }
            return true;
        }
    };
};

const mockMessagingService = {
    sendEachForMulticast: async function (payload) {
        fcmMulticastCalls.push(payload);
        return {
            responses: payload.tokens.map(() => ({ success: true })),
            successCount: payload.tokens.length,
            failureCount: 0
        };
    }
};

try {
    Object.defineProperty(adminModule.admin, 'messaging', {
        value: () => mockMessagingService,
        writable: true,
        configurable: true
    });
} catch (e) {
    adminModule.admin.messaging = () => mockMessagingService;
}

if (adminModule.admin.apps && adminModule.admin.apps.length > 0) {
    adminModule.admin.app().messaging = () => mockMessagingService;
}
adminModule.messaging = mockMessagingService;

// Require onSkuWrite trigger after mocks are installed
const { onSkuWrite } = require('../inventory/stock');

async function runTests() {
    // ─────────────────────────────────────────────────────────────
    // SCENARIO A: Stock transitions from 0 to Positive (Restock Triggered)
    // ─────────────────────────────────────────────────────────────
    console.log("--- SCENARIO A: Stock Restored (0 -> 10) triggers FCM & updates subscriptions ---");
    try {
        // Reset state
        collections.skus.clear();
        collections.products.clear();
        collections.stock_notification_requests.clear();
        fcmMulticastCalls = [];
        queryLogs = [];

        const testProductId = 'PROD_FERTILIZER_01';
        const testSkuId = 'SKU_FERT_50KG';

        // 1. Seed Product (Currently Out of Stock: stock = 0)
        collections.products.set(testProductId, {
            _id: testProductId,
            name: 'NPK 19:19:19 Fertilizer 50kg',
            stockQuantity: 0,
            stock: 0,
            price: 1200
        });

        // 2. Seed active SKU
        collections.skus.set(testSkuId, {
            _id: testSkuId,
            productId: testProductId,
            name: '50kg Bag',
            isActive: true,
            pricing: { consumerPrice: 1200, mrp: 1400 },
            inventory: { availableStock: 10 }
        });

        // 3. Seed unfulfilled stock notification requests for this product
        collections.stock_notification_requests.set('REQ_001', {
            _id: 'REQ_001',
            userId: 'USER_FARMER_1',
            productId: testProductId,
            fcmToken: 'fcm_token_farmer_1_xyz',
            fulfilled: false,
            createdAt: new Date('2026-10-01T08:00:00Z')
        });

        collections.stock_notification_requests.set('REQ_002', {
            _id: 'REQ_002',
            userId: 'USER_FARMER_2',
            productId: testProductId,
            fcmToken: 'fcm_token_farmer_2_abc',
            fulfilled: false,
            createdAt: new Date('2026-10-01T09:00:00Z')
        });

        // Seed already fulfilled request (should NOT receive alert)
        collections.stock_notification_requests.set('REQ_003', {
            _id: 'REQ_003',
            userId: 'USER_FARMER_3',
            productId: testProductId,
            fcmToken: 'fcm_token_farmer_3_old',
            fulfilled: true,
            createdAt: new Date('2026-09-20T08:00:00Z')
        });

        // 4. Simulate SKU update event: stock goes from 0 to 10
        const event = {
            data: {
                before: {
                    data: () => ({
                        productId: testProductId,
                        name: '50kg Bag',
                        isActive: true,
                        pricing: { consumerPrice: 1200, mrp: 1400 },
                        inventory: { availableStock: 0 }
                    })
                },
                after: {
                    data: () => ({
                        productId: testProductId,
                        name: '50kg Bag',
                        isActive: true,
                        pricing: { consumerPrice: 1200, mrp: 1400 },
                        inventory: { availableStock: 10 }
                    })
                }
            }
        };

        await onSkuWrite.run(event);

        // Verification 1: Check query to stock_notification_requests
        const hasReqQuery = queryLogs.some(
            q => q.collection === 'stock_notification_requests' && q.field === 'productId' && q.val === testProductId
        );
        const hasFulfilledFilter = queryLogs.some(
            q => q.collection === 'stock_notification_requests' && q.field === 'fulfilled' && q.val === false
        );
        assert(hasReqQuery, 'Must query stock_notification_requests for target productId');
        assert(hasFulfilledFilter, 'Must filter stock_notification_requests where fulfilled == false');
        pass("A.1 stock_notification_requests queried for unfulfilled requests");

        // Verification 2: Check FCM sendEachForMulticast payload
        assert.strictEqual(fcmMulticastCalls.length, 1, 'Exactly one multicast batch must be dispatched');
        const fcmCall = fcmMulticastCalls[0];
        assert.deepStrictEqual(fcmCall.tokens.sort(), ['fcm_token_farmer_1_xyz', 'fcm_token_farmer_2_abc'].sort(), 'Tokens must include all unfulfilled subscribers');
        assert.strictEqual(fcmCall.notification.title, '✅ Stock Available!');
        assert(fcmCall.notification.body.includes('NPK 19:19:19 Fertilizer 50kg'), 'Body should contain product name');
        assert.strictEqual(fcmCall.data.type, 'STOCK_AVAILABLE');
        assert.strictEqual(fcmCall.data.productId, testProductId);
        pass("A.2 FCM sendEachForMulticast invoked with correct title, body, and data payload");

        // Verification 3: Check batch update of documents in stock_notification_requests
        const req1 = collections.stock_notification_requests.get('REQ_001');
        const req2 = collections.stock_notification_requests.get('REQ_002');
        const req3 = collections.stock_notification_requests.get('REQ_003');

        assert.strictEqual(req1.fulfilled, true, 'REQ_001 must be marked as fulfilled');
        assert(req1.notifiedAt !== undefined, 'REQ_001 must have notifiedAt timestamp');
        assert.strictEqual(req2.fulfilled, true, 'REQ_002 must be marked as fulfilled');
        assert(req2.notifiedAt !== undefined, 'REQ_002 must have notifiedAt timestamp');
        assert.strictEqual(req3.fulfilled, true, 'REQ_003 was already fulfilled and remains so');
        pass("A.3 Matched subscription documents batch updated to fulfilled: true with notifiedAt");

        // Verification 4: Parent Product stock updated
        const updatedProduct = collections.products.get(testProductId);
        assert.strictEqual(updatedProduct.stockQuantity, 10, 'Product stock updated to 10');
        pass("A.4 Product stockQuantity and variants synchronized");

    } catch (err) {
        fail("Scenario A failed", err);
    }

    // ─────────────────────────────────────────────────────────────
    // SCENARIO B: Stock Increases when Already In Stock (No Alert)
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- SCENARIO B: Stock Increases when already in stock (5 -> 10) ---");
    try {
        collections.skus.clear();
        collections.products.clear();
        collections.stock_notification_requests.clear();
        fcmMulticastCalls = [];
        queryLogs = [];

        const testProductId = 'PROD_SEEDS_02';
        const testSkuId = 'SKU_SEEDS_1KG';

        // Product already in stock (prevStock = 5)
        collections.products.set(testProductId, {
            _id: testProductId,
            name: 'Hybrid Mustard Seeds 1kg',
            stockQuantity: 5,
            stock: 5,
            price: 350
        });

        collections.skus.set(testSkuId, {
            _id: testSkuId,
            productId: testProductId,
            name: '1kg Pouch',
            isActive: true,
            pricing: { consumerPrice: 350, mrp: 400 },
            inventory: { availableStock: 10 }
        });

        collections.stock_notification_requests.set('REQ_004', {
            _id: 'REQ_004',
            userId: 'USER_FARMER_4',
            productId: testProductId,
            fcmToken: 'fcm_token_farmer_4',
            fulfilled: false
        });

        // Trigger SKU update: 5 -> 10
        const event = {
            data: {
                before: {
                    data: () => ({
                        productId: testProductId,
                        name: '1kg Pouch',
                        isActive: true,
                        pricing: { consumerPrice: 350, mrp: 400 },
                        inventory: { availableStock: 5 }
                    })
                },
                after: {
                    data: () => ({
                        productId: testProductId,
                        name: '1kg Pouch',
                        isActive: true,
                        pricing: { consumerPrice: 350, mrp: 400 },
                        inventory: { availableStock: 10 }
                    })
                }
            }
        };

        await onSkuWrite.run(event);

        assert.strictEqual(fcmMulticastCalls.length, 0, 'No FCM notifications should be sent when stock was already > 0');
        const req4 = collections.stock_notification_requests.get('REQ_004');
        assert.strictEqual(req4.fulfilled, false, 'Subscription should remain unfulfilled');
        pass("B.1 Restock notification NOT triggered when previous stock was already > 0");

    } catch (err) {
        fail("Scenario B failed", err);
    }

    // ─────────────────────────────────────────────────────────────
    // SCENARIO C: Empty Subscriber Handling
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- SCENARIO C: Stock Restores (0 -> 5) with zero subscribers ---");
    try {
        collections.skus.clear();
        collections.products.clear();
        collections.stock_notification_requests.clear();
        fcmMulticastCalls = [];
        queryLogs = [];

        const testProductId = 'PROD_PESTICIDE_03';
        const testSkuId = 'SKU_PEST_250ML';

        collections.products.set(testProductId, {
            _id: testProductId,
            name: 'Bio Pest Control Spray 250ml',
            stockQuantity: 0,
            stock: 0,
            price: 220
        });

        collections.skus.set(testSkuId, {
            _id: testSkuId,
            productId: testProductId,
            name: '250ml Bottle',
            isActive: true,
            pricing: { consumerPrice: 220, mrp: 260 },
            inventory: { availableStock: 5 }
        });

        // No subscribers in stock_notification_requests

        const event = {
            data: {
                before: {
                    data: () => ({
                        productId: testProductId,
                        name: '250ml Bottle',
                        isActive: true,
                        pricing: { consumerPrice: 220, mrp: 260 },
                        inventory: { availableStock: 0 }
                    })
                },
                after: {
                    data: () => ({
                        productId: testProductId,
                        name: '250ml Bottle',
                        isActive: true,
                        pricing: { consumerPrice: 220, mrp: 260 },
                        inventory: { availableStock: 5 }
                    })
                }
            }
        };

        await onSkuWrite.run(event);

        assert.strictEqual(fcmMulticastCalls.length, 0, 'No FCM calls when subscriber list is empty');
        const updatedProduct = collections.products.get(testProductId);
        assert.strictEqual(updatedProduct.stockQuantity, 5, 'Product stock successfully updated to 5');
        pass("C.1 Function completes gracefully with 0 subscribers and updates product stock");

    } catch (err) {
        fail("Scenario C failed", err);
    }

    // Restore original methods
    adminModule.db.collection = originalCollection;
    adminModule.db.batch = originalBatch;
    try {
        adminModule.admin.messaging = originalMessaging;
    } catch (e) {
        // ignore
    }

    // ─────────────────────────────────────────────────────────────
    // SUMMARY
    // ─────────────────────────────────────────────────────────────
    console.log("\n==========================================");
    console.log(`STOCK NOTIFICATION TESTS: ${passed} PASSED, ${failed} FAILED.`);
    console.log("==========================================\n");

    if (failed > 0) {
        process.exit(1);
    }
}

runTests().catch(err => {
    console.error("FATAL ERROR IN STOCK NOTIFICATION TEST RUNNER:", err);
    process.exit(1);
});
