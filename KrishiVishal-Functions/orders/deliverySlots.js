const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { db, admin } = require("../core/admin");
const { isAdminRequest } = require("../core/utils");

const REGION = 'asia-south1';

/**
 * Schema Summary for Agent 2 / 3 / 4 Reference:
 * Collection: delivery_slots/{slotId}
 * Document fields:
 * - slotId: string (e.g. "SLOT_2026-09-16_09-12_PATNA")
 * - date: string ("YYYY-MM-DD")
 * - startTime: string ("09:00")
 * - endTime: string ("12:00")
 * - hubId: string (e.g. "HUB_PATNA_MAIN")
 * - maxCapacity: number (default: 30)
 * - currentBookings: number (default: 0)
 * - isActive: boolean (default: true)
 * - createdAt: timestamp
 */

/**
 * getAvailableSlots: Callable function to retrieve active slots with available capacity.
 * Inputs: { date: "YYYY-MM-DD", hubId?: string }
 */
exports.getAvailableSlots = onCall({ region: REGION }, async (request) => {
    if (!request.auth) {
        throw new HttpsError('unauthenticated', 'Login required to fetch delivery slots.');
    }

    const { date, hubId } = request.data || {};
    if (!date || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new HttpsError('invalid-argument', 'Valid date in YYYY-MM-DD format is required.');
    }

    try {
        let query = db.collection("delivery_slots")
            .where("date", "==", date)
            .where("isActive", "==", true);

        if (hubId && typeof hubId === 'string') {
            query = query.where("hubId", "==", hubId);
        }

        const snapshot = await query.get();
        const slots = [];

        snapshot.forEach(doc => {
            const data = doc.data();
            const maxCapacity = Number(data.maxCapacity) || 0;
            const currentBookings = Number(data.currentBookings) || 0;
            const availableCapacity = Math.max(0, maxCapacity - currentBookings);

            slots.push({
                slotId: doc.id,
                date: data.date,
                startTime: data.startTime || "",
                endTime: data.endTime || "",
                hubId: data.hubId || "DEFAULT",
                maxCapacity,
                currentBookings,
                availableCapacity,
                isAvailable: availableCapacity > 0
            });
        });

        // Sort chronologically by startTime
        slots.sort((a, b) => (a.startTime || "").localeCompare(b.startTime || ""));

        return { slots };
    } catch (error) {
        console.error("[getAvailableSlots] Error:", error);
        throw new HttpsError('internal', error.message);
    }
});

/**
 * validateAndReserveSlot: Helper executed inside createOrder transaction.
 */
exports.validateAndReserveSlot = async (transaction, slotId) => {
    if (!slotId || typeof slotId !== 'string') return null;

    const slotRef = db.collection("delivery_slots").doc(slotId);
    const slotDoc = await transaction.get(slotRef);

    if (!slotDoc.exists) {
        throw new Error(`Delivery slot not found: ${slotId}`);
    }

    const data = slotDoc.data();
    if (!data.isActive) {
        throw new Error(`Delivery slot ${slotId} is no longer active.`);
    }

    const maxCapacity = Number(data.maxCapacity) || 0;
    const currentBookings = Number(data.currentBookings) || 0;

    if (currentBookings >= maxCapacity) {
        throw new Error(`Delivery slot ${slotId} is fully booked (${currentBookings}/${maxCapacity}). Please select another slot.`);
    }

    transaction.update(slotRef, {
        currentBookings: admin.firestore.FieldValue.increment(1),
        lastBookedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return {
        slotId,
        date: data.date,
        startTime: data.startTime,
        endTime: data.endTime,
        hubId: data.hubId
    };
};

/**
 * deleteDeliverySlot: Delete a slot only if currentBookings === 0.
 */
exports.deleteDeliverySlot = onCall({ region: REGION }, async (request) => {
    if (!(await isAdminRequest({ auth: request.auth }))) {
        throw new HttpsError('permission-denied', 'Admin access required to delete delivery slots.');
    }

    const { slotId } = request.data || {};
    if (!slotId || typeof slotId !== 'string') {
        throw new HttpsError('invalid-argument', 'Valid slotId is required.');
    }

    const slotRef = db.collection("delivery_slots").doc(slotId);
    const slotDoc = await slotRef.get();

    if (!slotDoc.exists) {
        throw new HttpsError('not-found', `Delivery slot ${slotId} not found.`);
    }

    const currentBookings = Number(slotDoc.data().currentBookings) || 0;
    if (currentBookings > 0) {
        throw new HttpsError('failed-precondition', `Cannot delete slot with ${currentBookings} active booking(s). Deactivate the slot instead.`);
    }

    await slotRef.delete();
    return { success: true, slotId };
});
