/**
 * KrishiVishal Leads & Tele-calling Engine
 * Role-based lead disposition management, follow-up scheduling, and Spoke Hub routing.
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { db, admin } = require("../core/admin");

const REGION = 'asia-south1';
const ALLOWED_TELECALLING_ROLES = [
    'telecaller',
    'kisancallcenter',
    'supportagent',
    'crmexecutive',
    'hubmanager',
    'admin',
    'superadmin',
    'ordermanager',
    'operationsadmin'
];

/**
 * Validates caller role for telecalling and leads management.
 */
function requireLeadsRole(auth) {
    if (!auth || !auth.uid) {
        throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }
    const token = auth.token || {};
    const role = (token.role || '').toLowerCase();
    const isAuthorized = token.admin === true ||
        token.isAdmin === true ||
        token.isSuperAdmin === true ||
        ALLOWED_TELECALLING_ROLES.includes(role);

    if (!isAuthorized) {
        throw new HttpsError('permission-denied', 'Unauthorized. Caller lacks telecalling or leads management role.');
    }
}

const VALID_STATUSES = [
    'NEW',
    'CONTACTED',
    'INTERESTED',
    'CONVERTED',
    'DROPPED',
    'CALLBACK_REQUESTED'
];

const VALID_DISPOSITIONS = [
    'INTERESTED_ORDER_PLACED',
    'CALLBACK_REQUESTED',
    'DOUBT_ON_PRICE_OR_DELIVERY',
    'CROP_ADVISORY_NEEDED',
    'WRONG_NUMBER_OR_JUNK'
];

/**
 * Validates lead disposition payload.
 * Pure function for testing and runtime input hygiene.
 */
function validateDispositionInput({ status, disposition, callbackAt }) {
    if (!status || !VALID_STATUSES.includes(status.toUpperCase())) {
        throw new HttpsError(
            'invalid-argument',
            `Invalid status '${status}'. Must be one of: ${VALID_STATUSES.join(', ')}`
        );
    }

    if (disposition && !VALID_DISPOSITIONS.includes(disposition.toUpperCase())) {
        throw new HttpsError(
            'invalid-argument',
            `Invalid disposition '${disposition}'. Must be one of: ${VALID_DISPOSITIONS.join(', ')}`
        );
    }

    let parsedCallback = null;
    if (callbackAt) {
        const d = new Date(callbackAt);
        if (isNaN(d.getTime())) {
            throw new HttpsError('invalid-argument', 'Invalid callbackAt date format.');
        }
        parsedCallback = d.toISOString();
    }

    return {
        status: status.toUpperCase(),
        disposition: disposition ? disposition.toUpperCase() : null,
        callbackAt: parsedCallback
    };
}

/**
 * Callable Function: updateLeadDisposition
 * Parameters: { leadId: string, status: string, disposition: string, notes: string, callbackAt?: string }
 */
const updateLeadDisposition = onCall({ region: REGION, timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
    requireLeadsRole(request.auth);

    const { leadId, status, disposition, notes, callbackAt } = request.data || {};
    if (!leadId || typeof leadId !== 'string' || leadId.trim().length === 0) {
        throw new HttpsError('invalid-argument', 'Valid leadId is required.');
    }

    const cleanLeadId = leadId.trim();
    const validated = validateDispositionInput({ status, disposition, callbackAt });

    const leadRef = db.collection("leads").doc(cleanLeadId);
    const leadSnap = await leadRef.get();

    if (!leadSnap.exists) {
        throw new HttpsError('not-found', `Lead document ${cleanLeadId} not found.`);
    }

    const callerUid = request.auth.uid;
    const callerName = request.auth.token?.name || request.auth.token?.email || 'Telecaller';
    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    const updatePayload = {
        status: validated.status,
        telecallerDisposition: validated.disposition,
        lastNotes: notes || '',
        lastContactedBy: callerUid,
        lastContactedByName: callerName,
        lastContactedAt: timestamp,
        updatedAt: timestamp
    };

    if (validated.callbackAt) {
        updatePayload.callbackScheduledAt = validated.callbackAt;
    } else if (validated.status !== 'CALLBACK_REQUESTED') {
        updatePayload.callbackScheduledAt = null;
    }

    // Save call history entry in subcollection for audit trails
    const historyRef = leadRef.collection("call_history").doc();

    const batch = db.batch();
    batch.update(leadRef, updatePayload);
    batch.set(historyRef, {
        historyId: historyRef.id,
        leadId: cleanLeadId,
        status: validated.status,
        disposition: validated.disposition,
        notes: notes || '',
        callbackAt: validated.callbackAt,
        agentId: callerUid,
        agentName: callerName,
        recordedAt: timestamp
    });

    await batch.commit();

    return {
        success: true,
        leadId: cleanLeadId,
        status: validated.status,
        disposition: validated.disposition,
        callbackAt: validated.callbackAt
    };
});

/**
 * Callable Function: assignLeadsToHub
 * Parameters: { leadIds: string[], hubId: string }
 * Bulk assigns leads to a specific regional or spoke hub.
 */
const assignLeadsToHub = onCall({ region: REGION, timeoutSeconds: 60, memory: '256MiB' }, async (request) => {
    requireLeadsRole(request.auth);

    const { leadIds = [], hubId } = request.data || {};
    if (!hubId || typeof hubId !== 'string') {
        throw new HttpsError('invalid-argument', 'Valid hubId is required.');
    }
    if (!Array.isArray(leadIds) || leadIds.length === 0) {
        throw new HttpsError('invalid-argument', 'Non-empty leadIds array is required.');
    }

    const batch = db.batch();
    const timestamp = admin.firestore.FieldValue.serverTimestamp();
    const callerUid = request.auth.uid;

    leadIds.forEach((id) => {
        const leadRef = db.collection("leads").doc(String(id).trim());
        batch.update(leadRef, {
            assignedHubId: hubId,
            assignedAt: timestamp,
            assignedBy: callerUid,
            updatedAt: timestamp
        });
    });

    await batch.commit();

    return {
        success: true,
        hubId,
        assignedCount: leadIds.length
    };
});

module.exports = {
    validateDispositionInput,
    updateLeadDisposition,
    assignLeadsToHub,
    VALID_STATUSES,
    VALID_DISPOSITIONS
};
