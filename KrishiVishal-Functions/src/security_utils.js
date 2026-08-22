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
 * Checks if the user is an Admin.
 * Custom claims are authoritative, fallback to user document for compatibility.
 */
function requireAdmin(context) {
    requireAuth(context);
    const isAdmin = context.auth.token.admin === true || context.auth.token.role === 'ADMIN' || context.auth.token.role === 'SuperAdmin';
    if (!isAdmin) {
        throw new functions.https.HttpsError('permission-denied', 'Admin privileges required.');
    }
}

/**
 * Checks if the user is a Rider.
 */
function requireRider(context) {
    requireAuth(context);
    if (context.auth.token.role !== 'RIDER') {
        throw new functions.https.HttpsError('permission-denied', 'Rider privileges required.');
    }
}

/**
 * Verifies that the authenticated user owns the order OR is an admin.
 */
function requireOrderOwner(order, context) {
    const uid = requireAuth(context);
    const isAdmin = context.auth.token.admin === true || context.auth.token.role === 'ADMIN';
    if (order.userId !== uid && !isAdmin) {
        throw new functions.https.HttpsError('permission-denied', 'You do not have permission to access this order.');
    }
}

/**
 * Verifies that the authenticated user is the assigned rider for the order OR an admin.
 */
function requireAssignedRider(order, context) {
    const uid = requireAuth(context);
    const isAdmin = context.auth.token.admin === true || context.auth.token.role === 'ADMIN';
    if (order.riderId !== uid && !isAdmin) {
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
    // Admins can bypass state machine for corrections (explicit override)
    if (context && context.auth && context.auth.token.admin === true) {
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

module.exports = {
    requireAuth,
    requireAdmin,
    requireRider,
    requireOrderOwner,
    requireAssignedRider,
    validateOrderTransition
};
