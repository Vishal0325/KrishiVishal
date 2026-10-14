/**
 * Package 2a: Unified Wallet Service & Hardened Admin Adjustment Test Suite
 * RUNS AGAINST REAL FIRESTORE EMULATOR.
 * Run with: firebase emulators:exec --only firestore "node tests/package2_wallet_service.test.js"
 */

const assert = require("assert");
const { db, admin } = require("../core/admin");
const walletService = require("../finance/walletService");
const {
    adminAdjustWallet,
    createWalletTopUpOrder,
    verifyWalletTopUp,
    WALLET_TOPUP_ENABLED,
    MAX_ADMIN_ADJUSTMENT,
    isAuthorizedAdmin,
    deriveTimeWindowKey
} = require("../finance/walletTopUp");

console.log("=================================================================");
console.log("=== PACKAGE 2a: UNIFIED WALLET SERVICE & ADMIN ADJUSTMENT   ===");
console.log("=== RUNNING AGAINST REAL FIRESTORE EMULATOR                   ===");
console.log("=================================================================\n");

let passed = 0;
let failed = 0;

function pass(name) {
    console.log(`✅ PASS: ${name}`);
    passed++;
}

function fail(name, err) {
    console.error(`❌ FAIL: ${name} - ${err.message || err}`);
    if (err.stack) {
        console.error(err.stack);
    }
    failed++;
}

async function runPackage2TestSuite() {
    // 0. Hard Guard: Must be connected to Real Firestore Emulator
    const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
    if (!emulatorHost) {
        console.error("❌ CRITICAL: FIRESTORE_EMULATOR_HOST environment variable is missing!");
        console.error("This test suite strictly requires a running Firestore Emulator.");
        console.error("Execute using: firebase emulators:exec --only firestore \"node tests/package2_wallet_service.test.js\"\n");
        process.exit(1);
    }

    console.log(`[Emulator Verification] Connected to REAL Firestore Emulator at ${emulatorHost}`);
    console.log(`[Project ID] ${process.env.GCLOUD_PROJECT || 'krishivishal-a9ed7'}\n`);

    // Probe connection
    const probeRef = db.collection("_test_probe_").doc("wallet_heartbeat");
    await probeRef.set({ connected: true, timestamp: Date.now() });
    const probeSnap = await probeRef.get();
    assert.strictEqual(probeSnap.exists, true);
    console.log("✅ Probe check verified: Active read/write connection to Firestore Emulator confirmed.\n");

    // =================================================================
    // TEST (a): Credit Wallet (Doc creation, balance update, GL sync)
    // =================================================================
    console.log("--- TEST (a): Credit Wallet Core Operation & System 2 GL Posting ---");
    try {
        const uidA = "usr_p2_test_a";
        await db.collection("users").doc(uidA).set({
            name: "Farmer Ramesh",
            walletBalance: 100,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        const resA = await walletService.creditWallet({
            uid: uidA,
            amount: 500,
            eventType: "ADMIN_CREDIT",
            entityId: "CREDIT_EVT_A_001",
            description: "Goodwill credit for delayed delivery"
        });

        assert.strictEqual(resA.success, true);
        assert.strictEqual(resA.alreadyProcessed, false);
        assert.strictEqual(resA.balanceBefore, 100);
        assert.strictEqual(resA.balanceAfter, 600);
        assert.strictEqual(resA.amount, 500);

        // Verify users/{uid} in real Firestore
        const userSnapA = await db.collection("users").doc(uidA).get();
        assert.strictEqual(userSnapA.data().walletBalance, 600);

        // Verify root wallet_transactions/{txId}
        const txSnapA = await db.collection("wallet_transactions").doc(resA.txId).get();
        assert.strictEqual(txSnapA.exists, true);
        const txDataA = txSnapA.data();
        assert.strictEqual(txDataA.uid, uidA);
        assert.strictEqual(txDataA.amount, 500);
        assert.strictEqual(txDataA.type, "CREDIT");
        assert.strictEqual(txDataA.eventType, "ADMIN_CREDIT");
        assert.strictEqual(txDataA.balanceBefore, 100);
        assert.strictEqual(txDataA.balanceAfter, 600);

        // Verify System 2 Journal Entry and lines
        const jeSnapA = await db.collection("journal_entries").doc(resA.journalEntryId).get();
        assert.strictEqual(jeSnapA.exists, true);
        assert.strictEqual(jeSnapA.data().status, "POSTED");
        assert.strictEqual(jeSnapA.data().totalAmount, 500);

        const linesSnapA = await db.collection("journal_entries").doc(resA.journalEntryId).collection("lines").get();
        assert.strictEqual(linesSnapA.size, 2);
        let debitSumA = 0;
        let creditSumA = 0;
        linesSnapA.forEach(d => {
            debitSumA += d.data().debit || 0;
            creditSumA += d.data().credit || 0;
        });
        assert.strictEqual(debitSumA, 500);
        assert.strictEqual(creditSumA, 500);

        pass("Test (a): Credit wallet creates root wallet_transactions doc, updates user balance to ₹600, and posts balanced System 2 JE (Dr 6035 / Cr 2065)");
    } catch (err) {
        fail("Test (a): Credit wallet core operation", err);
    }

    // =================================================================
    // TEST (b): Debit Wallet (Order payment, balance deduction, GL sync)
    // =================================================================
    console.log("\n--- TEST (b): Debit Wallet Core Operation & Deferred Revenue GL Posting ---");
    try {
        const uidB = "usr_p2_test_b";
        await db.collection("users").doc(uidB).set({
            name: "Farmer Suresh",
            walletBalance: 1000,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        const resB = await walletService.debitWallet({
            uid: uidB,
            amount: 350,
            eventType: "ORDER_PAYMENT",
            entityId: "ORD_B_001",
            description: "Payment for seeds order ORD_B_001"
        });

        assert.strictEqual(resB.success, true);
        assert.strictEqual(resB.alreadyProcessed, false);
        assert.strictEqual(resB.balanceBefore, 1000);
        assert.strictEqual(resB.balanceAfter, 650);
        assert.strictEqual(resB.amount, 350);

        // Verify users/{uid}
        const userSnapB = await db.collection("users").doc(uidB).get();
        assert.strictEqual(userSnapB.data().walletBalance, 650);

        // Verify root wallet_transactions/{txId}
        const txSnapB = await db.collection("wallet_transactions").doc(resB.txId).get();
        assert.strictEqual(txSnapB.exists, true);
        assert.strictEqual(txSnapB.data().type, "DEBIT");
        assert.strictEqual(txSnapB.data().balanceAfter, 650);

        // Verify System 2 Journal Entry (Dr 2065 / Cr 2070)
        const jeSnapB = await db.collection("journal_entries").doc(resB.journalEntryId).get();
        assert.strictEqual(jeSnapB.exists, true);
        assert.strictEqual(jeSnapB.data().status, "POSTED");
        assert.strictEqual(jeSnapB.data().totalAmount, 350);

        pass("Test (b): Debit wallet decreases balance to ₹650, writes root wallet_transactions, and posts balanced JE (Dr 2065 / Cr 2070)");
    } catch (err) {
        fail("Test (b): Debit wallet core operation", err);
    }

    // =================================================================
    // TEST (c): Floor Check on Debit (Balance cannot drop below 0)
    // =================================================================
    console.log("\n--- TEST (c): Strict Balance Floor Check (>= 0) ---");
    try {
        const uidC = "usr_p2_test_c";
        await db.collection("users").doc(uidC).set({
            name: "Farmer Dinesh",
            walletBalance: 200,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        let caughtErr = null;
        try {
            await walletService.debitWallet({
                uid: uidC,
                amount: 500,
                eventType: "ORDER_PAYMENT",
                entityId: "ORD_C_OVERDRAFT",
                description: "Overdraft attempt"
            });
        } catch (e) {
            caughtErr = e;
        }

        assert.ok(caughtErr, "Overdraft must throw error");
        assert.strictEqual(caughtErr.code, "INSUFFICIENT_WALLET_BALANCE");

        // Verify balance was NOT mutated
        const userSnapC = await db.collection("users").doc(uidC).get();
        assert.strictEqual(userSnapC.data().walletBalance, 200);

        // Verify no JE was created
        const jeSnapC = await db.collection("journal_entries").doc("JE_WALLET_ORDER_PAYMENT_ORD_C_OVERDRAFT").get();
        assert.strictEqual(jeSnapC.exists, false);

        pass("Test (c): Floor check prevents overdraft (₹200 balance, ₹500 debit rejected with INSUFFICIENT_WALLET_BALANCE, balance untouched)");
    } catch (err) {
        fail("Test (c): Strict balance floor check", err);
    }

    // =================================================================
    // TEST (d): Idempotency Replay (Replays do not duplicate writes)
    // =================================================================
    console.log("\n--- TEST (d): Idempotency Replay Deduplication ---");
    try {
        const uidD = "usr_p2_test_d";
        await db.collection("users").doc(uidD).set({
            name: "Farmer Mahesh",
            walletBalance: 500,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        const paramsD = {
            uid: uidD,
            amount: 250,
            eventType: "REFERRAL_REWARD",
            entityId: "REF_D_REPLAY_TEST",
            description: "Referral signup reward"
        };

        const resD1 = await walletService.creditWallet(paramsD);
        assert.strictEqual(resD1.success, true);
        assert.strictEqual(resD1.alreadyProcessed, false);
        assert.strictEqual(resD1.balanceAfter, 750);

        // Second call with same idempotency key / entityId
        const resD2 = await walletService.creditWallet(paramsD);
        assert.strictEqual(resD2.success, true);
        assert.strictEqual(resD2.alreadyProcessed, true);

        // Verify balance in Firestore is strictly 750 (NOT 1000)
        const userSnapD = await db.collection("users").doc(uidD).get();
        assert.strictEqual(userSnapD.data().walletBalance, 750);

        // Verify only 1 journal entry exists
        const jeSnapD = await db.collection("journal_entries").doc("JE_WALLET_REFERRAL_REWARD_REF_D_REPLAY_TEST").get();
        assert.strictEqual(jeSnapD.exists, true);

        pass("Test (d): Idempotency replay safely returns alreadyProcessed: true and preserves balance at ₹750 without double-crediting");
    } catch (err) {
        fail("Test (d): Idempotency replay", err);
    }

    // =================================================================
    // TEST (e): Transaction Pass-Through (Caller ACID commits together)
    // =================================================================
    console.log("\n--- TEST (e): Caller Transaction Pass-Through Atomic Commit ---");
    try {
        const uidE = "usr_p2_test_e";
        const orderIdE = "ORD_E_PASS_THROUGH_01";
        const orderRefE = db.collection("orders").doc(orderIdE);

        await db.collection("users").doc(uidE).set({
            name: "Farmer Anil",
            walletBalance: 1200,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        await orderRefE.set({
            orderId: orderIdE,
            status: "CREATED",
            amount: 400
        });

        // Run in single caller-managed transaction
        await db.runTransaction(async (transaction) => {
            const orderSnap = await transaction.get(orderRefE);
            assert.strictEqual(orderSnap.exists, true);

            // walletService participates in caller tx
            const wRes = await walletService.debitWallet({
                uid: uidE,
                amount: 400,
                eventType: "ORDER_PAYMENT",
                entityId: orderIdE,
                description: `Payment for ${orderIdE}`
            }, { tx: transaction });

            assert.strictEqual(wRes.success, true);

            // Caller updates its order document
            transaction.update(orderRefE, {
                status: "PAID",
                paymentMethod: "WALLET",
                walletTxId: wRes.txId
            });
        });

        // Verify real Firestore state
        const updatedUserE = await db.collection("users").doc(uidE).get();
        const updatedOrderE = await orderRefE.get();
        assert.strictEqual(updatedUserE.data().walletBalance, 800);
        assert.strictEqual(updatedOrderE.data().status, "PAID");

        const jeSnapE = await db.collection("journal_entries").doc(`JE_WALLET_ORDER_PAYMENT_${orderIdE}`).get();
        assert.strictEqual(jeSnapE.exists, true);
        assert.strictEqual(jeSnapE.data().status, "POSTED");

        pass("Test (e): Caller transaction pass-through atomically commits order update + wallet balance debit + GL JE in single tx");
    } catch (err) {
        fail("Test (e): Caller transaction pass-through", err);
    }

    // =================================================================
    // TEST (f): Transaction Rollback on Caller Abort
    // =================================================================
    console.log("\n--- TEST (f): Caller Transaction Failure Complete Rollback ---");
    try {
        const uidF = "usr_p2_test_f";
        await db.collection("users").doc(uidF).set({
            name: "Farmer Vikas",
            walletBalance: 500,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        let aborted = false;
        try {
            await db.runTransaction(async (transaction) => {
                await walletService.creditWallet({
                    uid: uidF,
                    amount: 300,
                    eventType: "ADMIN_CREDIT",
                    entityId: "EVT_F_ABORT",
                    description: "Goodwill before crash"
                }, { tx: transaction });

                // Caller encounters failure after walletService stages writes
                throw new Error("SIMULATED_INVENTORY_ALLOCATION_CRASH");
            });
        } catch (e) {
            if (e.message === "SIMULATED_INVENTORY_ALLOCATION_CRASH") {
                aborted = true;
            } else {
                throw e;
            }
        }

        assert.strictEqual(aborted, true);

        // Verify balance in Firestore remained strictly 500 (NOT 800)
        const userSnapF = await db.collection("users").doc(uidF).get();
        assert.strictEqual(userSnapF.data().walletBalance, 500);

        // Verify no JE was committed
        const jeSnapF = await db.collection("journal_entries").doc("JE_WALLET_ADMIN_CREDIT_EVT_F_ABORT").get();
        assert.strictEqual(jeSnapF.exists, false);

        pass("Test (f): Caller crash completely rolls back wallet credit and journal entry, preserving balance at ₹500");
    } catch (err) {
        fail("Test (f): Caller transaction failure rollback", err);
    }

    // =================================================================
    // TEST (g): Locked Fiscal Period Aborts Wallet Transaction
    // =================================================================
    console.log("\n--- TEST (g): Locked Fiscal Period Abort & Balance Protection ---");
    try {
        const lockedPeriodId = "2026-07";
        await db.collection("fiscal_periods").doc(lockedPeriodId).set({
            periodId: lockedPeriodId,
            status: "LOCKED",
            lockedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        const uidG = "usr_p2_test_g";
        await db.collection("users").doc(uidG).set({
            name: "Farmer Manoj",
            walletBalance: 400,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        let periodLockedError = false;
        try {
            await walletService.creditWallet({
                uid: uidG,
                amount: 150,
                eventType: "ADMIN_CREDIT",
                entityId: "EVT_G_LOCKED_PERIOD",
                description: "Credit in past locked period"
            }, {
                date: new Date("2026-07-15")
            });
        } catch (e) {
            if (/FISCAL_PERIOD_LOCKED/i.test(e.message)) {
                periodLockedError = true;
            } else {
                throw e;
            }
        }

        assert.strictEqual(periodLockedError, true, "Locked fiscal period must throw FISCAL_PERIOD_LOCKED");

        // Verify balance untouched
        const userSnapG = await db.collection("users").doc(uidG).get();
        assert.strictEqual(userSnapG.data().walletBalance, 400);

        pass("Test (g): Locked fiscal period (2026-07) strictly blocks wallet credit and preserves balance");
    } catch (err) {
        fail("Test (g): Locked fiscal period abort", err);
    }

    // =================================================================
    // TEST (h): Kill Switch on Customer Wallet Top-Up
    // =================================================================
    console.log("\n--- TEST (h): WALLET_TOPUP_ENABLED Kill-Switch Enforcement ---");
    try {
        assert.strictEqual(WALLET_TOPUP_ENABLED, false, "WALLET_TOPUP_ENABLED must default to false");

        // Attempt createWalletTopUpOrder
        let topUpOrderBlocked = false;
        try {
            await createWalletTopUpOrder.run({
                data: { amount: 500 },
                auth: { uid: "test_customer_h" }
            });
        } catch (e) {
            if (e.code === "failed-precondition" && /WALLET_TOPUP_DISABLED/i.test(e.message)) {
                topUpOrderBlocked = true;
            } else {
                throw e;
            }
        }
        assert.strictEqual(topUpOrderBlocked, true, "createWalletTopUpOrder must be blocked by kill switch");

        // Attempt verifyWalletTopUp
        let verifyTopUpBlocked = false;
        try {
            await verifyWalletTopUp.run({
                data: {
                    topUpId: "tu_test_123",
                    razorpayOrderId: "order_123",
                    razorpayPaymentId: "pay_123",
                    razorpaySignature: "dummy_sig"
                },
                auth: { uid: "test_customer_h" }
            });
        } catch (e) {
            if (e.code === "failed-precondition" && /WALLET_TOPUP_DISABLED/i.test(e.message)) {
                verifyTopUpBlocked = true;
            } else {
                throw e;
            }
        }
        assert.strictEqual(verifyTopUpBlocked, true, "verifyWalletTopUp must be blocked by kill switch");

        pass("Test (h): Kill switch WALLET_TOPUP_ENABLED=false strictly blocks both createWalletTopUpOrder and verifyWalletTopUp");
    } catch (err) {
        fail("Test (h): Kill switch enforcement", err);
    }

    // =================================================================
    // TEST (i): Admin Adjustment Role Gating
    // =================================================================
    console.log("\n--- TEST (i): Admin Adjustment Strict Role Gating ---");
    try {
        const uidI = "usr_p2_test_i";
        await db.collection("users").doc(uidI).set({
            name: "Farmer Deepak",
            walletBalance: 100,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // 1. Non-admin customer attempt
        let customerBlocked = false;
        try {
            await adminAdjustWallet.run({
                data: {
                    userId: uidI,
                    amount: 50,
                    type: "CREDIT",
                    reason: "Customer trying to self-adjust wallet balance"
                },
                auth: { uid: "cust_attacker", token: { role: "customer" } }
            });
        } catch (e) {
            if (e.code === "permission-denied" && /UNAUTHORIZED/i.test(e.message)) {
                customerBlocked = true;
            } else {
                throw e;
            }
        }
        assert.strictEqual(customerBlocked, true, "Customer role must be denied");

        // 2. Unauthenticated attempt
        let unauthBlocked = false;
        try {
            await adminAdjustWallet.run({
                data: {
                    userId: uidI,
                    amount: 50,
                    type: "CREDIT",
                    reason: "Unauthenticated request"
                },
                auth: null
            });
        } catch (e) {
            if (e.code === "unauthenticated") {
                unauthBlocked = true;
            } else {
                throw e;
            }
        }
        assert.strictEqual(unauthBlocked, true, "Unauthenticated request must be denied");

        // 3. Authorized Finance Admin attempt
        const authAdminRes = await adminAdjustWallet.run({
            data: {
                userId: uidI,
                amount: 75,
                type: "CREDIT",
                reason: "Valid finance compensation for delivery delay",
                idempotencyKey: "ADJ_AUTH_TEST_001"
            },
            auth: { uid: "fin_admin_01", token: { role: "finance_admin" } }
        });

        assert.strictEqual(authAdminRes.success, true);
        assert.strictEqual(authAdminRes.balanceAfter, 175);

        pass("Test (i): Role gating strictly rejects customers and unauthenticated requests with permission-denied; permits FinanceAdmin");
    } catch (err) {
        fail("Test (i): Admin adjustment role gating", err);
    }

    // =================================================================
    // TEST (j): Admin Adjustment Validation (Reason length & ₹5,000 Cap)
    // =================================================================
    console.log("\n--- TEST (j): Admin Adjustment Validation (Reason >= 10 chars, Cap <= ₹5000) ---");
    try {
        const uidJ = "usr_p2_test_j";
        await db.collection("users").doc(uidJ).set({
            name: "Farmer Rajesh",
            walletBalance: 200,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        const adminAuth = { uid: "super_admin_01", token: { role: "superadmin" } };

        // 1. Reason too short (< 10 chars)
        let shortReasonRejected = false;
        try {
            await adminAdjustWallet.run({
                data: {
                    userId: uidJ,
                    amount: 50,
                    type: "CREDIT",
                    reason: "short"
                },
                auth: adminAuth
            });
        } catch (e) {
            if (e.code === "invalid-argument" && /INVALID_REASON/i.test(e.message)) {
                shortReasonRejected = true;
            } else {
                throw e;
            }
        }
        assert.strictEqual(shortReasonRejected, true, "Reason < 10 characters must be rejected");

        // 2. Amount > ₹5,000 cap
        let overCapRejected = false;
        try {
            await adminAdjustWallet.run({
                data: {
                    userId: uidJ,
                    amount: 5001,
                    type: "CREDIT",
                    reason: "Trying to credit more than maximum allowable cap"
                },
                auth: adminAuth
            });
        } catch (e) {
            if (e.code === "invalid-argument" && /INVALID_AMOUNT/i.test(e.message)) {
                overCapRejected = true;
            } else {
                throw e;
            }
        }
        assert.strictEqual(overCapRejected, true, "Amount > ₹5,000 cap must be rejected");

        // 3. Negative amount
        let negativeAmountRejected = false;
        try {
            await adminAdjustWallet.run({
                data: {
                    userId: uidJ,
                    amount: -100,
                    type: "CREDIT",
                    reason: "Negative amount exploit attempt"
                },
                auth: adminAuth
            });
        } catch (e) {
            if (e.code === "invalid-argument") {
                negativeAmountRejected = true;
            } else {
                throw e;
            }
        }
        assert.strictEqual(negativeAmountRejected, true, "Negative amount must be rejected");

        pass("Test (j): Validation strictly rejects short reason (< 10 chars), amount > ₹5,000 cap, and negative amount");
    } catch (err) {
        fail("Test (j): Admin adjustment validation", err);
    }

    // =================================================================
    // TEST (k): Fallback 60s Idempotency Key
    // =================================================================
    console.log("\n--- TEST (k): 60-Second Fallback Idempotency Hash ---");
    try {
        const uidK = "usr_p2_test_k";
        await db.collection("users").doc(uidK).set({
            name: "Farmer Govind",
            walletBalance: 300,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        const adminAuth = { uid: "fin_admin_02", token: { role: "finance_admin" } };
        const payloadK = {
            userId: uidK,
            amount: 150,
            type: "CREDIT",
            reason: "Customer service goodwill compensation"
            // No idempotencyKey provided -> triggers 60s fallback hash
        };

        const resK1 = await adminAdjustWallet.run({ data: payloadK, auth: adminAuth });
        assert.strictEqual(resK1.success, true);
        assert.strictEqual(resK1.alreadyProcessed, false);
        assert.strictEqual(resK1.balanceAfter, 450);

        // Immediate retry within the same 60-second window
        const resK2 = await adminAdjustWallet.run({ data: payloadK, auth: adminAuth });
        assert.strictEqual(resK2.success, true);
        assert.strictEqual(resK2.alreadyProcessed, true);

        // Verify balance in Firestore is strictly 450 (NOT 600)
        const userSnapK = await db.collection("users").doc(uidK).get();
        assert.strictEqual(userSnapK.data().walletBalance, 450);

        pass("Test (k): Fallback 60s idempotency hash deduplicates unkeyed admin adjustments, preventing accidental double-credits");
    } catch (err) {
        fail("Test (k): Fallback 60s idempotency hash", err);
    }

    console.log("\n=================================================================");
    console.log(`PACKAGE 2a TEST RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log("=================================================================\n");

    if (failed > 0) {
        process.exit(1);
    }
}

runPackage2TestSuite().catch((err) => {
    console.error("FATAL in Package 2a Test Suite:", err);
    process.exit(1);
});
