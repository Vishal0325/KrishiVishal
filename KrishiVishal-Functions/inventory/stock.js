const { onDocumentUpdated, onDocumentWritten } = require("firebase-functions/v2/firestore");
const { db, admin } = require("../core/admin");
const { getWarehouseStockRef, recordMovement, DEFAULT_WAREHOUSE_ID } = require("./inventoryEngine");

const REGION = 'asia-south1';

/**
 * onReturnStockSync: Triggered when a return is COMPLETED and QC is processed.
 * Routes to RETURN_IN (available stock) or DAMAGE based on qcStatus with full ledger trail.
 */
exports.onReturnStockSync = onDocumentUpdated({ document: "returns/{returnId}", region: REGION }, async (event) => {
    const change = event.data;
    const context = { params: event.params };
    const newData = change.after?.data();
    const oldData = change.before?.data();
    const returnId = context.params.returnId;

    if (!newData || !oldData) return null;

    if (newData.status === 'COMPLETED' &&
        newData.stockRestored !== true &&
        (newData.qcStatus === 'PASSED' || newData.qcStatus === 'DAMAGED')) {

        const skuCode = newData.skuCode;
        const productId = newData.productId;
        const quantity = Number(newData.quantity || 1);
        const batchId = newData.batchId || "GENERAL";
        const warehouseId = newData.warehouseId || DEFAULT_WAREHOUSE_ID;
        const isPassed = newData.qcStatus === 'PASSED';

        if (!skuCode && !productId) {
            console.error(`Missing skuCode and productId in return ${returnId}`);
            return null;
        }

        try {
            await db.runTransaction(async (transaction) => {
                const returnRef = change.after.ref;
                const rSnap = await transaction.get(returnRef);
                if (rSnap.data().stockRestored === true) return;

                let targetSkuCode = skuCode;

                // Fallback: If legacy return only had productId, find first active SKU
                if (!targetSkuCode && productId) {
                    const skusSnap = await transaction.get(db.collection("skus").where("productId", "==", productId).limit(1));
                    if (!skusSnap.empty) {
                        targetSkuCode = skusSnap.docs[0].id;
                    }
                }

                if (targetSkuCode) {
                    const skuRef = db.collection("skus").doc(targetSkuCode);
                    const skuSnap = await transaction.get(skuRef);

                    if (skuSnap.exists) {
                        const wsRef = getWarehouseStockRef(targetSkuCode, batchId, warehouseId);
                        const wsSnap = await transaction.get(wsRef);
                        const wsData = wsSnap.exists ? wsSnap.data() : { availableStock: 0, committedStock: 0, damagedStock: 0 };

                        const availBefore = wsData.availableStock || 0;
                        const availAfter = availBefore + (isPassed ? quantity : 0);
                        const damagedAfter = (wsData.damagedStock || 0) + (isPassed ? 0 : quantity);

                        transaction.set(wsRef, {
                            skuCode: targetSkuCode,
                            batchId,
                            warehouseId,
                            availableStock: availAfter,
                            damagedStock: damagedAfter,
                            updatedAt: admin.firestore.FieldValue.serverTimestamp()
                        }, { merge: true });

                        if (isPassed) {
                            transaction.update(skuRef, {
                                "inventory.availableStock": admin.firestore.FieldValue.increment(quantity),
                                "inventory.totalStock": admin.firestore.FieldValue.increment(quantity),
                                updatedAt: admin.firestore.FieldValue.serverTimestamp()
                            });
                        }

                        recordMovement(transaction, {
                            movementType: isPassed ? "RETURN_IN" : "DAMAGE",
                            skuCode: targetSkuCode,
                            batchId,
                            warehouseId,
                            quantity,
                            availableBefore: availBefore,
                            availableAfter: availAfter,
                            committedBefore: wsData.committedStock || 0,
                            committedAfter: wsData.committedStock || 0,
                            referenceId: returnId,
                            actorId: newData.inspectedBy || "QC_STAFF",
                            actorRole: "STAFF",
                            reason: `Customer return inspection: ${newData.qcStatus}`,
                            idempotencyKey: `RETURN:${returnId}:RESTORE`
                        });
                    }
                }

                transaction.update(returnRef, {
                    stockRestored: true,
                    stockRestoredAt: admin.firestore.FieldValue.serverTimestamp()
                });
            });

            console.log(`Stock processed for Return ${returnId} (QC: ${newData.qcStatus})`);
        } catch (error) {
            console.error(`CRITICAL: Failed to restore stock for return ${returnId}:`, error.message);
            throw error;
        }
    }
    return null;
});

/**
 * onSkuWrite: Syncs SKU changes (price, stock) to the parent Product document for UI consistency.
 * Idempotent, checks for actual differences before writing to avoid loops.
 */
exports.onSkuWrite = onDocumentWritten({ document: "skus/{skuId}", region: REGION }, async (event) => {
    const afterData = event.data?.after?.data();
    const beforeData = event.data?.before?.data();

    // Check if relevant fields actually changed to prevent trigger churn
    if (beforeData && afterData) {
        const priceSame = beforeData.pricing?.consumerPrice === afterData.pricing?.consumerPrice &&
            beforeData.pricing?.mrp === afterData.pricing?.mrp;
        const stockSame = beforeData.inventory?.availableStock === afterData.inventory?.availableStock;
        const activeSame = beforeData.isActive === afterData.isActive;
        const nameSame = beforeData.name === afterData.name;
        if (priceSame && stockSame && activeSame && nameSame) {
            return null; // No relevant change
        }
    }

    const productId = afterData?.productId || beforeData?.productId;
    if (!productId) return null;

    try {
        const skuSnap = await db.collection("skus")
            .where("productId", "==", productId)
            .where("isActive", "==", true)
            .get();

        const variants = skuSnap.docs.map(doc => {
            const data = doc.data();
            return {
                id: doc.id,
                skuCode: data.skuCode || doc.id,
                label: data.name || `${data.segments?.pack || ''}`,
                price: Number(data.pricing?.consumerPrice || 0),
                mrp: Number(data.pricing?.mrp || 0),
                stock: Number(data.inventory?.availableStock || 0),
                unit: data.segments?.unit || "",
                size: `${data.segments?.size || ''}`,
                reorderLevel: Number(data.reorderLevel || 50),
                barcode: data.barcode?.ean13 || ""
            };
        });

        const productRef = db.collection("products").doc(productId);
        const productSnap = await productRef.get();

        if (productSnap.exists) {
            const minPrice = variants.length > 0 ? Math.min(...variants.map(v => v.price)) : 0;
            const totalAvailableStock = variants.reduce((sum, v) => sum + v.stock, 0);

            await productRef.update({
                variants,
                price: minPrice,
                discountedPrice: minPrice,
                stockQuantity: totalAvailableStock,
                stock: totalAvailableStock,
                hasVariants: variants.length > 1,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            console.log(`Synced ${variants.length} SKUs to Product ${productId} (Stock: ${totalAvailableStock}, MinPrice: ₹${minPrice})`);
        }
    } catch (err) {
        console.error(`Failed to sync SKUs for Product ${productId}:`, err.message);
    }
    return null;
});
