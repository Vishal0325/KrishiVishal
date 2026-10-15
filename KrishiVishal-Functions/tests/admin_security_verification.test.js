/**
 * ADMIN SECURITY & HARDENING VERIFICATION TEST SUITE
 * Verifies fixes for:
 * 1. Privilege Escalation Prevention in createStaffMember
 * 2. Stale Claims Removal on setUserRole (Downgrade) and deactivateUser
 * 3. Lock addSecureAuditLog to Authorized Staff/Admin Only
 * 4. 0% GST and 0 Profit Orders in getFinanceSummary (No Fake Fallbacks)
 * 5. Strict Input Validation in saveExpense (Negative amounts & invalid tax rates rejected)
 */

const assert = require('assert');
const { createStaffMember, addSecureAuditLog, getFinanceSummary, saveExpense } = require('../admin/adminServices');
const { setUserRole, deactivateUser } = require('../auth/roleProvisioning');
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
    let usersStore = {};
    let auditLogsStore = [];
    let revokedTokens = [];

    const origAuthGetUser = auth.getUser;
    const origAuthSetClaims = auth.setCustomUserClaims;
    const origAuthCreateUser = admin.auth().createUser;
    const origAuthRevoke = auth.revokeRefreshTokens;
    const origCollection = db.collection;

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
                add: async (doc) => {
                    auditLogsStore.push(doc);
                    return { id: `audit_${auditLogsStore.length}` };
                }
            };
        }
        if (colName === 'expenses') {
            return {
                add: async (doc) => ({ id: 'exp_doc_1' }),
                doc: (id) => ({
                    update: async (doc) => {}
                }),
                limit: () => ({ get: async () => [] })
            };
        }
        if (colName === 'orders') {
            return {
                where: () => ({
                    get: async () => [
                        {
                            id: 'ord_zero_tax',
                            data: () => ({
                                status: 'DELIVERED',
                                totalAmount: 1000,
                                cgst: 0,
                                sgst: 0,
                                igst: 0,
                                grossProfit: 0
                            })
                        }
                    ]
                }),
                get: async () => [
                    {
                        id: 'ord_zero_tax',
                        data: () => ({
                            status: 'DELIVERED',
                            totalAmount: 1000,
                            cgst: 0,
                            sgst: 0,
                            igst: 0,
                            grossProfit: 0
                        })
                    }
                ]
            };
        }
        if (colName === 'ledger') {
            return {
                where: () => ({
                    where: () => ({
                        get: async () => []
                    }),
                    get: async () => []
                })
            };
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
        // Ensure another superadmin exists so last superadmin guard passes
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
    // TEST (c): addSecureAuditLog Authorization
    // =============================================================
    console.log("\n--- TEST C: addSecureAuditLog Authorization Guards ---");

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

    // Case 3: Authorized staff member CAN write audit log and role is authoritative
    try {
        auditLogsStore = [];
        const logRes = await addSecureAuditLog.run({
            data: { action: 'UPDATE_STOCK', module: 'INVENTORY', entityId: 'prod_fertilizer_1', details: { qty: 50 } },
            auth: { uid: 'staff_uid', token: { role: 'CatalogManager', isStaff: true } }
        });
        assert.strictEqual(logRes.success, true);
        assert.strictEqual(auditLogsStore.length, 1);
        assert.strictEqual(auditLogsStore[0].action, 'UPDATE_STOCK');
        assert.strictEqual(auditLogsStore[0].userRole, 'CatalogManager'); // Verified from token, not fake "Admin"
        pass("C.3 Authorized staff successfully writes audit log with token-derived role");
    } catch (e) {
        fail("C.3 Staff writing audit log", e);
    }

    // =============================================================
    // TEST (d): getFinanceSummary 0% GST Order & 0 Gross Profit
    // =============================================================
    console.log("\n--- TEST D: getFinanceSummary on 0% GST & 0 Gross Profit ---");

    try {
        const finRes = await getFinanceSummary.run({
            data: {},
            auth: { uid: 'superadmin_uid', token: { role: 'SuperAdmin', isSuperAdmin: true } }
        });
        assert.strictEqual(finRes.totalRevenue, 1000);
        // Previously: (cgst + sgst + igst) || (amt * 0.05) evaluated 0 || 50 = 50
        // Now: must be 0!
        assert.strictEqual(finRes.gstCollected, 0);
        // Previously: Number(grossProfit) || (amt * 0.18) evaluated 0 || 180 = 180
        // Now: must be 0!
        assert.strictEqual(finRes.grossProfit, 0);
        pass("D.1 getFinanceSummary correctly calculates ₹0 tax (no 5% fake tax) and ₹0 profit (no 18% fake profit) on 0-value items");
    } catch (e) {
        fail("D.1 getFinanceSummary calculation", e);
    }

    // =============================================================
    // TEST (e): saveExpense Strict Input Validation
    // =============================================================
    console.log("\n--- TEST E: saveExpense Strict Input Validation ---");

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

    // Case 2: Negative other charges
    try {
        await saveExpense.run({
            data: { formData: { categoryId: 'cat_rent', subtotal: 1000, otherCharges: -200 } },
            auth: { uid: 'superadmin_uid', token: { role: 'SuperAdmin', isSuperAdmin: true } }
        });
        fail("E.2 Negative other charges", new Error("Allowed negative other charges!"));
    } catch (e) {
        if (e.code === 'invalid-argument') {
            pass("E.2 saveExpense correctly rejected negative other charges");
        } else {
            fail("E.2 Negative other charges", e);
        }
    }

    // Case 3: Invalid GST rate (> 28%)
    try {
        await saveExpense.run({
            data: { formData: { categoryId: 'cat_rent', subtotal: 1000, taxType: 'GST', cgstRate: 40 } },
            auth: { uid: 'superadmin_uid', token: { role: 'SuperAdmin', isSuperAdmin: true } }
        });
        fail("E.3 GST rate > 28%", new Error("Allowed GST rate > 28%!"));
    } catch (e) {
        if (e.code === 'invalid-argument') {
            pass("E.3 saveExpense correctly rejected GST rate > 28%");
        } else {
            fail("E.3 GST rate > 28%", e);
        }
    }

    // Case 4: Valid expense saves successfully
    try {
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
        assert.strictEqual(expRes.id, 'exp_doc_1');
        pass("E.4 saveExpense successfully calculates and stores valid expense");
    } catch (e) {
        fail("E.4 Valid expense", e);
    }

    // Cleanup mocks
    auth.getUser = origAuthGetUser;
    auth.setCustomUserClaims = origAuthSetClaims;
    admin.auth().createUser = origAuthCreateUser;
    auth.revokeRefreshTokens = origAuthRevoke;
    db.collection = origCollection;

    console.log(`\n==========================================`);
    console.log(`ADMIN SECURITY VERIFICATION: ${passed} PASSED, ${failed} FAILED`);
    console.log(`==========================================\n`);

    if (failed > 0) {
        process.exit(1);
    }
}

runTests();
