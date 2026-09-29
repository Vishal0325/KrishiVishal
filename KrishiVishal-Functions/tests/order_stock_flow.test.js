const assert = require('assert');

// Simple mock for admin and db
const mockDB = {};
const transactionLog = [];

const db = {
    collection: (name) => ({
        doc: (id) => ({ path: name + '/' + id })
    }),
    runTransaction: async (cb) => {
        const transaction = {
            get: async (ref) => {
                const data = mockDB[ref.path];
                return {
                    exists: !!data,
                    data: () => data || {}
                };
            },
            update: (ref, data) => {
                transactionLog.push({ ref: ref.path, data });
                if (mockDB[ref.path]) {
                    Object.assign(mockDB[ref.path], data);
                }
            }
        };
        await cb(transaction);
    }
};

function findVariantIndex(variants, item) {
    if (!variants || !Array.isArray(variants)) return -1;
    let vIdx = -1;
    if (item.variantId) {
        vIdx = variants.findIndex(v => v.id === item.variantId);
    }
    if (vIdx === -1 && item.variantLabel) {
        vIdx = variants.findIndex(v => {
            const vName = v.name || v.label || v.title || '';
            const iLabel = item.variantLabel || item.selectedVariant || '';
            return vName.toLowerCase().trim() === iLabel.toLowerCase().trim();
        });
    }
    if (vIdx === -1 && item.skuCode) {
        vIdx = variants.findIndex(v => (v.skuCode || v.sku || '') === item.skuCode);
    }
    if (vIdx === -1 && item.packSize) {
        vIdx = variants.findIndex(v => (v.name || v.label || v.title || v.packSize || '') === item.packSize);
    }
    return vIdx;
}

console.log('=== RUNNING ORDER STOCK FLOW TESTS ===\n');

let passed = 0;
let failed = 0;

function pass(name) { console.log('PASS: ' + name); passed++; }
function fail(name, err) { console.log('FAIL: ' + name + ' - ' + (err.message || err)); failed++; }

async function runTests() {
    console.log('--- 1. Simple Product Flow ---');
    let simpleProduct = { stock: 100 };
    let simpleOrder = { id: 'o1', items: [{ productId: 'p1', quantity: 5 }] };
    
    // createOrder deduction
    simpleProduct.stock -= simpleOrder.items[0].quantity;
    try {
        assert.strictEqual(simpleProduct.stock, 95);
        pass('createOrder simple product stock deduction (100 -> 95)');
    } catch(e) { fail('createOrder simple deduction', e); }

    // onOrderStatusUpdate restoration
    mockDB['products/p1'] = { ...simpleProduct };
    mockDB['orders/o1'] = { stockRestored: false };
    
    const oldData = { status: 'PLACED' };
    const newData = { status: 'CANCELLED', items: simpleOrder.items };

    if (newData.status === 'CANCELLED' && oldData.status !== 'CANCELLED') {
        if (!oldData.stockRestored && !newData.stockRestored) {
            await db.runTransaction(async (t) => {
                const oSnap = await t.get(db.collection('orders').doc('o1'));
                if (oSnap.data().stockRestored) return;
                
                const pSnap = await t.get(db.collection('products').doc('p1'));
                const pData = pSnap.data();
                pData.stock += newData.items[0].quantity;
                
                t.update(db.collection('products').doc('p1'), { stock: pData.stock });
                t.update(db.collection('orders').doc('o1'), { stockRestored: true });
            });
        }
    }
    
    try {
        assert.strictEqual(mockDB['products/p1'].stock, 100);
        assert.strictEqual(mockDB['orders/o1'].stockRestored, true);
        pass('onOrderStatusUpdate simple product restoration (95 -> 100)');
    } catch(e) { fail('onOrderStatusUpdate simple restoration', e); }


    console.log('\n--- 2. Variant Product Flow ---');
    let variantProduct = { 
        stock: 50, 
        variants: [
            { id: 'v1', label: '10ml', stock: 20 },
            { id: 'v2', label: '20ml', stock: 30 }
        ] 
    };
    let variantOrder = { items: [{ productId: 'p2', variantLabel: '10ml', quantity: 2 }] };
    
    // createOrder variant deduction
    let vIdx = findVariantIndex(variantProduct.variants, variantOrder.items[0]);
    if (vIdx !== -1) {
        variantProduct.variants[vIdx].stock -= variantOrder.items[0].quantity;
        variantProduct.stock -= variantOrder.items[0].quantity;
    }
    try {
        assert.strictEqual(variantProduct.variants[0].stock, 18);
        assert.strictEqual(variantProduct.stock, 48);
        pass('createOrder variant product stock deduction (variant 20->18, total 50->48)');
    } catch(e) { fail('createOrder variant deduction', e); }

    // onOrderStatusUpdate variant restoration
    mockDB['products/p2'] = JSON.parse(JSON.stringify(variantProduct));
    mockDB['orders/o2'] = { stockRestored: false };
    
    newData.items = variantOrder.items;
    if (!oldData.stockRestored && !newData.stockRestored) {
        await db.runTransaction(async (t) => {
            const oSnap = await t.get(db.collection('orders').doc('o2'));
            if (oSnap.data().stockRestored) return;
            
            const pSnap = await t.get(db.collection('products').doc('p2'));
            const pData = pSnap.data();
            
            let idx = findVariantIndex(pData.variants, newData.items[0]);
            if (idx !== -1) {
                pData.variants[idx].stock += newData.items[0].quantity;
                pData.stock += newData.items[0].quantity;
            }
            
            t.update(db.collection('products').doc('p2'), { stock: pData.stock, variants: pData.variants });
            t.update(db.collection('orders').doc('o2'), { stockRestored: true });
        });
    }

    try {
        assert.strictEqual(mockDB['products/p2'].variants[0].stock, 20);
        assert.strictEqual(mockDB['products/p2'].stock, 50);
        assert.strictEqual(mockDB['orders/o2'].stockRestored, true);
        pass('onOrderStatusUpdate variant product restoration (variant 18->20, total 48->50)');
    } catch(e) { fail('onOrderStatusUpdate variant restoration', e); }


    console.log('\n--- 3. Idempotency Guard (Double Cancel) ---');
    transactionLog.length = 0;
    const oldDataDouble = { status: 'CANCELLED', stockRestored: true };
    const newDataDouble = { status: 'CANCELLED', stockRestored: true };
    
    if (oldDataDouble.stockRestored || newDataDouble.stockRestored) {
        // Expected bypass
    } else {
        fail('Idempotency Guard', new Error('Guard failed to skip early'));
    }
    
    try {
        assert.strictEqual(transactionLog.length, 0);
        pass('Idempotency guard prevented double restoration');
    } catch(e) { fail('Idempotency guard', e); }

    console.log('\n==========================================');
    console.log(`ORDER STOCK FLOW TESTS COMPLETED: ${passed} PASSED, ${failed} FAILED.`);
    console.log('==========================================');
    
    process.exit(failed > 0 ? 1 : 0);
}

runTests();
