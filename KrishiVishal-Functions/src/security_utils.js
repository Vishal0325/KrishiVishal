const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

/**
 * Ensures user is authenticated and returns their UID.
 */
function requireAuth(context) {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated.');
    }
    return context.auth.uid;
}

/**
 * Checks if the user is an Admin (Managerial Role).
 * Custom claims are authoritative.
 */
function requireAdmin(context) {
    requireAuth(context);
    const role = context.auth.token.role;
    const isAdmin = ['SuperAdmin', 'CatalogManager', 'OrderManager', 'Viewer'].includes(role);
    if (!isAdmin) {
        throw new functions.https.HttpsError('permission-denied', 'Admin privileges required.');
    }
}

/**
 * Checks for SuperAdmin specifically.
 */
function requireSuperAdmin(context) {
    requireAuth(context);
    if (context.auth.token.role !== 'SuperAdmin') {
        throw new functions.https.HttpsError('permission-denied', 'SuperAdmin privileges required.');
    }
}

/**
 * Checks for specific role.
 */
function requireRole(context, role) {
    requireAuth(context);
    if (context.auth.token.role !== role) {
        throw new functions.https.HttpsError('permission-denied', `Role ${role} required.`);
    }
}

/**
 * Checks for any of the given roles.
 */
function requireAnyRole(context, rolesList) {
    requireAuth(context);
    if (!rolesList.includes(context.auth.token.role)) {
        throw new functions.https.HttpsError('permission-denied', 'Required role not found.');
    }
}

/**
 * Checks if the user is a Rider.
 */
function requireRider(context) {
    requireAuth(context);
    // Canonical PascalCase role is "Rider"
    if (context.auth.token.role !== 'Rider') {
        throw new functions.https.HttpsError('permission-denied', 'Rider privileges required.');
    }
}

/**
 * Verifies that the authenticated user owns the order OR is a management user.
 */
function requireOrderOwner(order, context) {
    const uid = requireAuth(context);
    const role = context.auth.token.role;
    const isManager = ['SuperAdmin', 'OrderManager'].includes(role);

    if (order.userId !== uid && !isManager) {
        throw new functions.https.HttpsError('permission-denied', 'You do not have permission to access this order.');
    }
}

/**
 * Verifies that the authenticated user is the assigned rider for the order OR a management user.
 */
function requireAssignedRider(order, context) {
    const uid = requireAuth(context);
    const role = context.auth.token.role;
    const isManager = ['SuperAdmin', 'OrderManager'].includes(role);

    if (order.riderId !== uid && !isManager) {
        throw new functions.https.HttpsError('permission-denied', 'You are not the assigned rider for this order.');
    }
}

/**
 * Order Status State Machine transitions validation.
 */
const VALID_TRANSITIONS = {
    'PLACED': ['CONFIRMED', 'CANCELLED'],
    'CONFIRMED': ['ASSIGNED', 'CANCELLED'],
    'ASSIGNED': ['SHIPPED', 'CANCELLED'],
    'SHIPPED': ['OUT_FOR_DELIVERY', 'CANCELLED'],
    'OUT_FOR_DELIVERY': ['DELIVERED', 'CANCELLED'],
    'DELIVERED': ['RETURNED'], // Only 'RETURNED' after 'DELIVERED'
    'CANCELLED': [], // Terminal state
    'RETURNED': [] // Terminal state for delivery flow
};

function validateOrderTransition(oldStatus, newStatus, context) {
    // SuperAdmins can bypass state machine for corrections (explicit override)
    if (context && context.auth && context.auth.token.role === 'SuperAdmin') {
        return true;
    }

    if (!VALID_TRANSITIONS[oldStatus]) {
        throw new functions.https.HttpsError('failed-precondition', `Unknown initial status: ${oldStatus}`);
    }

    if (!VALID_TRANSITIONS[oldStatus].includes(newStatus)) {
        throw new functions.https.HttpsError('failed-precondition', `Invalid status transition from ${oldStatus} to ${newStatus}`);
    }

    return true;
}

/**
 * Safe Secret Handling: Ensures a required secret is present in the environment.
 */
function getRequiredSecret(secretName, description = "") {
    const value = process.env[secretName];
    if (!value || value.trim() === "") {
        const errorMsg = `Required secret '${secretName}' is not configured${
            description ? ` (${description})` : ""
        }. Please set it in Firebase Console → Functions → Runtime environment variables.`;

        console.error("FATAL:", errorMsg);
        throw new functions.https.HttpsError(
            'failed-precondition',
            'Service configuration incomplete. Admin has been notified.'
        );
    }
    return value;
}

module.exports = {
    requireAuth,
    requireAdmin,
    requireSuperAdmin,
    requireRole,
    requireAnyRole,
    requireRider,
    requireOrderOwner,
    requireAssignedRider,
    validateOrderTransition,
    getRequiredSecret
};
