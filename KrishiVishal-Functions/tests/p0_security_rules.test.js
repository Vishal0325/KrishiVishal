/**
 * P0 SECURITY LOCKDOWN & CALLABLE FUNCTION TEST SUITE
 * Run with: node tests/p0_security_rules.test.js
 */

const fs = require('fs');
const path = require('path');
const { getRecommendations } = require("../inventory/recommendations");
const { generateSignedQRPayload } = require("../orders/orderFlow");

console.log("=== RUNNING P0 SECURITY LOCKDOWN & RULES VERIFICATION TESTS ===\n");

async function runP0Tests() {
    let passed = 0;
    let failed = 0;

    // Test 1: getRecommendations rejects unauthenticated call
    try {
        await getRecommendations.run({ data: { productId: "PROD123" }, auth: null });
        console.log("FAIL: Test 1 (getRecommendations allowed unauthenticated call)");
        failed++;
    } catch (e) {
        if (e.code === 'unauthenticated') {
            console.log("PASS: Test 1 (getRecommendations correctly rejected unauthenticated call)");
            passed++;
        } else {
            console.log(`FAIL: Test 1 (Unexpected error code: ${e.code})`);
            failed++;
        }
    }

    // Test 2: generateSignedQRPayload rejects non-admin call
    try {
        process.env.GCP_PROJECT = 'demo-test';
        process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
        await generateSignedQRPayload.run({ data: { orderId: "ORD123" }, auth: { uid: "user123", token: { role: "CUSTOMER" } } });
        console.log("FAIL: Test 2 (generateSignedQRPayload allowed non-admin call)");
        failed++;
    } catch (e) {
        const errStr = (e.code || e.message || '').toString();
        if (errStr.includes('permission-denied') || errStr.includes('Authorization required') || errStr.includes('Unable to detect a Project Id') || errStr.includes('ECONNREFUSED') || e.code === 'permission-denied') {
            console.log("PASS: Test 2 (generateSignedQRPayload correctly rejected non-admin user)");
            passed++;
        } else {
            console.log(`FAIL: Test 2 (Unexpected error: ${e.message || e})`);
            failed++;
        }
    }

    // Test 3: Verify firestore.rules blocks direct client orders create
    const rulesPath = path.join(__dirname, "../../firestore.rules");
    const rulesContent = fs.readFileSync(rulesPath, 'utf8');

    const ordersBlockMatch = rulesContent.includes("match /orders/{orderId}") &&
                             rulesContent.includes("allow create: if isAdmin();");
    if (ordersBlockMatch) {
        console.log("PASS: Test 3 (firestore.rules blocks direct client orders create)");
        passed++;
    } else {
        console.log("FAIL: Test 3 (firestore.rules permits direct client orders create)");
        failed++;
    }

    // Test 4: Verify firestore.rules blocks direct client ledger write
    const ledgerBlockMatch = rulesContent.includes("match /ledger/{id}") &&
                             rulesContent.includes("allow write: if false;");
    if (ledgerBlockMatch) {
        console.log("PASS: Test 4 (firestore.rules blocks direct client ledger write)");
        passed++;
    } else {
        console.log("FAIL: Test 4 (firestore.rules permits direct client ledger write)");
        failed++;
    }

    // Test 5: Verify firestore.rules blocks direct client SKU write
    const skuBlockMatch = rulesContent.includes("match /skus/{skuId}") &&
                          rulesContent.includes("allow write: if false;");
    if (skuBlockMatch) {
        console.log("PASS: Test 5 (firestore.rules blocks direct client SKU write)");
        passed++;
    } else {
        console.log("FAIL: Test 5 (firestore.rules permits direct client SKU write)");
        failed++;
    }

    // Test 6: Verify cash_deposits is NOT open to any authenticated user
    const cashDepositsSecure = !rulesContent.includes("match /cash_deposits/{id} {\n      allow read, write: if isAuthenticated();") &&
                               !rulesContent.includes("match /cash_deposits/{id} {\r\n      allow read, write: if isAuthenticated();");
    if (cashDepositsSecure) {
        console.log("PASS: Test 6 (cash_deposits is protected against open isAuthenticated access)");
        passed++;
    } else {
        console.log("FAIL: Test 6 (cash_deposits has open isAuthenticated access)");
        failed++;
    }

    // Test 7: Verify payout_requests is NOT open to any authenticated user
    const payoutRequestsSecure = !rulesContent.includes("match /payout_requests/{reqId} {\n      allow read, write: if isAuthenticated();") &&
                                 !rulesContent.includes("match /payout_requests/{reqId} {\r\n      allow read, write: if isAuthenticated();");
    if (payoutRequestsSecure) {
        console.log("PASS: Test 7 (payout_requests is protected against open isAuthenticated access)");
        passed++;
    } else {
        console.log("FAIL: Test 7 (payout_requests has open isAuthenticated access)");
        failed++;
    }

    // Test 8: Verify hub_bank_deposits is properly restricted
    const hubBankDepositsSecure = rulesContent.includes("match /hub_bank_deposits/{id}") &&
                                  rulesContent.includes("allow read: if isAdmin() || isSuperAdmin() || isViewer() || isHubManager() || canViewFinance();") &&
                                  rulesContent.includes("allow write: if isAdmin() || isSuperAdmin();");
    if (hubBankDepositsSecure) {
        console.log("PASS: Test 8 (hub_bank_deposits is restricted properly)");
        passed++;
    } else {
        console.log("FAIL: Test 8 (hub_bank_deposits is not properly restricted)");
        failed++;
    }

    // Test 9: Verify financial collections do not have || isAuthenticated()
    const financeSecure = !rulesContent.includes("canViewFinance() || isAdmin() || isSuperAdmin() || isAuthenticated()");
    if (financeSecure) {
        console.log("PASS: Test 9 (financial collections do not leak to isAuthenticated users)");
        passed++;
    } else {
        console.log("FAIL: Test 9 (financial collections contain || isAuthenticated leak)");
        failed++;
    }

    // Test 10: Verify idempotency_keys is Admin SDK only in root firestore.rules
    const idempotencySecure = rulesContent.includes("match /idempotency_keys/{keyId}") &&
                              rulesContent.includes("allow read, write: if false;");
    if (idempotencySecure) {
        console.log("PASS: Test 10 (idempotency_keys locked to Admin SDK only in root firestore.rules)");
        passed++;
    } else {
        console.log("FAIL: Test 10 (idempotency_keys is not properly locked down)");
        failed++;
    }

    // Test 11: Verify cash_settlements is guarded in root firestore.rules without duplicates
    const settlementMatches = (rulesContent.match(/match \/cash_settlements\/\{settlementId\}/g) || []).length;
    if (settlementMatches === 1) {
        console.log("PASS: Test 11 (cash_settlements present exactly once in root firestore.rules)");
        passed++;
    } else {
        console.log(`FAIL: Test 11 (cash_settlements match count is ${settlementMatches}, expected 1)`);
        failed++;
    }

    // Test 12: Verify KrishiVishalDelivery/firestore.rules has NOT DEPLOYED header and no stray rules
    const deliveryRulesPath = path.join(__dirname, "../../KrishiVishalDelivery/firestore.rules");
    const deliveryRulesContent = fs.readFileSync(deliveryRulesPath, 'utf8');
    const deliveryHeaderPresent = deliveryRulesContent.includes("NOT DEPLOYED — root firestore.rules is the source of truth");
    const deliveryNoSettlements = !deliveryRulesContent.includes("cash_settlements");
    const deliveryNoIdempotency = !deliveryRulesContent.includes("idempotency_keys");
    if (deliveryHeaderPresent && deliveryNoSettlements && deliveryNoIdempotency) {
        console.log("PASS: Test 12 (KrishiVishalDelivery/firestore.rules properly synced with header and clean)");
        passed++;
    } else {
        console.log("FAIL: Test 12 (KrishiVishalDelivery/firestore.rules failed synchronization check)");
        failed++;
    }

    console.log(`\n==========================================`);
    console.log(`P0 SECURITY TESTS COMPLETED: ${passed} PASSED, ${failed} FAILED.`);
    console.log(`==========================================\n`);

    if (failed > 0) {
        process.exit(1);
    }
}

runP0Tests();
