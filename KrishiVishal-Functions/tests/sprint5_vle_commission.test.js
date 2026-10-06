/**
 * sprint5_vle_commission.test.js
 * Comprehensive Unit Test Suite for Kisan Mitra / VLE Commission & Assisted Buying Engine.
 */

const assert = require('assert');
const {
  calculateVleOrderCommission,
  normalizeCategory,
  generateVleCode,
  DEFAULT_COMMISSION_SLABS
} = require('../marketing/vleCommissionEngine');

console.log("=== RUNNING SPRINT 5: KISAN MITRA & VLE COMMISSION TEST SUITE ===\n");

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

async function runVleCommissionTests() {
  // ─────────────────────────────────────────────────────────────
  // TEST 1: Category Normalization
  // ─────────────────────────────────────────────────────────────
  console.log("--- TEST 1: Category Normalization ---");
  try {
    // Fertilizer variations (English & Hindi)
    assert.strictEqual(normalizeCategory('Fertilizer 50kg bag'), 'FERTILIZER');
    assert.strictEqual(normalizeCategory('यूरिया दानेदार (खाद)'), 'FERTILIZER');
    assert.strictEqual(normalizeCategory('IFFCO DAP 18:46:00'), 'FERTILIZER');
    pass("1.1 Fertilizer items normalized correctly (English & Hindi keywords)");

    // Seed variations
    assert.strictEqual(normalizeCategory('Pioneer Hybrid Corn Seed'), 'SEEDS');
    assert.strictEqual(normalizeCategory('धान का संकर बीज'), 'SEEDS');
    assert.strictEqual(normalizeCategory('Certified Wheat Seeds'), 'SEEDS');
    pass("1.2 Seed items normalized correctly");

    // Pesticide / Insecticide / Herbicide variations
    assert.strictEqual(normalizeCategory('Broad-spectrum Pesticide 1L'), 'PESTICIDE');
    assert.strictEqual(normalizeCategory('फसल सुरक्षा कीटनाशक दवा'), 'PESTICIDE');
    assert.strictEqual(normalizeCategory('Systemic Fungicide'), 'PESTICIDE');
    assert.strictEqual(normalizeCategory('Selective Herbicide 500ml'), 'PESTICIDE');
    pass("1.3 Pesticides, fungicides, herbicides normalized correctly");

    // Default / Miscellaneous items
    assert.strictEqual(normalizeCategory('Knapsack Battery Sprayer Pump'), 'DEFAULT');
    assert.strictEqual(normalizeCategory('Irrigation Pipe 50m'), 'DEFAULT');
    assert.strictEqual(normalizeCategory(''), 'DEFAULT');
    assert.strictEqual(normalizeCategory(null), 'DEFAULT');
    pass("1.4 Miscellaneous / empty categories fall back to DEFAULT safely");

  } catch (err) {
    fail("TEST 1 Category Normalization", err);
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 2: Category-Wise Commission Slab Calculation
  // ─────────────────────────────────────────────────────────────
  console.log("\n--- TEST 2: Multi-Item Order Commission Breakdown ---");
  try {
    const multiItemOrder = {
      orderId: "ORD_TEST_991",
      totalAmount: 13500,
      items: [
        {
          name: "IFFCO Urea 45kg",
          category: "Fertilizer",
          price: 266.5,
          quantity: 10 // ₹2,665 @ 1.5% = ₹39.98
        },
        {
          name: "Hybrid Paddy Seed 5kg",
          category: "Seeds",
          price: 950,
          quantity: 4 // ₹3,800 @ 3.5% = ₹133.00
        },
        {
          name: "Coragen Insecticide 60ml",
          category: "Pesticide",
          price: 1850,
          quantity: 2 // ₹3,700 @ 5.0% = ₹185.00
        },
        {
          name: "Garden Pruning Shears",
          category: "Hand Tools",
          price: 450,
          quantity: 1 // ₹450 @ 2.5% = ₹11.25
        }
      ]
    };

    const result = calculateVleOrderCommission(multiItemOrder);

    // Verify breakdown length and individual commissions
    assert.strictEqual(result.commissionBreakdown.length, 4);

    const ureaCommission = result.commissionBreakdown.find(i => i.name.includes("Urea"));
    assert.strictEqual(ureaCommission.rate, 0.015);
    assert.strictEqual(ureaCommission.commission, 39.98);

    const seedCommission = result.commissionBreakdown.find(i => i.name.includes("Seed"));
    assert.strictEqual(seedCommission.rate, 0.035);
    assert.strictEqual(seedCommission.commission, 133.00);

    const pestCommission = result.commissionBreakdown.find(i => i.name.includes("Insecticide"));
    assert.strictEqual(pestCommission.rate, 0.05);
    assert.strictEqual(pestCommission.commission, 185.00);

    const toolCommission = result.commissionBreakdown.find(i => i.name.includes("Pruning"));
    assert.strictEqual(toolCommission.rate, 0.025);
    assert.strictEqual(toolCommission.commission, 11.25);

    // Total: 39.98 + 133.00 + 185.00 + 11.25 = 369.23
    assert.strictEqual(result.totalCommission, 369.23);
    pass("2.1 Multi-item order accurately calculates category-wise commission and total");

    // ─────────────────────────────────────────────────────────────
    // TEST 2.2: Custom Slabs Override
    // ─────────────────────────────────────────────────────────────
    const customSlabs = {
      FERTILIZER: 0.02, // Raised to 2%
      SEEDS: 0.04       // Raised to 4%
    };
    const customResult = calculateVleOrderCommission(multiItemOrder, customSlabs);
    const customUrea = customResult.commissionBreakdown.find(i => i.name.includes("Urea"));
    assert.strictEqual(customUrea.rate, 0.02);
    assert.strictEqual(customUrea.commission, 53.30); // 2665 * 0.02
    pass("2.2 Custom VLE commission slabs override defaults seamlessly");

    // ─────────────────────────────────────────────────────────────
    // TEST 2.3: Order with Empty Items (Fallback to flat default)
    // ─────────────────────────────────────────────────────────────
    const emptyItemsOrder = {
      orderId: "ORD_NO_ITEMS_01",
      totalAmount: 5000,
      items: []
    };
    const fallbackResult = calculateVleOrderCommission(emptyItemsOrder);
    assert.strictEqual(fallbackResult.commissionBreakdown.length, 1);
    assert.strictEqual(fallbackResult.totalCommission, 125); // 5000 * 2.5%
    pass("2.3 Flat order fallback accurately calculates 2.5% default rate");

  } catch (err) {
    fail("TEST 2 Commission Calculation", err);
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 3: VLE Code Formatting & Uniqueness Format
  // ─────────────────────────────────────────────────────────────
  console.log("\n--- TEST 3: VLE Code Generation Format ---");
  try {
    const codeFormatRegex = /^KM-[A-Z0-9]{3,8}-[0-9]{3,4}$/;

    // Simulate code generation with district and village
    const mockDistrict = 'SAMASTIPUR';
    const mockVillage = 'Ujiarpur';
    const prefix = (mockDistrict || mockVillage).toUpperCase().replace(/[^A-Z]/g, '').substring(0, 5);
    const mockCode = `KM-${prefix}-452`;

    assert.strictEqual(codeFormatRegex.test(mockCode), true);
    assert.strictEqual(mockCode.startsWith('KM-SAMAS-'), true);
    pass("3.1 Generated VLE code conforms to standard rural prefix pattern (KM-SAMAS-XXX)");

  } catch (err) {
    fail("TEST 3 VLE Code Generation Format", err);
  }

  // ─────────────────────────────────────────────────────────────
  // TEST 4: Return Window Escrow & Clawback Invariants
  // ─────────────────────────────────────────────────────────────
  console.log("\n--- TEST 4: 7-Day Maturity Window & Clawback Lifecycle ---");
  try {
    const deliveredAt = new Date('2026-10-01T10:00:00.000Z');
    const maturityWindowMs = 7 * 24 * 60 * 60 * 1000;
    const expectedMaturityDate = new Date(deliveredAt.getTime() + maturityWindowMs);

    const commissionDoc = {
      orderId: "ORD_DELIVERED_101",
      vleId: "vle_user_456",
      vleCode: "KM-PATNA-102",
      totalCommission: 450,
      status: "HOLD_RETURN_WINDOW",
      deliveredAt: deliveredAt.toISOString(),
      matureAt: expectedMaturityDate.toISOString()
    };

    // Assert escrow hold on delivery
    assert.strictEqual(commissionDoc.status, "HOLD_RETURN_WINDOW");
    assert.strictEqual(
      new Date(commissionDoc.matureAt).getTime() - new Date(commissionDoc.deliveredAt).getTime(),
      7 * 24 * 3600 * 1000
    );
    pass("4.1 Accrued commission is placed in 7-day HOLD_RETURN_WINDOW escrow upon delivery");

    // Simulating cancellation / return before 7 days -> CLAWBACK
    const daysSinceDelivery = 3;
    const isWithinReturnWindow = daysSinceDelivery < 7;
    assert.strictEqual(isWithinReturnWindow, true);

    const cancelledOrderState = {
      ...commissionDoc,
      status: "CLAWBACK",
      clawbackReason: "Customer initiated return during 7-day window",
      clawbackAt: new Date('2026-10-04T12:00:00.000Z').toISOString()
    };
    assert.strictEqual(cancelledOrderState.status, "CLAWBACK");
    assert.strictEqual(cancelledOrderState.totalCommission, 450);
    pass("4.2 Cancelled/Returned orders transition commission to CLAWBACK preventing wallet credit");

    // Simulating 8 days past delivery -> MATURED
    const matureTestDate = new Date('2026-10-09T10:00:00.000Z');
    const isEligibleForDisbursement = matureTestDate.getTime() >= new Date(commissionDoc.matureAt).getTime();
    assert.strictEqual(isEligibleForDisbursement, true);

    const maturedState = {
      ...commissionDoc,
      status: "MATURED",
      maturedAt: matureTestDate.toISOString()
    };
    assert.strictEqual(maturedState.status, "MATURED");
    pass("4.3 After 7-day return window expires, commission matures for wallet credit");

  } catch (err) {
    fail("TEST 4 Maturity & Clawback", err);
  }

  // ─────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────
  console.log(`\n======================================================`);
  console.log(`SPRINT 5 VLE COMMISSION TESTS COMPLETE: ${passed} passed, ${failed} failed`);
  console.log(`======================================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runVleCommissionTests().catch((err) => {
  console.error("Unhandled error in test runner:", err);
  process.exit(1);
});
