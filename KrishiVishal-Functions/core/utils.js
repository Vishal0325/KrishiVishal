const { HttpsError } = require("firebase-functions/v2/https");
const { db } = require("./admin");

/**
 * Basic Circuit Breaker implementation for 3rd party API calls.
 */
class CircuitBreaker {
    constructor(serviceName, options = {}) {
        this.serviceName = serviceName;
        this.failureThreshold = options.failureThreshold || 5;
        this.resetTimeout = options.resetTimeout || 30000;
        this.failures = 0;
        this.lastFailureTime = 0;
        this.state = 'CLOSED';
    }

    async execute(action) {
        if (this.state === 'OPEN') {
            if (Date.now() - this.lastFailureTime > this.resetTimeout) {
                this.state = 'HALF_OPEN';
            } else {
                throw new Error(`Circuit Breaker [${this.serviceName}] is OPEN.`);
            }
        }
        try {
            const result = await action();
            this.failures = 0;
            this.state = 'CLOSED';
            return result;
        } catch (error) {
            this.failures++;
            this.lastFailureTime = Date.now();
            if (this.failures >= this.failureThreshold) this.state = 'OPEN';
            throw error;
        }
    }
}

async function checkFeatureFlag(flagName) {
    const config = await db.collection("settings").doc("config").get();
    const flags = config.data() || {};
    if (flags.maintenanceMode) throw new HttpsError('unavailable', 'Maintenance Mode');
    return !!flags[flagName];
}

async function isAdminRequest(obj) {
    // Support both v1 (context) and v2 (request/obj) patterns
    const auth = obj.auth || obj;
    if (!auth || !auth.uid) return false;

    // 1. Check Custom Claims (High Performance)
    if (auth.token && (auth.token.admin === true || auth.token.isAdmin === true ||
        ["ADMIN", "SuperAdmin", "CatalogManager", "OrderManager"].includes(auth.token.role))) {
        return true;
    }

    // 2. Fallback to DB check (Security)
    const userDoc = await db.collection("users").doc(auth.uid).get();
    const d = userDoc.data() || {};
    return d.isAdmin === true || ["ADMIN", "SuperAdmin"].includes(d.role);
}

function addToOutbox(transaction, type, payload) {
    const outboxRef = db.collection("outbox").doc();
    transaction.set(outboxRef, {
        type, payload, status: "PENDING", retryCount: 0,
        createdAt: require("firebase-admin").firestore.FieldValue.serverTimestamp(),
    });
}

module.exports = { CircuitBreaker, checkFeatureFlag, isAdminRequest, addToOutbox };
