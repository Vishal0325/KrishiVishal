const { HttpsError } = require("firebase-functions/v2/https");

/**
 * Ensures user is authenticated and returns their UID.
 * Supports both v1 (context) and v2 (request) objects.
 */
function requireAuth(obj) {
    const auth = obj.auth;
    if (!auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }
    return auth.uid;
}

/**
 * Checks if the user is an Admin (Managerial Role).
 */
function requireAdmin(obj) {
    requireAuth(obj);
    const role = obj.auth.token.role;
    const isAdmin = ['SuperAdmin', 'CatalogManager', 'OrderManager'].includes(role);
    if (!isAdmin) {
        throw new HttpsError('permission-denied', 'Admin privileges required.');
    }
}

/**
 * Checks for SuperAdmin specifically.
 */
function requireSuperAdmin(obj) {
    requireAuth(obj);
    if (obj.auth.token.role !== 'SuperAdmin') {
        throw new HttpsError('permission-denied', 'SuperAdmin privileges required.');
    }
}

/**
 * Checks if the user is a Rider.
 */
function requireRider(obj) {
    requireAuth(obj);
    if (obj.auth.token.role !== 'Rider') {
        throw new HttpsError('permission-denied', 'Rider privileges required.');
    }
}

/**
 * Verifies that the authenticated user owns the order OR is a management user.
 */
function requireOrderOwner(order, obj) {
    const uid = requireAuth(obj);
    const role = obj.auth.token.role;
    const isManager = ['SuperAdmin', 'OrderManager'].includes(role);

    if (order.userId !== uid && !isManager) {
        throw new HttpsError('permission-denied', 'You do not have permission to access this order.');
    }
}

/**
 * Verifies that the authenticated user is the assigned rider for the order OR a management user.
 */
function requireAssignedRider(order, obj) {
    const uid = requireAuth(obj);
    const role = obj.auth.token.role;
    const isManager = ['SuperAdmin', 'OrderManager'].includes(role);

    if (order.riderId !== uid && !isManager) {
        throw new HttpsError('permission-denied', 'You are not the assigned rider for this order.');
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
    'DELIVERED': ['RETURNED'],
    'CANCELLED': [],
    'RETURNED': []
};

function validateOrderTransition(oldStatus, newStatus, obj) {
    if (obj && obj.auth && obj.auth.token) {
        const token = obj.auth.token;
        if (token.admin === true || token.isAdmin === true || ['ADMIN', 'SuperAdmin', 'OrderManager'].includes(token.role)) {
            return true;
        }
    }

    if (!VALID_TRANSITIONS[oldStatus]) {
        throw new HttpsError('failed-precondition', `Unknown initial status: ${oldStatus}`);
    }

    if (!VALID_TRANSITIONS[oldStatus].includes(newStatus)) {
        throw new HttpsError('failed-precondition', `Invalid status transition from ${oldStatus} to ${newStatus}`);
    }

    return true;
}

/**
 * Safe Secret Handling.
 */
function getRequiredSecret(secretName, description = "") {
    const value = process.env[secretName];
    if (!value || value.trim() === "") {
        console.error("FATAL: Required secret missing:", secretName);
        throw new HttpsError(
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
    requireRider,
    requireOrderOwner,
    requireAssignedRider,
    validateOrderTransition,
    getRequiredSecret
};
