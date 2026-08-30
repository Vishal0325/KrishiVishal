const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { db, admin } = require("../core/admin");

const REGION = 'asia-south1';

/**
 * onReturnStockSync: Triggered when a return is COMPLETED and QC is PASSED.
 */
exports.onReturnStockSync = onDocumentUpdated({ document: "returns/{returnId}", region: REGION }, async (event) => {
    const change = event.data;
    const context = { params: event.params };
    const newData = change.after.data();
    const oldData = change.before.data();
    const returnId = context.params.returnId;

    if (!newData || !oldData) return null;

    if (newData.status === 'COMPLETED' &&
        newData.qcStatus === 'PASSED' &&
        oldData.qcStatus !== 'PASSED' &&
        newData.stockRestored !== true) {

        const productId = newData.productId;
        const variantId = newData.variantId;
        const quantity = newData.quantity || 1;

        if (!productId) {
            console.error(`Missing productId in return ${returnId}`);
            return null;
        }

        try {
            await db.runTransaction(async (transaction) => {
                const returnRef = change.after.ref;
                const rSnap = await transaction.get(returnRef);

                if (rSnap.data().stockRestored === true) return;

                const productRef = db.collection("products").doc(productId);
                const productSnap = await transaction.get(productRef);

                if (!productSnap.exists) {
                    console.error(`Product ${productId} not found for return ${returnId}`);
                    return;
                }

                const productData = productSnap.data();

                if (variantId) {
                    const variantRef = productRef.collection("variants").doc(variantId);
                    const vSnap = await transaction.get(variantRef);

                    if (vSnap.exists) {
                        transaction.update(variantRef, {
                            stock: admin.firestore.FieldValue.increment(quantity)
                        });
                    }

                    const updatedVariants = (productData.variants || []).map(v => {
                        if (v.id === variantId) return { ...v, stock: (v.stock || 0) + quantity };
                        return v;
                    });
                    transaction.update(productRef, {
                        variants: updatedVariants,
                        stockQuantity: admin.firestore.FieldValue.increment(quantity),
                        stock: admin.firestore.FieldValue.increment(quantity)
                    });
                } else {
                    transaction.update(productRef, {
                        stockQuantity: admin.firestore.FieldValue.increment(quantity),
                        stock: admin.firestore.FieldValue.increment(quantity)
                    });
                }

                transaction.update(returnRef, {
                    stockRestored: true,
                    stockRestoredAt: admin.firestore.FieldValue.serverTimestamp()
                });
            });
            console.log(`Stock restored for Product ${productId} via Return ${returnId}`);
        } catch (error) {
            console.error(`Failed to restore stock for return ${returnId}:`, error);
        }
    }
    return null;
});
