const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { db, admin } = require("../core/admin");
const { isAdminRequest } = require("../core/utils");
const { validateSku, generateSkuCode } = require("./skuValidator");
const {
    DEFAULT_WAREHOUSE_ID,
    receiveGrn: engineReceiveGrn,
    adjustStock: engineAdjustStock,
    writeOffStock: engineWriteOffStock
} = require("./inventoryEngine");

/**
 * importSkus: Bulk import or update SKUs with strict 6-segment nomenclature validation,
 * row-level error reporting, immutable identity enforcement, and dry-run support.
 */
exports.importSkus = onCall({ region: 'asia-south1' }, async (request) => {
    // 1. Authorization
    if (!(await isAdminRequest({ auth: request.auth }))) {
        throw new HttpsError('permission-denied', 'Admin or Staff access required.');
    }

    const { skus, dryRun = false, warehouseId = DEFAULT_WAREHOUSE_ID } = request.data || {};
    if (!Array.isArray(skus) || skus.length === 0) {
        throw new HttpsError('invalid-argument', 'Payload must contain a non-empty list of skus.');
    }

    if (skus.length > 2000) {
        throw new HttpsError('invalid-argument', 'Maximum 2000 SKUs per import batch.');
    }

    const results = {
        total: skus.length,
        valid: 0,
        invalid: 0,
        created: 0,
        updated: 0,
        errors: [],
        dryRun: !!dryRun
    };

    const validatedRows = [];

    // Step 1: Pre-validation & parsing
    for (let index = 0; index < skus.length; index++) {
        const row = skus[index];
        const validation = validateSku(row.skuCode);

        if (!validation.isValid) {
            results.invalid++;
            results.errors.push({
                index,
                skuCode: row.skuCode || `ROW_${index}`,
                error: validation.error
            });
            continue;
        }

        // Validate pricing
        const mrp = Number(row.mrp || 0);
        const consumerPrice = Number(row.consumerPrice || 0);
        const landingCost = Number(row.landingCost || 0);
        const dealerPrice = Number(row.dealerPrice || 0);

        if (mrp < 0 || consumerPrice < 0) {
            results.invalid++;
            results.errors.push({
                index,
                skuCode: validation.skuCode,
                error: 'Pricing values (MRP, consumerPrice) must be non-negative.'
            });
            continue;
        }

        results.valid++;
        validatedRows.push({
            row,
            validation,
            pricing: { mrp, consumerPrice, landingCost, dealerPrice }
        });
    }

    if (dryRun) {
        return results;
    }

    // Step 2: Batch Commit in chunks of 400
    const BATCH_SIZE = 400;
    for (let i = 0; i < validatedRows.length; i += BATCH_SIZE) {
        const chunk = validatedRows.slice(i, i + BATCH_SIZE);
        const writeBatch = db.batch();

        for (const item of chunk) {
            const { row, validation, pricing } = item;
            const skuCode = validation.skuCode;
            const skuRef = db.collection("skus").doc(skuCode);

            const docData = {
                skuCode,
                productId: validation.productId,
                segments: validation.segments,
                name: (row.name || `${validation.segments.brand} ${validation.segments.item} ${validation.segments.pack}`).trim(),
                pricing,
                barcode: {
                    ean13: row.barcode || row.ean13 || "",
                    internal: skuCode
                },
                tax: {
                    hsnCode: row.hsnCode || "31021010",
                    gstRate: Number(row.gstRate || 5)
                },
                reorderLevel: Number(row.reorderLevel || 50),
                minStockLimit: Number(row.minStockLimit || 10),
                isActive: row.isActive !== false,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };

            writeBatch.set(skuRef, docData, { merge: true });
        }

        await writeBatch.commit();
    }

    // Step 3: Handle initial stock if provided for any row
    for (const item of validatedRows) {
        const { row, validation, pricing } = item;
        const stockQty = Number(row.stock || 0);

        if (stockQty > 0) {
            try {
                await db.runTransaction(async (transaction) => {
                    await engineReceiveGrn(transaction, {
                        skuCode: validation.skuCode,
                        batchNumber: row.batchNumber || `INIT-${Date.now()}`,
                        mfgDate: row.mfgDate,
                        expiryDate: row.expiryDate,
                        quantity: stockQty,
                        warehouseId,
                        binLocation: row.binLocation || "",
                        landingCost: pricing.landingCost,
                        actorId: request.auth.uid,
                        idempotencyKey: `IMPORT:${validation.skuCode}:INIT_STOCK`
                    });
                });
            } catch (err) {
                results.errors.push({
                    skuCode: validation.skuCode,
                    error: `SKU saved but initial stock failed: ${err.message}`
                });
            }
        }
    }

    results.created = results.valid;
    return results;
});

/**
 * upsertSku: Single SKU create or update with strict validation and audit.
 */
exports.upsertSku = onCall({ region: 'asia-south1' }, async (request) => {
    if (!(await isAdminRequest({ auth: request.auth }))) {
        throw new HttpsError('permission-denied', 'Admin or Staff access required.');
    }

    const { skuCode, data } = request.data || {};
    const validation = validateSku(skuCode);
    if (!validation.isValid) {
        throw new HttpsError('invalid-argument', validation.error);
    }

    const code = validation.skuCode;
    const skuRef = db.collection("skus").doc(code);

    await db.runTransaction(async (transaction) => {
        const existingSnap = await transaction.get(skuRef);

        const skuPayload = {
            skuCode: code,
            productId: validation.productId,
            name: (data.name || `${validation.segments.brand} ${validation.segments.item} ${validation.segments.pack}`).trim(),
            segments: validation.segments,
            pricing: {
                mrp: Number(data.pricing?.mrp ?? data.mrp ?? 0),
                landingCost: Number(data.pricing?.landingCost ?? data.landingCost ?? 0),
                dealerPrice: Number(data.pricing?.dealerPrice ?? data.dealerPrice ?? 0),
                consumerPrice: Number(data.pricing?.consumerPrice ?? data.consumerPrice ?? 0)
            },
            barcode: {
                ean13: data.barcode?.ean13 || data.barcode || "",
                internal: code
            },
            tax: {
                hsnCode: data.tax?.hsnCode || data.hsnCode || "31021010",
                gstRate: Number(data.tax?.gstRate ?? data.gstRate ?? 5)
            },
            reorderLevel: Number(data.reorderLevel || 50),
            minStockLimit: Number(data.minStockLimit || 10),
            isActive: data.isActive !== false,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        if (!existingSnap.exists) {
            // Initialize empty inventory for new SKU
            skuPayload.inventory = {
                totalStock: 0,
                availableStock: 0,
                committedStock: 0
            };
            skuPayload.createdAt = admin.firestore.FieldValue.serverTimestamp();
            transaction.set(skuRef, skuPayload);
        } else {
            // Update mutable fields only, preserve existing inventory
            transaction.set(skuRef, skuPayload, { merge: true });
        }
    });

    return { success: true, skuCode: code, productId: validation.productId };
});

/**
 * receiveGrn: Inward Goods Receipt with FEFO batch creation and ledger tracking.
 */
exports.receiveGrn = onCall({ region: 'asia-south1' }, async (request) => {
    if (!(await isAdminRequest({ auth: request.auth }))) {
        throw new HttpsError('permission-denied', 'Admin or Staff access required.');
    }

    const payload = request.data || {};
    const { skuCode, batchNumber, quantity, idempotencyKey } = payload;

    const validation = validateSku(skuCode);
    if (!validation.isValid) throw new HttpsError('invalid-argument', validation.error);
    if (!quantity || quantity <= 0) throw new HttpsError('invalid-argument', 'Quantity must be > 0.');

    const cleanKey = idempotencyKey || `GRN:${skuCode}:${batchNumber || Date.now()}:${quantity}`;

    const result = await db.runTransaction(async (transaction) => {
        return await engineReceiveGrn(transaction, {
            ...payload,
            skuCode: validation.skuCode,
            quantity: Number(quantity),
            actorId: request.auth.uid,
            idempotencyKey: cleanKey
        });
    });

    return result;
});

/**
 * adjustInventory: Atomic stock adjustment with ledger trail.
 */
exports.adjustInventory = onCall({ region: 'asia-south1' }, async (request) => {
    if (!(await isAdminRequest({ auth: request.auth }))) {
        throw new HttpsError('permission-denied', 'Admin only.');
    }

    const { skuCode, adjustment, reason, batchId, warehouseId, idempotencyKey } = request.data || {};
    if (!skuCode || isNaN(adjustment) || Number(adjustment) === 0) {
        throw new HttpsError('invalid-argument', 'skuCode and non-zero adjustment quantity required.');
    }

    const cleanKey = idempotencyKey || `ADJUST:${skuCode}:${Date.now()}:${adjustment}`;

    const result = await db.runTransaction(async (transaction) => {
        return await engineAdjustStock(transaction, {
            skuCode: skuCode.toUpperCase(),
            batchId: batchId || "GENERAL",
            warehouseId: warehouseId || DEFAULT_WAREHOUSE_ID,
            adjustmentQty: Number(adjustment),
            reason,
            actorId: request.auth.uid,
            idempotencyKey: cleanKey
        });
    });

    return result;
});

/**
 * writeOffStock: Damage / Expiry stock deduction with ledger.
 */
exports.writeOffStock = onCall({ region: 'asia-south1' }, async (request) => {
    if (!(await isAdminRequest({ auth: request.auth }))) {
        throw new HttpsError('permission-denied', 'Admin only.');
    }

    const { skuCode, batchId, quantity, type, reason, warehouseId, idempotencyKey } = request.data || {};
    if (!skuCode || !quantity || quantity <= 0) {
        throw new HttpsError('invalid-argument', 'Valid skuCode and positive quantity required.');
    }

    const cleanKey = idempotencyKey || `WRITEOFF:${skuCode}:${batchId || 'GEN'}:${Date.now()}:${quantity}`;

    const result = await db.runTransaction(async (transaction) => {
        return await engineWriteOffStock(transaction, {
            skuCode: skuCode.toUpperCase(),
            batchId: batchId || "GENERAL",
            warehouseId: warehouseId || DEFAULT_WAREHOUSE_ID,
            quantity: Number(quantity),
            type: type === "EXPIRED" ? "EXPIRED" : "DAMAGE",
            reason,
            actorId: request.auth.uid,
            idempotencyKey: cleanKey
        });
    });

    return result;
});

/**
 * getInventoryReport: Detailed aggregated stock status report
 */
exports.getInventoryReport = onCall({ region: 'asia-south1' }, async (request) => {
    if (!(await isAdminRequest({ auth: request.auth }))) {
        throw new HttpsError('permission-denied', 'Admin or Staff access required.');
    }

    const skusSnap = await db.collection("skus").where("isActive", "==", true).limit(500).get();
    const reports = [];

    for (const doc of skusSnap.docs) {
        const data = doc.data();
        const available = data.inventory?.availableStock || 0;
        const reorder = data.reorderLevel || 50;

        reports.push({
            skuCode: doc.id,
            name: data.name,
            totalStock: data.inventory?.totalStock || 0,
            availableStock: available,
            committedStock: data.inventory?.committedStock || 0,
            reorderLevel: reorder,
            isLowStock: available <= reorder,
            mrp: data.pricing?.mrp || 0,
            consumerPrice: data.pricing?.consumerPrice || 0
        });
    }

    return { total: reports.length, items: reports };
});

/**
 * Standardize pack weight/size string into numeric grams.
 * Examples: "500g" -> 500, "1kg" -> 1000, "1.5 kg" -> 1500, "250ml" -> 250, "1L" -> 1000
 */
function parseWeightToGrams(raw) {
    if (typeof raw === 'number') return raw;
    if (!raw || typeof raw !== 'string') return 0;
    const clean = raw.trim().toLowerCase();
    const match = clean.match(/^([\d.]+)\s*(kg|g|gm|gms|l|ltr|litre|litres|ml)?$/);
    if (!match) {
        const num = parseFloat(clean);
        return isNaN(num) ? 0 : num;
    }
    const val = parseFloat(match[1]);
    const unit = match[2] || 'g';
    if (unit === 'kg' || unit === 'l' || unit === 'ltr' || unit === 'litre' || unit === 'litres') {
        return Math.round(val * 1000);
    }
    return Math.round(val);
}

exports.parseWeightToGrams = parseWeightToGrams;

/**
 * migrateSkuWeights: Idempotent migration converting legacy string weights to numeric weightGrams.
 * Scans both 'skus' and 'products' collections.
 */
exports.migrateSkuWeights = onCall({ region: 'asia-south1' }, async (request) => {
    if (!(await isAdminRequest({ auth: request.auth }))) {
        throw new HttpsError('permission-denied', 'Admin access required for SKU weight migration.');
    }

    try {
        let totalScanned = 0;
        let migratedCount = 0;
        let skippedCount = 0;
        const errors = [];

        // 1. Migrate SKUs collection
        const skusSnap = await db.collection("skus").get();
        totalScanned += skusSnap.size;

        const skuBatch = db.batch();
        let skuOps = 0;

        for (const doc of skusSnap.docs) {
            try {
                const data = doc.data();
                if (typeof data.weightGrams === 'number' && data.weightGrams > 0) {
                    skippedCount++;
                    continue;
                }
                const rawWeight = data.weight || data.packSize || data.size || "";
                const weightGrams = parseWeightToGrams(rawWeight);

                skuBatch.update(doc.ref, {
                    weightGrams,
                    weight: weightGrams,
                    weightMigratedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                migratedCount++;
                skuOps++;
            } catch (err) {
                errors.push({ id: doc.id, collection: "skus", error: err.message });
            }
        }

        if (skuOps > 0) {
            await skuBatch.commit();
        }

        // 2. Migrate Products collection
        const productsSnap = await db.collection("products").get();
        totalScanned += productsSnap.size;

        const productBatch = db.batch();
        let productOps = 0;

        for (const doc of productsSnap.docs) {
            try {
                const data = doc.data();
                if (typeof data.weightGrams === 'number' && data.weightGrams > 0) {
                    skippedCount++;
                    continue;
                }
                const rawWeight = data.weight || data.unit || "";
                const weightGrams = parseWeightToGrams(rawWeight);

                if (weightGrams > 0) {
                    productBatch.update(doc.ref, {
                        weightGrams,
                        weightMigratedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                    migratedCount++;
                    productOps++;
                } else {
                    skippedCount++;
                }
            } catch (err) {
                errors.push({ id: doc.id, collection: "products", error: err.message });
            }
        }

        if (productOps > 0) {
            await productBatch.commit();
        }

        return {
            success: true,
            totalScanned,
            migratedCount,
            skippedCount,
            errors
        };
    } catch (error) {
        console.error("[migrateSkuWeights] Error:", error);
        throw new HttpsError('internal', error.message);
    }
});

