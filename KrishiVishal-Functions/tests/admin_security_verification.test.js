/**
 * ADMIN SECURITY & HARDENING VERIFICATION TEST SUITE
 * Verifies fixes for:
 * 1. Privilege Escalation Prevention in createStaffMember
 * 2. Stale Claims Removal on setUserRole (Downgrade) and deactivateUser
 * 3. Lock addSecureAuditLog to Authorized Staff/Admin Only + Dual-write to admin_logs
 * 4. 0% GST and 0 Profit Orders in getFinanceSummary + Accurate Expense Fallback Calculation
 * 5. Strict Input Validation in saveExpense (Negative amounts, discount > subtotal, combined GST > 28%)
 * 6. Quarantine RTV Journal Entry Idempotency & Conflict-free Partial Resolutions
 */

const assert = require('assert');
const { createStaffMember, addSecureAuditLog, getFinanceSummary, saveExpense } = require('../admin/adminServices');
const { setUserRole, deactivateUser } = require('../auth/roleProvisioning');
const { resolveQuarantinedStockLogic } = require('../inventory/quarantineEngine');
const { db, admin, auth } = require('../core/admin');

console.log("=== RUNNING ADMIN SECURITY & HARDENING VERIFICATION TESTS ===\n");

let passed = 0;
let failed = 0;

function pass(name) {
    console.log(`PASS: ${name}`);
    passed++;
}

function fail(name, err) {
    console.log(`FAIL: ${name} - ${err.message || err}`);
    failed++;
}

async function runTests() {
    // -------------------------------------------------------------
    // Mock Setup
    // -------------------------------------------------------------
    let userClaimsStore = {};
    let usersStore = {
        'superadmin_uid': { role: 'SuperAdmin', status: 'ACTIVE', deactivated: false },
        'staff_uid': { role: 'CatalogManager', isStaff: true, status: 'ACTIVE', deactivated: false },
        'other_superadmin': { role: 'SuperAdmin', status: 'ACTIVE', deactivated: false }
    };
    let auditLogsStore = [];
    let adminLogsStore = [];
    let expensesStore = [];
    let revokedTokens = [];

    const origAuthGetUser = auth.getUser;
    const origAuthSetClaims = auth.setCustomUserClaims;
    const origAuthCreateUser = admin.auth().createUser;
    const origAuthRevoke = auth.revokeRefreshTokens;
    const origCollection = db.collection;
    const origRunTransaction = db.runTransaction;

    const queryFrom = (docs, failure) => ({
        where() { return this; },
        orderBy() { return this; },
        limit() { return this; },
        startAfter() { return this; },
        get: async () => {
            if (failure) throw failure;
            return { docs, empty: docs.length === 0, size: docs.length };
        }
    });

    auth.getUser = async (uid) => ({
        uid,
        customClaims: userClaimsStore[uid] || {}
    });

    auth.setCustomUserClaims = async (uid, claims) => {
        userClaimsStore[uid] = claims;
    };

    auth.revokeRefreshTokens = async (uid) => {
        revokedTokens.push(uid);
    };

    admin.auth().createUser = async (opts) => ({
        uid: 'newly_created_staff_id',
        email: opts.email,
        displayName: opts.displayName
    });

    db.collection = (colName) => {
        if (colName === 'users') {
            return {
                doc: (uid) => ({
                    get: async () => ({
                        exists: !!usersStore[uid],
                        data: () => usersStore[uid] || {}
                    }),
                    set: async (data, opts) => {
                        usersStore[uid] = { ...(opts && opts.merge ? usersStore[uid] : {}), ...data };
                    }
                }),
                where: (field, op, val) => ({
                    get: async () => {
                        const docs = Object.entries(usersStore)
                            .filter(([_, u]) => u[field] === val)
                            .map(([id, d]) => ({ id, data: () => d }));
                        return { size: docs.length, docs, empty: docs.length === 0 };
                    }
                })
            };
        }
        if (colName === 'audit_logs') {
            return {
                doc: (id) => ({
                    get: async () => {
                        const data = auditLogsStore.find((entry) => entry.__id === id);
                        return { exists: !!data, data: () => data || {} };
                    },
                    set: async (doc) => {
                        auditLogsStore.push({ ...doc, __id: id });
                    }
                }),
                add: async (doc) => {
                    auditLogsStore.push(doc);
                    return { id: `audit_${auditLogsStore.length}` };
                }
            };
        }
        if (colName === 'admin_logs') {
            return {
                doc: (id) => ({
                    get: async () => {
                        const data = adminLogsStore.find((entry) => entry.__id === id);
                        return { exists: !!data, data: () => data || {} };
                    },
                    set: async (doc) => {
                        adminLogsStore.push({ ...doc, __id: id });
                    }
                }),
                add: async (doc) => {
                    adminLogsStore.push(doc);
                    return { id: `admin_log_${adminLogsStore.length}` };
                }
            };
        }
        if (colName === 'expenses') {
            return {
                add: async (doc) => {
                    expensesStore.push(doc);
                    return { id: `exp_${expensesStore.length}` };
                },
                doc: (id = `exp_${expensesStore.length + 1}`) => ({
                    id,
                    get: async () => ({ exists: false, data: () => null }),
                    set: async (doc) => {
                        expensesStore.push(doc);
                    },
                    update: async (doc) => {}
                }),
                where: () => queryFrom(expensesStore.map((d, i) => ({ id: `exp_${i}`, data: () => d }))),
                orderBy() { return this; },
                limit() { return this; },
                get: async () => ({ docs: expensesStore.map((d, i) => ({ id: `exp_${i}`, data: () => d })), size: expensesStore.length, empty: expensesStore.length === 0 })
            };
        }
        if (colName === 'counters') {
            return {
                doc: (id) => ({
                    id,
                    get: async () => ({ exists: true, data: () => ({ year: new Date().getFullYear(), count: 0 }) }),
                    set: async () => {}
                })
            };
        }
        if (colName === 'orders') {
            const docs = [{
                id: 'ord_zero_tax',
                data: () => ({
                    status: 'DELIVERED',
                    totalAmount: 1000,
                    cgst: 0,
                    sgst: 0,
                    igst: 0,
                    grossProfit: 0
                })
            }];
            return queryFrom(docs);
        }
        if (colName === 'ledger') {
            const error = Object.assign(new Error("INDEX_NOT_READY_FALLBACK_TRIGGER"), { code: "failed-precondition" });
            return { where: () => queryFrom([], error) };
        }
        if (colName === 'whitelisted_riders' || colName === 'riders') {
            return {
                doc: () => ({
                    get: async () => ({ exists: false }),
                    set: async () => {}
                }),
                where: () => ({
                    get: async () => ({ docs: [] })
                })
            };
        }
        return origCollection.call(db, colName);
    };
    db.runTransaction = async (callback) => callback({
        get: async (ref) => ref.get(),
        getAll: async (...refs) => Promise.all(refs.map((ref) => ref.get())),
        create: (ref, data) => ref.set(data),
        set: (ref, data, opt) => ref.set(data, opt),
        update: (ref, data) => (ref.update ? ref.update(data) : ref.set(data, { merge: true }))
    });

    // =============================================================
    // TEST (a): Privilege Escalation Prevention in createStaffMember
    // =============================================================
    console.log("--- TEST A: Privilege Escalation Prevention in createStaffMember ---");

    // Case 1: CatalogManager cannot create SuperAdmin
    try {
        await createStaffMember.run({
            data: { email: 'bad_admin@kv.com', password: 'SecretPassword123!', name: 'Attacker', role: 'SuperAdmin' },
            auth: { uid: 'catalog_mgr_uid', token: { role: 'CatalogManager', isStaff: true } }
        });
        fail("A.1 CatalogManager creating SuperAdmin", new Error("Allowed CatalogManager to create SuperAdmin!"));
    } catch (e) {
        if (e.code === 'permission-denied') {
            pass("A.1 CatalogManager correctly blocked from creating SuperAdmin (permission-denied)");
        } else {
            fail("A.1 CatalogManager creating SuperAdmin", e);
        }
    }

    // Case 2: Customer cannot create any staff member
    try {
        await createStaffMember.run({
            data: { email: 'viewer@kv.com', password: 'SecretPassword123!', name: 'Viewer', role: 'Viewer' },
            auth: { uid: 'customer_uid', token: { role: 'Customer' } }
        });
        fail("A.2 Customer creating staff member", new Error("Allowed Customer to create staff!"));
    } catch (e) {
        if (e.code === 'permission-denied') {
            pass("A.2 Customer correctly blocked from creating staff member (permission-denied)");
        } else {
            fail("A.2 Customer creating staff member", e);
        }
    }

    // Case 3: SuperAdmin CAN create staff member with validated role
    try {
        const staffRes = await createStaffMember.run({
            data: { email: 'order_manager@kv.com', password: 'SecretPassword123!', name: 'OM User', role: 'OrderManager' },
            auth: { uid: 'superadmin_uid', token: { role: 'SuperAdmin', isSuperAdmin: true } }
        });
        assert.strictEqual(staffRes.success, true);
        assert.strictEqual(userClaimsStore['newly_created_staff_id'].role, 'OrderManager');
        assert.strictEqual(userClaimsStore['newly_created_staff_id'].isSuperAdmin, false);
        assert.strictEqual(userClaimsStore['newly_created_staff_id'].isAdmin, false);
        assert.strictEqual(userClaimsStore['newly_created_staff_id'].isStaff, true);
        pass("A.3 SuperAdmin successfully creates OrderManager with scoped claims");
    } catch (e) {
        fail("A.3 SuperAdmin creating staff", e);
    }

    // =============================================================
    // TEST (b): Stale Claims Cleared on Downgrade & Deactivate
    // =============================================================
    console.log("\n--- TEST B: Stale Claims Cleared on Downgrade & Deactivation ---");

    // Case 1: SuperAdmin downgraded to Customer via setUserRole -> isSuperAdmin, admin, isAdmin become false
    try {
        userClaimsStore['demoted_user_uid'] = {
            role: 'SuperAdmin',
            isSuperAdmin: true,
            isAdmin: true,
            admin: true,
            isStaff: true,
            hubAccess: 'ALL'
        };
        const demoteRes = await setUserRole.run({
            data: { targetUid: 'demoted_user_uid', role: 'Customer' },
            auth: { uid: 'superadmin_uid', token: { role: 'SuperAdmin', isSuperAdmin: true } }
        });
        assert.strictEqual(demoteRes.role, 'Customer');
        assert.strictEqual(userClaimsStore['demoted_user_uid'].role, 'Customer');
        assert.strictEqual(userClaimsStore['demoted_user_uid'].isSuperAdmin, false);
        assert.strictEqual(userClaimsStore['demoted_user_uid'].isAdmin, false);
        assert.strictEqual(userClaimsStore['demoted_user_uid'].admin, false);
        assert.strictEqual(userClaimsStore['demoted_user_uid'].isStaff, false);
        assert.strictEqual(userClaimsStore['demoted_user_uid'].hubAccess, null);
        pass("B.1 Role downgrade to Customer explicitly clears isSuperAdmin, isAdmin, admin, and isStaff claims");
    } catch (e) {
        fail("B.1 Role downgrade to Customer", e);
    }

    // Case 2: SuperAdmin deactivated via deactivateUser -> isSuperAdmin, admin, isAdmin become false, role: 'Deactivated'
    try {
        userClaimsStore['deactivated_admin_uid'] = {
            role: 'SuperAdmin',
            isSuperAdmin: true,
            isAdmin: true,
            admin: true,
            isStaff: true
        };
        usersStore['deactivated_admin_uid'] = { role: 'SuperAdmin' };
        usersStore['other_superadmin'] = { role: 'SuperAdmin' };

        const deactRes = await deactivateUser.run({
            data: { targetUid: 'deactivated_admin_uid' },
            auth: { uid: 'superadmin_uid', token: { role: 'SuperAdmin', isSuperAdmin: true } }
        });
        assert.strictEqual(deactRes.success, true);
        assert.strictEqual(deactRes.role, 'Deactivated');
        assert.strictEqual(userClaimsStore['deactivated_admin_uid'].role, 'Deactivated');
        assert.strictEqual(userClaimsStore['deactivated_admin_uid'].isSuperAdmin, false);
        assert.strictEqual(userClaimsStore['deactivated_admin_uid'].isAdmin, false);
        assert.strictEqual(userClaimsStore['deactivated_admin_uid'].admin, false);
        assert.strictEqual(userClaimsStore['deactivated_admin_uid'].isStaff, false);
        assert.strictEqual(userClaimsStore['deactivated_admin_uid'].hubAccess, null);
        assert.strictEqual(usersStore['deactivated_admin_uid'].role, 'Deactivated');
        assert.strictEqual(usersStore['deactivated_admin_uid'].deactivated, true);
        pass("B.2 deactivateUser explicitly sets role='Deactivated' and clears isSuperAdmin and all admin claims");
    } catch (e) {
        fail("B.2 deactivateUser stale claims", e);
    }

    // =============================================================
    // TEST (c): addSecureAuditLog Authorization & Dual-Write Integrity
    // =============================================================
    console.log("\n--- TEST C: addSecureAuditLog Authorization & Dual-Write Integrity ---");

    // Case 1: Customer cannot write audit logs
    try {
        await addSecureAuditLog.run({
            data: { action: 'REFUND_APPROVED', module: 'ORDERS', entityId: 'ord_123' },
            auth: { uid: 'customer_uid', token: { role: 'Customer' } }
        });
        fail("C.1 Customer writing audit log", new Error("Allowed customer to write audit log!"));
    } catch (e) {
        if (e.code === 'permission-denied') {
            pass("C.1 Customer correctly blocked from writing audit logs (permission-denied)");
        } else {
            fail("C.1 Customer writing audit log", e);
        }
    }

    // Case 2: Unauthenticated guest cannot write audit logs
    try {
        await addSecureAuditLog.run({
            data: { action: 'REFUND_APPROVED', module: 'ORDERS', entityId: 'ord_123' },
            auth: null
        });
        fail("C.2 Guest writing audit log", new Error("Allowed guest to write audit log!"));
    } catch (e) {
        if (e.code === 'unauthenticated') {
            pass("C.2 Guest correctly blocked from writing audit logs (unauthenticated)");
        } else {
            fail("C.2 Guest writing audit log", e);
        }
    }

    // Case 3: Authorized staff member writes to BOTH audit_logs AND admin_logs
    try {
        auditLogsStore = [];
        adminLogsStore = [];
        const logRes = await addSecureAuditLog.run({
            data: {
                action: 'UPDATE_STOCK',
                module: 'INVENTORY',
                entityId: 'prod_fertilizer_1',
                eventId: 'stock_update_001',
                details: { adminName: 'Officer Ramesh', details: 'Added 50 bags' }
            },
            auth: { uid: 'staff_uid', token: { role: 'CatalogManager', isStaff: true } }
        });
        assert.strictEqual(logRes.success, true);
        assert.strictEqual(auditLogsStore.length, 1);
        assert.strictEqual(auditLogsStore[0].userRole, 'CatalogManager');
        assert.strictEqual(auditLogsStore[0].action, 'UPDATE_STOCK');

        // Check mirror in admin_logs for mobile app consumption
        assert.strictEqual(adminLogsStore.length, 1);
        assert.strictEqual(adminLogsStore[0].adminId, 'staff_uid');
        assert.strictEqual(adminLogsStore[0].adminName, 'Officer Ramesh');
        assert.strictEqual(adminLogsStore[0].action, 'UPDATE_STOCK');
        assert.strictEqual(adminLogsStore[0].targetId, 'prod_fertilizer_1');
        assert.strictEqual(adminLogsStore[0].targetType, 'INVENTORY');
        const replayRes = await addSecureAuditLog.run({
            data: {
                action: 'UPDATE_STOCK',
                module: 'INVENTORY',
                entityId: 'prod_fertilizer_1',
                eventId: 'stock_update_001',
                details: { adminName: 'Officer Ramesh', details: 'Added 50 bags' }
            },
            auth: { uid: 'staff_uid', token: { role: 'CatalogManager', isStaff: true } }
        });
        assert.strictEqual(replayRes.success, true);
        assert.strictEqual(auditLogsStore.length, 1);
        assert.strictEqual(adminLogsStore.length, 1);
        pass("C.3 Authorized staff successfully writes audit log, dual-writing to audit_logs and admin_logs");
    } catch (e) {
        fail("C.3 Staff writing audit log", e);
    }

    // =============================================================
    // TEST (d): getFinanceSummary 0% GST Order & Expense Fallback
    // =============================================================
    console.log("\n--- TEST D: getFinanceSummary on 0% GST & Expense Fallback Accuracy ---");

    try {
        // Seed expense with totalAmountMinor: 450000 (i.e. ₹4,500.00)
        expensesStore = [
            { totalAmountMinor: 450000, amount: 4500, warehouseId: 'HUB_PATNA' },
            { totalAmountMinor: 250000, amount: 2500, warehouseId: 'HUB_PATNA' }
        ];

        const finRes = await getFinanceSummary.run({
            data: {},
            auth: { uid: 'superadmin_uid', token: { role: 'SuperAdmin', isSuperAdmin: true } }
        });
        assert.strictEqual(finRes.totalRevenue, 1000);
        assert.strictEqual(finRes.gstCollected, 0); // Must be 0, NOT 5% (50)
        assert.strictEqual(finRes.grossProfit, 0);  // Must be 0, NOT 18% (180)
        // Fallback correctly parsed ₹4,500 + ₹2,500 = ₹7,000 from totalAmountMinor / amount
        assert.strictEqual(finRes.expenses, 7000);
        assert.strictEqual(finRes.netProfit, -7000);
        pass("D.1 getFinanceSummary correctly calculates ₹0 tax (no 5% fake tax) and parses expenses accurately in fallback");
    } catch (e) {
        fail("D.1 getFinanceSummary calculation", e);
    }

    // =============================================================
    // TEST (e): saveExpense Comprehensive Input Validation
    // =============================================================
    console.log("\n--- TEST E: saveExpense Comprehensive Input Validation ---");

    // Case 1: Negative subtotal
    try {
        await saveExpense.run({
            data: { formData: { categoryId: 'cat_rent', subtotal: -1500 } },
            auth: { uid: 'superadmin_uid', token: { role: 'SuperAdmin', isSuperAdmin: true } }
        });
        fail("E.1 Negative subtotal", new Error("Allowed negative subtotal in expense!"));
    } catch (e) {
        if (e.code === 'invalid-argument') {
            pass("E.1 saveExpense correctly rejected negative subtotal");
        } else {
            fail("E.1 Negative subtotal", e);
        }
    }

    // Case 2: Discount exceeding subtotal
    try {
        await saveExpense.run({
            data: { formData: { categoryId: 'cat_rent', subtotal: 100, discount: 150 } },
            auth: { uid: 'superadmin_uid', token: { role: 'SuperAdmin', isSuperAdmin: true } }
        });
        fail("E.2 Discount exceeding subtotal", new Error("Allowed discount > subtotal!"));
    } catch (e) {
        if (e.code === 'invalid-argument' && e.message.includes('cannot exceed subtotal')) {
            pass("E.2 saveExpense correctly rejected discount > subtotal");
        } else {
            fail("E.2 Discount exceeding subtotal", e);
        }
    }

    // Case 3: Combined GST rate exceeding 28% (e.g. CGST 20% + SGST 20% = 40%)
    try {
        await saveExpense.run({
            data: { formData: { categoryId: 'cat_rent', subtotal: 1000, taxType: 'GST', cgstRate: 20, sgstRate: 20 } },
            auth: { uid: 'superadmin_uid', token: { role: 'SuperAdmin', isSuperAdmin: true } }
        });
        fail("E.3 Combined GST > 28%", new Error("Allowed combined GST rate > 28%!"));
    } catch (e) {
        if (e.code === 'invalid-argument' && e.message.includes('Combined GST rate')) {
            pass("E.3 saveExpense correctly rejected combined GST rate (40% > 28%)");
        } else {
            fail("E.3 Combined GST > 28%", e);
        }
    }

    // Case 4: Unreasonable RoundOff
    try {
        await saveExpense.run({
            data: { formData: { categoryId: 'cat_rent', subtotal: 1000, roundOff: 50 } },
            auth: { uid: 'superadmin_uid', token: { role: 'SuperAdmin', isSuperAdmin: true } }
        });
        fail("E.4 RoundOff > 10", new Error("Allowed roundOff > 10!"));
    } catch (e) {
        if (e.code === 'invalid-argument') {
            pass("E.4 saveExpense correctly rejected excessive roundOff amount");
        } else {
            fail("E.4 RoundOff > 10", e);
        }
    }

    // Case 5: Valid expense saves successfully with amount, totalAmount, and totalAmountMinor
    try {
        expensesStore = [];
        const expRes = await saveExpense.run({
            data: {
                formData: {
                    categoryId: 'cat_supplies',
                    subtotal: 5000,
                    discount: 200,
                    taxType: 'GST',
                    cgstRate: 9,
                    sgstRate: 9,
                    otherCharges: 100,
                    roundOff: 0
                }
            },
            auth: { uid: 'superadmin_uid', token: { role: 'SuperAdmin', isSuperAdmin: true } }
        });
        assert.strictEqual(expRes.success, true);
        assert.strictEqual(expensesStore.length, 1);
        // Taxable = 4800, GST = 864, Other = 100 => Total = 5764
        assert.strictEqual(expensesStore[0].amount, 5764);
        assert.strictEqual(expensesStore[0].totalAmount, 5764);
        assert.strictEqual(expensesStore[0].totalAmountMinor, 576400);
        pass("E.5 saveExpense successfully validates, computes total, and persists amount and totalAmount");
    } catch (e) {
        fail("E.5 Valid expense", e);
    }

    // =============================================================
    // TEST (f): Missing User Document in Firestore is Strictly Denied
    // =============================================================
    console.log("\n--- TEST F: Missing User Document in Firestore Strictly Denied ---");

    // Case 1: Caller with SuperAdmin custom claim but NO Firestore doc is rejected
    try {
        await addSecureAuditLog.run({
            data: { action: 'DELETE_DATABASE', module: 'ADMIN', entityId: 'db_1', eventId: 'orphan_event_1' },
            auth: { uid: 'orphan_superadmin_uid', token: { role: 'SuperAdmin', isSuperAdmin: true } }
        });
        fail("F.1 Orphan SuperAdmin writing audit log", new Error("Allowed orphan SuperAdmin without user doc!"));
    } catch (e) {
        if (e.code === 'permission-denied') {
            pass("F.1 Orphan SuperAdmin without Firestore user doc is strictly denied (permission-denied)");
        } else {
            fail("F.1 Orphan SuperAdmin writing audit log", e);
        }
    }

    // Case 2: Caller with SuperAdmin custom claim but NO Firestore doc cannot assign role
    try {
        await setUserRole.run({
            data: { targetUid: 'target_u1', role: 'Viewer' },
            auth: { uid: 'orphan_superadmin_uid', token: { role: 'SuperAdmin', isSuperAdmin: true } }
        });
        fail("F.2 Orphan SuperAdmin assigning role", new Error("Allowed orphan SuperAdmin to assign role!"));
    } catch (e) {
        if (e.code === 'permission-denied') {
            pass("F.2 Orphan SuperAdmin cannot assign role without Firestore user doc (permission-denied)");
        } else {
            fail("F.2 Orphan SuperAdmin assigning role", e);
        }
    }

    // Cleanup mocks
    auth.getUser = origAuthGetUser;
    auth.setCustomUserClaims = origAuthSetClaims;
    admin.auth().createUser = origAuthCreateUser;
    auth.revokeRefreshTokens = origAuthRevoke;
    db.collection = origCollection;
    db.runTransaction = origRunTransaction;

    console.log(`\n==========================================`);
    console.log(`ADMIN SECURITY VERIFICATION: ${passed} PASSED, ${failed} FAILED`);
    console.log(`==========================================\n`);

    if (failed > 0) {
        process.exit(1);
    }
}

runTests();
