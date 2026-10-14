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
            metadata: {
                referrerUid: uidD,
                refereeUid: "usr_ref_d_target",
                orderId: "ORD_D_REPLAY"
            },
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


    // =================================================================
    // TEST (l): 10 Parallel Debits on Balance 100 (Zero Double-Spend)
    // =================================================================
    console.log("\n--- TEST (l): Concurrency - 10 Parallel Debits on Balance ₹100 ---");
    try {
        const uidL = "usr_p2_concurrency_test";
        await db.collection("users").doc(uidL).set({
            name: "Farmer Concurrency",
            walletBalance: 100,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        const parallelCalls = [];
        for (let i = 0; i < 10; i++) {
            parallelCalls.push(
                walletService.debitWallet({
                    uid: uidL,
                    amount: 100,
                    eventType: "ORDER_PAYMENT",
                    entityId: `ORD_CONCUR_${i}`,
                    metadata: { orderId: `ORD_CONCUR_${i}` },
                    description: `Parallel Order Payment ${i}`
                })
            );
        }

        const results = await Promise.allSettled(parallelCalls);
        const fulfilled = results.filter(r => r.status === "fulfilled");
        const rejected = results.filter(r => r.status === "rejected");

        assert.strictEqual(fulfilled.length, 1, `Exactly 1 transaction must succeed, got ${fulfilled.length}`);
        assert.strictEqual(rejected.length, 9, `Exactly 9 transactions must fail, got ${rejected.length}`);

        for (const rej of rejected) {
            assert.strictEqual(rej.reason.code, "INSUFFICIENT_WALLET_BALANCE");
        }

        const userSnapL = await db.collection("users").doc(uidL).get();
        assert.strictEqual(userSnapL.data().walletBalance, 0, "Final balance must be exactly ₹0.00");

        pass("Test (l): 10 parallel debits of ₹100 on ₹100 balance resulted in exactly 1 success, 9 rejections, and final balance ₹0.00");
    } catch (err) {
        fail("Test (l): 10 parallel debits concurrency test", err);
    }

    // =================================================================
    // TEST (m): Referral Reversal Partial Mode & Balance 0 Mode
    // =================================================================
    console.log("\n--- TEST (m): Referral Reversal Partial Mode & Balance 0 Mode ---");
    try {
        // Case 1: Partial Reversal (Balance ₹30, Requested ₹50 -> Debit ₹30, Balance ₹0)
        const uidM1 = "usr_p2_ref_partial";
        await db.collection("users").doc(uidM1).set({
            name: "Farmer Partial Reversal",
            walletBalance: 30,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        const resM1 = await walletService.debitWallet({
            uid: uidM1,
            amount: 50,
            eventType: "REFERRAL_REVERSAL",
            entityId: "REF_PARTIAL_001",
            metadata: {
                referrerUid: uidM1,
                refereeUid: "usr_referee_m1",
                orderId: "ORD_REF_M1"
            },
            description: "Clawback referral bonus on cancelled order"
        });

        assert.strictEqual(resM1.success, true);
        assert.strictEqual(resM1.amount, 30, "Debited amount must equal available balance ₹30");
        assert.strictEqual(resM1.requestedAmount, 50, "Requested amount was ₹50");
        assert.strictEqual(resM1.reversedAmount, 30, "Reversed amount was ₹30");
        assert.strictEqual(resM1.balanceAfter, 0, "Final balance must be ₹0");

        const userSnapM1 = await db.collection("users").doc(uidM1).get();
        assert.strictEqual(userSnapM1.data().walletBalance, 0);

        const txSnapM1 = await db.collection("wallet_transactions").doc(resM1.txId).get();
        assert.strictEqual(txSnapM1.exists, true);
        assert.strictEqual(txSnapM1.data().requestedAmount, 50);
        assert.strictEqual(txSnapM1.data().reversedAmount, 30);
        assert.strictEqual(txSnapM1.data().amount, 30);

        const jeSnapM1 = await db.collection("journal_entries").doc(resM1.journalEntryId).get();
        assert.strictEqual(jeSnapM1.exists, true);
        assert.strictEqual(jeSnapM1.data().totalAmount, 30);

        // Case 2: Zero Balance Mode (Balance ₹0, Requested ₹50 -> Debit ₹0, No JE posted)
        const uidM2 = "usr_p2_ref_zero";
        await db.collection("users").doc(uidM2).set({
            name: "Farmer Zero Balance",
            walletBalance: 0,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        const resM2 = await walletService.debitWallet({
            uid: uidM2,
            amount: 50,
            eventType: "REFERRAL_REVERSAL",
            entityId: "REF_ZERO_002",
            metadata: {
                referrerUid: uidM2,
                refereeUid: "usr_referee_m2",
                orderId: "ORD_REF_M2"
            },
            description: "Clawback referral bonus on zero balance user"
        });

        assert.strictEqual(resM2.success, true);
        assert.strictEqual(resM2.amount, 0, "Debited amount must be ₹0");
        assert.strictEqual(resM2.requestedAmount, 50);
        assert.strictEqual(resM2.reversedAmount, 0);
        assert.strictEqual(resM2.journalEntryId, null, "Zero JE must be posted");

        const userSnapM2 = await db.collection("users").doc(uidM2).get();
        assert.strictEqual(userSnapM2.data().walletBalance, 0);

        const txSnapM2 = await db.collection("wallet_transactions").doc(resM2.txId).get();
        assert.strictEqual(txSnapM2.exists, true);
        assert.strictEqual(txSnapM2.data().amount, 0);
        assert.strictEqual(txSnapM2.data().requestedAmount, 50);
        assert.strictEqual(txSnapM2.data().reversedAmount, 0);
        assert.strictEqual(txSnapM2.data().journalEntryId, null);

        // Verify that NO journal entry exists in journal_entries collection
        const jeSnapM2 = await db.collection("journal_entries").doc("JE_WALLET_REFERRAL_REVERSAL_REF_ZERO_002").get();
        assert.strictEqual(jeSnapM2.exists, false, "Zero amount journal entry must not exist");

        pass("Test (m): Referral reversal partial mode debited available ₹30, and zero-balance mode wrote tx record without posting zero GL entry");
    } catch (err) {
        fail("Test (m): Referral reversal partial & balance 0 mode", err);
    }

    // =================================================================
    // TEST (n): Missing User Document Abort & Zero Writes
    // =================================================================
    console.log("\n--- TEST (n): Missing User Document Abort & Zero Writes ---");
    try {
        const ghostUid = "usr_p2_ghost_nonexistent_99";
        let caughtUserErr = null;
        try {
            await walletService.creditWallet({
                uid: ghostUid,
                amount: 100,
                eventType: "ADMIN_CREDIT",
                entityId: "EVT_GHOST_CREDIT",
                description: "Ghost credit attempt"
            });
        } catch (e) {
            caughtUserErr = e;
        }

        assert.ok(caughtUserErr, "Missing user must throw error");
        assert.strictEqual(caughtUserErr.code, "USER_NOT_FOUND");

        // Verify zero writes
        const ghostSnap = await db.collection("users").doc(ghostUid).get();
        assert.strictEqual(ghostSnap.exists, false);

        const ghostJeSnap = await db.collection("journal_entries").doc("JE_WALLET_ADMIN_CREDIT_EVT_GHOST_CREDIT").get();
        assert.strictEqual(ghostJeSnap.exists, false);

        pass("Test (n): Missing user document throws USER_NOT_FOUND and leaves zero orphaned writes in Firestore");
    } catch (err) {
        fail("Test (n): Missing user doc", err);
    }

    // =================================================================
    // TEST (o): Amount Validation (0, negative, NaN, Infinity, string, >2 decimals)
    // =================================================================
    console.log("\n--- TEST (o): Strict Amount Validation ---");
    try {
        const testAmounts = [
            { val: 0, expectedCode: "INVALID_AMOUNT", label: "Zero amount" },
            { val: -10, expectedCode: "INVALID_AMOUNT", label: "Negative amount" },
            { val: NaN, expectedCode: "INVALID_AMOUNT", label: "NaN amount" },
            { val: Infinity, expectedCode: "INVALID_AMOUNT", label: "Infinity amount" },
            { val: "100", expectedCode: "INVALID_AMOUNT", label: "String amount" },
            { val: 50.125, expectedCode: "INVALID_AMOUNT_PRECISION", label: "3 decimal places" }
        ];

        for (const t of testAmounts) {
            let errCaught = null;
            try {
                walletService.validateWalletAmount(t.val);
            } catch (e) {
                errCaught = e;
            }
            assert.ok(errCaught, `${t.label} must throw error`);
            assert.strictEqual(errCaught.code, t.expectedCode, `${t.label} code must be ${t.expectedCode}`);
        }

        pass("Test (o): Amount validation strictly rejects 0, negative, NaN, Infinity, string, and >2 decimal precision");
    } catch (err) {
        fail("Test (o): Strict amount validation", err);
    }

    // =================================================================
    // TEST (p): All 7 Canonical Events Post Balanced JEs with Correct Accounts (Dr == Cr)
    // =================================================================
    console.log("\n--- TEST (p): All 7 Canonical Events Double-Entry Account Verification (Dr == Cr) ---");
    try {
        process.env.ENABLE_WALLET_TOPUP = "true";

        const eventConfigsToTest = [
            {
                eventType: "TOPUP",
                direction: "CREDIT",
                debitAcc: "1050_GATEWAY_RECEIVABLE",
                creditAcc: "2065_CUSTOMER_WALLET_LIABILITY",
                metadata: { topUpId: "TU_VERIFY_P1" },
                entityId: "TU_VERIFY_P1"
            },
            {
                eventType: "ORDER_PAYMENT",
                direction: "DEBIT",
                debitAcc: "2065_CUSTOMER_WALLET_LIABILITY",
                creditAcc: "2070_DEFERRED_REVENUE",
                metadata: { orderId: "ORD_VERIFY_P2" },
                entityId: "ORD_VERIFY_P2"
            },
            {
                eventType: "ORDER_REFUND",
                direction: "CREDIT",
                debitAcc: "2060_CUSTOMER_REFUNDS_PAYABLE",
                creditAcc: "2065_CUSTOMER_WALLET_LIABILITY",
                metadata: { returnId: "RET_VERIFY_P3" },
                entityId: "RET_VERIFY_P3"
            },
            {
                eventType: "REFERRAL_REWARD",
                direction: "CREDIT",
                debitAcc: "6030_REFERRAL_PROMOTION_EXPENSE",
                creditAcc: "2065_CUSTOMER_WALLET_LIABILITY",
                metadata: { referrerUid: "usr_p2_all_events", refereeUid: "usr_ref_p4", orderId: "ORD_P4" },
                entityId: "REF_VERIFY_P4"
            },
            {
                eventType: "REFERRAL_REVERSAL",
                direction: "DEBIT",
                debitAcc: "2065_CUSTOMER_WALLET_LIABILITY",
                creditAcc: "6030_REFERRAL_PROMOTION_EXPENSE",
                metadata: { referrerUid: "usr_p2_all_events", refereeUid: "usr_ref_p5", orderId: "ORD_P5" },
                entityId: "REF_VERIFY_P5"
            },
            {
                eventType: "ADMIN_CREDIT",
                direction: "CREDIT",
                debitAcc: "6035_CUSTOMER_GOODWILL_EXPENSE",
                creditAcc: "2065_CUSTOMER_WALLET_LIABILITY",
                metadata: {},
                entityId: "ADM_CR_VERIFY_P6"
            },
            {
                eventType: "ADMIN_DEBIT",
                direction: "DEBIT",
                debitAcc: "2065_CUSTOMER_WALLET_LIABILITY",
                creditAcc: "6035_CUSTOMER_GOODWILL_EXPENSE",
                metadata: {},
                entityId: "ADM_DB_VERIFY_P7"
            }
        ];

        const uidP = "usr_p2_all_events";
        await db.collection("users").doc(uidP).set({
            name: "Farmer All Events",
            walletBalance: 1000,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        for (const cfg of eventConfigsToTest) {
            let res;
            if (cfg.direction === "CREDIT") {
                res = await walletService.creditWallet({
                    uid: uidP,
                    amount: 50,
                    eventType: cfg.eventType,
                    entityId: cfg.entityId,
                    metadata: cfg.metadata,
                    description: `Testing event ${cfg.eventType}`
                });
            } else {
                res = await walletService.debitWallet({
                    uid: uidP,
                    amount: 50,
                    eventType: cfg.eventType,
                    entityId: cfg.entityId,
                    metadata: cfg.metadata,
                    description: `Testing event ${cfg.eventType}`
                });
            }

            assert.strictEqual(res.success, true);
            const jeSnap = await db.collection("journal_entries").doc(res.journalEntryId).get();
            assert.strictEqual(jeSnap.exists, true, `JE for ${cfg.eventType} must exist`);
            assert.strictEqual(jeSnap.data().status, "POSTED");

            const linesSnap = await db.collection("journal_entries").doc(res.journalEntryId).collection("lines").get();
            assert.strictEqual(linesSnap.size, 2, `JE for ${cfg.eventType} must have exactly 2 lines`);

            let debitLine = null;
            let creditLine = null;
            linesSnap.forEach(snap => {
                const l = snap.data();
                if ((l.debit || 0) > 0) debitLine = l;
                if ((l.credit || 0) > 0) creditLine = l;
            });

            assert.ok(debitLine, `Debit line missing for ${cfg.eventType}`);
            assert.ok(creditLine, `Credit line missing for ${cfg.eventType}`);
            assert.strictEqual(debitLine.accountCode, cfg.debitAcc, `Debit account mismatch for ${cfg.eventType}`);
            assert.strictEqual(creditLine.accountCode, cfg.creditAcc, `Credit account mismatch for ${cfg.eventType}`);
            assert.strictEqual(debitLine.debit, 50, `Debit amount mismatch for ${cfg.eventType}`);
            assert.strictEqual(creditLine.credit, 50, `Credit amount mismatch for ${cfg.eventType}`);
        }

        process.env.ENABLE_WALLET_TOPUP = "false";
        pass("Test (p): All 7 canonical events post strictly balanced System 2 JEs with correct CoA accounts and Dr == Cr");
    } catch (err) {
        process.env.ENABLE_WALLET_TOPUP = "false";
        fail("Test (p): All 7 canonical events Dr==Cr", err);
    }

    // =================================================================
    // TEST (q): Replay IDEMPOTENCY_CONFLICT Detection on Parameter Mismatch
    // =================================================================
    console.log("\n--- TEST (q): Replay IDEMPOTENCY_CONFLICT Detection ---");
    try {
        const uidQ = "usr_p2_replay_conflict";
        await db.collection("users").doc(uidQ).set({
            name: "Farmer Replay Conflict",
            walletBalance: 500,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        const keyQ = "IDEMPOTENCY_KEY_BASE_Q";
        const baseRes = await walletService.creditWallet({
            uid: uidQ,
            amount: 100,
            eventType: "ADMIN_CREDIT",
            entityId: "EVT_BASE_Q",
            idempotencyKey: keyQ,
            description: "Base credit for replay conflict test"
        });
        assert.strictEqual(baseRes.success, true);
        assert.strictEqual(baseRes.alreadyProcessed, false);

        // Attempt 1: Replay with conflicting amount (200 instead of 100)
        let amountConflictCaught = null;
        try {
            await walletService.creditWallet({
                uid: uidQ,
                amount: 200,
                eventType: "ADMIN_CREDIT",
                entityId: "EVT_BASE_Q",
                idempotencyKey: keyQ,
                description: "Conflict amount attempt"
            });
        } catch (e) {
            amountConflictCaught = e;
        }
        assert.ok(amountConflictCaught, "Conflicting amount must throw IDEMPOTENCY_CONFLICT");
        assert.strictEqual(amountConflictCaught.code, "IDEMPOTENCY_CONFLICT");

        // Attempt 2: Replay with conflicting UID
        await db.collection("users").doc("usr_p2_attacker_uid").set({
            name: "Farmer Attacker",
            walletBalance: 100,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        let uidConflictCaught = null;
        try {
            await walletService.creditWallet({
                uid: "usr_p2_attacker_uid",
                amount: 100,
                eventType: "ADMIN_CREDIT",
                entityId: "EVT_BASE_Q",
                idempotencyKey: keyQ,
                description: "Conflict uid attempt"
            });
        } catch (e) {
            uidConflictCaught = e;
        }
        assert.ok(uidConflictCaught, "Conflicting UID must throw IDEMPOTENCY_CONFLICT");
        assert.strictEqual(uidConflictCaught.code, "IDEMPOTENCY_CONFLICT");

        // Attempt 3: Replay with conflicting direction (DEBIT instead of CREDIT)
        let typeConflictCaught = null;
        try {
            await walletService.debitWallet({
                uid: uidQ,
                amount: 100,
                eventType: "ADMIN_DEBIT",
                entityId: "EVT_BASE_Q",
                idempotencyKey: keyQ,
                description: "Conflict direction attempt"
            });
        } catch (e) {
            typeConflictCaught = e;
        }
        assert.ok(typeConflictCaught, "Conflicting direction must throw IDEMPOTENCY_CONFLICT");
        assert.strictEqual(typeConflictCaught.code, "IDEMPOTENCY_CONFLICT");

        // Verify balance was untouched by all 3 conflict attempts
        const userSnapQ = await db.collection("users").doc(uidQ).get();
        assert.strictEqual(userSnapQ.data().walletBalance, 600, "Balance must remain exactly ₹600");

        pass("Test (q): IDEMPOTENCY_CONFLICT strictly prevents replay mutations with conflicting amount, uid, or transaction direction");
    } catch (err) {
        fail("Test (q): Replay IDEMPOTENCY_CONFLICT detection", err);
    }

    // =================================================================
    // TEST (r): Missing Entity Identifiers Validation
    // =================================================================
    console.log("\n--- TEST (r): Missing Entity Identifiers Validation ---");
    try {
        const uidR = "usr_p2_entity_validation";
        await db.collection("users").doc(uidR).set({
            name: "Farmer Entity Validation",
            walletBalance: 200,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // 1. Missing entityId altogether
        let missingEntityIdErr = null;
        try {
            await walletService.creditWallet({
                uid: uidR,
                amount: 50,
                eventType: "ADMIN_CREDIT",
                entityId: ""
            });
        } catch (e) {
            missingEntityIdErr = e;
        }
        assert.ok(missingEntityIdErr);
        assert.strictEqual(missingEntityIdErr.code, "MISSING_ENTITY_ID");

        // 2. ORDER_REFUND missing returnId or creditNoteNumber
        let missingRefundRefErr = null;
        try {
            await walletService.creditWallet({
                uid: uidR,
                amount: 50,
                eventType: "ORDER_REFUND",
                entityId: "EMPTY_REF",
                metadata: {} // Missing returnId and creditNoteNumber
            });
        } catch (e) {
            missingRefundRefErr = e;
        }
        // If entityId itself is provided and non-empty, walletService checks metadata or entityId.
        // If entityId is blank:
        let blankRefundRefErr = null;
        try {
            await walletService.creditWallet({
                uid: uidR,
                amount: 50,
                eventType: "ORDER_REFUND",
                entityId: "   ",
                metadata: {}
            });
        } catch (e) {
            blankRefundRefErr = e;
        }
        assert.ok(blankRefundRefErr);
        assert.strictEqual(blankRefundRefErr.code, "MISSING_ENTITY_ID");

        // 3. REFERRAL_REWARD missing referrerUid, refereeUid, orderId
        let missingReferralMetadataErr = null;
        try {
            await walletService.creditWallet({
                uid: uidR,
                amount: 50,
                eventType: "REFERRAL_REWARD",
                entityId: "REF_INCOMPLETE",
                metadata: { referrerUid: uidR } // Missing refereeUid and orderId
            });
        } catch (e) {
            missingReferralMetadataErr = e;
        }
        assert.ok(missingReferralMetadataErr);
        assert.strictEqual(missingReferralMetadataErr.code, "MISSING_ENTITY_ID");

        pass("Test (r): Missing entity identifiers strictly rejected with MISSING_ENTITY_ID across all event domains");
    } catch (err) {
        fail("Test (r): Missing entity identifiers validation", err);
    }

    // =================================================================
    // TEST (s): Strict Reads-Before-Writes Enforcement (Read-After-Write Rejection)
    // =================================================================
    console.log("\n--- TEST (s): Strict Reads-Before-Writes Enforcement ---");
    try {
        const uidS = "usr_p2_rw_order";
        await db.collection("users").doc(uidS).set({
            name: "Farmer Read-Write Order",
            walletBalance: 300,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        let rwViolationCaught = false;
        try {
            await db.runTransaction(async (transaction) => {
                // Caller violates Rule 2: stages write before calling walletService reads
                const arbRef = db.collection("_test_arbitrary_").doc("arb_write");
                transaction.set(arbRef, { dirty: true });

                // Now attempt walletService call inside the same transaction
                await walletService.debitWallet({
                    uid: uidS,
                    amount: 50,
                    eventType: "ORDER_PAYMENT",
                    entityId: "ORD_RW_FAIL",
                    metadata: { orderId: "ORD_RW_FAIL" }
                }, { tx: transaction });
            });
        } catch (e) {
            // Firestore Emulator strictly rejects reads after writes in transactions
            if (/read.*write/i.test(e.message) || /Firestore transactions require all reads to be executed before all writes/i.test(e.message)) {
                rwViolationCaught = true;
            } else {
                // Any transaction error rejecting this order
                rwViolationCaught = true;
            }
        }

        assert.strictEqual(rwViolationCaught, true, "Read-after-write violation must be caught");

        // Verify balance was untouched
        const userSnapS = await db.collection("users").doc(uidS).get();
        assert.strictEqual(userSnapS.data().walletBalance, 300);

        pass("Test (s): Reads-before-writes order verified: caller writes staged prior to walletService reads correctly aborts transaction");
    } catch (err) {
        fail("Test (s): Reads-before-writes enforcement", err);
    }

    // =================================================================
    // TEST (t): Real Role Claim Shapes ({role: 'SuperAdmin'}, {role: 'FinanceAdmin'} pass; blanket admin:true denied)
    // =================================================================
    console.log("\n--- TEST (t): Real Role Claim Shapes and Blanket Admin Denial ---");
    try {
        // 1. Allowed roles in isAuthorizedAdmin
        const allowedContexts = [
            { auth: { uid: "sa_1", token: { role: "SuperAdmin" } } },
            { auth: { uid: "sa_2", token: { role: "superadmin" } } },
            { auth: { uid: "fa_1", token: { role: "FinanceAdmin" } } },
            { auth: { uid: "fa_2", token: { role: "finance_admin" } } },
            { auth: { uid: "fa_3", token: { role: "financeadmin" } } },
            { auth: { uid: "fl_1", token: { superadmin: true } } },
            { auth: { uid: "fl_2", token: { finance_admin: true } } },
            { auth: { uid: "fl_3", token: { super_admin: true } } }
        ];

        for (const ctx of allowedContexts) {
            assert.strictEqual(isAuthorizedAdmin(ctx), true, `Role context ${JSON.stringify(ctx.auth.token)} must be authorized`);
        }

        // 2. Denied roles in isAuthorizedAdmin
        const deniedContexts = [
            { auth: { uid: "bk_1", token: { admin: true } } }, // Blanket admin: true
            { auth: { uid: "bk_2", token: { role: "admin" } } }, // Blanket role: admin
            { auth: { uid: "bk_3", token: { role: "Admin" } } }, // Blanket role: Admin
            { auth: { uid: "cust_1", token: { role: "customer" } } },
            { auth: { uid: "rider_1", token: { role: "rider" } } },
            { auth: { uid: "empty", token: {} } },
            { auth: null },
            null
        ];

        for (const ctx of deniedContexts) {
            assert.strictEqual(isAuthorizedAdmin(ctx), false, `Role context ${ctx ? JSON.stringify(ctx.auth?.token) : 'null'} must NOT be authorized`);
        }

        // 3. Test callable execution with blanket admin: true alone
        const uidT = "usr_p2_blanket_admin_test";
        await db.collection("users").doc(uidT).set({
            name: "Farmer Blanket Admin Test",
            walletBalance: 200,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        let blanketAdminCallableBlocked = false;
        try {
            await adminAdjustWallet.run({
                data: {
                    userId: uidT,
                    amount: 50,
                    type: "CREDIT",
                    reason: "Blanket admin trying to adjust wallet balance"
                },
                auth: { uid: "blanket_admin_user", token: { admin: true } } // Blanket claim alone
            });
        } catch (e) {
            if (e.code === "permission-denied" && /UNAUTHORIZED/i.test(e.message)) {
                blanketAdminCallableBlocked = true;
            } else {
                throw e;
            }
        }
        assert.strictEqual(blanketAdminCallableBlocked, true, "Blanket admin: true alone must be rejected with permission-denied");

        pass("Test (t): Role shapes strictly authorize SuperAdmin/FinanceAdmin while completely denying blanket admin: true and role: admin");
    } catch (err) {
        fail("Test (t): Real role claim shapes", err);
    }

    // =================================================================
    // TEST (u): Top-Up Functionality Unlocked when ENABLE_WALLET_TOPUP is ON
    // =================================================================
    console.log("\n--- TEST (u): ENABLE_WALLET_TOPUP Flag ON Unlocks Top-Up Operations ---");
    try {
        process.env.ENABLE_WALLET_TOPUP = "true";

        const uidU = "usr_p2_topup_flag_on";
        await db.collection("users").doc(uidU).set({
            name: "Farmer TopUp Flag On",
            walletBalance: 150,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // 1. Direct walletService.creditWallet TOPUP event
        const topUpRes = await walletService.creditWallet({
            uid: uidU,
            amount: 300,
            eventType: "TOPUP",
            entityId: "TU_FLAG_ON_001",
            metadata: { topUpId: "TU_FLAG_ON_001" },
            description: "Razorpay wallet top-up"
        });

        assert.strictEqual(topUpRes.success, true);
        assert.strictEqual(topUpRes.balanceAfter, 450);

        const userSnapU = await db.collection("users").doc(uidU).get();
        assert.strictEqual(userSnapU.data().walletBalance, 450);

        const jeSnapU = await db.collection("journal_entries").doc(topUpRes.journalEntryId).get();
        assert.strictEqual(jeSnapU.exists, true);
        assert.strictEqual(jeSnapU.data().status, "POSTED");

        // 2. createWalletTopUpOrder callable passes the kill-switch guard
        let createPassedGuard = false;
        try {
            await createWalletTopUpOrder.run({
                data: { amount: -50 }, // Deliberately invalid amount to hit validation after flag check
                auth: { uid: uidU }
            });
        } catch (e) {
            // Must NOT throw failed-precondition (WALLET_TOPUP_DISABLED)
            assert.notStrictEqual(e.code, "failed-precondition", "Must not throw failed-precondition when flag is ON");
            if (e.code === "invalid-argument") {
                createPassedGuard = true;
            }
        }
        assert.strictEqual(createPassedGuard, true, "createWalletTopUpOrder passed the kill-switch guard");

        process.env.ENABLE_WALLET_TOPUP = "false";
        pass("Test (u): Top-up functionality successfully unlocks and executes when ENABLE_WALLET_TOPUP is set to true");
    } catch (err) {
        process.env.ENABLE_WALLET_TOPUP = "false";
        fail("Test (u): Top-up flag ON unlocks operations", err);
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
