const assert = require('assert');
const { calculateTaxForOrder } = require('../tax/gstEngine');

async function runTests() {
    console.log("=================================================================");
    console.log("=== RUNNING SPRINT 7: AUDIT REMEDIATION TEST SUITE           ===");
    console.log("=================================================================\n");

    let passed = 0;
    let failed = 0;

    function pass(name) { console.log(`✅ PASS: ${name}`); passed++; }
    function fail(name, err) { console.error(`❌ FAIL: ${name} - ${err.message || err}`); failed++; }

    // Test 1: HSN Unknown → must THROW
    try {
        calculateTaxForOrder({
            shippingState: "bihar",
            items: [{ hsnCode: "9999", taxablePrice: 1000, quantity: 1, category: "UNKNOWN" }]
        });
        fail("Test 1.1: Unknown HSN must throw GST_RULE_46_VIOLATION", new Error("Did not throw"));
    } catch (e) {
        if (e.message.includes("GST_RULE_46_VIOLATION")) {
            pass("Test 1.1: Unknown HSN correctly throws GST_RULE_46_VIOLATION");
        } else {
            fail("Test 1.1: Unknown HSN threw wrong error", e);
        }
    }

    console.log(`\n=================================================================`);
    console.log(`SPRINT 7 TESTS: ${passed} PASSED, ${failed} FAILED`);
    console.log(`=================================================================\n`);
    
    if (failed > 0) process.exit(1);
}

runTests();
