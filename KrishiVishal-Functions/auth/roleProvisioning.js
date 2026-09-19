const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { db, admin, auth } = require("../core/admin");

const REGION = 'asia-south1';

/**
 * claimRiderRole:
 * Server-authoritative custom claims provisioning for Riders and Servicemen.
 * Caller must be authenticated with phone auth (not anonymous).
 * Phone number must match whitelisted_riders document (E.164 or 10-digit ID).
 * Sets whitelist doc uid and status: 'REGISTERED' server-side.
 * Sets custom claim role='Rider' (or 'Serviceman'/'Partner' per whitelist).
 * Merges with existing custom claims.
 */
exports.claimRiderRole = onCall({ region: REGION }, async (request) => {
    const context = { auth: request.auth };
    if (!context.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }
    const token = context.auth.token || {};
    if (token.firebase && token.firebase.sign_in_provider === 'anonymous') {
        throw new HttpsError('permission-denied', 'Anonymous users cannot claim roles.');
    }

    const phone = token.phone_number;
    if (!phone) {
        throw new HttpsError('failed-precondition', 'Phone number missing in authentication token.');
    }

    // Lookup whitelist document (by E.164, 10-digit ID, or phone field)
    let wDoc = await db.collection("whitelisted_riders").doc(phone).get();
    let docRef = db.collection("whitelisted_riders").doc(phone);

    if (!wDoc.exists) {
        const plainPhone = phone.replace("+91", "").trim();
        if (plainPhone) {
            wDoc = await db.collection("whitelisted_riders").doc(plainPhone).get();
            if (wDoc.exists) {
                docRef = db.collection("whitelisted_riders").doc(plainPhone);
            }
        }
    }

    if (!wDoc.exists) {
        const querySnap = await db.collection("whitelisted_riders").where("phone", "==", phone).limit(1).get();
        if (!querySnap.empty) {
            wDoc = querySnap.docs[0];
            docRef = wDoc.ref;
        }
    }

    if (!wDoc.exists) {
        throw new HttpsError('permission-denied', 'Phone number is not whitelisted.');
    }

    const wData = wDoc.data() || {};
    const whitelistRole = (wData.role || 'rider').toLowerCase().trim();
    let roleToAssign = 'Rider';
    if (whitelistRole === 'service_man' || whitelistRole === 'serviceman') {
        roleToAssign = 'Serviceman';
    } else if (whitelistRole === 'both') {
        roleToAssign = 'Partner';
    }

    // 1. Update whitelisted_riders document server-side
    await docRef.set({
        status: 'REGISTERED',
        uid: context.auth.uid,
        registeredAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // 2. Ensure rider profile exists server-side
    if (roleToAssign === 'Rider' || roleToAssign === 'Partner') {
        await db.collection("riders").doc(context.auth.uid).set({
            id: context.auth.uid,
            phone: phone,
            name: wData.name || '',
            role: roleToAssign,
            partnerRole: whitelistRole,
            riderSerialId: wData.riderSerialId || '',
            riderIdDisplay: wData.riderIdDisplay || '',
            status: 'ACTIVE',
            online: true,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    }

    // 3. Update user doc server-side
    await db.collection("users").doc(context.auth.uid).set({
        partnerRole: whitelistRole,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // 3. Set Custom Claim, MERGING with existing claims
    const userRecord = await auth.getUser(context.auth.uid);
    const existingClaims = userRecord.customClaims || {};
    await auth.setCustomUserClaims(context.auth.uid, {
        ...existingClaims,
        role: roleToAssign
    });

    return {
        success: true,
        uid: context.auth.uid,
        role: roleToAssign,
        status: 'REGISTERED'
    };
});

/**
 * setUserRole:
 * Admin-only role assignment for SuperAdmin to set role='Serviceman', 'Partner', 'Rider', etc.
 * Merges with existing custom claims.
 */
exports.setUserRole = onCall({ region: REGION }, async (request) => {
    const context = { auth: request.auth };
    if (!context.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const token = context.auth.token || {};
    const isSuperAdmin = token.role === 'SuperAdmin' || token.admin === true || token.isAdmin === true;
    if (!isSuperAdmin) {
        throw new HttpsError('permission-denied', 'SuperAdmin privileges required to assign user roles.');
    }

    const { targetUid, role } = request.data || {};
    if (!targetUid || typeof targetUid !== 'string' || targetUid.trim().length === 0) {
        throw new HttpsError('invalid-argument', 'targetUid is required.');
    }

    const allowedRoles = ['SuperAdmin', 'ADMIN', 'OrderManager', 'CatalogManager', 'Viewer', 'Rider', 'Serviceman', 'Partner', 'Customer'];
    if (!role || !allowedRoles.includes(role)) {
        throw new HttpsError('invalid-argument', `Invalid role. Allowed roles: ${allowedRoles.join(', ')}`);
    }

    // Merge existing claims
    const userRecord = await auth.getUser(targetUid);
    const existingClaims = userRecord.customClaims || {};
    await auth.setCustomUserClaims(targetUid, {
        ...existingClaims,
        role: role
    });

    // Update Firestore users/{targetUid} document
    await db.collection("users").doc(targetUid).set({
        role: role,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return { success: true, targetUid, role };
});
