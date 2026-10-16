/**
 * KrishiVishal Sales Ledger & Order Delivery Revenue Recognition Engine
 * Conforming to Ind AS 115 (Revenue from Contracts with Customers), Matching Principle, & Rule 46 CGST.
 * 
 * Part of CA-Ready Financial Architecture (Sprint 4).
 */

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { db, admin } = require("../core/admin");
const { isAdminRequest } = require("../core/utils");
const { postJournalEntry } = require("./generalLedger");
const { calculateTaxForOrder, roundCurrency } = require("../tax/gstEngine");
const { getNextInvoiceNumber, getOrCreateInvoiceNumberForOrder, getCurrentFinancialYear } = require("../invoices/sequentialInvoiceEngine");

const REGION = 'asia-south1';

/**
 * Derives current fiscal period in 'YYYY-MM' format.
 */
function getFiscalPeriodId(date = new Date()) {
    const d = date instanceof Date ? date : new Date(date);
    if (isNaN(d.getTime())) {
        return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit' }).format(new Date());
    }
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit'
    }).format(d);
}

/**
 * Recognizes revenue and COGS matching for a delivered customer order.
 * 
 * 1. Calculates dynamic tax breakdown via gstEngine.
 * 2. Assigns consecutive tax invoice number (KV/26-27/00001).
 * 3. Computes COGS from delivered item unit costs.
 * 4. Posts atomic balanced double-entry journal entry.
 * 5. Updates order with invoice number, financialStatus: 'RECOGNIZED'.
 * 
 * @param {object} orderData
 * @returns {Promise<object>}
 */
async function recognizeOrderDeliveryFinancials(orderData, options = {}) {
    const orderId = orderData.orderId || orderData.id;
    const {
        periodId = getFiscalPeriodId(),
        paymentMethod = "COD",
        shippingState = "Bihar",
        items = [],
        financialYear = getCurrentFinancialYear(),
        createdBy = "SYSTEM_DELIVERY_TRIGGER"
    } = orderData;

    if (!orderId) throw new Error("MISSING_ORDER_ID: orderId is required.");
    if (!Array.isArray(items) || items.length === 0) {
        throw new Error("EMPTY_ORDER_ITEMS: Order must contain at least one line item to recognize revenue.");
    }

    // 0. Idempotency Check: Guard against duplicate delivery recognition
    const orderRef = db.collection("orders").doc(orderId);
    const orderSnap = options.tx ? await options.tx.get(orderRef) : await orderRef.get();
    const existingOrder = orderSnap.exists ? (orderSnap.data() || {}) : {};

    if (existingOrder.financialStatus === "RECOGNIZED") {
        console.log(`[salesLedger] Order ${orderId} already financially recognized with Invoice #${existingOrder.invoiceNumber}. Returning existing record.`);
        return {
            success: true,
            alreadyRecognized: true,
            orderId,
            invoiceNumber: existingOrder.invoiceNumber,
            totalSales: existingOrder.totalSales,
            taxableAmount: existingOrder.taxableAmount,
            totalTax: existingOrder.totalTax,
            totalCogs: existingOrder.totalCogs,
            journalEntryId: existingOrder.journalEntryId
        };
    }

    // 1. Calculate statutory GST breakdown (Intra-State vs Inter-State)
    const taxCalculation = calculateTaxForOrder({
        shippingState,
        items: items.map(item => ({
            skuId: item.skuCode || item.skuId,
            name: item.name || item.skuCode,
            hsn: item.hsnCode || item.hsn,
            quantity: item.quantity || 1,
            taxablePrice: item.sellingPrice !== undefined ? item.sellingPrice : (item.taxablePrice || item.price || 0),
            category: item.category
        }))
    });

    const { taxableAmount, cgstAmount, sgstAmount, igstAmount, totalTax, grandTotal } = taxCalculation;

    // 2. Obtain Official Consecutive Tax Invoice Number (Rule 46 CGST)
    // Reuse existing official invoiceNumber if already allocated (e.g. at dispatch/packaging)
    let invoiceNumber = existingOrder.invoiceNumber || (existingOrder.invoice && existingOrder.invoice.invoiceNumber);
    if (!invoiceNumber || String(invoiceNumber).startsWith("KV/SAM/")) {
        const alloc = await getOrCreateInvoiceNumberForOrder(orderId, financialYear);
        invoiceNumber = alloc.invoiceNumber;
    }

    // 3. Compute Cost of Goods Sold (COGS) matching
    const settingsSnap = await db.collection("settings").doc("config").get();
    const settingsData = settingsSnap.exists ? settingsSnap.data() : {};
    const useBatchCogs = Boolean(settingsData.USE_BATCH_COGS || settingsData.useBatchCogs || false);

    let totalCogs = 0;
    for (const item of items) {
        const qty = Number(item.quantity || 1);
        let itemCogs = null;

        if (useBatchCogs) {
            // New Mode: Exact per-batch sum
            if (Array.isArray(item.batchAllocations) && item.batchAllocations.length > 0) {
                let batchAllocSum = 0;
                let allocatedTotalQty = 0;
                for (const alloc of item.batchAllocations) {
                    const aQty = Number(alloc.allocatedQty !== undefined ? alloc.allocatedQty : (alloc.quantity || 0));
                    const aCost = Number(alloc.landingCost !== undefined ? alloc.landingCost : (alloc.costPrice || 0));
                    if (aQty > 0 && aCost > 0) {
                        batchAllocSum += roundCurrency(aQty * aCost);
                        allocatedTotalQty += aQty;
                    }
                }
                if (allocatedTotalQty > 0 && batchAllocSum > 0) {
                    if (allocatedTotalQty === qty) {
                        itemCogs = batchAllocSum;
                    } else {
                        const weightedAvg = batchAllocSum / allocatedTotalQty;
                        itemCogs = roundCurrency(weightedAvg * qty);
                    }
                }
            }
        }

        // Fallback to legacy calculation (if useBatchCogs is false or legacy order without batch allocations)
        if (itemCogs === null) {
            let unitCost = null;

            if (item.unitCost !== undefined && item.unitCost !== null && !isNaN(Number(item.unitCost)) && Number(item.unitCost) > 0) {
                unitCost = Number(item.unitCost);
            } else if (item.costPrice !== undefined && item.costPrice !== null && !isNaN(Number(item.costPrice)) && Number(item.costPrice) > 0) {
                unitCost = Number(item.costPrice);
            } else if (item.landingCost !== undefined && item.landingCost !== null && !isNaN(Number(item.landingCost)) && Number(item.landingCost) > 0) {
                unitCost = Number(item.landingCost);
            } else if (item.batchAllocations && Array.isArray(item.batchAllocations) && item.batchAllocations.length > 0) {
                const batchCost = item.batchAllocations[0].landingCost || item.batchAllocations[0].costPrice;
                if (batchCost && !isNaN(Number(batchCost)) && Number(batchCost) > 0) {
                    unitCost = Number(batchCost);
                }
            }

            if (unitCost === null || isNaN(unitCost) || unitCost <= 0) {
                const skuId = item.skuCode || item.skuId || item.productId || 'UNKNOWN_ITEM';
                throw new Error(`MISSING_COST_PRICE: Line item '${skuId}' is missing valid statutory purchase/cost price. Heuristic estimation is strictly prohibited.`);
            }

            itemCogs = roundCurrency(unitCost * qty);
        }

        // Non-persisted Reconciliation logging: compare catalog vs batch COGS
        const catalogCost = Number(item.catalogCost || item.unitCost || 0);
        const catalogCogs = roundCurrency(catalogCost * qty);
        if (catalogCogs > 0 && itemCogs > 0) {
            const variance = roundCurrency(itemCogs - catalogCogs);
            const skuId = item.skuCode || item.skuId || item.productId || 'UNKNOWN_ITEM';
            console.log(`[COGS Reconciliation] Order ${orderId} Line '${skuId}': Qty ${qty} | Batch COGS: ₹${itemCogs} vs Catalog COGS: ₹${catalogCogs} | Variance: ${variance >= 0 ? '+' : ''}₹${variance}`);
        }

        totalCogs += itemCogs;
    }
    totalCogs = roundCurrency(totalCogs);

    // 4. Construct Balanced Double-Entry Journal Lines
    const isCod = String(paymentMethod).toUpperCase() === "COD";
    const debitAccount = isCod ? "1010_CASH_IN_HAND_RIDERS" : "2070_DEFERRED_REVENUE";

    const journalLines = [
        // Debit Asset/Liability: Rider Cash or Clear Deferred Revenue
        {
            accountCode: debitAccount,
            debit: grandTotal,
            credit: 0,
            description: `${isCod ? 'COD collected by Rider' : 'Clear Deferred Revenue'} for Order ${orderId}`
        },
        // Credit Operating Revenue for taxable base value
        {
            accountCode: "4010_SALES_AGRI_INPUTS",
            debit: 0,
            credit: taxableAmount,
            description: `Sales Revenue on Order ${orderId} (Inv #${invoiceNumber})`
        }
    ];

    // Output GST Liabilities
    if (cgstAmount > 0) {
        journalLines.push({
            accountCode: "2020_OUTPUT_CGST_PAYABLE",
            debit: 0,
            credit: cgstAmount,
            description: `Output CGST on Order ${orderId}`
        });
    }
    if (sgstAmount > 0) {
        journalLines.push({
            accountCode: "2030_OUTPUT_SGST_PAYABLE",
            debit: 0,
            credit: sgstAmount,
            description: `Output SGST on Order ${orderId}`
        });
    }
    if (igstAmount > 0) {
        journalLines.push({
            accountCode: "2040_OUTPUT_IGST_PAYABLE",
            debit: 0,
            credit: igstAmount,
            description: `Output IGST on Order ${orderId}`
        });
    }

    // Matching Principle: COGS Recognition (Dr COGS | Cr Inventory)
    if (totalCogs > 0) {
        journalLines.push({
            accountCode: "5010_COGS_AGRI_INPUTS",
            debit: totalCogs,
            credit: 0,
            description: `COGS recognized for Order ${orderId}`
        });
        journalLines.push({
            accountCode: "1040_INVENTORY_MAIN_HUB",
            debit: 0,
            credit: totalCogs,
            description: `Inventory reduction on sale for Order ${orderId}`
        });
    }

    // Operating Expense Accrual: Rider Delivery Expense Matching
    // Calculate rider delivery earning for this delivered order if rider is assigned
    const riderDeliveryEarning = Number(orderData.riderEarning || orderData.deliveryEarning || (orderData.assignedRiderId || orderData.riderId ? 30 : 0));
    if (riderDeliveryEarning > 0) {
        journalLines.push({
            accountCode: "6010_RIDER_DELIVERY_PAYOUTS",
            debit: riderDeliveryEarning,
            credit: 0,
            description: `Rider delivery expense accrued for Order ${orderId}`
        });
        journalLines.push({
            accountCode: "2015_RIDER_PAYOUTS_PAYABLE",
            debit: 0,
            credit: riderDeliveryEarning,
            description: `Rider payable accrued for Order ${orderId}`
        });
    }

    // 5. Post atomic journal entry (Asserts Debits === Credits)
    const journalResult = await postJournalEntry({
        entryId: `JE_ORDER_DELIVERY_${orderId}`,
        refType: "ORDER_DELIVERY",
        refId: orderId,
        periodId,
        date: new Date(),
        memo: `Sales & COGS recognition for Order #${orderId} (Invoice #${invoiceNumber})`,
        lines: journalLines,
        createdBy
    }, options);

    const updatePayload = {
        invoiceNumber,
        financialStatus: "RECOGNIZED",
        financialPeriodId: periodId,
        journalEntryId: journalResult.entryId,
        taxableAmount,
        cgstAmount,
        sgstAmount,
        igstAmount,
        totalTax,
        totalSales: grandTotal,
        totalCogs,
        recognizedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    // 6. Check and mark rider cash credit flag (Strict Idempotency Guard)
    const riderId = orderData.riderId || orderData.assignedRiderId;
    const isAlreadyCashCredited = existingOrder.riderCashCredited === true;

    if (isCod && riderId && !isAlreadyCashCredited) {
        updatePayload.riderCashCredited = true;
        updatePayload.riderCashCreditedAt = admin.firestore.FieldValue.serverTimestamp();
    }

    // 7. Update order document with recognized financial metadata
    if (options.tx) {
        options.tx.set(orderRef, updatePayload, { merge: true });
    } else {
        await orderRef.set(updatePayload, { merge: true });
    }

    // 8. Update Rider Cash-in-Hand on COD delivery (Exclusively if not already credited)
    if (isCod && riderId && !isAlreadyCashCredited) {
        const riderRef = db.collection("riders").doc(riderId);
        const riderUpdate = {
            cash_in_hand: admin.firestore.FieldValue.increment(grandTotal),
            last_cod_delivery_at: admin.firestore.FieldValue.serverTimestamp()
        };
        if (options.tx) {
            options.tx.set(riderRef, riderUpdate, { merge: true });
        } else {
            await riderRef.set(riderUpdate, { merge: true });
        }
    }

    return {
        success: true,
        orderId,
        invoiceNumber,
        totalSales: grandTotal,
        taxableAmount,
        totalTax,
        totalCogs,
        journalEntryId: journalResult.entryId
    };
}

/**
 * In-memory reconciliation helper: computes line-wise COGS comparison
 * between catalogCost (standard price list) and batchCost (FEFO actuals)
 * without performing any production writes.
 */
function computeCogsReconciliationBreakdown(orderData) {
    const items = orderData.items || [];
    const breakdown = [];
    let totalCatalogCogs = 0;
    let totalBatchCogs = 0;

    for (const item of items) {
        const qty = Number(item.quantity || 1);
        const skuCode = item.skuCode || item.productId || 'UNKNOWN_ITEM';
        const catalogCost = Number(item.catalogCost || item.unitCost || 0);
        const catalogCogs = roundCurrency(catalogCost * qty);

        let batchCogs = null;
        if (Array.isArray(item.batchAllocations) && item.batchAllocations.length > 0) {
            let sum = 0;
            let aQtyTotal = 0;
            for (const alloc of item.batchAllocations) {
                const aQty = Number(alloc.allocatedQty !== undefined ? alloc.allocatedQty : (alloc.quantity || 0));
                const aCost = Number(alloc.landingCost !== undefined ? alloc.landingCost : (alloc.costPrice || 0));
                if (aQty > 0 && aCost > 0) {
                    sum += roundCurrency(aQty * aCost);
                    aQtyTotal += aQty;
                }
            }
            if (aQtyTotal > 0 && sum > 0) {
                batchCogs = (aQtyTotal === qty) ? sum : roundCurrency((sum / aQtyTotal) * qty);
            }
        }
        if (batchCogs === null) {
            batchCogs = catalogCogs;
        }

        const variance = roundCurrency(batchCogs - catalogCogs);
        totalCatalogCogs += catalogCogs;
        totalBatchCogs += batchCogs;

        breakdown.push({
            skuCode,
            quantity: qty,
            catalogCost,
            catalogCogs,
            batchCogs,
            variance
        });
    }

    return {
        orderId: orderData.orderId || orderData.id,
        items: breakdown,
        totalCatalogCogs: roundCurrency(totalCatalogCogs),
        totalBatchCogs: roundCurrency(totalBatchCogs),
        totalVariance: roundCurrency(totalBatchCogs - totalCatalogCogs)
    };
}

/**
 * Admin-only read-only Cloud Function: computes line-wise COGS comparison
 * between catalogCost (standard price list) and batchCost (FEFO actuals) with ZERO database writes.
 * Allows administrators and accountants to audit variance before enabling USE_BATCH_COGS.
 */
const reconcileOrderCogs = onCall({ region: REGION }, async (request) => {
    const isAdmin = await isAdminRequest(request);
    if (!isAdmin) {
        throw new HttpsError('permission-denied', 'Only administrators can inspect COGS reconciliation.');
    }
    const orderId = request.data?.orderId;
    if (!orderId || typeof orderId !== 'string') {
        throw new HttpsError('invalid-argument', 'orderId string is required.');
    }
    const orderSnap = await db.collection('orders').doc(orderId).get();
    if (!orderSnap.exists) {
        throw new HttpsError('not-found', `Order ${orderId} not found.`);
    }
    return computeCogsReconciliationBreakdown(orderSnap.data());
});

module.exports = {
    getFiscalPeriodId,
    recognizeOrderDeliveryFinancials,
    computeCogsReconciliationBreakdown,
    reconcileOrderCogs
};

