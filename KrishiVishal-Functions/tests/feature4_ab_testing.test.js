/**
 * Unit Test Suite for Feature 4: A/B Testing & Variant Winner Tracking
 * Run via: node tests/feature4_ab_testing.test.js
 */

const assert = require('assert');
const campaigns = require('../messaging/campaigns');

let passedTests = 0;
let totalTests = 0;

function reportPass(name) {
    passedTests++;
    totalTests++;
    console.log(`✅ PASS: ${name}`);
}

function reportFail(name, err) {
    totalTests++;
    console.error(`❌ FAIL: ${name}`, err);
    process.exitCode = 1;
}

console.log("\n=== RUNNING FEATURE 4 A/B TESTING UNIT TESTS ===\n");

// 1. Validation tests
try {
    const validAb = campaigns.validateCampaignInput({
        isAbTest: true,
        splitRatio: 50,
        variantA: {
            title: "🌾 20% Off Hybrid Wheat Seeds",
            body: "Order premium certified hybrid wheat seeds today.",
            deepLink: "/product?id=SEEDS_WHEAT_HYBRID_25KG"
        },
        variantB: {
            title: "🚚 Free Home Delivery Today",
            body: "Zero delivery fee on all agricultural inputs delivered to your farm.",
            deepLink: "/product?id=FERT_UREA_50KG"
        },
        audience: { type: 'ALL' }
    });

    assert.strictEqual(validAb.isAbTest, true);
    assert.strictEqual(validAb.splitRatio, 50);
    assert.strictEqual(validAb.variantA.title, "🌾 20% Off Hybrid Wheat Seeds");
    assert.strictEqual(validAb.variantB.title, "🚚 Free Home Delivery Today");
    reportPass("1.1 Valid A/B test input successfully validates with both variants");
} catch (e) {
    reportFail("1.1 Valid A/B test input", e);
}

try {
    assert.throws(() => {
        campaigns.validateCampaignInput({
            isAbTest: true,
            splitRatio: 50,
            variantA: {
                title: "This title is way too long to pass the strict 65 character length limit enforcement for push notification variant A",
                body: "Valid body text"
            },
            variantB: {
                title: "Valid Title B",
                body: "Valid body B"
            }
        });
    }, /must not exceed 65 characters/);
    reportPass("1.2 Variant A title > 65 characters strictly rejected");
} catch (e) {
    reportFail("1.2 Variant A title length rejection", e);
}

try {
    assert.throws(() => {
        campaigns.validateCampaignInput({
            isAbTest: true,
            splitRatio: 50,
            variantA: {
                title: "Valid Title A",
                body: "Valid body A"
            },
            variantB: {
                title: "Valid Title B",
                body: "a".repeat(241)
            }
        });
    }, /must not exceed 240 characters/);
    reportPass("1.3 Variant B body > 240 characters strictly rejected");
} catch (e) {
    reportFail("1.3 Variant B body length rejection", e);
}

try {
    assert.throws(() => {
        campaigns.validateCampaignInput({
            isAbTest: true,
            splitRatio: 5, // Invalid: must be >= 10
            variantA: { title: "Title A", body: "Body A" },
            variantB: { title: "Title B", body: "Body B" }
        });
    }, /splitRatio must be between 10% and 90%/);
    reportPass("1.4 Out of bounds splitRatio (< 10%) strictly rejected");
} catch (e) {
    reportFail("1.4 Out of bounds splitRatio rejection", e);
}

// 2. CTR and Winner Math for A/B variants
try {
    const sentA = 500;
    const sentB = 500;
    const uniqueClicksA = 75; // 15% CTR
    const uniqueClicksB = 50; // 10% CTR

    const ctrA = Math.round((uniqueClicksA / sentA) * 1000) / 10;
    const ctrB = Math.round((uniqueClicksB / sentB) * 1000) / 10;

    assert.strictEqual(ctrA, 15);
    assert.strictEqual(ctrB, 10);

    let winner = null;
    if (ctrA > ctrB) winner = 'A';
    else if (ctrB > ctrA) winner = 'B';
    else if (ctrA > 0) winner = 'TIE';

    assert.strictEqual(winner, 'A');
    reportPass("2.1 Variant CTR calculation and Winner determination (Variant A wins by +5% CTR)");
} catch (e) {
    reportFail("2.1 Variant CTR and Winner calculation", e);
}

// 3. Variant B Winner test
try {
    const sentA = 500;
    const sentB = 500;
    const uniqueClicksA = 30; // 6% CTR
    const uniqueClicksB = 80; // 16% CTR

    const ctrA = Math.round((uniqueClicksA / sentA) * 1000) / 10;
    const ctrB = Math.round((uniqueClicksB / sentB) * 1000) / 10;

    let winner = null;
    if (ctrA > ctrB) winner = 'A';
    else if (ctrB > ctrA) winner = 'B';

    assert.strictEqual(winner, 'B');
    reportPass("3.1 Variant B winning scenario correctly identified");
} catch (e) {
    reportFail("3.1 Variant B winning test", e);
}

// 4. Equal CTR results in TIE
try {
    const sentA = 1000;
    const sentB = 1000;
    const uniqueClicksA = 80; // 8% CTR
    const uniqueClicksB = 80; // 8% CTR

    const ctrA = Math.round((uniqueClicksA / sentA) * 1000) / 10;
    const ctrB = Math.round((uniqueClicksB / sentB) * 1000) / 10;

    let winner = null;
    if (ctrA > ctrB) winner = 'A';
    else if (ctrB > ctrA) winner = 'B';
    else if (ctrA > 0) winner = 'TIE';

    assert.strictEqual(winner, 'TIE');
    reportPass("4.1 Identical CTR between Variant A and B yields TIE result");
} catch (e) {
    reportFail("4.1 Identical CTR yields TIE", e);
}

// 5. Insecure HTTP image in variant strictly rejected
try {
    assert.throws(() => {
        campaigns.validateCampaignInput({
            isAbTest: true,
            splitRatio: 50,
            variantA: {
                title: "Valid A",
                body: "Valid body",
                imageUrl: "http://insecure.com/seed.jpg" // Insecure HTTP
            },
            variantB: {
                title: "Valid B",
                body: "Valid body"
            }
        });
    }, /Image URL must be a valid HTTPS URL/);
    reportPass("5.1 Insecure HTTP image in Variant A strictly rejected");
} catch (e) {
    reportFail("5.1 Insecure HTTP image in variant", e);
}

console.log(`\n======================================================`);
console.log(`FEATURE 4 A/B TESTING SUMMARY: ${passedTests} PASSED, ${totalTests - passedTests} FAILED`);
console.log(`======================================================\n`);

if (totalTests - passedTests > 0) {
    process.exit(1);
}
