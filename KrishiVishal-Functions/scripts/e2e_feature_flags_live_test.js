const admin = require('firebase-admin');
const assert = require('assert');

try {
  admin.app();
} catch {
  admin.initializeApp({ projectId: 'krishivishal-a9ed7' });
}

const db = admin.firestore();
const { applyFlagUpdate } = require('../featureFlags/dist/updateFeatureFlag');
const { resolveFlag, validateValue } = require('../featureFlags/dist/flagRegistry');
const { assertCheckoutAllowed } = require('../featureFlags/dist/enforcement');

async function runE2ETest() {
  console.log('=== STARTING COMPLETE E2E LIVE TEST FOR SYSTEM CONTROLS ===\n');

  // 1. Fetch current global doc
  const globalRef = db.doc('system_configs/global');
  const snapBefore = await globalRef.get();
  assert(snapBefore.exists, 'system_configs/global must exist');
  const initialData = snapBefore.data();
  const initialVersion = initialData.version || 0;
  console.log(`[PASS 1] Verified initial live state: v${initialVersion}, maintenanceMode: ${initialData.maintenanceMode}`);

  // Test Caller (SuperAdmin)
  const superAdminCaller = {
    uid: 'GqgzP80yj9hz2ZjCqP8tP9CfeSP2',
    email: 'sanjaysmt10@gmail.com',
    claims: { role: 'SuperAdmin', isSuperAdmin: true, isAdmin: true, admin: true },
    ip: '127.0.0.1'
  };

  // 2. Test Concurrency: passing wrong expectedVersion must fail with aborted
  console.log('\n[PASS 2] Testing Concurrency / Stale Version Rejection...');
  const resolved = resolveFlag(null, 'maintenanceMode').value;
  try {
    await applyFlagUpdate(db, superAdminCaller, {
      hubId: null,
      flag: resolved,
      newValue: !initialData.maintenanceMode,
      reason: 'Testing optimistic concurrency failure',
      expectedVersion: initialVersion + 999 // wrong version
    }, 'super_admin');
    assert.fail('Should have thrown aborted error for wrong version');
  } catch (err) {
    assert.strictEqual(err.code, 'aborted', `Expected aborted error code, got ${err.code}`);
    console.log('  -> Successfully rejected with conflict error (aborted) when expectedVersion does not match');
  }

  // 3. Test RBAC: Non-admin caller modifying global switch must be rejected
  console.log('\n[PASS 3] Testing RBAC / Unauthorized Access Rejection...');
  const hubManagerCaller = {
    uid: 'LFVaaTvaVaelYmA6HyJB9PWqzFu1',
    email: 'hubmanager@krishivishal.com',
    claims: { role: 'HubManager', hubId: 'HUB-SAM-001' },
    ip: '127.0.0.1'
  };
  try {
    const { authorize } = require('../featureFlags/dist/updateFeatureFlag');
    authorize(hubManagerCaller.claims, null);
    assert.fail('HubManager should not be authorized to change global switches');
  } catch (err) {
    assert.strictEqual(err.code, 'permission-denied', `Expected permission-denied, got ${err.code}`);
    console.log('  -> Successfully blocked non-admin user from modifying global kill switch');
  }

  // 4. Test Valid Flag Update via Transaction: Toggle maintenanceMode to false (normal state)
  console.log('\n[PASS 4] Testing Live Update & Audit Trail Write...');
  const currentSnap = await globalRef.get();
  const currentVer = currentSnap.data().version;
  const initialMaintenance = currentSnap.data().maintenanceMode;
  const flippedValue = !initialMaintenance;

  console.log(`  -> Flipping maintenanceMode: ${initialMaintenance} -> ${flippedValue}`);
  const updateResult = await applyFlagUpdate(db, superAdminCaller, {
    hubId: null,
    flag: resolved,
    newValue: flippedValue,
    reason: 'E2E automated verification: step 1 flag toggle test',
    expectedVersion: currentVer
  }, 'super_admin');

  console.log(`  -> Update result: changed=${updateResult.changed}, newVersion=${updateResult.version}`);
  const postUpdateSnap = await globalRef.get();
  assert.strictEqual(postUpdateSnap.data().maintenanceMode, flippedValue);
  assert.strictEqual(postUpdateSnap.data().version, updateResult.version);
  console.log('  -> Live Firestore document confirmed updated with new version');

  // Restore back to original state
  console.log(`  -> Restoring maintenanceMode back: ${flippedValue} -> ${initialMaintenance}`);
  const restoreResult = await applyFlagUpdate(db, superAdminCaller, {
    hubId: null,
    flag: resolved,
    newValue: initialMaintenance,
    reason: 'E2E automated verification: step 2 restore original state',
    expectedVersion: updateResult.version
  }, 'super_admin');
  assert.strictEqual(restoreResult.changed, true);
  console.log(`  -> Restored successfully to v${restoreResult.version}`);

  // 5. Verify Audit Log Entry
  let auditQuery;
  try {
    auditQuery = await db.collection('system_config_audit')
      .where('configDoc', '==', 'system_configs/global')
      .orderBy('at', 'desc')
      .limit(1)
      .get();
  } catch (indexErr) {
    console.log('  [Notice] Composite index still building in Cloud, querying by timestamp:');
    auditQuery = await db.collection('system_config_audit')
      .orderBy('at', 'desc')
      .limit(5)
      .get();
  }

  assert(auditQuery.size >= 1, 'Audit log entry must be created');
  const auditDoc = auditQuery.docs[0].data();
  assert.strictEqual(auditDoc.flagPath, 'maintenanceMode');
  assert.strictEqual(auditDoc.updatedByEmail, 'sanjaysmt10@gmail.com');
  console.log(`[PASS 5] Verified audit trail record created: docId=${auditQuery.docs[0].id}, reason="${auditDoc.reason}"`);

  // 6. Test Checkout Enforcement Integration
  console.log('\n[PASS 6] Testing Order Checkout Enforcement...');
  // Normal state -> assertCheckoutAllowed should pass
  await assertCheckoutAllowed({ hubId: 'HUB-SAM-001', paymentMethod: 'COD' });
  console.log('  -> Normal state: assertCheckoutAllowed PASSED for COD');

  await assertCheckoutAllowed({ hubId: 'HUB-SAM-001', paymentMethod: 'RAZORPAY_ONLINE' });
  console.log('  -> Normal state: assertCheckoutAllowed PASSED for RAZORPAY_ONLINE');

  // Test Decision logic when blocked
  const { evaluateCheckout } = require('../featureFlags/dist/enforcement');
  const blockedMaintenance = evaluateCheckout({
    maintenanceMode: true,
    checkoutFrozen: false,
    paymentsOnlineEnabled: true,
    codEnabledGlobal: true,
    hubLockdown: false,
    hubAcceptingOrders: true,
    codEnabledHub: true
  });
  assert.strictEqual(blockedMaintenance.allowed, false);
  assert.strictEqual(blockedMaintenance.code, 'MAINTENANCE_MODE');
  console.log('  -> Maintenance mode gate: evaluateCheckout correctly returns MAINTENANCE_MODE');

  const blockedFrozen = evaluateCheckout({
    maintenanceMode: false,
    checkoutFrozen: true,
    paymentsOnlineEnabled: true,
    codEnabledGlobal: true,
    hubLockdown: false,
    hubAcceptingOrders: true,
    codEnabledHub: true
  });
  assert.strictEqual(blockedFrozen.allowed, false);
  assert.strictEqual(blockedFrozen.code, 'CHECKOUT_FROZEN');
  console.log('  -> Checkout frozen gate: evaluateCheckout correctly returns CHECKOUT_FROZEN');

  const blockedOnline = evaluateCheckout({
    maintenanceMode: false,
    checkoutFrozen: false,
    paymentsOnlineEnabled: false,
    codEnabledGlobal: true,
    hubLockdown: false,
    hubAcceptingOrders: true,
    codEnabledHub: true
  }, 'RAZORPAY_ONLINE');
  assert.strictEqual(blockedOnline.allowed, false);
  assert.strictEqual(blockedOnline.code, 'ONLINE_PAYMENTS_DISABLED');
  console.log('  -> Online payments gate: evaluateCheckout correctly returns ONLINE_PAYMENTS_DISABLED');

  const blockedCod = evaluateCheckout({
    maintenanceMode: false,
    checkoutFrozen: false,
    paymentsOnlineEnabled: true,
    codEnabledGlobal: false,
    hubLockdown: false,
    hubAcceptingOrders: true,
    codEnabledHub: true
  }, 'COD');
  assert.strictEqual(blockedCod.allowed, false);
  assert.strictEqual(blockedCod.code, 'COD_DISABLED');
  console.log('  -> COD payments gate: evaluateCheckout correctly returns COD_DISABLED');

  console.log('\n======================================================');
  console.log('🎉 ALL END-TO-END VERIFICATION CHECKS PASSED PERFECTLY!');
  console.log('======================================================');
}

runE2ETest().then(() => process.exit(0)).catch((err) => {
  console.error('\n❌ E2E TEST FAILED:', err);
  process.exit(1);
});
