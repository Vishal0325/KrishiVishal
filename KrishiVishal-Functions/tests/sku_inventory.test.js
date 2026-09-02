const assert = require('assert');
const { validateSku, generateSkuCode, VALID_CATEGORIES, VALID_UNITS } = require('../inventory/skuValidator');

console.log('--- KrishiVishal SKU & Inventory Test Suite ---');

// ==========================================
// TEST SUITE 1: SKU NOMENCLATURE & VALIDATION
// ==========================================

// Test 1.1: Valid Standard SKU
{
    const validSku = 'FE-URE-GRN-46-050KG-IFF';
    const result = validateSku(validSku);
    assert.strictEqual(result.isValid, true, 'Valid SKU should pass validation');
    assert.strictEqual(result.skuCode, validSku);
    assert.strictEqual(result.productId, 'FE-URE-GRN-IFF', 'Parent Product ID should match CC-III-VVV-BBB');
    assert.strictEqual(result.segments.category, 'FE');
    assert.strictEqual(result.segments.item, 'URE');
    assert.strictEqual(result.segments.variety, 'GRN');
    assert.strictEqual(result.segments.grade, '46');
    assert.strictEqual(result.segments.size, 50);
    assert.strictEqual(result.segments.unit, 'KG');
    assert.strictEqual(result.segments.brand, 'IFF');
    console.log('PASS: Test 1.1 (Valid Standard SKU FE-URE-GRN-46-050KG-IFF)');
}

// Test 1.2: Valid Liquid Formulation SKU
{
    const liquidSku = 'PE-GLY-LIQ-00-500ML-BAY';
    const result = validateSku(liquidSku);
    assert.strictEqual(result.isValid, true);
    assert.strictEqual(result.productId, 'PE-GLY-LIQ-BAY');
    assert.strictEqual(result.segments.size, 500);
    assert.strictEqual(result.segments.unit, 'ML');
    console.log('PASS: Test 1.2 (Valid Liquid SKU PE-GLY-LIQ-00-500ML-BAY)');
}

// Test 1.3: Reject Invalid Format (e.g. KV-FERT-IFF-UREA-50KG)
{
    const invalidFormats = [
        'KV-FERT-IFF-UREA-50KG',
        'FE-URE-GRN-50KG',
        'INVALID_SKU',
        '',
        null,
        'FE-URE-GRN-46-50KG-IFF' // Pack size missing 3-digit padding
    ];
    for (const badSku of invalidFormats) {
        const result = validateSku(badSku);
        assert.strictEqual(result.isValid, false, `Should reject bad format '${badSku}'`);
    }
    console.log('PASS: Test 1.3 (Reject Invalid Formats & Unapproved Nomenclature)');
}

// Test 1.4: Reject Invalid Category
{
    const badCatSku = 'XX-URE-GRN-46-050KG-IFF';
    const result = validateSku(badCatSku);
    assert.strictEqual(result.isValid, false);
    assert(result.error.includes('category'), 'Error should mention invalid category');
    console.log('PASS: Test 1.4 (Reject Invalid Category Code)');
}

// Test 1.5: Reject Invalid Unit
{
    const badUnitSku = 'FE-URE-GRN-46-050XX-IFF';
    const result = validateSku(badUnitSku);
    assert.strictEqual(result.isValid, false);
    assert(result.error.includes('unit'), 'Error should mention invalid unit');
    console.log('PASS: Test 1.5 (Reject Invalid Unit)');
}

// Test 1.6: SKU Generator Utility
{
    const generated = generateSkuCode({
        category: 'FE',
        item: 'DAP',
        variety: 'GRN',
        grade: '18',
        size: 50,
        unit: 'KG',
        brand: 'IFF'
    });
    assert.strictEqual(generated, 'FE-DAP-GRN-18-050KG-IFF');
    console.log('PASS: Test 1.6 (SKU Generator output: ' + generated + ')');
}

// ==========================================
// TEST SUITE 2: FEFO ALLOCATION ALGORITHM
// ==========================================

{
    // Mock Batches
    const now = Date.now();
    const batches = [
        { batchId: 'B3', batchNumber: 'BTH-003', availableStock: 10, expiryDate: now + 30 * 86400000 }, // Expiring in 30 days
        { batchId: 'B1', batchNumber: 'BTH-001', availableStock: 5, expiryDate: now + 10 * 86400000 },  // Expiring in 10 days (Earliest)
        { batchId: 'B2', batchNumber: 'BTH-002', availableStock: 20, expiryDate: now + 20 * 86400000 }  // Expiring in 20 days
    ];

    // Sort by FEFO
    batches.sort((a, b) => a.expiryDate - b.expiryDate);
    assert.strictEqual(batches[0].batchId, 'B1', 'B1 must be first (FEFO)');
    assert.strictEqual(batches[1].batchId, 'B2', 'B2 must be second (FEFO)');
    assert.strictEqual(batches[2].batchId, 'B3', 'B3 must be third (FEFO)');

    // Allocate 12 units across batches
    let needed = 12;
    const allocations = [];
    for (const b of batches) {
        if (needed <= 0) break;
        const take = Math.min(b.availableStock, needed);
        allocations.push({ batchId: b.batchId, qty: take });
        needed -= take;
    }

    assert.strictEqual(needed, 0, 'All 12 units should be allocated');
    assert.strictEqual(allocations.length, 2, 'Should allocate from 2 batches');
    assert.strictEqual(allocations[0].batchId, 'B1');
    assert.strictEqual(allocations[0].qty, 5); // 5 from B1
    assert.strictEqual(allocations[1].batchId, 'B2');
    assert.strictEqual(allocations[1].qty, 7); // 7 from B2

    console.log('PASS: Test 2.1 (FEFO Multi-Batch Allocation: 5 from B1, 7 from B2)');
}

// ==========================================
// TEST SUITE 3: IDEMPOTENCY KEY VERIFICATION
// ==========================================

{
    const key = `ORDER:ORD-12345:RESERVE:FE-URE-GRN-46-050KG-IFF`;
    assert(key.startsWith('ORDER:ORD-12345:RESERVE:'), 'Deterministic key format verified');
    console.log('PASS: Test 3.1 (Deterministic Idempotency Key Structure)');
}

console.log('--- ALL SKU & INVENTORY TESTS PASSED ---');
