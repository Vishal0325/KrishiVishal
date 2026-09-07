const functionsV1 = require("firebase-functions/v1");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { db, admin } = require("../core/admin");

const REGION = 'asia-south1';

/**
 * Helper to generate a unique referral code and persist to users/{uid}.
 */
async function createUniqueReferralCode(uid, displayName, email) {
    const name = displayName || email?.split('@')[0] || "USER";
    const firstName = name.split(' ')[0].toUpperCase().replace(/[^A-Z]/g, '').substring(0, 6);
    const prefix = firstName.length > 0 ? firstName : "USER";
    
    let referralCode = "";
    let isUnique = false;
    let attempts = 0;
    
    while (!isUnique && attempts < 5) {
        const randomDigits = Math.floor(100 + Math.random() * 900); // 3 digits
        referralCode = `KV-${prefix}${randomDigits}`;
        
        const existingUsers = await db.collection("users").where("referralCode", "==", referralCode).limit(1).get();
        if (existingUsers.empty) {
            isUnique = true;
        }
        attempts++;
    }
    
    if (!isUnique) {
        referralCode = `KV-${prefix}${Date.now().toString().substring(9)}`;
    }

    await db.collection("users").doc(uid).set({
        referralCode: referralCode,
        walletBalance: admin.firestore.FieldValue.increment(0),
        hasCompletedFirstOrder: false
    }, { merge: true });

    return referralCode;
}

/**
 * Generates a unique referral code when a new user signs up.
 * Triggered on user creation via Auth.
 */
exports.generateReferralCode = functionsV1.region(REGION).auth.user().onCreate(async (user) => {
    const code = await createUniqueReferralCode(user.uid, user.displayName, user.email);
    console.log(`Assigned referral code ${code} to user ${user.uid}`);
});

/**
 * Returns the current user's referral code or creates one on-demand
 * if missing (e.g. for existing users created prior to the referral trigger).
 */
exports.getOrCreateReferralCode = onCall({ region: REGION }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be logged in.');
    }

    const uid = request.auth.uid;
    const userDocRef = db.collection("users").doc(uid);
    const userDoc = await userDocRef.get();

    if (userDoc.exists && userDoc.data().referralCode) {
        return { referralCode: userDoc.data().referralCode };
    }

    let displayName = userDoc.exists ? (userDoc.data().name || userDoc.data().displayName) : "";
    let email = userDoc.exists ? userDoc.data().email : "";

    try {
        const authUser = await admin.auth().getUser(uid);
        if (!displayName) displayName = authUser.displayName;
        if (!email) email = authUser.email;
    } catch (e) {
        console.warn("Could not fetch auth user record:", e);
    }

    const referralCode = await createUniqueReferralCode(uid, displayName, email);
    return { referralCode };
});

/**
 * Applies a referral code for a new user.
 * Expected input: { referralCodeEntered: "KV-XXX" }
 */
exports.applyReferralCode = onCall({ region: REGION }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'User must be logged in.');
    }

    const newUserUid = request.auth.uid;
    const { referralCodeEntered } = request.data || {};

    if (!referralCodeEntered) {
        throw new HttpsError('invalid-argument', 'referralCodeEntered is required.');
    }

    // Check if the user already used a referral code
    const newUserDocRef = db.collection("users").doc(newUserUid);
    const newUserDoc = await newUserDocRef.get();
    
    if (newUserDoc.exists && newUserDoc.data().referredBy) {
        throw new HttpsError('already-exists', 'You have already used a referral code.');
    }

    // Find the referrer
    const referrerQuery = await db.collection("users").where("referralCode", "==", referralCodeEntered).limit(1).get();
    
    if (referrerQuery.empty) {
        throw new HttpsError('not-found', 'Invalid referral code.');
    }

    const referrerDoc = referrerQuery.docs[0];
    const referrerUid = referrerDoc.id;

    // Fraud check 1: Self-referral
    if (referrerUid === newUserUid) {
        throw new HttpsError('invalid-argument', 'You cannot refer yourself.');
    }

    // Fraud check 2: FCM Token Match
    const referrerData = referrerDoc.data();
    const newUserData = newUserDoc.data() || {};
    
    if (referrerData.fcmToken && newUserData.fcmToken && referrerData.fcmToken === newUserData.fcmToken) {
        console.warn(`Fraud flagged: FCM Token match for ${newUserUid} and ${referrerUid}`);
        throw new HttpsError('failed-precondition', 'Referral blocked due to suspicious activity.');
    }

    // Get referral settings (or defaults)
    const settingsDoc = await db.collection("config").doc("referralSettings").get();
    const settings = settingsDoc.exists ? settingsDoc.data() : { referrerRewardAmount: 50, refereeRewardAmount: 50, isEnabled: true };

    if (settings.isEnabled === false) {
        throw new HttpsError('failed-precondition', 'The referral program is temporarily disabled.');
    }

    const referrerRewardAmount = typeof settings.referrerRewardAmount === 'number' ? settings.referrerRewardAmount : 50;
    const refereeRewardAmount = typeof settings.refereeRewardAmount === 'number' ? settings.refereeRewardAmount : 50;

    // Apply the referral code using a batch to ensure atomicity
    const batch = db.batch();
    
    // 1. Update the new user's document
    batch.set(newUserDocRef, {
        referredBy: referralCodeEntered,
        walletBalance: admin.firestore.FieldValue.increment(refereeRewardAmount)
    }, { merge: true });

    // 2. Create the referral document
    const newReferralRef = db.collection("referrals").doc();
    batch.set(newReferralRef, {
        referrerUid: referrerUid,
        refereeUid: newUserUid,
        referralCode: referralCodeEntered,
        status: "SIGNED_UP",
        referrerRewardAmount: referrerRewardAmount,
        refereeRewardAmount: refereeRewardAmount,
        referenceOrderId: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        rewardedAt: null,
        voidReason: null
    });

    // 3. Create wallet transaction for referee
    const txnRef = db.collection("wallet_transactions").doc();
    batch.set(txnRef, {
        uid: newUserUid,
        type: "REFERRAL_SIGNUP_CREDIT",
        amount: refereeRewardAmount,
        referenceOrderId: null,
        referenceReferralId: newReferralRef.id,
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    await batch.commit();

    return { success: true, reward: refereeRewardAmount };
});
