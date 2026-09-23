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
exports.claimRiderRole = onCall({ region: REGION, invoker: 'public' }, async (request) => {
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

    // Check if user is marked deactivated in users/{uid}
    const userSnap = await db.collection("users").doc(context.auth.uid).get();
    if (userSnap.exists && userSnap.data()?.deactivated === true) {
        throw new HttpsError('permission-denied', 'User account is deactivated.');
    }

    const wData = wDoc.data() || {};
    const wStatus = (wData.status || '').toUpperCase().trim();
    // Deny-list guard: reject ONLY 'DEACTIVATED' and 'BLOCKED'.
    // All other statuses ('PENDING_REGISTRATION', 'REGISTERED', 'APPROVED', 'ACTIVE', or empty) are allowed.
    const DENIED_WHITELIST_STATUSES = ['DEACTIVATED', 'BLOCKED'];
    if (DENIED_WHITELIST_STATUSES.includes(wStatus)) {
        throw new HttpsError('permission-denied', `Rider account is ${wStatus.toLowerCase()}.`);
    }

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
    const isSuperAdmin = token.role === 'SuperAdmin';
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

/**
 * deactivateUser:
 * SuperAdmin-only offboarding callable.
 * Resets user's custom claim role to 'Customer' and calls auth.revokeRefreshTokens(targetUid).
 * Updates users/{targetUid} and deactivates any riders/{targetUid} doc.
 */
exports.deactivateUser = onCall({ region: REGION }, async (request) => {
    const context = { auth: request.auth };
    if (!context.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const token = context.auth.token || {};
    if (token.role !== 'SuperAdmin') {
        throw new HttpsError('permission-denied', 'SuperAdmin privileges required to deactivate users.');
    }

    const targetUid = request.data?.uid || request.data?.targetUid;
    if (!targetUid || typeof targetUid !== 'string' || targetUid.trim().length === 0) {
        throw new HttpsError('invalid-argument', 'targetUid or uid is required.');
    }

    // Prevent SuperAdmin from deactivating self
    if (context.auth.uid === targetUid) {
        throw new HttpsError('invalid-argument', 'SuperAdmin cannot deactivate self.');
    }

    const userRecord = await auth.getUser(targetUid);
    const existingClaims = userRecord.customClaims || {};

    // Prevent deactivating the last SuperAdmin
    if (existingClaims.role === 'SuperAdmin') {
        const superAdminsSnap = await db.collection("users").where("role", "==", "SuperAdmin").get();
        if (superAdminsSnap.size <= 1) {
            throw new HttpsError('failed-precondition', 'Cannot deactivate the last SuperAdmin.');
        }
    }

    // 1. Reset role to 'Customer' in custom claims, clear admin flags
    const updatedClaims = {
        ...existingClaims,
        role: 'Customer',
        admin: false,
        isAdmin: false
    };
    await auth.setCustomUserClaims(targetUid, updatedClaims);

    // 2. Revoke refresh tokens to force re-authentication / claim invalidation
    await auth.revokeRefreshTokens(targetUid);

    // 3. Update Firestore users doc
    await db.collection("users").doc(targetUid).set({
        role: 'Customer',
        deactivated: true,
        deactivatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // 4. If rider document exists, mark inactive
    const riderRef = db.collection("riders").doc(targetUid);
    const riderDoc = await riderRef.get();
    if (riderDoc.exists) {
        await riderRef.set({
            status: 'INACTIVE',
            online: false,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    }

    // 5. Update matching whitelisted_riders entry to DEACTIVATED
    const wUidQuery = await db.collection("whitelisted_riders").where("uid", "==", targetUid).get();
    for (const doc of wUidQuery.docs) {
        await doc.ref.set({
            status: 'DEACTIVATED',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    }
    const phone = userRecord.phoneNumber;
    if (phone) {
        const plainPhone = phone.replace("+91", "").trim();
        const p1 = db.collection("whitelisted_riders").doc(phone);
        const p1Doc = await p1.get();
        if (p1Doc.exists) {
            await p1.set({ status: 'DEACTIVATED', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        }
        if (plainPhone) {
            const p2 = db.collection("whitelisted_riders").doc(plainPhone);
            const p2Doc = await p2.get();
            if (p2Doc.exists) {
                await p2.set({ status: 'DEACTIVATED', updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
            }
        }
    }

    return {
        success: true,
        uid: targetUid,
        role: 'Customer'
    };
});
