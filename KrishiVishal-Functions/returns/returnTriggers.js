const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { db, admin } = require("../core/admin");
const { generateCreditNoteForReturn } = require("../invoices/creditNoteEngine");
const { calculateTaxForOrder } = require("../tax/gstEngine");

const REGION = "asia-south1";

/**
 * Core business handler for return QC approval and Credit Note financial issuance.
 * Extracted as a pure async function for deterministic unit and emulator testing.
 *
 * @param {object} params
 * @param {string} params.returnId
 * @param {object} params.beforeData
 * @param {object} params.afterData
 * @param {FirebaseFirestore.DocumentReference} [params.returnRef]
 * @returns {Promise<object|null>}
 */
async function handleReturnApproved({ returnId, beforeData, afterData, returnRef = null }) {
    if (!beforeData || !afterData || !returnId) return null;

    // Condition to fire:
    // 1. Authoritative business approval reached: status === "APPROVED" AND qcStatus === "PASSED"
    // 2. Newly transitioned into this fully approved state, OR an unfinalized return recovering from a missing credit note number
    // 3. Financial settlement pending (refundStatus !== "CREDIT_NOTE_ISSUED" and (!afterData.creditNoteNo || afterData.refundStatus === "PENDING"))
    const wasFullyApproved = beforeData.status === "APPROVED" && beforeData.qcStatus === "PASSED";
    const isNowFullyApproved = afterData.status === "APPROVED" && afterData.qcStatus === "PASSED";
    const isPendingFinancials = afterData.refundStatus !== "CREDIT_NOTE_ISSUED" && (!afterData.creditNoteNo || afterData.refundStatus === "PENDING");

    // Fires on fresh approval transition OR crash-recovery retry where creditNoteNo is still missing
    const isEligibleForIssuance = (!wasFullyApproved && isNowFullyApproved) || (isNowFullyApproved && !beforeData.creditNoteNo);

    if (!isEligibleForIssuance || !isPendingFinancials) {
        return null;
    }

    const orderId = afterData.orderId;
    if (!orderId) {
        console.error(`[onReturnApproved] Missing orderId in return ${returnId}`);
        return null;
    }

    // 1. Fetch parent order document
    const orderDoc = await db.collection("orders").doc(orderId).get();
    if (!orderDoc.exists) {
        throw new Error(`ORDER_NOT_FOUND: Order ${orderId} does not exist for return ${returnId}`);
    }
    const order = orderDoc.data() || {};
    const originalInvoiceNo = order.invoiceNumber || order.invoice?.invoiceNumber;
    if (!originalInvoiceNo) {
        throw new Error(`MISSING_INVOICE_NUMBER: Order ${orderId} does not possess an official tax invoice number`);
    }

    // 2. Resolve returned items array
    let returnedItems = afterData.items;
    if (!Array.isArray(returnedItems) || returnedItems.length === 0) {
        // Fallback for single-item return formats: { skuCode, productId, quantity, price, taxablePrice, etc. }
        const matchedItem = (order.items || []).find(it =>
            (afterData.skuCode && (it.skuCode === afterData.skuCode || it.skuId === afterData.skuCode)) ||
            (afterData.productId && (it.productId === afterData.productId || it.id === afterData.productId))
        ) || (Array.isArray(order.items) && order.items.length > 0 ? order.items[0] : null);

        returnedItems = [{
            skuId: afterData.skuCode || afterData.productId || (matchedItem && (matchedItem.skuCode || matchedItem.skuId)) || "SKU_GEN_RETURN",
            name: (matchedItem && matchedItem.name) || afterData.productName || "Returned Agri Product",
            quantity: Number(afterData.quantity || 1),
            taxablePrice: matchedItem?.taxablePrice !== undefined ? matchedItem.taxablePrice : (matchedItem?.price || matchedItem?.sellingPrice || afterData.price || 0),
            costPrice: matchedItem?.costPrice || afterData.costPrice || 0,
            hsn: matchedItem?.hsn || matchedItem?.hsnCode || afterData.hsn || "3808"
        }];
    }

    // 3. Calculate tax breakdown for returned items
    const shippingState = order.shippingState || order.shippingAddress?.state || "Bihar";
    const taxCalc = calculateTaxForOrder({
        shippingState,
        items: returnedItems
    });

    // 4. Invoke canonical Credit Note Engine
    const result = await generateCreditNoteForReturn({
        orderId,
        returnRequestId: returnId,
        originalInvoiceNo,
        returnedItems,
        returnReason: afterData.reason || afterData.returnReason || "CUSTOMER_RETURN",
        shippingState,
        restockable: afterData.restockable !== false, // QC Passed returns are restockable by default
        createdBy: afterData.approvedBy || "SYSTEM_RETURN_TRIGGER"
    });

    // 5. Update returns/{returnId} document atomically
    const targetRef = returnRef || db.collection("returns").doc(returnId);
    const updatePayload = {
        creditNoteNo: result.creditNoteNumber,
        creditNoteId: result.creditNoteId,
        refundStatus: "CREDIT_NOTE_ISSUED",
        financialSettlementAt: admin.firestore.FieldValue.serverTimestamp()
    };
    await targetRef.update(updatePayload);

    console.log(`[onReturnApproved] Successfully issued Credit Note ${result.creditNoteNumber} for return ${returnId}`);

    return {
        success: true,
        returnId,
        orderId,
        creditNoteNumber: result.creditNoteNumber,
        creditNoteId: result.creditNoteId,
        taxCalc
    };
}

/**
 * Firestore trigger: onUpdate of returns/{returnId}
 */
const onReturnApproved = onDocumentUpdated({ document: "returns/{returnId}", region: REGION }, async (event) => {
    const change = event.data;
    if (!change) return null;

    const returnId = event.params.returnId;
    const beforeData = change.before?.data();
    const afterData = change.after?.data();

    try {
        return await handleReturnApproved({
            returnId,
            beforeData,
            afterData,
            returnRef: change.after.ref
        });
    } catch (err) {
        console.error(`[onReturnApproved] Failed processing return ${returnId}:`, err);
        throw err;
    }
});

module.exports = {
    onReturnApproved,
    handleReturnApproved
};
