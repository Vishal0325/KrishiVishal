const assert = require('assert');
const adminModule = require('../core/admin');
const {
    runMonthEndChecklist,
    lockFiscalPeriod,
    unlockFiscalPeriod,
    validatePeriodFormat
} = require('../finance/fiscalPeriodEngine');
const { assertFiscalPeriodUnlocked } = require('../finance/generalLedger');

console.log("========================================================================");
console.log("=== RUNNING SPRINT 9: FISCAL PERIOD & MONTH-END CLOSE TEST SUITE ===");
console.log("========================================================================\n");

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

async function runSprint9TestSuite() {
    const originalCollection = adminModule.db.collection;

    try {
        // In-memory Firestore store for test isolation
        const store = {
            fiscal_periods: new Map(),
            journal_entries: new Map(),
            audit_logs: new Map(),
            orders: new Map(),
            users: new Map(),
            goods_receipts: new Map()
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
                collection: (subCol) => {
                    return {
                        doc: (subId) => createMockDocRef(`${collectionName}/${docId}/${subCol}`, subId),
                        get: async () => {
                            const subDocs = [];
                            const prefix = `${collectionName}/${docId}/${subCol}/`;
                            for (const [k, v] of Object.entries(store)) {
                                if (k.startsWith(prefix)) {
                                    for (const [sId, sVal] of v.entries()) {
                                        subDocs.push({ id: sId, data: () => sVal });
                                    }
                                }
                            }
                            return { docs: subDocs };
                        }
                    };
                }
            };
        }

        // Mock Firestore collection handler
        adminModule.db.collection = (collectionName) => {
            const table = store[collectionName] || (store[collectionName] = new Map());
            return {
                doc: (docId) => createMockDocRef(collectionName, docId),
                where: () => ({
                    where: () => ({
                        where: () => ({
                            limit: () => ({
                                get: async () => ({ docs: [], size: 0 })
                            }),
                            get: async () => ({ docs: [], size: 0 })
                        }),
                        limit: () => ({
                            get: async () => ({ docs: [], size: 0 })
                        }),
                        get: async () => ({ docs: [], size: 0 })
                    }),
                    limit: () => ({
                        get: async () => ({ docs: [], size: 0 })
                    }),
                    get: async () => {
                        const docs = [];
                        for (const [id, data] of table.entries()) {
                            docs.push({ id, data: () => data, ref: createMockDocRef(collectionName, id) });
                        }
                        return { docs, size: docs.length };
                    }
                }),
                orderBy: () => ({
                    limit: () => ({
                        get: async () => ({ docs: [] })
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

        // --- TEST CASE 1: Period format validation ---
        try {
            validatePeriodFormat("2026-10");
            pass("Case 1.1: Valid YYYY-MM period accepted");
        } catch (e) {
            fail("Case 1.1: Valid YYYY-MM period accepted", e);
        }

        try {
            validatePeriodFormat("invalid-period");
            fail("Case 1.2: Reject invalid period format", new Error("Did not throw"));
        } catch (e) {
            assert.strictEqual(e.message.includes("INVALID_PERIOD_ID"), true);
            pass("Case 1.2: Successfully rejected malformed period format");
        }

        // --- TEST CASE 2: Run Month-End Checklist on balanced period ---
        try {
            const checklist = await runMonthEndChecklist("2026-10");
            assert.strictEqual(checklist.periodId, "2026-10");
            assert.strictEqual(Array.isArray(checklist.checks), true);
            assert.strictEqual(checklist.checks.length, 4);
            assert.strictEqual(checklist.canLock, true);
            pass("Case 2: Month-End checklist passes all 4 statutory checks on clean period");
        } catch (e) {
            fail("Case 2: Month-End checklist passes all 4 statutory checks", e);
        }

        // --- TEST CASE 3: Lock Fiscal Period ---
        try {
            const lockResult = await lockFiscalPeriod({
                periodId: "2026-10",
                lockedBy: "ca.auditor@krishivishal.com",
                lockNotes: "Audited by CA R.K. Sharma & Associates - Statutory Close"
            });

            assert.strictEqual(lockResult.status, "LOCKED");
            assert.strictEqual(lockResult.periodId, "2026-10");
            assert.strictEqual(lockResult.lockedBy, "ca.auditor@krishivishal.com");

            const periodData = store.fiscal_periods.get("2026-10");
            assert.strictEqual(periodData.status, "LOCKED");
            pass("Case 3: Period successfully locked with closure metrics and status=LOCKED");
        } catch (e) {
            fail("Case 3: Period successfully locked", e);
        }

        // --- TEST CASE 4: Prevent Duplicate Lock on Already Locked Period ---
        try {
            await lockFiscalPeriod({
                periodId: "2026-10",
                lockedBy: "finance@krishivishal.com"
            });
            fail("Case 4: Prevent double locking", new Error("Did not throw ALREADY_LOCKED"));
        } catch (e) {
            assert.strictEqual(e.code, "ALREADY_LOCKED");
            pass("Case 4: Correctly throws ALREADY_LOCKED when locking an already closed period");
        }

        // --- TEST CASE 5: General Ledger Rejection when Period is Locked ---
        try {
            await assertFiscalPeriodUnlocked("2026-10");
            fail("Case 5: assertFiscalPeriodUnlocked block", new Error("Did not reject locked period"));
        } catch (e) {
            assert.strictEqual(e.code, "FISCAL_PERIOD_LOCKED");
            pass("Case 5: assertFiscalPeriodUnlocked strictly blocks journal mutation on locked period");
        }

        // --- TEST CASE 6: Unlock Fiscal Period with Mandatory Audit Reason ---
        try {
            // Test missing reason throws error
            try {
                await unlockFiscalPeriod({
                    periodId: "2026-10",
                    unlockedBy: "superadmin@krishivishal.com",
                    unlockReason: ""
                });
                fail("Case 6.1: Reject empty unlock reason", new Error("Allowed empty reason"));
            } catch (err) {
                assert.strictEqual(err.code, "MANDATORY_UNLOCK_REASON");
                pass("Case 6.1: Strictly rejects unlocking without statutory reason");
            }

            // Valid unlock with reason
            const unlockRes = await unlockFiscalPeriod({
                periodId: "2026-10",
                unlockedBy: "superadmin@krishivishal.com",
                unlockReason: "Court order GST amendment for return voucher adjustment"
            });

            assert.strictEqual(unlockRes.status, "ACTIVE");
            const periodData = store.fiscal_periods.get("2026-10");
            assert.strictEqual(periodData.status, "ACTIVE");

            // Assert audit log was recorded
            const auditEntries = Array.from(store.audit_logs.values());
            const unlockAudit = auditEntries.find(a => a.action === "FISCAL_PERIOD_UNLOCKED");
            assert.strictEqual(!!unlockAudit, true);
            assert.strictEqual(unlockAudit.actor, "superadmin@krishivishal.com");
            assert.strictEqual(unlockAudit.resourceId, "2026-10");

            pass("Case 6.2: Period successfully unlocked and immutable audit trail verified");
        } catch (e) {
            fail("Case 6: Unlock fiscal period", e);
        }

    } finally {
        adminModule.db.collection = originalCollection;
    }

    console.log(`\n-----------------------------------------------------------------`);
    console.log(`SPRINT 9 TEST RESULTS: Passed: ${passed} | Failed: ${failed}`);
    console.log(`-----------------------------------------------------------------\n`);

    if (failed > 0) process.exit(1);
}

runSprint9TestSuite().catch(err => {
    console.error("Fatal Test Runner Error:", err);
    process.exit(1);
});
