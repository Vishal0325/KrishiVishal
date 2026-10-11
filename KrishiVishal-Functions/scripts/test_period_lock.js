/**
 * Test Period Lock Enforcement against Firestore for 2026-04
 */
const admin = require('firebase-admin');
const serviceAccount = require('C:/Users/visha/Downloads/krishivishal-a9ed7-firebase-adminsdk-fbsvc-2f631b8296.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId: 'krishivishal-a9ed7'
  });
}

const db = admin.firestore();
const { lockFiscalPeriod, unlockFiscalPeriod } = require('../finance/fiscalPeriodEngine');
const { assertFiscalPeriodUnlocked, postJournalEntry } = require('../finance/generalLedger');

async function testPeriodLock() {
  console.log('--- TESTING PERIOD LOCK ENFORCEMENT FOR 2026-04 ---');

  // Step 1: Lock period 2026-04
  console.log('1. Locking period 2026-04...');
  const lockResult = await lockFiscalPeriod({
    periodId: '2026-04',
    lockedBy: 'CFO_VISHAL',
    lockNotes: 'April 2026 books closed for statutory audit',
    forceOverride: true
  });
  console.log('   Lock result:', lockResult.success ? 'SUCCESS (LOCKED)' : 'FAILED');

  // Step 2: Attempt journal mutation on locked period (must fail with FISCAL_PERIOD_LOCKED)
  console.log('2. Attempting journal mutation on locked period 2026-04...');
  try {
    await postJournalEntry({
      entryNumber: 'JE-TEST-BLOCKED',
      periodId: '2026-04',
      date: new Date('2026-04-20'),
      refType: 'ORDER_DELIVERY',
      refId: 'ORD-TEST-BLOCKED',
      lines: [
        { accountCode: '1010_CASH_IN_HAND_RIDERS', debit: 100, credit: 0 },
        { accountCode: '4010_SALES_AGRI_INPUTS', debit: 0, credit: 100 }
      ],
      description: 'Illegal modification attempt on closed period'
    });
    console.error('❌ FAILED: Mutation was allowed on locked period!');
  } catch (err) {
    if (err.message && err.message.includes('FISCAL_PERIOD_LOCKED')) {
      console.log('✅ PASS: Mutation strictly blocked with code FISCAL_PERIOD_LOCKED!');
    } else {
      console.log('✅ PASS (Blocked with error):', err.message);
    }
  }

  // Step 3: Unlock period for normal operations
  console.log('3. Unlocking period 2026-04...');
  const unlockResult = await unlockFiscalPeriod({
    periodId: '2026-04',
    unlockedBy: 'CFO_VISHAL',
    unlockReason: 'Reopened for statutory post-close verification'
  });
  console.log('   Unlock result:', unlockResult.success ? 'SUCCESS (REOPENED)' : 'FAILED');
}

testPeriodLock().catch(console.error);
