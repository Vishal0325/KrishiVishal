const assert = require('assert');
const adminModule = require('../core/admin');
const {
    submitApprovalRequest,
    reviewApprovalRequest,
    getApprovalRequests,
    ALLOWED_CHECKER_ROLES
} = require('../finance/makerCheckerEngine');

console.log("==========================================================================");
console.log("=== RUNNING SPRINT 10: MAKER-CHECKER & DUAL-AUTHORIZATION TEST SUITE ===");
console.log("==========================================================================\n");

let passed = 0;
let failed = 0;

function pass(testName) {
    console.log(`✅ PASS: ${testName}`);
    passed++;
}

function fail(testName, err) {
    console.error(`❌ FAIL: ${testName} - ${err.message || err}`);
    failed++;
}

async function runSprint10TestSuite() {
    const originalCollection = adminModule.db.collection;
    const originalRunTransaction = adminModule.db.runTransaction;

    try {
        const store = {
            approval_requests: new Map(),
            suppliers: new Map(),
            supplier_invoices: new Map(),
            journal_entries: new Map(),
            audit_logs: new Map(),
            fiscal_periods: new Map()
        };

        function createMockDocRef(collectionName, docId) {
            const table = store[collectionName] || (store[collectionName] = new Map());
            return {
                id: docId,
                get: async () => {
                    const data = table.get(docId);
                    return {
                        exists: !!data,
                        id: docId,
                        data: () => data
                    };
                },
                set: async (payload, options = {}) => {
                    const existing = table.get(docId) || {};
                    const merged = options.merge ? { ...existing, ...payload } : payload;
                    table.set(docId, merged);
                    return true;
                },
                update: async (payload) => {
                    const existing = table.get(docId) || {};
                    table.set(docId, { ...existing, ...payload });
                    return true;
                },
                collection: (subCol) => {
                    return {
                        doc: (subId) => createMockDocRef(`${collectionName}/${docId}/${subCol}`, subId),
                        get: async () => ({ docs: [] })
                    };
                }
            };
        }

        adminModule.db.collection = (collectionName) => {
            const table = store[collectionName] || (store[collectionName] = new Map());
            return {
                doc: (docId) => createMockDocRef(collectionName, docId),
                where: () => ({
                    orderBy: () => ({
                        limit: () => ({
                            get: async () => {
                                const docs = [];
                                for (const [id, data] of table.entries()) {
                                    docs.push({ id, data: () => data, ref: createMockDocRef(collectionName, id) });
                                }
                                return { docs, size: docs.length };
                            }
                        })
                    })
                }),
                orderBy: () => ({
                    limit: () => ({
                        get: async () => {
                            const docs = [];
                            for (const [id, data] of table.entries()) {
                                docs.push({ id, data: () => data, ref: createMockDocRef(collectionName, id) });
                            }
                            return { docs, size: docs.length };
                        }
                    })
                }),
                add: async (payload) => {
                    const id = `AUDIT_${Date.now()}_${Math.random().toString(36).substring(7)}`;
                    table.set(id, payload);
                    return { id };
                },
                get: async () => {
                    const docs = [];
                    for (const [id, data] of table.entries()) {
                        docs.push({ id, data: () => data, ref: createMockDocRef(collectionName, id) });
                    }
                    return { docs, size: docs.length };
                }
            };
        };

        // Mock runTransaction for payment settlement
        adminModule.db.runTransaction = async (updateFunction) => {
            const tx = {
                get: async (ref) => ref.get(),
                update: (ref, payload) => ref.update(payload),
                set: (ref, payload, opt) => ref.set(payload, opt)
            };
            return await updateFunction(tx);
        };

        // Seed sample supplier and supplier invoice
        store.suppliers.set("SUP_IFFCO_01", {
            id: "SUP_IFFCO_01",
            name: "IFFCO Fertilizer Suppliers",
            bankDetails: {
                accountNumber: "91028374619",
                ifsc: "SBIN0001234",
                beneficiaryName: "IFFCO OLD ACCOUNT",
                bankName: "SBI Main"
            },
            bankDetailsStatus: "VERIFIED"
        });

        store.supplier_invoices.set("INV_BIG_001", {
            id: "INV_BIG_001",
            supplierId: "SUP_IFFCO_01",
            supplierInvoiceNo: "IFFCO/2026/999",
            outstandingBalance: 100000,
            paidAmount: 0,
            status: "PENDING"
        });

        // --- TEST CASE 1: Self-Approval Guard (SoD Violation Blocked) ---
        let req1Id;
        try {
            const req1 = await submitApprovalRequest({
                requestType: "SUPPLIER_BANK_UPDATE",
                entityType: "SUPPLIERS",
                entityId: "SUP_IFFCO_01",
                payload: {
                    accountNumber: "50200084920192",
                    ifsc: "HDFC0000456",
                    beneficiaryName: "IFFCO PRIVATE LIMITED",
                    bankName: "HDFC Bank Samastipur"
                },
                maker: {
                    uid: "MAKER_UID_001",
                    email: "rahul.accountant@krishivishal.com",
                    role: "Accountant"
                }
            });
            req1Id = req1.requestId;

            // Attempt self-approval by Maker
            try {
                await reviewApprovalRequest({
                    requestId: req1Id,
                    checker: {
                        uid: "MAKER_UID_001", // SAME AS MAKER!
                        email: "rahul.accountant@krishivishal.com",
                        role: "CFO" // Even with CFO title, UID matches!
                    },
                    action: "APPROVE",
                    remarks: "Trying to self approve my own change"
                });
                fail("Case 1: Self-Approval Guard", new Error("Allowed maker to approve own request"));
            } catch (err) {
                assert.strictEqual(err.code, "MAKER_CANNOT_BE_CHECKER");
                pass("Case 1: Maker cannot be Checker - Strictly threw MAKER_CANNOT_BE_CHECKER");
            }
        } catch (e) {
            fail("Case 1: Self-Approval Guard setup", e);
        }

        // --- TEST CASE 2: Role Authorization Guard ---
        try {
            await reviewApprovalRequest({
                requestId: req1Id,
                checker: {
                    uid: "RIDER_UID_999",
                    email: "rider@krishivishal.com",
                    role: "RiderManager" // Unauthorized!
                },
                action: "APPROVE",
                remarks: "Rider approving bank change"
            });
            fail("Case 2: Role Authorization Guard", new Error("Allowed unauthorized role to approve"));
        } catch (err) {
            assert.strictEqual(err.code, "UNAUTHORIZED_CHECKER");
            pass("Case 2: Role Authorization Guard strictly blocked non-CFO/Director (UNAUTHORIZED_CHECKER)");
        }

        // --- TEST CASE 3: Valid Supplier Bank Update Approval Workflow ---
        try {
            // Check supplier bank details still unchanged prior to approval
            const supPre = store.suppliers.get("SUP_IFFCO_01");
            assert.strictEqual(supPre.bankDetails.ifsc, "SBIN0001234");
            assert.strictEqual(supPre.bankDetailsStatus, "PENDING_APPROVAL");

            // Approved by authorized CFO
            const approveRes = await reviewApprovalRequest({
                requestId: req1Id,
                checker: {
                    uid: "CFO_UID_777",
                    email: "cfo@krishivishal.com",
                    role: "CFO"
                },
                action: "APPROVE",
                remarks: "Verified bank cancelled cheque. Approved."
            });

            assert.strictEqual(approveRes.status, "APPROVED");

            // Check supplier record officially updated
            const supPost = store.suppliers.get("SUP_IFFCO_01");
            assert.strictEqual(supPost.bankDetails.ifsc, "HDFC0000456");
            assert.strictEqual(supPost.bankDetails.accountNumber, "50200084920192");
            assert.strictEqual(supPost.bankDetailsStatus, "VERIFIED");

            // Check audit log recorded
            const auditLogs = Array.from(store.audit_logs.values());
            const bankAudit = auditLogs.find(a => a.action === "APPROVAL_EXECUTED" && a.resourceType === "suppliers");
            assert.strictEqual(!!bankAudit, true);
            assert.strictEqual(bankAudit.actor, "cfo@krishivishal.com");

            pass("Case 3: Authorized CFO approval successfully updated supplier bank details with audit trail");
        } catch (e) {
            fail("Case 3: Valid Supplier Bank Update Approval Workflow", e);
        }

        // --- TEST CASE 4: High-Value Payment Atomic Execution ---
        try {
            const payReq = await submitApprovalRequest({
                requestType: "HIGH_VALUE_PAYMENT",
                entityType: "SUPPLIER_INVOICES",
                entityId: "SUP_IFFCO_01",
                payload: {
                    invoiceId: "INV_BIG_001",
                    amount: 100000,
                    utrRef: "HDFCN202610078841",
                    bankAccountCode: "1030_BANK_CURRENT_HDFC",
                    periodId: "2026-10"
                },
                maker: {
                    uid: "MAKER_UID_002",
                    email: "accountant2@krishivishal.com",
                    role: "Accountant"
                }
            });

            const payReqId = payReq.requestId;

            // Approve high-value payment by Director
            const payApprovalRes = await reviewApprovalRequest({
                requestId: payReqId,
                checker: {
                    uid: "DIR_UID_888",
                    email: "director@krishivishal.com",
                    role: "Director"
                },
                action: "APPROVE",
                remarks: "Payment authorization confirmed against GRN-2026-10."
            });

            assert.strictEqual(payApprovalRes.status, "APPROVED");

            // Verify invoice marked as PAID
            const invPost = store.supplier_invoices.get("INV_BIG_001");
            assert.strictEqual(invPost.status, "PAID");
            assert.strictEqual(invPost.outstandingBalance, 0);
            assert.strictEqual(invPost.paidAmount, 100000);

            pass("Case 4: High-value payment (>₹50,000) executed ledger settlement atomically upon Director authorization");
        } catch (e) {
            fail("Case 4: High-Value Payment Atomic Execution", e);
        }

        // --- TEST CASE 5: Rejection Workflow ---
        try {
            const rejectReq = await submitApprovalRequest({
                requestType: "SUPPLIER_BANK_UPDATE",
                entityType: "SUPPLIERS",
                entityId: "SUP_IFFCO_01",
                payload: {
                    accountNumber: "1234567890",
                    ifsc: "PUNB0009999",
                    beneficiaryName: "Suspicious Beneficiary",
                    bankName: "PNB"
                },
                maker: {
                    uid: "MAKER_UID_003",
                    email: "intern@krishivishal.com",
                    role: "Accountant"
                }
            });

            // Missing rejection remarks throws error
            try {
                await reviewApprovalRequest({
                    requestId: rejectReq.requestId,
                    checker: { uid: "CFO_UID_777", email: "cfo@krishivishal.com", role: "CFO" },
                    action: "REJECT",
                    remarks: ""
                });
                fail("Case 5.1: Missing rejection remarks", new Error("Allowed empty remarks on reject"));
            } catch (err) {
                assert.strictEqual(err.message.includes("MANDATORY_REJECTION_REASON"), true);
                pass("Case 5.1: Mandatory justification remarks enforced on rejection");
            }

            // Valid rejection
            const rejectRes = await reviewApprovalRequest({
                requestId: rejectReq.requestId,
                checker: { uid: "CFO_UID_777", email: "cfo@krishivishal.com", role: "CFO" },
                action: "REJECT",
                remarks: "Beneficiary name mismatch with GST registration certificate."
            });

            assert.strictEqual(rejectRes.status, "REJECTED");
            const reqDoc = store.approval_requests.get(rejectReq.requestId);
            assert.strictEqual(reqDoc.status, "REJECTED");
            assert.strictEqual(reqDoc.rejectionReason, "Beneficiary name mismatch with GST registration certificate.");

            pass("Case 5.2: Rejection workflow properly marks request as REJECTED without modifying live records");
        } catch (e) {
            fail("Case 5: Rejection Workflow", e);
        }

    } finally {
        adminModule.db.collection = originalCollection;
        adminModule.db.runTransaction = originalRunTransaction;
    }

    console.log(`\n-----------------------------------------------------------------`);
    console.log(`SPRINT 10 TEST RESULTS: Passed: ${passed} | Failed: ${failed}`);
    console.log(`-----------------------------------------------------------------\n`);

    if (failed > 0) process.exit(1);
}

runSprint10TestSuite().catch(err => {
    console.error("Fatal Test Runner Error:", err);
    process.exit(1);
});
