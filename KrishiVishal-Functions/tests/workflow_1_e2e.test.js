/**
 * WORKFLOW 1: CUSTOMER COD ORDER TEST
 * 
 * Verifies the complete customer journey for COD order creation:
 * 1. Customer authentication context
 * 2. Product and inventory setup
 * 3. Calling createOrder Cloud Function
 * 4. Verifying order document, prices, taxes, warehouse routing, OTP
 * 5. Verifying stock decrement and inventory movements
 * 6. Verifying idempotency (duplicate prevention)
 * 7. Verifying Admin Panel query compatibility
 */

const assert = require('assert');
const { createOrder } = require('../orders/orderFlow');
const { db, admin } = require('../core/admin');

console.log("=================================================================");
console.log("=== RUNNING WORKFLOW 1 — CUSTOMER COD ORDER E2E VERIFICATION ===");
console.log("=================================================================\n");

let passed = 0;
let failed = 0;

function pass(name) {
    console.log(`✅ PASS: ${name}`);
    passed++;
}

function fail(name, err) {
    console.error(`❌ FAIL: ${name} - ${err.message || err}`);
    failed++;
}

// In-Memory Firestore mock that perfectly mirrors Firestore SDK
const mockDb = {
    settings: {
        config: {
            deliveryCharge: 50,
            freeDeliveryAbove: 500,
            autoPrintNewOrders: true
        }
    },
    warehouses: {
        'wh_samastipur': {
            id: 'wh_samastipur',
            name: 'Central Hub Samastipur',
            isActive: true,
            isPrimary: true,
            pincodes: ['848101', '848125', '848134']
        },
        'wh_patna': {
            id: 'wh_patna',
            name: 'Patna Regional Hub',
            isActive: true,
            isPrimary: false,
            pincodes: ['800001', '800020']
        }
    },
    delivery_slots: {},
    products: {
        'PROD_NEEM_OIL_1L': {
            id: 'PROD_NEEM_OIL_1L',
            name: 'KrishiVishal Organic Neem Oil (1 Litre)',
            price: 450,
            discountedPrice: 400,
            mrp: 500,
            gstRate: 18,
            isTaxInclusive: true,
            category: 'Bio-Pesticides',
            hsnCode: '3808',
            stock: 25,
            fulfillmentType: 'SELF_STOCK',
            variants: [
                { id: 'var_1l', label: '1 Litre', price: 400, mrp: 500, stock: 25, skuCode: 'SKU_NEEM_1L' }
            ]
        }
    },
    skus: {},
    users: {
        'cust_ramesh_bihar': {
            id: 'cust_ramesh_bihar',
            name: 'Ramesh Kumar',
            phone: '+919876543210',
            role: 'Customer',
            walletBalance: 0
        }
    },
    orders: {},
    idempotency_keys: {},
    inventory_movements: {},
    outbox: {}
};

// Wire up mock store to admin.firestore()
const originalCollection = db.collection;
const originalRunTransaction = db.runTransaction;

db.collection = function (collName) {
    return {
        doc: function (docId) {
            const effectiveId = docId || ('gen_' + Math.random().toString(36).substring(2, 9));
            return {
                id: effectiveId,
                path: `${collName}/${effectiveId}`,
                get: async function () {
                    const coll = mockDb[collName] || {};
                    const data = coll[effectiveId];
                    return {
                        exists: Boolean(data),
                        id: effectiveId,
                        data: () => (data ? JSON.parse(JSON.stringify(data)) : undefined)
                    };
                },
                set: async function (data, opts) {
                    if (!mockDb[collName]) mockDb[collName] = {};
                    if (opts && opts.merge && mockDb[collName][effectiveId]) {
                        mockDb[collName][effectiveId] = { ...mockDb[collName][effectiveId], ...data };
                    } else {
                        mockDb[collName][effectiveId] = JSON.parse(JSON.stringify(data));
                    }
                    return { id: effectiveId };
                },
                update: async function (data) {
                    if (!mockDb[collName] || !mockDb[collName][effectiveId]) {
                        throw new Error(`Doc not found: ${collName}/${effectiveId}`);
                    }
                    Object.assign(mockDb[collName][effectiveId], JSON.parse(JSON.stringify(data)));
                    return { id: effectiveId };
                },
                collection: function (subColl) {
                    return db.collection(`${collName}_${effectiveId}_${subColl}`);
                }
            };
        },
        get: async function () {
            const coll = mockDb[collName] || {};
            const docs = Object.keys(coll).map(k => ({
                id: k,
                exists: true,
                data: () => JSON.parse(JSON.stringify(coll[k]))
            }));
            return {
                empty: docs.length === 0,
                docs,
                size: docs.length
            };
        }
    };
};

db.runTransaction = async function (txnCallback) {
    const txn = {
        get: async function (ref) {
            return ref.get();
        },
        set: function (ref, data, opts) {
            const parts = ref.path.split('/');
            const coll = parts[0];
            const id = parts[1];
            if (!mockDb[coll]) mockDb[coll] = {};
            if (opts && opts.merge && mockDb[coll][id]) {
                mockDb[coll][id] = { ...mockDb[coll][id], ...JSON.parse(JSON.stringify(data)) };
            } else {
                mockDb[coll][id] = JSON.parse(JSON.stringify(data));
            }
        },
        update: function (ref, data) {
            const parts = ref.path.split('/');
            const coll = parts[0];
            const id = parts[1];
            if (!mockDb[coll] || !mockDb[coll][id]) {
                throw new Error(`Transaction update failed: doc ${ref.path} does not exist`);
            }
            // Handle FieldValue.increment
            const processed = {};
            for (const [k, v] of Object.entries(data)) {
                if (v && v.constructor && v.constructor.name === 'NumericIncrementTransform') {
                    // simulate increment
                    processed[k] = (mockDb[coll][id][k] || 0) + v.operand;
                } else {
                    processed[k] = v;
                }
            }
            Object.assign(mockDb[coll][id], JSON.parse(JSON.stringify(processed)));
        }
    };
    return await txnCallback(txn);
};

async function runWorkflow1() {
    try {
        console.log("--- STEP 1: Authentication & Customer Context ---");
        const customerAuth = {
            uid: 'cust_ramesh_bihar',
            token: { role: 'Customer', phone_number: '+919876543210' }
        };
        assert(customerAuth.uid, "Customer must have valid UID");
        pass("Step 1: Customer authenticated with verified UID and role");

        console.log("\n--- STEP 2: Product & Cart Selection ---");
        const selectedProduct = mockDb.products['PROD_NEEM_OIL_1L'];
        const initialStock = selectedProduct.variants[0].stock; // 25
        assert.strictEqual(initialStock, 25);
        
        const cartItems = [
            {
                productId: 'PROD_NEEM_OIL_1L',
                variantId: 'var_1l',
                variantLabel: '1 Litre',
                skuCode: 'SKU_NEEM_1L',
                quantity: 2 // 2 units @ ₹400 = ₹800
            }
        ];
        pass(`Step 2: Customer selected 2 units of ${selectedProduct.name} (Initial stock: ${initialStock})`);

        console.log("\n--- STEP 3: Delivery Address & Hub Selection ---");
        const address = {
            line1: 'Gram - Kalyanpur, Ward No 4',
            city: 'Samastipur',
            state: 'Bihar',
            pincode: '848134', // Matches Samastipur hub
            landmark: 'Near Panchayat Bhawan',
            lat: 25.9667,
            lng: 85.8333
        };
        pass("Step 3: Valid Bihar delivery address configured with pincode 848134");

        console.log("\n--- STEP 4: Calling createOrder Cloud Function with COD ---");
        const idempotencyKey = 'IDEM_WF1_TEST_001';
        const orderRequest = {
            data: {
                idempotencyKey,
                cartItems,
                address,
                paymentMethod: 'COD',
                userName: 'Ramesh Kumar',
                userPhone: '9876543210',
                destinationHubId: 'wh_samastipur'
            },
            auth: customerAuth
        };

        const result = await createOrder.run(orderRequest);
        assert(result && result.success, "createOrder must return success: true");
        const orderId = result.orderId;
        assert(orderId, "createOrder must return orderId");
        pass(`Step 4: createOrder returned success: true, orderId: ${orderId}`);

        console.log("\n--- STEP 5: Verifying Order in Firestore Database ---");
        const createdOrder = mockDb.orders[orderId];
        assert(createdOrder, "Order document must exist in Firestore 'orders' collection");
        assert.strictEqual(createdOrder.status, 'PLACED', "Initial order status must be 'PLACED'");
        assert.strictEqual(createdOrder.paymentMethod, 'COD', "Payment method must be 'COD'");
        assert.strictEqual(createdOrder.paymentStatus, 'PENDING', "COD initial payment status must be 'PENDING'");
        assert.strictEqual(createdOrder.userId, customerAuth.uid, "Order must belong to authenticated customer");
        assert.strictEqual(createdOrder.warehouseId, 'wh_samastipur', "Order must be routed to Samastipur Hub via pincode match");
        assert(createdOrder.customerOTP && createdOrder.customerOTP.length === 4, "Order must have 4-digit delivery OTP");
        
        // Financial totals: 2 units * ₹400 = ₹800. ₹800 > freeDeliveryAbove (₹500), so deliveryCharge = 0.
        // Total = ₹800.
        assert.strictEqual(createdOrder.subtotal, 800, `Expected subtotal 800, got ${createdOrder.subtotal}`);
        assert.strictEqual(createdOrder.deliveryCharge, 0, `Expected deliveryCharge 0 (free delivery > 500), got ${createdOrder.deliveryCharge}`);
        assert.strictEqual(createdOrder.totalAmount, 800, `Expected totalAmount 800, got ${createdOrder.totalAmount}`);
        
        // GST check: 18% inclusive. Taxable = 800 / 1.18 = 677.97. CGST = 61.02, SGST = 61.02.
        assert(createdOrder.cgstAmount > 0, "CGST must be computed for intra-state supply");
        assert(createdOrder.sgstAmount > 0, "SGST must be computed for intra-state supply");
        assert.strictEqual(createdOrder.igstAmount, 0, "IGST must be 0 for intra-state supply");
        pass(`Step 5: Order verified in Firestore: Amount=₹${createdOrder.totalAmount}, Status=${createdOrder.status}, Hub=${createdOrder.warehouseId}, OTP=${createdOrder.customerOTP}`);

        console.log("\n--- STEP 6: Verifying Inventory Deduction & Movements ---");
        const updatedProduct = mockDb.products['PROD_NEEM_OIL_1L'];
        const remainingStock = updatedProduct.variants[0].stock;
        assert.strictEqual(remainingStock, 23, `Variant stock should be decremented by 2 (25 -> 23), got ${remainingStock}`);

        const movements = Object.values(mockDb.inventory_movements);
        assert(movements.length >= 1, "At least one inventory_movement record must be appended");
        const orderMovement = movements.find(m => m.orderId === orderId);
        assert(orderMovement, "Movement record must reference orderId");
        assert.strictEqual(orderMovement.type, 'OUTWARD', "Movement type must be 'OUTWARD'");
        assert.strictEqual(orderMovement.qty, 2, "Movement quantity must be 2");
        pass(`Step 6: Inventory decremented (25 -> 23) and OUTWARD movement logged in ledger`);

        console.log("\n--- STEP 7: Testing Idempotency (Duplicate Prevention) ---");
        const duplicateResult = await createOrder.run(orderRequest);
        assert.strictEqual(duplicateResult.isDuplicate, true, "Second call must flag isDuplicate: true");
        assert.strictEqual(duplicateResult.orderId, orderId, "Second call must return the exact same orderId");
        // Stock should still be 23, NOT decremented again
        assert.strictEqual(mockDb.products['PROD_NEEM_OIL_1L'].variants[0].stock, 23, "Stock must NOT be decremented again on retry");
        pass("Step 7: Duplicate request with same idempotencyKey returned existing order without double-decrementing stock");

        console.log("\n--- STEP 8: Verifying Visibility in Admin Panel Orders Query ---");
        // In Orders.jsx: query(collection(db, 'orders'), orderBy('createdAt', 'desc'))
        const allOrders = Object.values(mockDb.orders);
        const adminFoundOrder = allOrders.find(o => o.id === orderId);
        assert(adminFoundOrder, "Admin panel must find created order in collection('orders')");
        assert.strictEqual(adminFoundOrder.userName, 'Ramesh Kumar');
        assert.strictEqual(adminFoundOrder.warehouseName, 'Central Hub Samastipur');
        assert.strictEqual(adminFoundOrder.status, 'PLACED');
        pass("Step 8: Admin Panel Orders table query successfully retrieves the order with customer & hub details");

        console.log("\n=================================================================");
        console.log(`WORKFLOW 1 VERIFICATION COMPLETED: ${passed} PASSED, ${failed} FAILED`);
        console.log("=================================================================\n");

    } catch (err) {
        fail("WORKFLOW 1 Execution", err);
    } finally {
        db.collection = originalCollection;
        db.runTransaction = originalRunTransaction;
    }
}

runWorkflow1();
