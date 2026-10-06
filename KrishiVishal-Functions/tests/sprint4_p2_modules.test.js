const assert = require('assert');
const {
    calculateOrderEarnings,
    calculateRiderPayout
} = require('../logistics/riderPayoutEngine');
const {
    computeAuditVariance
} = require('../inventory/cycleCountEngine');

console.log("=== RUNNING SPRINT 4: RIDER PAYOUT ENGINE & WMS CYCLE COUNT AUDIT TEST SUITE ===\n");

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

async function runSprint4Tests() {
    // ─────────────────────────────────────────────────────────────
    // TEST 1: Rider Payout Calculation
    // Base delivery, heavy allowance, distance surcharge, and fake attempt penalties
    // ─────────────────────────────────────────────────────────────
    console.log("--- TEST 1: Rider Payout Calculations ---");
    try {
        // 1.1 Base Delivery Earning (₹30 for DELIVERED)
        const order1 = { id: 'ORD_01', status: 'DELIVERED', totalWeightKg: 5, distanceKm: 8 };
        const res1 = calculateOrderEarnings(order1);
        assert.strictEqual(res1.baseEarning, 30, 'Base earning must be 30');
        assert.strictEqual(res1.heavyAllowance, 0, 'Heavy allowance should be 0 for <= 10kg');
        assert.strictEqual(res1.distanceSurcharge, 0, 'Distance surcharge should be 0 for <= 12km');
        assert.strictEqual(res1.netEarning, 30, 'Net earning should be 30');
        pass("1.1 Base delivery earning of ₹30 calculated correctly for standard delivery");

        // 1.2 Heavy Item Allowance (+₹15 if weight > 10 kg)
        const order2 = { id: 'ORD_02', status: 'DELIVERED', totalWeightKg: 25, distanceKm: 6 };
        const res2 = calculateOrderEarnings(order2);
        assert.strictEqual(res2.baseEarning, 30);
        assert.strictEqual(res2.heavyAllowance, 15, 'Heavy allowance must be ₹15 for > 10kg (e.g. 25kg fertilizer)');
        assert.strictEqual(res2.distanceSurcharge, 0);
        assert.strictEqual(res2.grossEarning, 45, 'Gross should be 30 + 15 = 45');
        pass("1.2 Heavy item allowance (+₹15) triggered for fertilizer/seed bags > 10 kg");

        // 1.3 Rural Distance Surcharge (+₹5 per km beyond 12 km)
        const order3 = { id: 'ORD_03', status: 'DELIVERED', totalWeightKg: 4, distanceKm: 18 };
        const res3 = calculateOrderEarnings(order3);
        assert.strictEqual(res3.baseEarning, 30);
        assert.strictEqual(res3.heavyAllowance, 0);
        // (18 - 12) * 5 = 6 * 5 = 30
        assert.strictEqual(res3.distanceSurcharge, 30, 'Distance surcharge must be 6km * ₹5 = ₹30');
        assert.strictEqual(res3.grossEarning, 60, 'Gross should be 30 + 30 = 60');
        pass("1.3 Rural distance surcharge (+₹5/km above 12km) calculated correctly");

        // 1.4 Heavy + Distance combined
        const order4 = { id: 'ORD_04', status: 'DELIVERED', totalWeightKg: 15, distanceKm: 16 };
        const res4 = calculateOrderEarnings(order4);
        // Base 30 + Heavy 15 + Distance (16-12)*5=20 => 65
        assert.strictEqual(res4.baseEarning, 30);
        assert.strictEqual(res4.heavyAllowance, 15);
        assert.strictEqual(res4.distanceSurcharge, 20);
        assert.strictEqual(res4.grossEarning, 65);
        pass("1.4 Combined high-weight (15kg) and remote distance (16km) yields ₹65 accurately");

        // 1.5 Fake Attempt Penalty (-₹20) when rider marks unavailable > 75m away
        const orderFake = {
            id: 'ORD_FAKE_01',
            status: 'CUSTOMER_UNAVAILABLE',
            distanceToCustomerAtAttempt: 150 // 150m away from farmer location
        };
        const resFake = calculateOrderEarnings(orderFake);
        assert.strictEqual(resFake.baseEarning, 0, 'No base earning on unavailable');
        assert.strictEqual(resFake.isFakeAttempt, true, 'Should detect fake attempt');
        assert.strictEqual(resFake.penalty, 20, 'Penalty must be ₹20');
        pass("1.5 Fake delivery attempt (>75m from coordinate) applies -₹20 penalty");

    } catch (err) {
        fail("TEST 1 Rider Payout Calculations", err);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 2: Rider Payout Mandatory Cash Settlement Lock
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- TEST 2: Rider Payout Cash Settlement Lock ---");
    try {
        const sampleOrders = [
            { id: 'ORD_101', status: 'DELIVERED', totalWeightKg: 5, distanceKm: 6, isCod: true, isCashSettled: true },
            { id: 'ORD_102', status: 'DELIVERED', totalWeightKg: 8, distanceKm: 10, isCod: false } // Prepaid
        ];

        // 2.1 Fully settled rider payout -> PENDING_APPROVAL
        const payoutVerified = calculateRiderPayout({
            riderId: 'RIDER_001',
            riderName: 'Ramesh Kumar',
            hubId: 'hub_central_samastipur',
            startDate: '2026-09-20',
            endDate: '2026-09-27',
            orders: sampleOrders,
            cashSettlements: [{ id: 'SETTLE_01', riderId: 'RIDER_001', status: 'CONFIRMED' }]
        });

        assert.strictEqual(payoutVerified.settlementVerified, true);
        assert.strictEqual(payoutVerified.status, 'PENDING_APPROVAL');
        assert.strictEqual(payoutVerified.netPayable, 60);
        pass("2.1 Payout status is PENDING_APPROVAL and verified when all cash settlements are CONFIRMED");

        // 2.2 Pending cash settlement -> ON_HOLD_CASH_MISMATCH
        const payoutHold1 = calculateRiderPayout({
            riderId: 'RIDER_001',
            riderName: 'Ramesh Kumar',
            hubId: 'hub_central_samastipur',
            startDate: '2026-09-20',
            endDate: '2026-09-27',
            orders: sampleOrders,
            cashSettlements: [{ id: 'SETTLE_02', riderId: 'RIDER_001', status: 'PENDING_VERIFICATION' }]
        });

        assert.strictEqual(payoutHold1.settlementVerified, false);
        assert.strictEqual(payoutHold1.status, 'ON_HOLD_CASH_MISMATCH');
        pass("2.2 Payout is strictly placed ON_HOLD_CASH_MISMATCH if any cash settlement is PENDING_VERIFICATION");

        // 2.3 Unsettled COD order in date range -> ON_HOLD_CASH_MISMATCH
        const ordersWithUnsettledCod = [
            { id: 'ORD_101', status: 'DELIVERED', totalWeightKg: 5, distanceKm: 6, isCod: true, isCashSettled: true },
            { id: 'ORD_103', status: 'DELIVERED', totalWeightKg: 5, distanceKm: 6, isCod: true, isCashSettled: false } // Unsettled COD!
        ];
        const payoutHold2 = calculateRiderPayout({
            riderId: 'RIDER_002',
            riderName: 'Suresh Yadav',
            hubId: 'hub_central_samastipur',
            startDate: '2026-09-20',
            endDate: '2026-09-27',
            orders: ordersWithUnsettledCod,
            cashSettlements: []
        });

        assert.strictEqual(payoutHold2.settlementVerified, false);
        assert.strictEqual(payoutHold2.status, 'ON_HOLD_CASH_MISMATCH');
        pass("2.3 Payout is locked with ON_HOLD_CASH_MISMATCH when individual COD delivery is unsettled");

    } catch (err) {
        fail("TEST 2 Rider Payout Cash Settlement Lock", err);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 3: Blind Audit & Variance Reconciliation
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- TEST 3: Blind Audit Variance & Quarantine Processing ---");
    try {
        const frozenSnapshot = {
            'SKU_UREA_50KG_BATCH_01': {
                skuCode: 'SKU_UREA_50KG',
                productName: 'Neem Coated Urea 50kg',
                batchNumber: 'BATCH_01',
                systemQty: 50,
                landingCost: 266.50
            },
            'SKU_DAP_50KG_BATCH_02': {
                skuCode: 'SKU_DAP_50KG',
                productName: 'IFFCO DAP 50kg',
                batchNumber: 'BATCH_02',
                systemQty: 30,
                landingCost: 1350.00
            },
            'SKU_CHLORO_1L_BATCH_03': {
                skuCode: 'SKU_CHLORO_1L',
                productName: 'Chlorpyrifos 20% EC 1L',
                batchNumber: 'BATCH_03',
                systemQty: 20,
                landingCost: 450.00
            }
        };

        const physicalCounts = [
            // SKU 1: Perfect match (50 counted, GOOD)
            { skuCode: 'SKU_UREA_50KG', batchNumber: 'BATCH_01', countedQty: 50, condition: 'GOOD' },
            // SKU 2: Shortage of 1 bag (29 counted instead of 30)
            { skuCode: 'SKU_DAP_50KG', batchNumber: 'BATCH_02', countedQty: 29, condition: 'GOOD' },
            // SKU 3: 15 good, 5 damaged/leaked bottles
            { skuCode: 'SKU_CHLORO_1L', batchNumber: 'BATCH_03', countedQty: 5, condition: 'DAMAGED' }
        ];

        const varianceResult = computeAuditVariance(frozenSnapshot, physicalCounts);

        // Urea should be PASSED
        const ureaReport = varianceResult.varianceReport.find(r => r.skuCode === 'SKU_UREA_50KG');
        assert.strictEqual(ureaReport.status, 'PASSED');
        assert.strictEqual(ureaReport.variance, 0);

        // DAP should be SHORTAGE of -1, value = ₹1350
        const dapReport = varianceResult.varianceReport.find(r => r.skuCode === 'SKU_DAP_50KG');
        assert.strictEqual(dapReport.status, 'SHORTAGE');
        assert.strictEqual(dapReport.variance, -1);
        assert.strictEqual(dapReport.financialImpact, 1350);

        // Chloro should be QUARANTINED
        const chloroReport = varianceResult.varianceReport.find(r => r.skuCode === 'SKU_CHLORO_1L');
        assert.strictEqual(chloroReport.status, 'QUARANTINED');
        assert.strictEqual(varianceResult.damagedItems.length, 1);
        assert.strictEqual(varianceResult.damagedItems[0].quantity, 5);

        pass("3.1 Blind audit accurately computes PASSED, SHORTAGE, and QUARANTINED status per item");
        pass("3.2 Damaged/leaked agrochemical bottles correctly segregated into damagedItems list for quarantine");

    } catch (err) {
        fail("TEST 3 Blind Audit Variance", err);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 4: Audit Debit Note & Threshold Alert (> ₹1,000)
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- TEST 4: Audit Discrepancy Threshold & Manager Debit Note ---");
    try {
        // Scenario A: Shortage below ₹1,000 threshold (e.g. 2 packets of seed @ ₹300 = ₹600)
        const lowShortageSnapshot = {
            'SKU_SEED_01_B1': {
                skuCode: 'SKU_SEED_01',
                batchNumber: 'B1',
                systemQty: 10,
                landingCost: 300.00
            }
        };
        const lowShortageCount = [
            { skuCode: 'SKU_SEED_01', batchNumber: 'B1', countedQty: 8, condition: 'GOOD' }
        ];
        const resLow = computeAuditVariance(lowShortageSnapshot, lowShortageCount);
        assert.strictEqual(resLow.totalShortageValue, 600);
        assert.strictEqual(resLow.requiresDebitNote, false, 'Shortage <= ₹1,000 should NOT require debit note');
        pass("4.1 Minor shortage below ₹1,000 threshold does not trigger manager debit note");

        // Scenario B: Shortage exceeds ₹1,000 threshold (e.g. 1 bag DAP @ ₹1,350)
        const highShortageSnapshot = {
            'SKU_DAP_B2': {
                skuCode: 'SKU_DAP',
                batchNumber: 'B2',
                systemQty: 10,
                landingCost: 1350.00
            }
        };
        const highShortageCount = [
            { skuCode: 'SKU_DAP', batchNumber: 'B2', countedQty: 9, condition: 'GOOD' }
        ];
        const resHigh = computeAuditVariance(highShortageSnapshot, highShortageCount);
        assert.strictEqual(resHigh.totalShortageValue, 1350);
        assert.strictEqual(resHigh.requiresDebitNote, true, 'Shortage > ₹1,000 MUST trigger debit note and CRITICAL alert');
        pass("4.2 Shortage of ₹1,350 (> ₹1,000 threshold) strictly flags requiresDebitNote and liability escalation");

        // Scenario C: Multiple shortages aggregating > ₹1,000
        const multiSnapshot = {
            'SKU_A_B1': { skuCode: 'SKU_A', batchNumber: 'B1', systemQty: 5, landingCost: 400.00 },
            'SKU_B_B1': { skuCode: 'SKU_B', batchNumber: 'B1', systemQty: 5, landingCost: 700.00 }
        };
        const multiCount = [
            { skuCode: 'SKU_A', batchNumber: 'B1', countedQty: 4, condition: 'GOOD' }, // -400
            { skuCode: 'SKU_B', batchNumber: 'B1', countedQty: 4, condition: 'GOOD' }  // -700 -> total -1100
        ];
        const resMulti = computeAuditVariance(multiSnapshot, multiCount);
        assert.strictEqual(resMulti.totalShortageValue, 1100);
        assert.strictEqual(resMulti.requiresDebitNote, true);
        pass("4.3 Aggregated cross-SKU shortages exceeding ₹1,000 correctly trigger liability escalation");

    } catch (err) {
        fail("TEST 4 Audit Discrepancy Threshold", err);
    }

    console.log("\n=======================================================");
    console.log(`SPRINT 4 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log("=======================================================\n");

    if (failed > 0) {
        process.exit(1);
    }
}

runSprint4Tests().catch(err => {
    console.error("Sprint 4 test suite failed unhandled:", err);
    process.exit(1);
});
