const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { db, admin } = require("../core/admin");
const ClearTaxProvider = require("../src/providers/ClearTaxProvider");
const { cleartaxAuthToken } = require("../core/secrets");

const REGION = 'asia-south1';

/**
 * Core business logic for processing inter-hub stock transfer E-Way Bill generation.
 * Separated from Firestore trigger event wrapper for direct unit-testability.
 *
 * @param {object} beforeData - Previous document data
 * @param {object} afterData - New document data
 * @param {string} transferId - Stock transfer document ID
 * @param {object|null} customProvider - Optional injected provider for testing
 */
async function processStockTransferEWayBill(beforeData, afterData, transferId, customProvider = null) {
    if (!beforeData || !afterData || !transferId) {
        return { skipped: true, reason: 'INVALID_INPUT' };
    }

    // 1. Condition check: Status transition to IN_TRANSIT
    const wasInTransit = beforeData.status === 'IN_TRANSIT';
    const isInTransit = afterData.status === 'IN_TRANSIT';

    if (wasInTransit || !isInTransit) {
        return { skipped: true, reason: 'STATUS_NOT_TRANSITIONED_TO_IN_TRANSIT' };
    }

    // 2. Consignment value check: Must be >= ₹50,000 (Section 68 of CGST Act threshold)
    const consignmentValue = Number(afterData.totalConsignmentValue || afterData.totalAmount || 0);
    if (consignmentValue < 50000) {
        console.log(`[E-Way Bill] Transfer ${transferId} value (₹${consignmentValue}) is below mandatory threshold of ₹50,000. Skipping E-Way bill generation.`);
        return { skipped: true, reason: 'CONSIGNMENT_VALUE_BELOW_THRESHOLD', value: consignmentValue };
    }

    // 3. Idempotency guard: Do not re-generate if already has an E-Way bill or GENERATED status
    if (afterData.ewayBillNumber || afterData.ewayBillStatus === 'GENERATED') {
        console.log(`[E-Way Bill] Transfer ${transferId} already has E-Way bill (${afterData.ewayBillNumber}). Skipping duplicate generation.`);
        return { skipped: true, reason: 'ALREADY_GENERATED', ewayBillNumber: afterData.ewayBillNumber };
    }

    // 4. Construct payload for ClearTax
    const payload = {
        transferId: transferId,
        id: transferId,
        createdAt: afterData.createdAt,
        originHubGstin: afterData.originHubGstin,
        originHubName: afterData.originHubName,
        originHubAddress: afterData.originHubAddress,
        originHubPlace: afterData.originHubPlace,
        originHubPincode: afterData.originHubPincode,
        destinationHubGstin: afterData.destinationHubGstin,
        destinationHubName: afterData.destinationHubName,
        destinationHubAddress: afterData.destinationHubAddress,
        destinationHubPlace: afterData.destinationHubPlace,
        destinationHubPincode: afterData.destinationHubPincode,
        vehicleNo: afterData.vehicleNo,
        transporterId: afterData.transporterId,
        driverPhone: afterData.driverPhone,
        lrNumber: afterData.lrNumber,
        transDistance: afterData.transDistance,
        totalConsignmentValue: consignmentValue,
        totalAmount: consignmentValue,
        items: (afterData.items || afterData.lineItems || []).map(item => ({
            productName: item.productName || item.skuCode || item.name || "Agrochemical Consignment",
            skuCode: item.skuCode || "",
            hsnCode: item.hsnCode || "3101",
            quantity: Number(item.quantity || 1),
            qtyUnit: item.qtyUnit || "NOS",
            taxableAmount: item.taxableAmount !== undefined ? Number(item.taxableAmount) : (item.taxableValue !== undefined ? Number(item.taxableValue) : (Number(item.price || 0) * Number(item.quantity || 1))),
            cgstRate: item.cgstRate !== undefined ? Number(item.cgstRate) : 2.5,
            sgstRate: item.sgstRate !== undefined ? Number(item.sgstRate) : 2.5,
            igstRate: item.igstRate !== undefined ? Number(item.igstRate) : 0,
            price: Number(item.price || 0)
        }))
    };

    try {
        const provider = customProvider || new ClearTaxProvider();
        const result = await provider.generateEWayBill(payload);

        if (result && result.status === 'SUCCESS') {
            const ewayBillNumber = result.ewayBillNo || result.providerReferenceId;
            const validUpto = result.validUpto || null;
            const pdfUrl = result.pdfUrl || null;

            await db.collection("stock_transfers").doc(transferId).set({
                ewayBillNumber: ewayBillNumber,
                ewayBillValidUpto: validUpto,
                ewayBillPdfUrl: pdfUrl,
                ewayBillStatus: "GENERATED",
                ewayBillGeneratedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });

            console.log(`[E-Way Bill] Successfully generated E-Way bill ${ewayBillNumber} for transfer ${transferId}`);
            return {
                success: true,
                ewayBillNumber,
                validUpto,
                pdfUrl,
                status: 'GENERATED'
            };
        } else {
            const errorMsg = result?.error?.message || (result?.error ? JSON.stringify(result.error) : 'ClearTax provider returned unsuccessful status');
            throw new Error(errorMsg);
        }
    } catch (error) {
        console.error(`[E-Way Bill] Generation failed for transfer ${transferId}:`, error.message);

        // Update transfer document with failure state
        await db.collection("stock_transfers").doc(transferId).set({
            ewayBillStatus: "FAILED",
            ewayBillError: error.message
        }, { merge: true });

        // Create escalation alert in admin_alerts
        await db.collection("admin_alerts").add({
            type: "EWAY_BILL_GENERATION_FAILED",
            transferId: transferId,
            error: error.message,
            severity: "HIGH",
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        return {
            success: false,
            status: 'FAILED',
            error: error.message
        };
    }
}

/**
 * Cloud Function Trigger: onStockTransferUpdated
 */
const onStockTransferUpdated = onDocumentUpdated({
    document: "stock_transfers/{transferId}",
    region: REGION,
    secrets: [cleartaxAuthToken]
}, async (event) => {
    const beforeData = event.data?.before?.data();
    const afterData = event.data?.after?.data();
    const transferId = event.params.transferId;

    return await processStockTransferEWayBill(beforeData, afterData, transferId);
});

module.exports = {
    onStockTransferUpdated,
    processStockTransferEWayBill
};
