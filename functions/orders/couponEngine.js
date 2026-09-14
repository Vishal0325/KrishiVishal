const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

/**
 * [FIXED] Point #109: Safe coupon validation and redemption using transactions.
 * Prevents multiple users from redeeming limited coupons simultaneously (Race Condition).
 */
exports.validateAndRedeemCoupon = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be logged in.');
  }

  const { couponCode, orderId } = data;
  if (!couponCode) {
    throw new functions.https.HttpsError('invalid-argument', 'Coupon code is required.');
  }

  const db = admin.firestore();
  const couponRef = db.collection('coupons').doc(couponCode.toUpperCase());

  try {
    return await db.runTransaction(async (transaction) => {
      const doc = await transaction.get(couponRef);
      if (!doc.exists) {
        throw new functions.https.HttpsError('not-found', 'Coupon code not found.');
      }

      const coupon = doc.data();
      const now = admin.firestore.Timestamp.now().toDate();

      // Validation
      if (coupon.status !== 'ACTIVE') {
        throw new functions.https.HttpsError('failed-precondition', 'Coupon is no longer active.');
      }

      if (coupon.expiryDate) {
        const expiry = coupon.expiryDate.toDate ? coupon.expiryDate.toDate() : new Date(coupon.expiryDate);
        if (expiry < now) {
          throw new functions.https.HttpsError('failed-precondition', 'Coupon has expired.');
        }
      }

      if (coupon.usageLimit && (coupon.usedCount || 0) >= coupon.usageLimit) {
        throw new functions.https.HttpsError('failed-precondition', 'Coupon usage limit reached.');
      }

      // Check if user already used it (if limited to once per user)
      const userRedemptionDocId = `${couponCode.toUpperCase()}_${context.auth.uid}`;
      const userRedemptionRef = db.collection('coupon_redemptions').doc(userRedemptionDocId);

      if (coupon.oncePerUser) {
        const userRedemptionSnap = await transaction.get(userRedemptionRef);
        if (userRedemptionSnap.exists) {
          throw new functions.https.HttpsError('already-exists', 'You have already used this coupon.');
        }
      }

      // Atomically increment usedCount
      transaction.update(couponRef, {
        usedCount: admin.firestore.FieldValue.increment(1),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      // Record redemption with deterministic document ID to prevent race conditions
      transaction.set(userRedemptionRef, {
        couponCode: couponCode.toUpperCase(),
        orderId: orderId || null,
        userId: context.auth.uid,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        redeemedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      return {
        success: true,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        minOrderValue: coupon.minOrderValue || 0
      };
    });
  } catch (error) {
    console.error('Coupon Redemption Error:', error);
    if (error instanceof functions.https.HttpsError) throw error;
    throw new functions.https.HttpsError('internal', error.message);
  }
});
