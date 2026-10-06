/**
 * KrishiVishal Marketing Triggers
 * Automated lifecycle CAPI conversion tracking for order deliveries and payments.
 */

const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { db, admin } = require("../core/admin");
const { sendCapiEvent } = require("./metaCapiClient");

const REGION = 'asia-south1';

/**
 * Evaluates whether an order update triggers a Meta CAPI Purchase event.
 * Pure logic helper for testing and runtime execution.
 *
 * Conditions:
 * 1. Status transitions to DELIVERED, OR paymentStatus transitions to PAID.
 * 2. Idempotency: metaPurchaseEventSent must NOT be true.
 */
function shouldTriggerPurchaseCapi(newData, oldData) {
    if (!newData) return false;
    if (newData.metaPurchaseEventSent === true) return false;

    const newStatus = (newData.status || '').toUpperCase();
    const oldStatus = (oldData?.status || '').toUpperCase();
    const newPayment = (newData.paymentStatus || '').toUpperCase();
    const oldPayment = (oldData?.paymentStatus || '').toUpperCase();

    const isDeliveredTransition = newStatus === 'DELIVERED' && oldStatus !== 'DELIVERED';
    const isPaidTransition = newPayment === 'PAID' && oldPayment !== 'PAID';

    return isDeliveredTransition || isPaidTransition;
}

/**
 * Builds the CAPI Purchase payload from order data.
 */
function buildPurchaseCapiPayload(orderId, orderData) {
    const phone = orderData.customerPhone || orderData.phone || orderData.userPhone || null;
    const firstName = orderData.customerName || orderData.userName || orderData.name || null;
    const city = orderData.shippingAddress?.city || orderData.city || null;
    const value = Number(orderData.totalAmount || orderData.payableAmount || orderData.grandTotal || 0);

    return {
        eventName: 'Purchase',
        eventId: `PURCHASE_${orderId}`,
        userData: {
            phone,
            firstName,
            city
        },
        customData: {
            value,
            currency: 'INR',
            content_type: 'product'
        },
        actionSource: 'app'
    };
}

/**
 * Core handler to process order CAPI event with idempotency.
 */
async function handleOrderCapiTrigger(orderId, newData, oldData, sendEventFn = sendCapiEvent) {
    if (!shouldTriggerPurchaseCapi(newData, oldData)) {
        return { triggered: false, reason: 'CONDITIONS_NOT_MET_OR_ALREADY_SENT' };
    }

    const payload = buildPurchaseCapiPayload(orderId, newData);
    const capiResult = await sendEventFn(payload);

    // Atomically mark idempotency flag
    try {
        const orderRef = db.collection("orders").doc(orderId);
        await orderRef.update({
            metaPurchaseEventSent: true,
            metaPurchaseEventSentAt: admin.firestore.FieldValue.serverTimestamp(),
            metaPurchaseEventResult: capiResult?.skipped ? 'SKIPPED_NO_CREDS' : (capiResult?.success ? 'SUCCESS' : 'FAILED')
        });
    } catch (err) {
        console.error(`[marketingTriggers] Failed to update metaPurchaseEventSent on order ${orderId}:`, err);
    }

    return {
        triggered: true,
        capiResult,
        orderId
    };
}

/**
 * Cloud Function Trigger: onOrderDeliveredCAPI
 * Fires on orders/{orderId} update to push offline/online conversions to Meta.
 */
const onOrderDeliveredCAPI = onDocumentUpdated({ document: "orders/{orderId}", region: REGION }, async (event) => {
    try {
        const change = event.data;
        if (!change) return null;

        const newData = change.after.data();
        const oldData = change.before.data();
        const orderId = event.params.orderId;

        return await handleOrderCapiTrigger(orderId, newData, oldData);
    } catch (error) {
        console.error('[onOrderDeliveredCAPI] Error executing trigger:', error);
        return null;
    }
});

module.exports = {
    shouldTriggerPurchaseCapi,
    buildPurchaseCapiPayload,
    handleOrderCapiTrigger,
    onOrderDeliveredCAPI
};
