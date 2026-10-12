const assert = require('assert');

console.log('=====================================================');
console.log('--- TEST SUITE: Max Daily Procure Limit & On-Demand ---');
console.log('=====================================================');

function simulateOnDemandLimit({
    product,
    cartQuantity,
    todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
}) {
    const fulfillmentType = product.fulfillmentType || 'SELF_STOCK';
    
    if (fulfillmentType === 'ON_DEMAND') {
        const maxLimit = Number(product.maxDailyProcureLimit) || 0;
        if (maxLimit > 0) {
            const isSameDay = product.dailyProcuredDate === todayStr;
            const alreadyProcured = isSameDay ? (Number(product.dailyProcuredCount) || 0) : 0;
            const newProcured = alreadyProcured + cartQuantity;
            if (newProcured > maxLimit) {
                throw new Error(`Today's procurement quota for "${product.name || product.id}" is full (${alreadyProcured}/${maxLimit} units). Please reduce quantity or order tomorrow.`);
            }
            product.dailyProcuredCount = newProcured;
            product.dailyProcuredDate = todayStr;
        }
        return { status: 'PROCUREMENT_PENDING', quantity: cartQuantity };
    }
    return { status: 'SELF_STOCK_RESERVED', quantity: cartQuantity };
}

// TEST 1: ON_DEMAND product within limit
{
    const today = '2026-10-12';
    const product = {
        id: 'PROD_OD_001',
        name: 'Hybrid Tomato Seeds 100g',
        fulfillmentType: 'ON_DEMAND',
        maxDailyProcureLimit: 10,
        dailyProcuredCount: 0,
        dailyProcuredDate: today
    };

    const res = simulateOnDemandLimit({ product, cartQuantity: 4, todayStr: today });
    assert.strictEqual(res.status, 'PROCUREMENT_PENDING');
    assert.strictEqual(product.dailyProcuredCount, 4);
    assert.strictEqual(product.dailyProcuredDate, today);
    console.log('PASS: Test 1 - Order within limit succeeded (4/10 units allocated).');
}

// TEST 2: Consecutive order within remaining limit
{
    const today = '2026-10-12';
    const product = {
        id: 'PROD_OD_001',
        name: 'Hybrid Tomato Seeds 100g',
        fulfillmentType: 'ON_DEMAND',
        maxDailyProcureLimit: 10,
        dailyProcuredCount: 4,
        dailyProcuredDate: today
    };

    const res = simulateOnDemandLimit({ product, cartQuantity: 6, todayStr: today });
    assert.strictEqual(res.status, 'PROCUREMENT_PENDING');
    assert.strictEqual(product.dailyProcuredCount, 10);
    console.log('PASS: Test 2 - Consecutive order reached exact limit (10/10 units).');
}

// TEST 3: Exceeding daily limit throws error with descriptive message
{
    const today = '2026-10-12';
    const product = {
        id: 'PROD_OD_001',
        name: 'Hybrid Tomato Seeds 100g',
        fulfillmentType: 'ON_DEMAND',
        maxDailyProcureLimit: 10,
        dailyProcuredCount: 10,
        dailyProcuredDate: today
    };

    let caughtError = null;
    try {
        simulateOnDemandLimit({ product, cartQuantity: 1, todayStr: today });
    } catch (err) {
        caughtError = err;
    }

    assert(caughtError !== null, 'Should have thrown quota exceeded error');
    assert(caughtError.message.includes('Today\'s procurement quota for "Hybrid Tomato Seeds 100g" is full (10/10 units)'));
    console.log('PASS: Test 3 - Exceeded limit correctly rejected with expected message:', caughtError.message);
}

// TEST 4: Limit automatically resets on a new calendar day
{
    const previousDate = '2026-10-11';
    const today = '2026-10-12';
    const product = {
        id: 'PROD_OD_001',
        name: 'Hybrid Tomato Seeds 100g',
        fulfillmentType: 'ON_DEMAND',
        maxDailyProcureLimit: 10,
        dailyProcuredCount: 10,
        dailyProcuredDate: previousDate // yesterday
    };

    const res = simulateOnDemandLimit({ product, cartQuantity: 5, todayStr: today });
    assert.strictEqual(res.status, 'PROCUREMENT_PENDING');
    assert.strictEqual(product.dailyProcuredCount, 5, 'Count should reset to new day order qty');
    assert.strictEqual(product.dailyProcuredDate, today);
    console.log('PASS: Test 4 - Counter cleanly reset on new date (5/10 units on new day).');
}

// TEST 5: Products without limit or with 0/empty limit allow unrestricted ordering
{
    const today = '2026-10-12';
    const product = {
        id: 'PROD_OD_UNLIMITED',
        name: 'Drip Pipe Roll',
        fulfillmentType: 'ON_DEMAND',
        maxDailyProcureLimit: null
    };

    const res = simulateOnDemandLimit({ product, cartQuantity: 100, todayStr: today });
    assert.strictEqual(res.status, 'PROCUREMENT_PENDING');
    assert.strictEqual(product.dailyProcuredCount, undefined);
    console.log('PASS: Test 5 - Unlimited on-demand product accepted without restriction.');
}

// TEST 6: Standard SELF_STOCK products are completely unaffected
{
    const product = {
        id: 'PROD_SELF_001',
        name: 'Amistar Fungicide 250ml',
        fulfillmentType: 'SELF_STOCK',
        maxDailyProcureLimit: 5
    };

    const res = simulateOnDemandLimit({ product, cartQuantity: 10 });
    assert.strictEqual(res.status, 'SELF_STOCK_RESERVED');
    console.log('PASS: Test 6 - SELF_STOCK product completely bypasses on-demand daily limit check.');
}

console.log('=====================================================');
console.log('ALL 6/6 UNIT & SCENARIO TESTS PASSED SUCCESSFULLY! ✅');
console.log('=====================================================');
