/**
 * Feature flags / kill switches: unit tests (no emulator, no network).
 * Requires the compiled TS output: `npm run build:flags` (done automatically by `npm test` via pretest).
 */
const assert = require('assert');
const path = require('path');

const dist = (f) => require(path.join(__dirname, '..', 'featureFlags', 'dist', f));
const registry = dist('flagRegistry');
const { ConfigCache } = dist('configCache');
const enforcement = dist('enforcement');
const upd = dist('updateFeatureFlag');

let passed = 0;
async function test(name, fn) {
    try {
        await fn();
        passed++;
        console.log(`  ok  ${name}`);
    } catch (e) {
        console.error(`  FAIL ${name}\n`, e);
        process.exitCode = 1;
        throw e;
    }
}

async function rejects(promiseOrFn, code, detailsCode) {
    try {
        await (typeof promiseOrFn === 'function' ? promiseOrFn() : promiseOrFn);
    } catch (e) {
        assert.strictEqual(e.code, code, `expected ${code}, got ${e.code}: ${e.message}`);
        if (detailsCode) assert.strictEqual(e.details && e.details.code, detailsCode);
        return e;
    }
    assert.fail(`expected rejection with ${code}`);
}
function throwsCode(fn, code) {
    try { fn(); } catch (e) { assert.strictEqual(e.code, code, `expected ${code}, got ${e.code}: ${e.message}`); return e; }
    assert.fail(`expected throw ${code}`);
}

// ---------------- fake Firestore (just enough for applyFlagUpdate) ----------------
const isPlain = (v) => v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype;
function deepMerge(base, patch) {
    const out = { ...base };
    for (const [k, v] of Object.entries(patch)) out[k] = isPlain(v) && isPlain(out[k]) ? deepMerge(out[k], v) : v;
    return out;
}
function makeDb(seed = {}) {
    const store = new Map(Object.entries(seed));
    let auto = 0;
    const db = {
        store,
        doc: (p) => ({ path: p }),
        collection: (c) => ({ doc: (id) => ({ path: `${c}/${id ?? `auto${++auto}`}` }) }),
        async runTransaction(cb) {
            const writes = [];
            const tx = {
                async get(ref) {
                    const d = store.get(ref.path);
                    return { exists: d !== undefined, data: () => (d === undefined ? undefined : structuredClone(d)) };
                },
                set(ref, data, opts) { writes.push([ref.path, data, opts]); },
            };
            const result = await cb(tx);
            for (const [p, data, opts] of writes) store.set(p, opts && opts.merge ? deepMerge(store.get(p) || {}, data) : data);
            return result;
        },
    };
    return db;
}
const SUPER = { role: 'SuperAdmin' };
const hm = (hubId) => ({ role: 'HubManager', hubId, hubAccess: 'SINGLE' });
const caller = (claims) => ({ uid: 'u1', email: 'u1@x.in', claims, ip: '1.2.3.4' });
const input = (o) => upd.validateInput({ expectedVersion: 0, reason: 'Razorpay webhook failing TICKET-1', ...o });
const audits = (db) => [...db.store.entries()].filter(([k]) => k.startsWith('system_config_audit/')).map(([, v]) => v);

(async () => {
    console.log('flagRegistry');
    await test('resolves known flags and slot paths, rejects unknown / prototype keys', () => {
        assert.ok(registry.resolveFlag(null, 'checkoutFrozen').ok);
        assert.ok(!registry.resolveFlag(null, 'lockdown').ok, 'hub flag not valid on global');
        assert.ok(!registry.resolveFlag('h1', 'checkoutFrozen').ok, 'global flag not valid on hub');
        assert.ok(registry.resolveFlag('h1', 'slotVisibility.slot_0900').ok);
        for (const bad of ['slotVisibility', 'slotVisibility.', 'slotVisibility.a.b', 'slotVisibility.a b', '__proto__', 'constructor', 'toString']) {
            assert.ok(!registry.resolveFlag('h1', bad).ok && !registry.resolveFlag(null, bad).ok, bad);
        }
    });
    await test('strict value validation (no coercion)', () => {
        const b = registry.resolveFlag(null, 'checkoutFrozen').value;
        for (const bad of ['true', 1, 0, null, undefined, {}]) assert.ok(!registry.validateValue(b, bad).ok, String(bad));
        assert.ok(registry.validateValue(b, true).ok);
        const n = registry.resolveFlag(null, 'minVersionCode').value;
        for (const bad of [-1, 1.5, NaN, Infinity, '12', 1e9]) assert.ok(!registry.validateValue(n, bad).ok, String(bad));
        assert.ok(registry.validateValue(n, 120).ok);
    });
    await test('HUB_ID_RE blocks path injection but allows existing id styles', () => {
        for (const bad of ['a/b', '..', '.', '__x__', '', 'x'.repeat(129)]) assert.ok(!registry.HUB_ID_RE.test(bad), bad);
        for (const ok of ['hub_pune_01', 'HUB-PNQ', 'AbC123xyz', 'hub.1']) assert.ok(registry.HUB_ID_RE.test(ok), ok);
    });

    console.log('validateInput / authorize');
    await test('critical switches require a reason >= 10 chars; non-critical do not', () => {
        throwsCode(() => upd.validateInput({ flagPath: 'checkoutFrozen', newValue: true, expectedVersion: 0, reason: 'short' }), 'invalid-argument');
        throwsCode(() => upd.validateInput({ flagPath: 'lockdown', hubId: 'h1', newValue: true, expectedVersion: 0 }), 'invalid-argument');
        upd.validateInput({ flagPath: 'acceptingOrders', hubId: 'h1', newValue: false, expectedVersion: 0 });
    });
    await test('requires expectedVersion, newValue, valid hubId', () => {
        throwsCode(() => upd.validateInput({ flagPath: 'acceptingOrders', hubId: 'h1', newValue: false }), 'invalid-argument');
        throwsCode(() => upd.validateInput({ flagPath: 'acceptingOrders', hubId: 'h1', expectedVersion: 0 }), 'invalid-argument');
        throwsCode(() => upd.validateInput({ flagPath: 'acceptingOrders', hubId: '../x', newValue: false, expectedVersion: 0 }), 'invalid-argument');
        throwsCode(() => upd.validateInput({ flagPath: 'acceptingOrders', hubId: 'h1', newValue: false, expectedVersion: -1 }), 'invalid-argument');
        throwsCode(() => upd.validateInput(null), 'invalid-argument');
        throwsCode(() => upd.validateInput({ flagPath: 'x', newValue: 1, expectedVersion: 0, reason: 'x'.repeat(501) }), 'invalid-argument');
    });
    await test('RBAC matrix', () => {
        assert.strictEqual(upd.authorize(SUPER, null), 'super_admin');
        assert.strictEqual(upd.authorize(SUPER, 'h1'), 'super_admin');
        assert.strictEqual(upd.authorize({ role: 'SUPER_ADMIN' }, null), 'super_admin');
        assert.strictEqual(upd.authorize(hm('h1'), 'h1'), 'hub_manager');
        throwsCode(() => upd.authorize(hm('h1'), null), 'permission-denied');
        throwsCode(() => upd.authorize(hm('h1'), 'h2'), 'permission-denied');
        throwsCode(() => upd.authorize({ role: 'HubManager' }, 'h1'), 'permission-denied');
        throwsCode(() => upd.authorize({ role: 'WarehouseManager', hubId: 'h1' }, 'h1'), 'permission-denied');
        throwsCode(() => upd.authorize({ role: 'Viewer' }, 'h1'), 'permission-denied');
        throwsCode(() => upd.authorize({ role: 'Customer' }, null), 'permission-denied');
        throwsCode(() => upd.authorize({}, null), 'permission-denied');
        throwsCode(() => upd.authorize({ ...SUPER, isActive: false }, null), 'permission-denied');
    });

    console.log('enforcement');
    const cfg = (g, h) => enforcement.toEffectiveConfig(g, h);
    await test('evaluateCheckout: defaults allow everything', () => {
        for (const m of ['COD', 'RAZORPAY_ONLINE', 'WALLET', undefined]) assert.deepStrictEqual(enforcement.evaluateCheckout(cfg(null, null), m), { allowed: true });
    });
    await test('evaluateCheckout: each switch blocks with a stable code; most restrictive wins', () => {
        const code = (g, h, m) => enforcement.evaluateCheckout(cfg(g, h), m).code;
        assert.strictEqual(code({ maintenanceMode: true }, null), 'MAINTENANCE_MODE');
        assert.strictEqual(code({ checkoutFrozen: true }, null), 'CHECKOUT_FROZEN');
        assert.strictEqual(code(null, { lockdown: true }), 'HUB_LOCKDOWN');
        assert.strictEqual(code(null, { acceptingOrders: false }), 'HUB_NOT_ACCEPTING_ORDERS');
        assert.strictEqual(code({ codEnabled: false }, { codEnabled: true }, 'COD'), 'COD_DISABLED');
        assert.strictEqual(code({ codEnabled: true }, { codEnabled: false }, 'COD'), 'COD_DISABLED');
        assert.strictEqual(code({ paymentsOnlineEnabled: false }, null, 'RAZORPAY_ONLINE'), 'ONLINE_PAYMENTS_DISABLED');
        assert.strictEqual(code({ codEnabled: false }, null, 'WALLET'), undefined, 'COD switch must not block wallet');
        assert.strictEqual(code({ maintenanceMode: true, checkoutFrozen: true }, { lockdown: true }), 'MAINTENANCE_MODE');
    });
    await test('malformed stored values fall back to defaults (no truthy-string surprises)', () => {
        assert.deepStrictEqual(enforcement.evaluateCheckout(cfg({ checkoutFrozen: 'yes', codEnabled: 'no' }, { lockdown: 1 }), 'COD'), { allowed: true });
    });

    const reader = (map, counter) => ({ async get(p) { counter.n++; if (map instanceof Error) throw map; return map[p] ?? null; } });
    await test('assertCheckoutAllowed rejects with failed-precondition + details.code', async () => {
        const c = { n: 0 };
        const cache = new ConfigCache(reader({ 'system_configs/global': { checkoutFrozen: true } }, c));
        await rejects(enforcement.assertCheckoutAllowed({ hubId: 'h1', paymentMethod: 'COD' }, cache), 'failed-precondition', 'CHECKOUT_FROZEN');
        const cache2 = new ConfigCache(reader({ 'system_configs/hubs_h1': { lockdown: true } }, c));
        await rejects(enforcement.assertCheckoutAllowed({ hubId: 'h1' }, cache2), 'failed-precondition', 'HUB_LOCKDOWN');
        await enforcement.assertCheckoutAllowed({ hubId: 'h2' }, cache2); // other hub unaffected
    });
    await test('assertCheckoutAllowed rejects malformed hub ids', async () => {
        const cache = new ConfigCache(reader({}, { n: 0 }));
        await rejects(enforcement.assertCheckoutAllowed({ hubId: 'a/b' }, cache), 'invalid-argument');
        await rejects(enforcement.assertCheckoutAllowed({ hubId: '' }, cache), 'invalid-argument');
    });
    await test('cache: 10s TTL, coalesces concurrent reads, invalidate()', async () => {
        const c = { n: 0 };
        let t = 1000;
        const cache = new ConfigCache(reader({}, c), 10_000, 300_000, () => t);
        await Promise.all(Array.from({ length: 25 }, () => cache.getDoc('system_configs/global')));
        assert.strictEqual(c.n, 1, 'concurrent misses coalesce');
        t += 9_999; await cache.getDoc('system_configs/global'); assert.strictEqual(c.n, 1);
        t += 2; await cache.getDoc('system_configs/global'); assert.strictEqual(c.n, 2);
        cache.invalidate('system_configs/global'); await cache.getDoc('system_configs/global'); assert.strictEqual(c.n, 3);
    });
    await test('cache: stale-on-error within 5 min, otherwise fail-closed (unavailable)', async () => {
        let t = 0, fail = false;
        const r = { async get() { if (fail) throw new Error('down'); return { checkoutFrozen: true }; } };
        const cache = new ConfigCache(r, 10_000, 300_000, () => t);
        await rejects(enforcement.assertCheckoutAllowed({ hubId: 'h1' }, cache), 'failed-precondition', 'CHECKOUT_FROZEN');
        fail = true; t = 60_000; // stale but within window: frozen state still enforced
        await rejects(enforcement.assertCheckoutAllowed({ hubId: 'h1' }, cache), 'failed-precondition', 'CHECKOUT_FROZEN');
        t = 400_000; // too stale
        await rejects(enforcement.assertCheckoutAllowed({ hubId: 'h1' }, cache), 'unavailable');
        const cold = new ConfigCache({ async get() { throw new Error('down'); } });
        await rejects(enforcement.assertCheckoutAllowed({ hubId: 'h1' }, cold), 'unavailable');
    });

    console.log('applyFlagUpdate (fake transaction)');
    const WH = { 'warehouses/h1': { name: 'Pune' }, 'warehouses/h2': { name: 'Nashik' } };
    await test('creates global doc: value, version 1, flagMeta, audit record', async () => {
        const db = makeDb();
        const r = await upd.applyFlagUpdate(db, caller(SUPER), input({ flagPath: 'checkoutFrozen', newValue: true }), 'super_admin');
        assert.deepStrictEqual([r.changed, r.oldValue, r.newValue, r.version], [true, false, true, 1]);
        const g = db.store.get('system_configs/global');
        assert.strictEqual(g.checkoutFrozen, true);
        assert.strictEqual(g.paymentsOnlineEnabled, true, 'defaults seeded');
        assert.strictEqual(g.version, 1);
        assert.strictEqual(g.flagMeta.checkoutFrozen.updatedBy, 'u1');
        assert.strictEqual(g.flagMeta.checkoutFrozen.reason, 'Razorpay webhook failing TICKET-1');
        const [a] = audits(db);
        assert.deepStrictEqual(
            [a.configDoc, a.flagPath, a.oldValue, a.newValue, a.updatedBy, a.hubId, a.severity, a.version, a.ip],
            ['system_configs/global', 'checkoutFrozen', false, true, 'u1', null, 'critical', 1, '1.2.3.4'],
        );
        assert.ok(a.at && g.updatedAt, 'server timestamps present');
    });
    await test('optimistic concurrency: stale expectedVersion -> aborted with currentVersion; no writes', async () => {
        const db = makeDb({ 'system_configs/global': { version: 5, checkoutFrozen: false } });
        const e = await rejects(upd.applyFlagUpdate(db, caller(SUPER), input({ flagPath: 'checkoutFrozen', newValue: true, expectedVersion: 4 }), 'super_admin'), 'aborted');
        assert.strictEqual(e.details.currentVersion, 5);
        assert.strictEqual(audits(db).length, 0);
        assert.strictEqual(db.store.get('system_configs/global').checkoutFrozen, false);
        const ok = await upd.applyFlagUpdate(db, caller(SUPER), input({ flagPath: 'checkoutFrozen', newValue: true, expectedVersion: 5 }), 'super_admin');
        assert.strictEqual(ok.version, 6);
    });
    await test('no-op change does not bump version or write audit', async () => {
        const db = makeDb({ 'system_configs/global': { version: 3, codEnabled: true } });
        const r = await upd.applyFlagUpdate(db, caller(SUPER), input({ flagPath: 'codEnabled', newValue: true, expectedVersion: 3 }), 'super_admin');
        assert.deepStrictEqual([r.changed, r.version], [false, 3]);
        assert.strictEqual(audits(db).length, 0);
    });
    await test('minVersionCode integer flag', async () => {
        const db = makeDb();
        const r = await upd.applyFlagUpdate(db, caller(SUPER), input({ flagPath: 'minVersionCode', newValue: 120, reason: 'Force update, security fix' }), 'super_admin');
        assert.deepStrictEqual([r.oldValue, r.newValue], [0, 120]);
    });
    await test('hub: unknown hub -> not-found', async () => {
        const db = makeDb(WH);
        await rejects(upd.applyFlagUpdate(db, caller(SUPER), input({ hubId: 'ghost', flagPath: 'lockdown', newValue: true }), 'super_admin'), 'not-found');
        assert.strictEqual(db.store.has('system_configs/hubs_ghost'), false);
    });
    await test('hub slot toggles merge into slotVisibility without clobbering siblings', async () => {
        const db = makeDb(WH);
        await upd.applyFlagUpdate(db, caller(hm('h1')), input({ hubId: 'h1', flagPath: 'slotVisibility.slot_0900', newValue: false, reason: '' }), 'hub_manager');
        await upd.applyFlagUpdate(db, caller(hm('h1')), input({ hubId: 'h1', flagPath: 'slotVisibility.slot_1200', newValue: false, expectedVersion: 1, reason: '' }), 'hub_manager');
        const h = db.store.get('system_configs/hubs_h1');
        assert.deepStrictEqual(h.slotVisibility, { slot_0900: false, slot_1200: false });
        assert.strictEqual(h.hubId, 'h1');
        assert.strictEqual(h.version, 2);
        assert.strictEqual(audits(db)[0].severity, 'operational');
        assert.strictEqual(audits(db)[0].hubId, 'h1');
    });
    await test('HubManager cannot lift a SuperAdmin lockdown, but can lift their own', async () => {
        const db = makeDb(WH);
        await upd.applyFlagUpdate(db, caller(SUPER), input({ hubId: 'h1', flagPath: 'lockdown', newValue: true }), 'super_admin');
        await rejects(upd.applyFlagUpdate(db, caller(hm('h1')), input({ hubId: 'h1', flagPath: 'lockdown', newValue: false, expectedVersion: 1 }), 'hub_manager'), 'permission-denied');
        await upd.applyFlagUpdate(db, caller(hm('h2')), input({ hubId: 'h2', flagPath: 'lockdown', newValue: true }), 'hub_manager');
        const r = await upd.applyFlagUpdate(db, caller(hm('h2')), input({ hubId: 'h2', flagPath: 'lockdown', newValue: false, expectedVersion: 1 }), 'hub_manager');
        assert.strictEqual(r.changed, true);
        const r2 = await upd.applyFlagUpdate(db, caller(SUPER), input({ hubId: 'h1', flagPath: 'lockdown', newValue: false, expectedVersion: 1 }), 'super_admin');
        assert.strictEqual(r2.changed, true);
    });
    await test('adminWriteLock blocks HubManager, not SuperAdmin (break-glass incl. unlocking)', async () => {
        const db = makeDb({ ...WH, 'system_configs/global': { version: 1, adminWriteLock: true } });
        await rejects(upd.applyFlagUpdate(db, caller(hm('h1')), input({ hubId: 'h1', flagPath: 'acceptingOrders', newValue: false, reason: '' }), 'hub_manager'), 'failed-precondition');
        await upd.applyFlagUpdate(db, caller(SUPER), input({ hubId: 'h1', flagPath: 'acceptingOrders', newValue: false, reason: '' }), 'super_admin');
        const r = await upd.applyFlagUpdate(db, caller(SUPER), input({ flagPath: 'adminWriteLock', newValue: false, expectedVersion: 1, reason: 'Incident resolved, unlocking' }), 'super_admin');
        assert.strictEqual(r.changed, true);
    });

    console.log(`\n${passed} feature-flag tests passed`);
})().catch(() => { process.exitCode = 1; });
