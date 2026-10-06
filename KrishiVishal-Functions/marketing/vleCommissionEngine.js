/**
 * vleCommissionEngine.js
 * Kisan Mitra (Village Level Entrepreneur - VLE) Rural Commission & Assisted Buying Engine.
 * Handles VLE registration, KYC verification, category-wise commission attribution,
 * 7-day return window maturity escrow, and automated wallet disbursements.
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { db, admin } = require("../core/admin");

const REGION = 'asia-south1';

const DEFAULT_COMMISSION_SLABS = {
  FERTILIZER: 0.015, // 1.5%
  SEEDS: 0.035,      // 3.5%
  PESTICIDE: 0.05,   // 5.0%
  DEFAULT: 0.025     // 2.5%
};

/**
 * Normalizes item category for commission rate lookup.
 */
function normalizeCategory(categoryName) {
  if (!categoryName || typeof categoryName !== 'string') return 'DEFAULT';
  const lower = categoryName.toLowerCase();
  if (lower.includes('fertilizer') || lower.includes('खाद') || lower.includes('urea') || lower.includes('dap')) {
    return 'FERTILIZER';
  }
  if (lower.includes('seed') || lower.includes('बीज') || lower.includes('hybrid')) {
    return 'SEEDS';
  }
  if (lower.includes('pesticide') || lower.includes('कीटनाशक') || lower.includes('fungicide') || lower.includes('herbicide') || lower.includes('dawa')) {
    return 'PESTICIDE';
  }
  return 'DEFAULT';
}

/**
 * Calculates commission breakdown for an order.
 * @param {object} orderData - Order payload containing items and totalAmount
 * @param {object} customSlabs - Optional custom commission slabs for the VLE
 * @returns {{ commissionBreakdown: Array, totalCommission: number }}
 */
function calculateVleOrderCommission(orderData, customSlabs = {}) {
  const slabs = { ...DEFAULT_COMMISSION_SLABS, ...customSlabs };
  const items = Array.isArray(orderData.items) ? orderData.items : [];
  
  const breakdown = [];
  let totalCommission = 0;

  if (items.length > 0) {
    items.forEach((item) => {
      const itemAmount = Number(item.price || item.unitPrice || 0) * Number(item.quantity || 1);
      const catKey = normalizeCategory(item.category || item.categoryName);
      const rate = slabs[catKey] !== undefined ? slabs[catKey] : slabs.DEFAULT;
      const commission = Math.round(itemAmount * rate * 100) / 100;

      breakdown.push({
        name: item.name || item.title || 'Item',
        category: catKey,
        amount: itemAmount,
        rate: rate,
        commission: commission
      });
      totalCommission += commission;
    });
  } else {
    // Fallback: Calculate flat default commission on whole order amount
    const orderTotal = Number(orderData.totalAmount || orderData.orderTotal || 0);
    const rate = slabs.DEFAULT;
    const commission = Math.round(orderTotal * rate * 100) / 100;
    breakdown.push({
      category: 'DEFAULT',
      amount: orderTotal,
      rate: rate,
      commission: commission
    });
    totalCommission = commission;
  }

  return {
    commissionBreakdown: breakdown,
    totalCommission: Math.round(totalCommission * 100) / 100
  };
}

/**
 * Generates a collision-resistant VLE code (e.g. KM-SAMAS-452).
 */
async function generateVleCode(districtOrHub, village) {
  const rawPrefix = (districtOrHub || village || 'BIHAR')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .substring(0, 5);
  const prefix = rawPrefix.length >= 3 ? rawPrefix : 'MITRA';

  let vleCode = '';
  let isUnique = false;
  let attempts = 0;

  while (!isUnique && attempts < 5) {
    const randomDigits = Math.floor(100 + Math.random() * 900);
    vleCode = `KM-${prefix}-${randomDigits}`;

    const existing = await db.collection('vle_profiles').where('vleCode', '==', vleCode).limit(1).get();
    if (existing.empty) {
      isUnique = true;
    }
    attempts++;
  }

  if (!isUnique) {
    vleCode = `KM-${prefix}-${Date.now().toString().slice(-4)}`;
  }

  return vleCode;
}

/**
 * Callable Function: registerAsKisanMitra
 * Self-registration for farmers/rural entrepreneurs wishing to become Kisan Mitras.
 */
const registerAsKisanMitra = onCall({ region: REGION }, async (request) => {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated.');
  }

  const uid = request.auth.uid;
  const {
    name,
    phone,
    hubId = 'hub_central_samastipur',
    village,
    panchayat = '',
    pincode = '848101',
    panNumber = '',
    bankAccountNo = '',
    ifscCode = '',
    bankDetails = {}
  } = request.data || {};

  if (!name || !phone || !village) {
    throw new HttpsError('invalid-argument', 'Name, phone, and village are mandatory.');
  }

  const vleRef = db.collection('vle_profiles').doc(uid);
  const existingDoc = await vleRef.get();

  if (existingDoc.exists && existingDoc.data().status === 'ACTIVE') {
    return {
      success: true,
      message: 'Already registered as Kisan Mitra',
      vleCode: existingDoc.data().vleCode,
      kycStatus: existingDoc.data().kycStatus
    };
  }

  const vleCode = await generateVleCode(hubId, village);

  const profileData = {
    vleId: uid,
    vleCode: vleCode,
    name: name.trim(),
    phone: phone.trim(),
    hubId: hubId.trim(),
    village: village.trim(),
    panchayat: panchayat.trim(),
    pincode: pincode.trim(),
    kycStatus: 'PENDING',
    panNumber: (panNumber || '').trim().toUpperCase(),
    bankDetails: {
      accountNumber: bankAccountNo || bankDetails.accountNumber || '',
      ifsc: (ifscCode || bankDetails.ifsc || '').toUpperCase(),
      bankName: bankDetails.bankName || '',
      holderName: bankDetails.holderName || name.trim()
    },
    commissionSlabs: DEFAULT_COMMISSION_SLABS,
    totalGmvGenerated: 0,
    totalCommissionEarned: 0,
    walletBalance: 0,
    status: 'ACTIVE',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp()
  };

  const batch = db.batch();
  batch.set(vleRef, profileData, { merge: true });
  // Also tag the user's main profile
  batch.set(db.collection('users').doc(uid), {
    isKisanMitra: true,
    vleCode: vleCode,
    vleKycStatus: 'PENDING'
  }, { merge: true });

  await batch.commit();

  return {
    success: true,
    vleCode: vleCode,
    kycStatus: 'PENDING',
    message: 'Kisan Mitra registration submitted successfully. KYC verification pending.'
  };
});

/**
 * Callable Function: verifyVleKyc
 * Admin/HubManager endpoint to approve or reject VLE KYC.
 */
const verifyVleKyc = onCall({ region: REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated.');
  }
  const token = request.auth.token || {};
  const isAuthorized = token.admin === true ||
    token.isAdmin === true ||
    token.isSuperAdmin === true ||
    ['admin', 'superadmin', 'hubmanager'].includes((token.role || '').toLowerCase());

  if (!isAuthorized) {
    throw new HttpsError('permission-denied', 'Unauthorized. Only Admins or Hub Managers can verify KYC.');
  }

  const { vleId, status, rejectionReason = '' } = request.data || {};
  if (!vleId || !status || !['VERIFIED', 'REJECTED', 'PENDING'].includes(status)) {
    throw new HttpsError('invalid-argument', 'vleId and valid status (VERIFIED | REJECTED | PENDING) required.');
  }

  const vleRef = db.collection('vle_profiles').doc(vleId);
  const vleSnap = await vleRef.get();
  if (!vleSnap.exists) {
    throw new HttpsError('not-found', 'VLE profile not found.');
  }

  const updateData = {
    kycStatus: status,
    rejectionReason: status === 'REJECTED' ? rejectionReason : null,
    verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
    verifiedBy: request.auth.uid
  };

  const batch = db.batch();
  batch.update(vleRef, updateData);
  batch.update(db.collection('users').doc(vleId), {
    vleKycStatus: status
  });

  await batch.commit();

  return {
    success: true,
    vleId,
    status
  };
});

/**
 * Callable Function: getVleDashboardSummary
 * Returns performance metrics and commission earnings for the logged-in VLE.
 */
const getVleDashboardSummary = onCall({ region: REGION }, async (request) => {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'User must be authenticated.');
  }

  const uid = request.auth.uid;
  const vleSnap = await db.collection('vle_profiles').doc(uid).get();

  if (!vleSnap.exists) {
    throw new HttpsError('not-found', 'Kisan Mitra profile does not exist for this account.');
  }

  const profile = vleSnap.data();

  // Aggregate commissions
  const commissionsSnap = await db.collection('vle_commissions')
    .where('vleId', '==', uid)
    .limit(100)
    .get();

  let pendingMaturityCommission = 0;
  let maturedCommission = 0;
  let settledCommission = 0;
  let totalOrdersCount = commissionsSnap.size;

  commissionsSnap.forEach((doc) => {
    const c = doc.data();
    if (c.status === 'HOLD_RETURN_WINDOW') {
      pendingMaturityCommission += (c.totalCommission || 0);
    } else if (c.status === 'MATURED') {
      maturedCommission += (c.totalCommission || 0);
    } else if (c.status === 'SETTLED') {
      settledCommission += (c.totalCommission || 0);
    }
  });

  return {
    success: true,
    profile: {
      vleCode: profile.vleCode,
      name: profile.name,
      village: profile.village,
      kycStatus: profile.kycStatus,
      walletBalance: profile.walletBalance || 0,
      totalGmvGenerated: profile.totalGmvGenerated || 0
    },
    metrics: {
      totalOrdersCount,
      pendingMaturityCommission: Math.round(pendingMaturityCommission * 100) / 100,
      maturedCommission: Math.round(maturedCommission * 100) / 100,
      settledCommission: Math.round(settledCommission * 100) / 100,
      availableForWithdrawal: Math.round((profile.walletBalance || 0) * 100) / 100
    }
  };
});

/**
 * Scheduled Cron: cronMaturityVleCommissions
 * Runs daily at 02:00 AM IST.
 * Moves commissions whose 7-day return window has expired from HOLD_RETURN_WINDOW to MATURED,
 * and atomically credits the VLE wallet.
 */
const cronMaturityVleCommissions = onSchedule({
  schedule: '0 2 * * *',
  timeZone: 'Asia/Kolkata',
  region: REGION
}, async () => {
  const now = new Date();
  console.log(`[cronMaturityVleCommissions] Executing maturity sweep at ${now.toISOString()}`);

  const snapshot = await db.collection('vle_commissions')
    .where('status', '==', 'HOLD_RETURN_WINDOW')
    .where('maturityDate', '<=', now.toISOString())
    .limit(200)
    .get();

  if (snapshot.empty) {
    console.log('[cronMaturityVleCommissions] No maturing commissions found.');
    return;
  }

  console.log(`[cronMaturityVleCommissions] Processing ${snapshot.size} maturing commission records.`);

  for (const docSnap of snapshot.docs) {
    const commData = docSnap.data();
    const vleId = commData.vleId;
    const amount = Number(commData.totalCommission) || 0;

    if (!vleId || amount <= 0) continue;

    try {
      await db.runTransaction(async (transaction) => {
        const vleRef = db.collection('vle_profiles').doc(vleId);
        const commRef = docSnap.ref;

        transaction.update(commRef, {
          status: 'MATURED',
          maturedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        transaction.update(vleRef, {
          walletBalance: admin.firestore.FieldValue.increment(amount),
          totalCommissionEarned: admin.firestore.FieldValue.increment(amount),
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        const txnRef = db.collection('wallet_transactions').doc();
        transaction.set(txnRef, {
          uid: vleId,
          type: 'VLE_COMMISSION_CREDIT',
          amount: amount,
          referenceOrderId: commData.orderId || null,
          referenceCommissionId: docSnap.id,
          description: `Kisan Mitra commission matured for order ${commData.orderId}`,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      });
      console.log(`[cronMaturityVleCommissions] Successfully matured ₹${amount} for VLE ${vleId}`);
    } catch (err) {
      console.error(`[cronMaturityVleCommissions] Error maturing comm ${docSnap.id}:`, err);
    }
  }
});

module.exports = {
  registerAsKisanMitra,
  verifyVleKyc,
  getVleDashboardSummary,
  cronMaturityVleCommissions,
  calculateVleOrderCommission,
  normalizeCategory,
  generateVleCode,
  DEFAULT_COMMISSION_SLABS
};
