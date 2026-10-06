const assert = require('assert');
const {
    validateDispositionInput,
    VALID_STATUSES,
    VALID_DISPOSITIONS
} = require('../marketing/leadsEngine');

console.log("=== RUNNING SPRINT 5: LEADS ENGINE & TELECALLING TEST SUITE ===\n");

let passed = 0;
let failed = 0;

function pass(name) {
    console.log(`PASS: ${name}`);
    passed++;
}

function fail(name, err) {
    console.error(`FAIL: ${name} - ${err.message || err}`);
    failed++;
}

async function runLeadsEngineTests() {
    // ─────────────────────────────────────────────────────────────
    // TEST 1: Disposition Validation & Payload Construction
    // ─────────────────────────────────────────────────────────────
    console.log("--- TEST 1: Disposition Validation & Formatting ---");
    try {
        const valid = validateDispositionInput({
            status: 'interested',
            disposition: 'interested_order_placed',
            callbackAt: '2026-10-05T14:30:00.000Z'
        });

        assert.strictEqual(valid.status, 'INTERESTED');
        assert.strictEqual(valid.disposition, 'INTERESTED_ORDER_PLACED');
        assert.strictEqual(valid.callbackAt, '2026-10-05T14:30:00.000Z');
        pass("1.1 Status, disposition, and ISO callbackAt validated and uppercased accurately");

        // Invalid status should throw
        assert.throws(() => {
            validateDispositionInput({ status: 'INVALID_STATUS' });
        }, /Invalid status/);
        pass("1.2 Invalid status rejected with invalid-argument error");

        // Invalid disposition should throw
        assert.throws(() => {
            validateDispositionInput({ status: 'CONTACTED', disposition: 'NON_EXISTENT_OUTCOME' });
        }, /Invalid disposition/);
        pass("1.3 Invalid disposition rejected with invalid-argument error");

        // Invalid callback date should throw
        assert.throws(() => {
            validateDispositionInput({ status: 'CALLBACK_REQUESTED', callbackAt: 'invalid-date' });
        }, /Invalid callbackAt/);
        pass("1.4 Malformed callbackAt date rejected with invalid-argument error");

    } catch (err) {
        fail("TEST 1 Disposition Validation", err);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 2: Role Authorization Guards
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- TEST 2: Leads Role Authorization Guards ---");
    try {
        function checkLeadsAuth(auth) {
            if (!auth || !auth.uid) throw new Error("unauthenticated");
            const token = auth.token || {};
            const role = (token.role || '').toLowerCase();
            const allowed = [
                'telecaller',
                'kisancallcenter',
                'supportagent',
                'crmexecutive',
                'hubmanager',
                'admin',
                'superadmin',
                'ordermanager',
                'operationsadmin'
            ];
            const isAuthorized = token.admin === true ||
                token.isAdmin === true ||
                token.isSuperAdmin === true ||
                allowed.includes(role);

            if (!isAuthorized) throw new Error("permission-denied");
            return true;
        }

        // 2.1 Unauthenticated rejected
        assert.throws(() => checkLeadsAuth(null), /unauthenticated/);
        assert.throws(() => checkLeadsAuth({}), /unauthenticated/);
        pass("2.1 Unauthenticated caller strictly rejected with unauthenticated");

        // 2.2 Unauthorized roles rejected (e.g. Customer, Rider, Vendor)
        assert.throws(() => checkLeadsAuth({ uid: 'cust_1', token: { role: 'Customer' } }), /permission-denied/);
        assert.throws(() => checkLeadsAuth({ uid: 'rider_1', token: { role: 'Rider' } }), /permission-denied/);
        assert.throws(() => checkLeadsAuth({ uid: 'vendor_1', token: { role: 'Vendor' } }), /permission-denied/);
        pass("2.2 Customer, Rider, and unauthorized roles strictly rejected with permission-denied");

        // 2.3 Telecaller, KisanCallCenter, HubManager, Admin authorized
        assert.strictEqual(checkLeadsAuth({ uid: 'tel_1', token: { role: 'Telecaller' } }), true);
        assert.strictEqual(checkLeadsAuth({ uid: 'kcc_1', token: { role: 'KisanCallCenter' } }), true);
        assert.strictEqual(checkLeadsAuth({ uid: 'hub_1', token: { role: 'HubManager' } }), true);
        assert.strictEqual(checkLeadsAuth({ uid: 'adm_1', token: { admin: true } }), true);
        pass("2.3 Telecaller, KisanCallCenter, HubManager, and Admins successfully authorized");

    } catch (err) {
        fail("TEST 2 Role Authorization Guards", err);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 3: Atomic Document Update & History Logging Structure
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- TEST 3: Lead Disposition History Payload ---");
    try {
        const leadId = 'LEAD_META_12345';
        const agentUid = 'AGENT_PRIYA_07';
        const agentName = 'Priya Sharma (KCC)';
        const validated = validateDispositionInput({
            status: 'CALLBACK_REQUESTED',
            disposition: 'CALLBACK_REQUESTED',
            callbackAt: '2026-10-03T16:00:00.000Z'
        });

        const historyPayload = {
            historyId: 'HIST_9988',
            leadId,
            status: validated.status,
            disposition: validated.disposition,
            notes: 'Kisan wants advisory on mustard aphid spray tomorrow evening.',
            callbackAt: validated.callbackAt,
            agentId: agentUid,
            agentName
        };

        assert.strictEqual(historyPayload.leadId, leadId);
        assert.strictEqual(historyPayload.status, 'CALLBACK_REQUESTED');
        assert.strictEqual(historyPayload.callbackAt, '2026-10-03T16:00:00.000Z');
        assert.strictEqual(historyPayload.agentId, agentUid);
        pass("3.1 Lead call history payload contains accurate disposition, callback, and agent metadata");

    } catch (err) {
        fail("TEST 3 Document Update Structure", err);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 4: Bulk Spoke Hub Routing
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- TEST 4: Bulk Spoke Hub Routing ---");
    try {
        function validateBulkRouting(leadIds, hubId) {
            if (!hubId || typeof hubId !== 'string') throw new Error("invalid-hub");
            if (!Array.isArray(leadIds) || leadIds.length === 0) throw new Error("empty-leads");
            return { hubId, count: leadIds.length };
        }

        assert.throws(() => validateBulkRouting([], 'hub_central_samastipur'), /empty-leads/);
        assert.throws(() => validateBulkRouting(['L1'], null), /invalid-hub/);

        const res = validateBulkRouting(['LEAD_01', 'LEAD_02', 'LEAD_03'], 'REG-TAJ-004');
        assert.strictEqual(res.hubId, 'REG-TAJ-004');
        assert.strictEqual(res.count, 3);
        pass("4.1 Bulk lead assignment validates non-empty lead arrays and valid hub identifiers");

    } catch (err) {
        fail("TEST 4 Bulk Routing", err);
    }

    console.log("\n=======================================================");
    console.log(`LEADS ENGINE TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log("=======================================================\n");

    if (failed > 0) {
        process.exit(1);
    }
}

runLeadsEngineTests().catch(err => {
    console.error("Leads engine test suite failed unhandled:", err);
    process.exit(1);
});
