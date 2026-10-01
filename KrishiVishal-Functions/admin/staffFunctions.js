const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { db, admin, auth } = require("../core/admin");

const REGION = 'asia-south1';

/**
 * setUserRole:
 * SuperAdmin-only role assignment for staff and users.
 * Sets custom claims and updates users/{targetUid} document.
 */
exports.setUserRole = onCall({ region: REGION, cors: true }, async (request) => {
    const context = { auth: request.auth };
    if (!context.auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const token = context.auth.token || {};
    const isSuperAdmin = token.role === 'SuperAdmin';
    if (!isSuperAdmin) {
        throw new HttpsError('permission-denied', 'SuperAdmin privileges required to assign user roles.');
    }

    const { targetUid, role, hubId, hubAccess } = request.data || {};
    if (!targetUid || typeof targetUid !== 'string' || targetUid.trim().length === 0) {
        throw new HttpsError('invalid-argument', 'targetUid is required.');
    }

    const allowedRoles = [
        'SuperAdmin', 'FinanceAdmin', 'HubManager', 'DepartmentManager', 'Viewer',
        'ADMIN', 'Admin', 'OrderManager', 'CatalogManager', 'Rider', 'Serviceman', 'Partner', 'Customer'
    ];
    if (!role || !allowedRoles.includes(role)) {
        throw new HttpsError('invalid-argument', `Invalid role. Allowed roles: ${allowedRoles.join(', ')}`);
    }

    // Validation & hubAccess default logic:
    // - SuperAdmin, FinanceAdmin, Viewer -> "ALL" (hubId ignored)
    // - HubManager, DepartmentManager -> "SINGLE" required, hubId required
    // - Validation: agar role === "HubManager" aur hubId nahi diya toh error throw karo
    let effectiveHubAccess = hubAccess;
    let effectiveHubId = hubId ? String(hubId).trim() : null;

    if (['SuperAdmin', 'FinanceAdmin', 'Viewer'].includes(role)) {
        effectiveHubAccess = 'ALL';
        effectiveHubId = null;
    } else if (role === 'HubManager') {
        if (!effectiveHubId) {
            throw new HttpsError('invalid-argument', 'hubId is required for HubManager role.');
        }
        effectiveHubAccess = 'SINGLE';
    } else if (role === 'DepartmentManager') {
        if (!effectiveHubId) {
            throw new HttpsError('invalid-argument', 'hubId is required for DepartmentManager role.');
        }
        effectiveHubAccess = 'SINGLE';
    } else {
        effectiveHubAccess = effectiveHubAccess || 'ALL';
    }

    // Fetch existing claims to preserve other claims (admin, isAdmin, isStaff, etc.)
    const userRecord = await auth.getUser(targetUid);
    const existingClaims = userRecord.customClaims || {};

    const updatedClaims = {
        ...existingClaims,
        role: role,
        hubAccess: effectiveHubAccess
    };

    if (effectiveHubAccess === 'SINGLE' && effectiveHubId) {
        updatedClaims.hubId = effectiveHubId;
    } else {
        delete updatedClaims.hubId;
    }

    await auth.setCustomUserClaims(targetUid, updatedClaims);

    // Update Firestore users/{targetUid} document
    await db.collection("users").doc(targetUid).set({
        role: role,
        hubAccess: effectiveHubAccess,
        hubId: effectiveHubId || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return {
        success: true,
        targetUid,
        role,
        hubAccess: effectiveHubAccess,
        hubId: effectiveHubId || null
    };
});
