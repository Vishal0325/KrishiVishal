/**
 * Final Wiring & Integration Check: End-to-End Financial Lifecycle & Nightly Reconciliation
 * 
 * Verifies:
 * 1. createOrder (WALLET): Atomic execution of stock reservation, order creation,
 *    System 2 canonical wallet debit (walletService.debitWallet), and Dr 2065 / Cr 2070 Journal Entry.
 * 2. verifyDeliveryOTP / Delivery Recognition: Revenue recognition, COGS matching,
 *    Dr 2070 (deferred revenue cleared), Cr 4010 + GST, and Dr 6010 / Cr 2015 (rider delivery accrual).
 * 3. Daily Nightly Reconciliation (reconcileDailyLedgerCore): All 3 statutory invariants pass with ZERO MISMATCH.
 * 4. Cancellation & Prepaid Wallet Refund: Cancelled wallet order clears deferred revenue to refunds payable
 *    and settles back to customer wallet, perfectly preserving all 3 reconciliation invariants.
 * 5. COD Delivery & Cash Settlement: COD order accrues rider cash_in_hand and 1010_CASH_IN_HAND_RIDERS,
 *    subsequently settled via confirmCashSettlement into 1020_HUB_CASH_VAULT.
 * 6. Rider Payout: approveRiderPayout debits 2015_RIDER_PAYOUTS_PAYABLE, completing full delivery partner lifecycle.
 * 7. index.js Exports: Verifies reconcileDailyLedger and reconcileDailyLedgerSchedule are exposed.
 * 
 * RUN COMMAND:
 * firebase emulators:exec --only firestore "node tests/final_wiring_e2e.test.js"
 */

const assert = require("assert");

// HARD EMULATOR GUARD
if (!process.env.FIRESTORE_EMULATOR_HOST) {
    console.error("FATAL: Final Wiring tests MUST run against the Firestore emulator.");
    console.error("Please run with: firebase emulators:exec --only firestore \"node tests/final_wiring_e2e.test.js\"");
    process.exit(1);
}

process.env.ENABLE_WALLET_TOPUP = "true";

const { db, admin } = require("../core/admin");
const { createOrder, verifyDeliveryOTP } = require("../orders/orderFlow");
const { onOrderStatusUpdate } = require("../orders/orderTriggers");
const { recognizeOrderDeliveryFinancials } = require("../finance/salesLedger");
const { reconcileDailyLedgerCore } = require("../finance/nightlyReconciliation");
const { confirmCashSettlement } = require("../finance/cashSettlement");
const { approveRiderPayout } = require("../logistics/riderPayoutEngine");
const walletService = require("../finance/walletService");

console.log("=========================================================================================");
console.log("=== FINAL WIRING & INTEGRATION CHECK: END-TO-END SYSTEM 2 FINANCIAL ARCHITECTURE      ===");
console.log("=== RUNNING AGAINST REAL FIRESTORE EMULATOR                                           ===");
console.log("=========================================================================================\n");
console.log(`[Emulator Verification] Connected to REAL Firestore Emulator at ${process.env.FIRESTORE_EMULATOR_HOST}`);
console.log(`[Project ID] ${process.env.GCLOUD_PROJECT || "krishivishal-a9ed7"}\n`);

let passed = 0;
let failed = 0;

function pass(name) {
    console.log(`✅ PASS: ${name}`);
    passed++;
}

function fail(name, err) {
    console.error(`❌ FAIL: ${name}`);
    console.error(err);
    failed++;
}

async function getJournalLines(entryId) {
    const snap = await db.collection("journal_entries").doc(entryId).collection("lines").get();
    return snap.docs.map(d => d.data());
}

async function clearEmulatorData() {
    if (process.env.FIRESTORE_EMULATOR_HOST) {
        const axios = require("axios");
        const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
        const projectId = process.env.GCLOUD_PROJECT || "krishivishal-a9ed7";
        try {
            await axios.delete(`http://${emulatorHost}/emulator/v1/projects/${projectId}/databases/(default)/documents`);
            console.log(`[Emulator Reset] Successfully cleared Firestore emulator data via REST API (${emulatorHost})`);
        } catch (e) {
            console.warn(`[Emulator Reset] REST delete failed (${e.message}), running collection fallback purge`);
            const collections = ["users", "riders", "journal_entries", "reconciliation_alerts", "reconciliation_logs", "orders", "wallet_transactions", "rider_transactions", "cash_settlements", "rider_payouts"];
            for (const col of collections) {
                const snap = await db.collection(col).get();
                if (!snap.empty) {
                    const batch = db.batch();
                    snap.docs.forEach(d => batch.delete(d.ref));
                    await batch.commit();
                }
            }
        }
    }
}

async function runTests() {
    // Reset emulator data before test suite runs to ensure deterministic isolation
    await clearEmulatorData();

    const now = new Date();
    const periodId = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    // 0. Connection probe & fiscal period initialization
    try {
        await db.collection("fiscal_periods").doc(periodId).set({
            status: "OPEN",
            unlockedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        const probeRef = db.collection("_emulator_probe").doc("final_probe");
        await probeRef.set({ ok: true, ts: admin.firestore.FieldValue.serverTimestamp() });
        pass("Firestore Emulator Connection & Open Fiscal Period Confirmed");
    } catch (err) {
        fail("Firestore Emulator Connection Probe", err);
        process.exit(1);
    }

    const hubId = "HUB_FINAL_01";
    const skuCode = "SKU_FINAL_FERT";
    const productId = "PROD_FINAL_FERT";
    const farmerUid = "USR_FINAL_FARMER_01";
    const riderUid = "RIDER_FINAL_01";
    const adminUid = "ADMIN_FINAL_01";

    // Seed master catalog, stock & configuration
    try {
        await db.collection("settings").doc("config").set({
            deliveryCharge: 0,
            freeDeliveryAbove: 100, // Guarantees free delivery for >= ₹100
            minOrderValue: 0,
            USE_BATCH_COGS: false
        });

        await db.collection("warehouses").doc(hubId).set({
            id: hubId,
            name: "Central Bihar Agri Hub",
            isActive: true,
            pincodes: ["848101"]
        });

        await db.collection("product_costs").doc(productId).set({
            productId,
            costPrice: 500,
            variantsCost: { "VAR_1KG": 500 }
        });

        await db.collection("products").doc(productId).set({
            id: productId,
            name: "Krishi Certified Wheat Seeds 10kg",
            category: "SEEDS",
            hsnCode: "1209",
            gstRate: 0,
            skuCode,
            price: 800,
            mrp: 900,
            costPrice: 500,
            stock: 200,
            variants: [{
                id: "VAR_1KG",
                skuCode,
                label: "10 kg",
                price: 800,
                mrp: 900,
                costPrice: 500,
                stock: 200
            }]
        });

        await db.collection("skus").doc(skuCode).set({
            skuCode,
            productId,
            name: "Wheat Seeds 10kg SKU",
            category: "SEEDS",
            hsnCode: "1209",
            tax: { gstRate: 0, hsn: "1209" },
            isActive: true,
            costPrice: 500,
            pricing: { consumerPrice: 800, mrp: 900 },
            inventory: {
                availableStock: 200,
                committedStock: 0,
                totalStock: 200
            }
        });

        await db.collection("skus").doc(skuCode).collection("batches").doc("BAT_FINAL_1").set({
            batchId: "BAT_FINAL_1",
            batchNumber: "BAT-FINAL-2026",
            isActive: true,
            qualityStatus: "PASSED",
            landingCost: 500,
            stock: 200,
            expiryDate: admin.firestore.Timestamp.fromMillis(Date.now() + 180 * 24 * 3600 * 1000)
        });

        await db.collection("warehouse_stock").doc(`${skuCode}_BAT_FINAL_1_${hubId}`).set({
            skuCode,
            batchId: "BAT_FINAL_1",
            warehouseId: hubId,
            availableStock: 200,
            committedStock: 0
        });

        // Seed farmer user with initial ₹0 wallet balance, then credit ₹3000 via System 2
        await db.collection("users").doc(farmerUid).set({
            id: farmerUid,
            uid: farmerUid,
            name: "Rameshwar Prasad",
            phone: "+919876543210",
            walletBalance: 0,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Post opening balance journal entry for wallet liability (so invariant begins balanced)
        await walletService.creditWallet({
            uid: farmerUid,
            amount: 3000,
            eventType: "TOPUP",
            entityId: "TOPUP_INITIAL_SEED",
            description: "Opening seed balance for customer wallet"
        });

        // Seed rider
        await db.collection("riders").doc(riderUid).set({
            id: riderUid,
            uid: riderUid,
            name: "Suresh Delivery Partner",
            phone: "+919876500001",
            cash_in_hand: 0,
            pendingShortageAmount: 0,
            isActive: true
        });

        pass("Master Data, Batches, Customer Wallet (₹3000) & Rider Initialized");
    } catch (err) {
        fail("Master Data & Wallet Initialization", err);
        process.exit(1);
    }

    // =========================================================================
    // TEST 1: createOrder with paymentMethod: 'WALLET' (System 2 Atomic Debit)
    // =========================================================================
    let orderId1 = null;
    let orderOtp1 = null;
    try {
        console.log("\n--- TEST 1: createOrder with WALLET (Atomic System 2 Debit) ---");
        const orderPayload = {
            idempotencyKey: `IDEM_FINAL_ORDER_1_${Date.now()}`,
            destinationHubId: hubId,
            userName: "Rameshwar Prasad",
            userPhone: "9876543210",
            paymentMethod: "WALLET",
            address: {
                line1: "Village Kothia, Near High School",
                city: "Samastipur",
                state: "Bihar",
                pincode: "848101"
            },
            cartItems: [{
                productId,
                skuCode,
                quantity: 1,
                variantId: "VAR_1KG"
            }]
        };

        const createRes = await createOrder.run({
            data: orderPayload,
            auth: { uid: farmerUid }
        });

        assert.strictEqual(createRes.success, true);
        assert.ok(createRes.orderId, "Must return valid orderId");
        assert.ok(createRes.customerOTP, "Must return customerOTP");
        orderId1 = createRes.orderId;
        orderOtp1 = createRes.customerOTP;

        // Verify order document
        const orderSnap = await db.collection("orders").doc(orderId1).get();
        assert.ok(orderSnap.exists, "Order doc must exist");
        const orderData = orderSnap.data();
        assert.strictEqual(orderData.paymentMethod, "WALLET");
        assert.strictEqual(orderData.paymentStatus, "PAID");
        assert.strictEqual(orderData.totalAmount, 800);
        assert.ok(orderData.walletTransactionId, "Must store walletTransactionId on order");
        assert.ok(orderData.journalEntryId, "Must store journalEntryId on order");

        // Verify user walletBalance decremented atomically from 3000 to 2200
        const userSnap = await db.collection("users").doc(farmerUid).get();
        assert.strictEqual(userSnap.data().walletBalance, 2200, "Wallet balance must be exactly 2200");

        // Verify root wallet_transactions record
        const wtSnap = await db.collection("wallet_transactions").doc(orderData.walletTransactionId).get();
        assert.ok(wtSnap.exists, "Root wallet_transactions document must exist");
        const wtData = wtSnap.data();
        assert.strictEqual(wtData.uid, farmerUid);
        assert.strictEqual(wtData.amount, 800);
        assert.strictEqual(wtData.type, "DEBIT");
        assert.strictEqual(wtData.eventType, "ORDER_PAYMENT");
        assert.strictEqual(wtData.balanceBefore, 3000);
        assert.strictEqual(wtData.balanceAfter, 2200);

        // Verify System 2 Journal Entry (JE_WALLET_ORDER_PAYMENT_${orderId})
        const jeId = `JE_WALLET_ORDER_PAYMENT_${orderId1}`;
        const jeSnap = await db.collection("journal_entries").doc(jeId).get();
        assert.ok(jeSnap.exists, "Journal entry for wallet order payment must exist");
        const jeData = jeSnap.data();
        assert.strictEqual(jeData.refType, "WALLET_TRANSACTION");
        assert.strictEqual(jeData.totalAmount, 800);

        const jeLines = await getJournalLines(jeId);
        assert.strictEqual(jeLines.length, 2, "Must have exactly 2 lines");
        const drLiability = jeLines.find(l => l.accountCode === "2065_CUSTOMER_WALLET_LIABILITY");
        const crDeferred = jeLines.find(l => l.accountCode === "2070_DEFERRED_REVENUE");
        assert.ok(drLiability, "Must debit 2065_CUSTOMER_WALLET_LIABILITY");
        assert.strictEqual(drLiability.debit, 800);
        assert.strictEqual(drLiability.credit, 0);
        assert.ok(crDeferred, "Must credit 2070_DEFERRED_REVENUE");
        assert.strictEqual(crDeferred.debit, 0);
        assert.strictEqual(crDeferred.credit, 800);

        pass("TEST 1: createOrder with WALLET debits balance, writes wallet_transactions & posts Dr 2065 / Cr 2070 JE");
    } catch (err) {
        fail("TEST 1: createOrder with WALLET", err);
    }

    // =========================================================================
    // TEST 2: Delivery Fulfillment & Revenue Recognition (Ind AS 115)
    // =========================================================================
    try {
        console.log("\n--- TEST 2: Delivery Fulfillment & Revenue Recognition ---");
        // Assign rider to order 1
        await db.collection("orders").doc(orderId1).update({
            riderId: riderUid,
            status: "OUT_FOR_DELIVERY"
        });

        // Fulfill delivery via verifyDeliveryOTP
        const verifyRes = await verifyDeliveryOTP.run({
            data: { orderId: orderId1, otp: orderOtp1 },
            auth: { uid: riderUid, token: { role: "rider" } }
        });
        assert.strictEqual(verifyRes.success, true);

        // Recognize order delivery financials
        const orderSnapAfter = await db.collection("orders").doc(orderId1).get();
        const recoRes = await recognizeOrderDeliveryFinancials({
            orderId: orderId1,
            ...orderSnapAfter.data()
        });
        assert.strictEqual(recoRes.success, true);
        assert.ok(recoRes.invoiceNumber, "Must generate invoiceNumber");
        assert.strictEqual(recoRes.totalSales, 800);

        // Check delivery journal entry
        const deliveryJeSnap = await db.collection("journal_entries").doc(recoRes.journalEntryId).get();
        assert.ok(deliveryJeSnap.exists, "Delivery JE must exist");
        const deliveryLines = await getJournalLines(recoRes.journalEntryId);

        // Verify Deferred Revenue was cleared (Dr 2070)
        const drDeferred = deliveryLines.find(l => l.accountCode === "2070_DEFERRED_REVENUE");
        assert.ok(drDeferred, "Must debit 2070_DEFERRED_REVENUE to clear prepaid liability");
        assert.strictEqual(drDeferred.debit, 800);

        // Verify Operating Revenue credited (Cr 4010)
        const crRevenue = deliveryLines.find(l => l.accountCode === "4010_SALES_AGRI_INPUTS");
        assert.ok(crRevenue, "Must credit 4010_SALES_AGRI_INPUTS");
        assert.ok(crRevenue.credit > 0, "Revenue credit must be > 0");

        // Verify COGS matched (Dr 5010 / Cr 1040)
        const drCogs = deliveryLines.find(l => l.accountCode === "5010_COGS_AGRI_INPUTS");
        const crInv = deliveryLines.find(l => l.accountCode === "1040_INVENTORY_MAIN_HUB");
        assert.ok(drCogs, "Must debit 5010_COGS_AGRI_INPUTS");
        assert.ok(crInv, "Must credit 1040_INVENTORY_MAIN_HUB");
        assert.strictEqual(drCogs.debit, 500);
        assert.strictEqual(crInv.credit, 500);

        // Verify Rider Delivery Accrual (Dr 6010 / Cr 2015_RIDER_PAYOUTS_PAYABLE)
        const drRiderExp = deliveryLines.find(l => l.accountCode === "6010_RIDER_DELIVERY_PAYOUTS");
        const crRiderPayable = deliveryLines.find(l => l.accountCode === "2015_RIDER_PAYOUTS_PAYABLE");
        assert.ok(drRiderExp, "Must debit 6010_RIDER_DELIVERY_PAYOUTS");
        assert.ok(crRiderPayable, "Must credit 2015_RIDER_PAYOUTS_PAYABLE");
        assert.strictEqual(drRiderExp.debit, 30);
        assert.strictEqual(crRiderPayable.credit, 30);

        pass("TEST 2: Delivery fulfillment clears 2070_DEFERRED_REVENUE, recognizes 4010 revenue & accrues 2015 rider payable");
    } catch (err) {
        fail("TEST 2: Delivery Fulfillment & Revenue Recognition", err);
    }

    // =========================================================================
    // TEST 3: Nightly Financial Reconciliation Engine Asserting ZERO MISMATCH
    // =========================================================================
    try {
        console.log("\n--- TEST 3: Nightly Financial Reconciliation (ZERO MISMATCH) ---");
        const recoResult = await reconcileDailyLedgerCore({
            periodId,
            date: new Date()
        });

        console.log(`[Reconciliation Result] Balanced: ${recoResult.balanced}, LogId: ${recoResult.logId}`);
        console.log(`[Wallet Invariant] Expected (users sum): ₹${recoResult.checks.wallet.userWalletSum}, Actual (GL 2065): ₹${recoResult.checks.wallet.glWalletLiability}, Diff: ₹${recoResult.checks.wallet.diff}`);
        console.log(`[Rider Cash Invariant] Expected (riders sum): ₹${recoResult.checks.riderCash.riderCashSum}, Actual (GL 1010): ₹${recoResult.checks.riderCash.glRiderCash}, Diff: ₹${recoResult.checks.riderCash.diff}`);
        console.log(`[Double-Entry Invariant] Total Debits: ₹${recoResult.checks.generalLedger.totalDebits}, Total Credits: ₹${recoResult.checks.generalLedger.totalCredits}, Diff: ₹${recoResult.checks.generalLedger.diff}`);

        assert.strictEqual(recoResult.balanced, true, "Balanced flag must be true");
        assert.strictEqual(recoResult.checks.wallet.balanced, true, "Wallet invariant must pass");
        assert.strictEqual(recoResult.checks.wallet.diff, 0, "Wallet liability diff must be 0");
        assert.strictEqual(recoResult.checks.riderCash.balanced, true, "Rider cash invariant must pass");
        assert.strictEqual(recoResult.checks.riderCash.diff, 0, "Rider cash diff must be 0");
        assert.strictEqual(recoResult.checks.generalLedger.balanced, true, "Double-entry invariant must pass");
        assert.strictEqual(recoResult.checks.generalLedger.diff, 0, "Double-entry diff must be 0");

        pass("TEST 3: Nightly Financial Reconciliation runs with ZERO MISMATCH (BALANCED)");
    } catch (err) {
        fail("TEST 3: Nightly Financial Reconciliation", err);
    }

    // =========================================================================
    // TEST 4: Order Cancellation & Prepaid Wallet Refund Flow
    // =========================================================================
    try {
        console.log("\n--- TEST 4: Order Cancellation & Prepaid Wallet Refund ---");
        // Place a second wallet order for ₹800
        const orderPayload2 = {
            idempotencyKey: `IDEM_FINAL_ORDER_CANCEL_${Date.now()}`,
            destinationHubId: hubId,
            userName: "Rameshwar Prasad",
            userPhone: "9876543210",
            paymentMethod: "WALLET",
            address: {
                line1: "Village Kothia",
                city: "Samastipur",
                state: "Bihar",
                pincode: "848101"
            },
            cartItems: [{
                productId,
                skuCode,
                quantity: 1,
                variantId: "VAR_1KG"
            }]
        };

        const createRes2 = await createOrder.run({
            data: orderPayload2,
            auth: { uid: farmerUid }
        });
        const orderId2 = createRes2.orderId;

        // User balance should now be 2200 - 800 = 1400
        const userBeforeCancel = await db.collection("users").doc(farmerUid).get();
        assert.strictEqual(userBeforeCancel.data().walletBalance, 1400);

        // Cancel order 2 and trigger refund flow
        const orderRef2 = db.collection("orders").doc(orderId2);
        const oldSnap = await orderRef2.get();
        await orderRef2.update({
            status: "CANCELLED",
            cancellationReason: "Crop planning changed"
        });
        const newSnap = await orderRef2.get();

        // Invoke cancellation trigger logic
        await onOrderStatusUpdate.run({
            data: { before: oldSnap, after: newSnap },
            params: { orderId: orderId2 }
        });

        // Verify customer wallet balance was refunded from 1400 back to 2200!
        const userAfterRefund = await db.collection("users").doc(farmerUid).get();
        assert.strictEqual(userAfterRefund.data().walletBalance, 2200, "Customer wallet balance must be fully restored to ₹2200");

        // Verify Step 1 JE: JE_CREDIT_NOTE_CANCEL_${orderId2} (Dr 2070 / Cr 2060)
        const cancelJeId = `JE_CREDIT_NOTE_CANCEL_${orderId2}`;
        const cancelJeSnap = await db.collection("journal_entries").doc(cancelJeId).get();
        assert.ok(cancelJeSnap.exists, "Step 1 cancellation JE must exist");
        const cancelLines = await getJournalLines(cancelJeId);
        const drDefCancel = cancelLines.find(l => l.accountCode === "2070_DEFERRED_REVENUE");
        const crRefundsPayable = cancelLines.find(l => l.accountCode === "2060_CUSTOMER_REFUNDS_PAYABLE");
        assert.strictEqual(drDefCancel.debit, 800);
        assert.strictEqual(crRefundsPayable.credit, 800);

        // Verify Step 2 JE: JE_SETTLEMENT_WALLET_${orderId2} (Dr 2060 / Cr 2065)
        const settleJeId = `JE_SETTLEMENT_WALLET_${orderId2}`;
        const settleJeSnap = await db.collection("journal_entries").doc(settleJeId).get();
        assert.ok(settleJeSnap.exists, "Step 2 settlement JE must exist");
        const settleLines = await getJournalLines(settleJeId);
        const drRefundsClear = settleLines.find(l => l.accountCode === "2060_CUSTOMER_REFUNDS_PAYABLE");
        const crWalletLiab = settleLines.find(l => l.accountCode === "2065_CUSTOMER_WALLET_LIABILITY");
        assert.strictEqual(drRefundsClear.debit, 800);
        assert.strictEqual(crWalletLiab.credit, 800);

        // Run reconciliation again: All 3 invariants must STILL hold with zero mismatch!
        const recoAfterCancel = await reconcileDailyLedgerCore({ periodId, date: new Date() });
        assert.strictEqual(recoAfterCancel.balanced, true, "Must remain BALANCED after cancellation refund");
        assert.strictEqual(recoAfterCancel.checks.wallet.diff, 0);

        pass("TEST 4: Order cancellation refund restores wallet balance and preserves reconciliation invariants");
    } catch (err) {
        fail("TEST 4: Order Cancellation & Prepaid Wallet Refund", err);
    }

    // =========================================================================
    // TEST 5: COD Delivery, Rider Cash Accrual & Hub Settlement Flow
    // =========================================================================
    try {
        console.log("\n--- TEST 5: COD Delivery & Hub Cash Settlement ---");
        // Place COD order
        const codOrderPayload = {
            idempotencyKey: `IDEM_FINAL_COD_${Date.now()}`,
            destinationHubId: hubId,
            userName: "Rameshwar Prasad",
            userPhone: "9876543210",
            paymentMethod: "COD",
            address: {
                line1: "Plot 9",
                city: "Samastipur",
                state: "Bihar",
                pincode: "848101"
            },
            cartItems: [{
                productId,
                skuCode,
                quantity: 1,
                variantId: "VAR_1KG"
            }]
        };

        const codCreateRes = await createOrder.run({
            data: codOrderPayload,
            auth: { uid: farmerUid }
        });
        const codOrderId = codCreateRes.orderId;

        // Assign rider and deliver
        await db.collection("orders").doc(codOrderId).update({
            riderId: riderUid,
            status: "OUT_FOR_DELIVERY"
        });

        const codOrderSnap = await db.collection("orders").doc(codOrderId).get();
        await recognizeOrderDeliveryFinancials({
            orderId: codOrderId,
            ...codOrderSnap.data()
        });

        // Verify rider cash_in_hand incremented to ₹800
        const riderAfterCod = await db.collection("riders").doc(riderUid).get();
        assert.strictEqual(riderAfterCod.data().cash_in_hand, 800, "Rider cash_in_hand must be ₹800");

        // Verify reconciliation holds before settlement (Sum of rider cash === GL 1010)
        const recoCod = await reconcileDailyLedgerCore({ periodId, date: new Date() });
        assert.strictEqual(recoCod.checks.riderCash.balanced, true, "Rider cash invariant must pass during transit");
        assert.strictEqual(recoCod.checks.riderCash.diff, 0);

        // Settle cash via confirmCashSettlement (Hub Manager deposits ₹800 into vault)
        const settlementDoc = await db.collection("cash_settlements").add({
            riderId: riderUid,
            hubId: hubId,
            totalCollected: 800,
            totalAmount: 800,
            status: "PENDING_VERIFICATION",
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        const settleRes = await confirmCashSettlement.run({
            data: { settlementId: settlementDoc.id, depositedAmount: 800, shortageAmount: 0 },
            auth: { uid: adminUid, token: { role: "hubmanager" } }
        });
        assert.strictEqual(settleRes.success, true);

        // Verify rider cash_in_hand cleared to 0
        const riderAfterSettle = await db.collection("riders").doc(riderUid).get();
        assert.strictEqual(riderAfterSettle.data().cash_in_hand, 0, "Rider cash_in_hand must be cleared to 0");

        // Reconcile again: Rider cash invariant remains 0 diff!
        const recoAfterSettle = await reconcileDailyLedgerCore({ periodId, date: new Date() });
        assert.strictEqual(recoAfterSettle.checks.riderCash.balanced, true);
        assert.strictEqual(recoAfterSettle.checks.riderCash.diff, 0);

        pass("TEST 5: COD delivery accrues rider cash_in_hand (1010), settled via confirmCashSettlement (1020)");
    } catch (err) {
        fail("TEST 5: COD Delivery & Hub Cash Settlement", err);
    }

    // =========================================================================
    // TEST 6: Weekly Rider Payout Approval with 2015_RIDER_PAYOUTS_PAYABLE
    // =========================================================================
    try {
        console.log("\n--- TEST 6: Weekly Rider Payout Approval (2015_RIDER_PAYOUTS_PAYABLE) ---");
        // Create payout record for riderUid
        const payoutDoc = await db.collection("rider_payouts").add({
            riderId: riderUid,
            riderName: "Suresh Delivery Partner",
            hubId: hubId,
            grossEarnings: 60, // 2 deliveries * ₹30
            grossPayoutAmount: 60,
            pendingShortageAmount: 0,
            shortageDeducted: 0,
            netPayable: 60,
            netPayoutAmount: 60,
            status: "PENDING_APPROVAL",
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        const payoutRes = await approveRiderPayout.run({
            data: { payoutId: payoutDoc.id, paymentMode: "NEFT", referenceNo: "NEFT_FINAL_TEST_123" },
            auth: { uid: adminUid, token: { role: "FinanceAdmin" } }
        });
        assert.strictEqual(payoutRes.success, true);
        assert.strictEqual(payoutRes.status, "PAID");

        // Verify JE debited 2015_RIDER_PAYOUTS_PAYABLE and credited bank
        const payoutJeId = `JE_RIDER_WEEKLY_PAYOUT_${payoutDoc.id}`;
        const payoutJeSnap = await db.collection("journal_entries").doc(payoutJeId).get();
        assert.ok(payoutJeSnap.exists, "Payout JE must exist");
        const payoutLines = await getJournalLines(payoutJeId);
        const drPayable = payoutLines.find(l => l.accountCode === "2015_RIDER_PAYOUTS_PAYABLE");
        const crBank = payoutLines.find(l => l.accountCode === "1030_BANK_CURRENT_HDFC");
        assert.ok(drPayable, "Must debit 2015_RIDER_PAYOUTS_PAYABLE");
        assert.strictEqual(drPayable.debit, 60);
        assert.ok(crBank, "Must credit 1030_BANK_CURRENT_HDFC");
        assert.strictEqual(crBank.credit, 60);

        // Reconcile again: Full system double-entry remains balanced!
        const recoFinal = await reconcileDailyLedgerCore({ periodId, date: new Date() });
        assert.strictEqual(recoFinal.balanced, true, "Final full lifecycle must be 100% BALANCED");
        assert.strictEqual(recoFinal.checks.generalLedger.diff, 0);

        pass("TEST 6: Weekly rider payout approves and debits 2015_RIDER_PAYOUTS_PAYABLE, maintaining GL balance");
    } catch (err) {
        fail("TEST 6: Weekly Rider Payout Approval", err);
    }

    // =========================================================================
    // TEST 7: index.js Functions Export Verification
    // =========================================================================
    try {
        console.log("\n--- TEST 7: index.js Exports Verification ---");
        const index = require("../index");
        assert.ok(index.reconcileDailyLedger, "index.js must export reconcileDailyLedger");
        assert.ok(index.reconcileDailyLedgerSchedule, "index.js must export reconcileDailyLedgerSchedule");
        assert.ok(index.createOrder, "index.js must export createOrder");
        assert.ok(index.verifyDeliveryOTP, "index.js must export verifyDeliveryOTP");
        assert.ok(index.postJournalEntry, "index.js must export postJournalEntry");
        assert.ok(index.confirmCashSettlement, "index.js must export confirmCashSettlement");
        assert.ok(index.approveRiderPayout, "index.js must export approveRiderPayout");
        assert.ok(index.recordExpensePayment, "index.js must export recordExpensePayment");
        assert.ok(index.recordBankPayout, "index.js must export recordBankPayout");
        assert.ok(index.payWithWallet, "index.js must export payWithWallet");
        pass("TEST 7: All required Cloud Functions and reconciliation engines exported from index.js");
    } catch (err) {
        fail("TEST 7: index.js Exports Verification", err);
    }

    // Summary
    console.log("\n=========================================================================================");
    console.log(`=== FINAL WIRING SUITE COMPLETE: ${passed} PASSED | ${failed} FAILED                          ===`);
    console.log("=========================================================================================\n");

    if (failed > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runTests().catch(err => {
    console.error("Fatal error during test execution:", err);
    process.exit(1);
});
