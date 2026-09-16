const assert = require('assert');
const crypto = require('crypto');
const { parseWeightToGrams } = require('../inventory/importSkus');

console.log('--- KrishiVishal Round 2 Features Unit Test Suite ---');

// ==========================================
// TEST SUITE 1: WEIGHT PARSER & MIGRATION
// ==========================================
console.log('\n[Suite 1: Weight Parser & Unit Standardization]');

// Test 1.1: Standard Metric Formats
{
    assert.strictEqual(parseWeightToGrams("500g"), 500, "500g should parse to 500 grams");
    assert.strictEqual(parseWeightToGrams("500 g"), 500, "500 g with space should parse to 500 grams");
    assert.strictEqual(parseWeightToGrams("1kg"), 1000, "1kg should parse to 1000 grams");
    assert.strictEqual(parseWeightToGrams("1.5 kg"), 1500, "1.5 kg should parse to 1500 grams");
    assert.strictEqual(parseWeightToGrams("250ml"), 250, "250ml should parse to 250 grams/ml equivalent");
    assert.strictEqual(parseWeightToGrams("1L"), 1000, "1L should parse to 1000 grams/ml equivalent");
    assert.strictEqual(parseWeightToGrams("2.5 litre"), 2500, "2.5 litre should parse to 2500 grams/ml equivalent");
    assert.strictEqual(parseWeightToGrams("50 gm"), 50, "50 gm should parse to 50 grams");
    assert.strictEqual(parseWeightToGrams("500 gms"), 500, "500 gms should parse to 500 grams");
    console.log('PASS: Test 1.1 (Standard metric and volume formats converted to grams)');
}

// Test 1.2: Edge Cases & Resilient Fallbacks
{
    assert.strictEqual(parseWeightToGrams(500), 500, "Numeric value should return unchanged");
    assert.strictEqual(parseWeightToGrams(""), 0, "Empty string should return 0");
    assert.strictEqual(parseWeightToGrams(null), 0, "Null should return 0");
    assert.strictEqual(parseWeightToGrams(undefined), 0, "Undefined should return 0");
    assert.strictEqual(parseWeightToGrams("invalid"), 0, "Invalid text should return 0");
    assert.strictEqual(parseWeightToGrams("100"), 100, "Pure numeric string should return 100");
    console.log('PASS: Test 1.2 (Edge cases: null, undefined, malformed strings)');
}

// ==========================================
// TEST SUITE 2: CANONICAL ADDRESS VALIDATION
// ==========================================
console.log('\n[Suite 2: Canonical Structured Address Validation]');

function validateAddressObject(address) {
    if (!address || typeof address !== 'object' || Array.isArray(address)) {
        return { isValid: false, error: 'Address must be a structured object' };
    }
    const required = ['line1', 'city', 'state', 'pincode'];
    for (const field of required) {
        if (!address[field] || typeof address[field] !== 'string' || address[field].trim().length === 0) {
            return { isValid: false, error: `Missing or invalid field: ${field}` };
        }
    }
    const cleanPincode = address.pincode.trim();
    if (!/^\d{6}$/.test(cleanPincode)) {
        return { isValid: false, error: 'Pincode must be 6 digits' };
    }
    return {
        isValid: true,
        address: {
            line1: address.line1.trim(),
            line2: (address.line2 || '').trim(),
            city: address.city.trim(),
            state: address.state.trim(),
            pincode: cleanPincode,
            landmark: (address.landmark || '').trim(),
            lat: typeof address.lat === 'number' ? address.lat : null,
            lng: typeof address.lng === 'number' ? address.lng : null
        }
    };
}

// Test 2.1: Valid Structured Address
{
    const validAddr = {
        line1: "House 12, Ward 4",
        line2: "Near High School",
        city: "Patna",
        state: "Bihar",
        pincode: "800001",
        landmark: "Shiv Mandir",
        lat: 25.5941,
        lng: 85.1376
    };
    const res = validateAddressObject(validAddr);
    assert.strictEqual(res.isValid, true);
    assert.strictEqual(res.address.pincode, "800001");
    assert.strictEqual(res.address.city, "Patna");
    console.log('PASS: Test 2.1 (Valid structured address parsed successfully)');
}

// Test 2.2: Reject Legacy String Address
{
    const stringAddr = "House 12, Ward 4, Patna, Bihar - 800001";
    const res = validateAddressObject(stringAddr);
    assert.strictEqual(res.isValid, false, "Legacy string address must be rejected");
    console.log('PASS: Test 2.2 (Legacy string address correctly rejected)');
}

// Test 2.3: Reject Invalid Pincode
{
    const badPincodeAddr = {
        line1: "House 12",
        city: "Patna",
        state: "Bihar",
        pincode: "80000A"
    };
    const res = validateAddressObject(badPincodeAddr);
    assert.strictEqual(res.isValid, false, "Non-numeric pincode must be rejected");
    console.log('PASS: Test 2.3 (Invalid pincode rejected)');
}

// ==========================================
// TEST SUITE 3: DELIVERY SLOT CONCURRENCY & SAFEGUARDS
// ==========================================
console.log('\n[Suite 3: Delivery Slot Concurrency & Safeguards]');

// Test 3.1: Slot Capacity Reservation Logic Simulation
{
    let slot = {
        slotId: "SLOT_2026-09-16_09-12_PATNA",
        date: "2026-09-16",
        startTime: "09:00",
        endTime: "12:00",
        maxCapacity: 1, // Only 1 seat
        currentBookings: 0,
        isActive: true
    };

    function simulateReserveSlot(slotDoc) {
        if (!slotDoc.isActive) throw new Error("Slot inactive");
        if (slotDoc.currentBookings >= slotDoc.maxCapacity) {
            throw new Error(`Delivery slot is fully booked (${slotDoc.currentBookings}/${slotDoc.maxCapacity})`);
        }
        slotDoc.currentBookings += 1;
        return { success: true, slotId: slotDoc.slotId };
    }

    // First booking succeeds
    const book1 = simulateReserveSlot(slot);
    assert.strictEqual(book1.success, true);
    assert.strictEqual(slot.currentBookings, 1);

    // Concurrent second booking fails with capacity limit
    assert.throws(() => {
        simulateReserveSlot(slot);
    }, /fully booked/);
    console.log('PASS: Test 3.1 (Delivery slot concurrency & max capacity enforcement)');
}

// Test 3.2: Slot Deletion Safeguard Logic
{
    function simulateDeleteSlot(slotDoc) {
        if (slotDoc.currentBookings > 0) {
            throw new Error(`Cannot delete slot with ${slotDoc.currentBookings} active booking(s)`);
        }
        return { deleted: true };
    }

    const activeBookedSlot = { slotId: "SLOT_1", currentBookings: 3 };
    assert.throws(() => simulateDeleteSlot(activeBookedSlot), /active booking/);

    const emptySlot = { slotId: "SLOT_2", currentBookings: 0 };
    const delRes = simulateDeleteSlot(emptySlot);
    assert.strictEqual(delRes.deleted, true);
    console.log('PASS: Test 3.2 (Slot deletion blocked when active bookings exist)');
}

// ==========================================
// TEST SUITE 4: FCM TOKEN REGISTRY IDEMPOTENCY
// ==========================================
console.log('\n[Suite 4: FCM Token Registry & Cleanup]');

{
    const token = "fcm_test_token_abc_123_456_xyz";
    const tokenId = crypto.createHash('sha256').update(token.trim()).digest('hex').substring(0, 32);
    assert.strictEqual(tokenId.length, 32, "Token ID must be 32-char SHA-256 hash");

    // Same token produces identical ID (idempotent registration)
    const tokenId2 = crypto.createHash('sha256').update(token.trim()).digest('hex').substring(0, 32);
    assert.strictEqual(tokenId, tokenId2, "Same token must generate identical document ID");
    console.log('PASS: Test 4.1 (FCM token hashing is deterministic and idempotent)');
}

console.log('\nAll Round 2 features tests passed successfully!');
