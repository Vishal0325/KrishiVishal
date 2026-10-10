const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { db, admin } = require("../core/admin");

const REGION = 'asia-south1';

/**
 * Helper to match an item to a variant in product.variants array.
 */
function findVariantIndex(variants, item) {
    if (!Array.isArray(variants) || variants.length === 0) return -1;
    
    const variantId = item.variantId || item.variant_id || (item.variant && item.variant.id);
    const skuCode = item.skuCode;
    const label = item.variantLabel || (item.variant && item.variant.label) || item.packSize || item.size;

    // 1. Match by variant id
    if (variantId) {
        const idx = variants.findIndex(v => v && v.id && String(v.id) === String(variantId));
        if (idx !== -1) return idx;
    }

    // 2. Match by skuCode
    if (skuCode) {
        const idx = variants.findIndex(v => v && v.skuCode && String(v.skuCode).toLowerCase() === String(skuCode).toLowerCase());
        if (idx !== -1) return idx;
    }

    // 3. Match by label / size / name / id
    if (label) {
        const cleanLabel = String(label).trim().toLowerCase();
        const idx = variants.findIndex(v => {
            if (!v) return false;
            return (v.label && String(v.label).trim().toLowerCase() === cleanLabel) ||
                   (v.size && String(v.size).trim().toLowerCase() === cleanLabel) ||
                   (v.name && String(v.name).trim().toLowerCase() === cleanLabel) ||
                   (v.id && String(v.id).trim().toLowerCase() === cleanLabel);
        });
        if (idx !== -1) return idx;
    }

    // 4. Single variant fallback if variant requested
    if (variants.length === 1 && (variantId || label)) {
        return 0;
    }

    return -1;
}

/**
 * Triggered when an order status is updated.
 */
exports.onOrderStatusUpdate = onDocumentUpdated({ document: "orders/{orderId}", region: REGION }, async (event) => {
    const change = event.data;
    const context = { params: event.params };
    const newData = change.after.data();
    const oldData = change.before.data();

    if (!newData || !oldData || newData.status === oldData.status) return null;

    const userId = newData.userId || newData.customerId;
    if (!userId) {
        console.error("No userId or customerId found for order:", context.params.orderId);
        return null;
    }

    // --- IND AS 115 REVENUE RECOGNITION ON DELIVERY ---
    if (oldData.status !== 'DELIVERED' && newData.status === 'DELIVERED') {
        try {
            const { recognizeOrderDeliveryFinancials } = require('../finance/salesLedger');
            await recognizeOrderDeliveryFinancials({
                orderId: context.params.orderId,
                ...newData
            });
        } catch (err) {
            console.error(`[RevenueRecognition] Failed for order ${context.params.orderId}:`, err);
        }
    }

    // --- REFERRAL LOGIC START ---
    try {
        if (newData.status === 'DELIVERED') {
            const userDocRef = db.collection("users").doc(userId);
            const userDoc = await userDocRef.get();
            const userData = userDoc.data() || {};
            
            if (userData.hasCompletedFirstOrder === false) {
                const referralsQuery = await db.collection("referrals")
                    .where("refereeUid", "==", userId)
                    .where("status", "==", "SIGNED_UP")
                    .limit(1).get();
                
                if (!referralsQuery.empty) {
                    const referralDoc = referralsQuery.docs[0];
                    const referralData = referralDoc.data();
                    const referrerUid = referralData.referrerUid;
                    const rewardAmount = referralData.referrerRewardAmount || 50;
                    
                    await db.runTransaction(async (transaction) => {
                        const referrerRef = db.collection("users").doc(referrerUid);
                        
                        transaction.update(userDocRef, { hasCompletedFirstOrder: true });
                        
                        transaction.update(referralDoc.ref, {
                            status: "REWARDED",
                            rewardedAt: admin.firestore.FieldValue.serverTimestamp(),
                            referenceOrderId: context.params.orderId
                        });
                        
                        transaction.update(referrerRef, {
                            walletBalance: admin.firestore.FieldValue.increment(rewardAmount)
                        });
                        
                        const txnRef = db.collection("wallet_transactions").doc();
                        transaction.set(txnRef, {
                            uid: referrerUid,
                            type: "REFERRAL_CREDIT",
                            amount: rewardAmount,
                            referenceOrderId: context.params.orderId,
                            referenceReferralId: referralDoc.id,
                            createdAt: admin.firestore.FieldValue.serverTimestamp()
                        });
                    });
                    
                    // Trigger push notification to referrer
                    const referrerDoc = await db.collection("users").doc(referrerUid).get();
                    if (referrerDoc.exists && referrerDoc.data().fcmToken) {
                        await admin.messaging().send({
                            notification: {
                                title: "Referral Reward!",
                                body: `Aapko ₹${rewardAmount} mil gaye! Aapke dost ne KrishiVishal join kiya.`
                            },
                            token: referrerDoc.data().fcmToken
                        }).catch(e => console.error("Referrer notif error:", e));
                    }
                } else {
                    await userDocRef.update({ hasCompletedFirstOrder: true });
                }
            }
        } else if (newData.status === 'CANCELLED') {
            // Check if this order was a reference for a rewarded referral
            const referralsQuery = await db.collection("referrals")
                .where("referenceOrderId", "==", context.params.orderId)
                .where("status", "==", "REWARDED")
                .limit(1).get();
                
            if (!referralsQuery.empty) {
                const referralDoc = referralsQuery.docs[0];
                const referralData = referralDoc.data();
                const referrerUid = referralData.referrerUid;
                const rewardAmount = referralData.referrerRewardAmount || 50;
                
                await db.runTransaction(async (transaction) => {
                    const referrerRef = db.collection("users").doc(referrerUid);
                    // Firestore increment handles floor at 0 if we assume it doesn't go negative or we clamp it later, 
                    // but standard increment could go negative. For simplicity, we just decrement.
                    transaction.update(referrerRef, {
                        walletBalance: admin.firestore.FieldValue.increment(-rewardAmount)
                    });
                    
                    transaction.update(referralDoc.ref, {
                        status: "VOIDED",
                        voidReason: "order_cancelled_after_reward"
                    });
                    
                    const txnRef = db.collection("wallet_transactions").doc();
                    transaction.set(txnRef, {
                        uid: referrerUid,
                        type: "REFERRAL_REVERSAL",
                        amount: rewardAmount,
                        referenceOrderId: context.params.orderId,
                        referenceReferralId: referralDoc.id,
                        createdAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                });
            }
        }
    } catch (e) {
        console.error("Error processing referral logic on order update:", e);
    }
    // --- REFERRAL LOGIC END ---

    // --- VLE / KISAN MITRA COMMISSION LOGIC START ---
    try {
        const vleCode = newData.vleCode || newData.kisanMitraCode;
        const bookedByVleId = newData.bookedByVleId;

        if (vleCode || bookedByVleId) {
            if (newData.status === 'DELIVERED' && oldData.status !== 'DELIVERED') {
                const commId = `vle_comm_${context.params.orderId}`;
                const commRef = db.collection('vle_commissions').doc(commId);
                const existingComm = await commRef.get();

                if (!existingComm.exists) {
                    let vleDoc = null;
                    if (bookedByVleId) {
                        const snap = await db.collection('vle_profiles').doc(bookedByVleId).get();
                        if (snap.exists) vleDoc = snap;
                    }
                    if (!vleDoc && vleCode) {
                        const querySnap = await db.collection('vle_profiles')
                            .where('vleCode', '==', String(vleCode).trim())
                            .limit(1)
                            .get();
                        if (!querySnap.empty) {
                            vleDoc = querySnap.docs[0];
                        }
                    }

                    if (vleDoc && vleDoc.data().status === 'ACTIVE') {
                        const vleData = vleDoc.data();
                        const { calculateVleOrderCommission } = require('../marketing/vleCommissionEngine');
                        const { commissionBreakdown, totalCommission } = calculateVleOrderCommission(newData, vleData.commissionSlabs);

                        if (totalCommission > 0) {
                            const now = new Date();
                            const maturityDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000); // 7-day return window

                            await db.runTransaction(async (transaction) => {
                                transaction.set(commRef, {
                                    commId: commId,
                                    orderId: context.params.orderId,
                                    vleId: vleDoc.id,
                                    vleCode: vleData.vleCode,
                                    farmerId: userId,
                                    farmerName: newData.userName || newData.customerName || 'Farmer',
                                    orderTotal: Number(newData.totalAmount || newData.orderTotal || 0),
                                    commissionBreakdown: commissionBreakdown,
                                    totalCommission: totalCommission,
                                    status: 'HOLD_RETURN_WINDOW',
                                    maturityDate: maturityDate.toISOString(),
                                    createdAt: admin.firestore.FieldValue.serverTimestamp()
                                });

                                transaction.update(vleDoc.ref, {
                                    totalGmvGenerated: admin.firestore.FieldValue.increment(Number(newData.totalAmount || 0)),
                                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                                });
                            });

                            console.log(`[VLE Commission] Held ₹${totalCommission} commission for VLE ${vleData.vleCode} on order ${context.params.orderId}`);
                        }
                    }
                }
            } else if (newData.status === 'CANCELLED' || newData.status === 'RETURNED') {
                const commId = `vle_comm_${context.params.orderId}`;
                const commRef = db.collection('vle_commissions').doc(commId);
                const commSnap = await commRef.get();

                if (commSnap.exists && commSnap.data().status === 'HOLD_RETURN_WINDOW') {
                    await commRef.update({
                        status: 'CLAWBACK',
                        voidReason: `Order transitioned to ${newData.status} during return buffer window`,
                        clawedBackAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                    console.log(`[VLE Commission] Successfully clawed back commission for order ${context.params.orderId}`);
                }
            }
        }
    } catch (vleErr) {
        console.error("Error processing VLE commission logic on order update:", vleErr);
    }
    // --- VLE / KISAN MITRA COMMISSION LOGIC END ---

    // --- STOCK RESTORATION ON CANCELLATION START ---
    try {
        if (newData.status === 'CANCELLED' && oldData.status !== 'CANCELLED') {
            // Idempotency guard: Prevent double stock restoration
            if (oldData.stockRestored === true || newData.stockRestored === true) {
                console.log(`[Stock Restoration] Order ${context.params.orderId} stock already restored or marked. Skipping.`);
            } else {
                const items = newData.items || [];
                if (items.length > 0) {
                    await db.runTransaction(async (transaction) => {
                        const orderRef = db.collection("orders").doc(context.params.orderId);
                        const orderSnap = await transaction.get(orderRef);
                        
                        if (!orderSnap.exists) return;
                        const currentOrderData = orderSnap.data();
                        
                        // Check flag inside transaction to guarantee idempotency across concurrent invocations
                        if (currentOrderData.stockRestored === true) {
                            console.log(`[Stock Restoration] Order ${context.params.orderId} stockRestored already true inside transaction. Skipping.`);
                            return;
                        }

                        // PHASE 1: READS
                        const skuStockUpdates = [];
                        const productDocMap = new Map(); // productId -> { ref, data, modified }

                        for (const item of items) {
                            if (item.fulfillmentType === 'ON_DEMAND') {
                                continue;
                            }

                            const qty = Number(item.quantity) || 0;
                            if (qty <= 0) continue;

                            const productId = item.productId || item.id;
                            const skuCode = item.skuCode && item.skuCode.trim().length > 0 ? item.skuCode.trim() : null;

                            let isSku = false;
                            if (skuCode && skuCode !== productId) {
                                const skuRef = db.collection("skus").doc(skuCode);
                                const skuSnap = await transaction.get(skuRef);
                                if (skuSnap.exists) {
                                    isSku = true;
                                    skuStockUpdates.push({
                                        ref: skuRef,
                                        quantity: qty
                                    });
                                }
                            }

                            if (!isSku && productId) {
                                if (!productDocMap.has(productId)) {
                                    const prodRef = db.collection("products").doc(productId);
                                    const prodSnap = await transaction.get(prodRef);
                                    if (prodSnap.exists) {
                                        productDocMap.set(productId, {
                                            ref: prodRef,
                                            data: prodSnap.data() || {},
                                            modified: false
                                        });
                                    }
                                }
                            }
                        }

                        // IN-MEMORY RESTORATION CALCULATIONS
                        for (const item of items) {
                            if (item.fulfillmentType === 'ON_DEMAND') continue;
                            const qty = Number(item.quantity) || 0;
                            if (qty <= 0) continue;

                            const productId = item.productId || item.id;
                            if (productId && productDocMap.has(productId)) {
                                const pCached = productDocMap.get(productId);
                                const productData = pCached.data;

                                if (Array.isArray(productData.variants) && productData.variants.length > 0) {
                                    const vIdx = findVariantIndex(productData.variants, item);
                                    if (vIdx !== -1) {
                                        const curStock = Number(productData.variants[vIdx].stock) || 0;
                                        productData.variants[vIdx].stock = curStock + qty;
                                        if (typeof productData.stock === 'number') {
                                            productData.stock = Number(productData.stock) + qty;
                                        }
                                        pCached.modified = true;
                                    } else if (typeof productData.stock === 'number') {
                                        productData.stock = Number(productData.stock) + qty;
                                        pCached.modified = true;
                                    }
                                } else if (typeof productData.stock === 'number') {
                                    productData.stock = Number(productData.stock) + qty;
                                    pCached.modified = true;
                                }
                            }
                        }

                        // PHASE 2: WRITES
                        for (const update of skuStockUpdates) {
                            transaction.update(update.ref, {
                                "inventory.availableStock": admin.firestore.FieldValue.increment(update.quantity),
                                "inventory.committedStock": admin.firestore.FieldValue.increment(-update.quantity),
                                updatedAt: admin.firestore.FieldValue.serverTimestamp()
                            });
                        }

                        for (const [pId, pCached] of productDocMap.entries()) {
                            if (pCached.modified) {
                                const pUpdates = {
                                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                                };
                                if (Array.isArray(pCached.data.variants)) {
                                    pUpdates.variants = pCached.data.variants;
                                }
                                if (typeof pCached.data.stock === 'number') {
                                    pUpdates.stock = pCached.data.stock;
                                }
                                transaction.update(pCached.ref, pUpdates);
                            }
                        }

                        transaction.update(orderRef, {
                            stockRestored: true,
                            stockRestoredAt: admin.firestore.FieldValue.serverTimestamp()
                        });
                    });
                    console.log(`[Stock Restoration] Successfully restored stock (including variants) for CANCELLED order ${context.params.orderId}`);
                } else {
                    // No items to restore, but mark flag
                    await db.collection("orders").doc(context.params.orderId).update({
                        stockRestored: true,
                        stockRestoredAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                }
            }
        }
    } catch (e) {
        console.error(`Error restoring stock for order ${context.params.orderId}:`, e);
    }
    // --- STOCK RESTORATION ON CANCELLATION END ---

    return null;
});

/**
 * Triggered when a new return request is created.
 */
exports.onReturnRequestCreated = onDocumentCreated({ document: "returns/{returnId}", region: REGION }, async (event) => {
    const snap = event.data;
    const context = { params: event.params };
    if (!snap) return null;

    const returnData = snap.data();
    const orderId = returnData.orderId;

    if (!orderId) return null;

    try {
        const orderDoc = await db.collection("orders").doc(orderId).get();
        if (!orderDoc.exists) {
            console.error(`Order ${orderId} not found for return ${context.params.returnId}`);
            return null;
        }

        const orderData = orderDoc.data();
        const originalRiderId = orderData.riderId;

        if (originalRiderId) {
            await snap.ref.update({
                riderId: originalRiderId,
                status: "PICKUP_SCHEDULED",
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            const riderDoc = await db.collection("riders").doc(originalRiderId).get();
            const fcmToken = riderDoc.data()?.fcmToken;

            if (fcmToken) {
                await admin.messaging().send({
                    notification: {
                        title: "New Return Pickup",
                        body: `Return pickup assigned for Order #${orderId.substring(0, 8)}`,
                    },
                    data: {
                        type: "RETURN_ASSIGNED",
                        returnId: context.params.returnId
                    },
                    token: fcmToken,
                });
            }
            console.log(`Return ${context.params.returnId} auto-assigned to Rider ${originalRiderId}`);
        } else {
            console.log(`No original rider found for Order ${orderId}. Manual assignment required.`);
        }
        return null;
    } catch (error) {
        console.error("Error in onReturnRequestCreated:", error);
        return null;
    }
});

/**
 * onOrderDeliveryUpdate: Calculates and updates rider_performance metrics.
 * Triggered when an order reaches a final state.
 */
exports.onOrderDeliveryUpdate = onDocumentUpdated({ document: "orders/{orderId}", region: REGION }, async (event) => {
    const change = event.data;
    const newData = change.after.data();
    const oldData = change.before.data();

    if (!newData || !oldData || newData.status === oldData.status) return null;

    const FINAL_STATES = ['DELIVERED', 'CANCELLED', 'RETURNED'];
    if (!FINAL_STATES.includes(newData.status)) return null;

    const riderId = newData.riderId;
    if (!riderId) return null;

    try {
        await db.runTransaction(async (transaction) => {
            const perfRef = db.collection("rider_performance").doc(riderId);
            const perfSnap = await transaction.get(perfRef);

            const stats = perfSnap.exists ? perfSnap.data() : {
                riderId,
                totalOrders: 0,
                deliveredCount: 0,
                cancelledCount: 0,
                returnedCount: 0,
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            };

            const oldStatus = oldData.status;
            const newStatus = newData.status;
            const FINAL_STATES = ['DELIVERED', 'CANCELLED', 'RETURNED'];

            // 1. If it's the FIRST time entering any final state
            if (!FINAL_STATES.includes(oldStatus)) {
                stats.totalOrders += 1;
            } else {
                // 2. Adjust previous final state counts (e.g., DELIVERED -> RETURNED)
                if (oldStatus === 'DELIVERED') stats.deliveredCount -= 1;
                if (oldStatus === 'CANCELLED') stats.cancelledCount -= 1;
                if (oldStatus === 'RETURNED') stats.returnedCount -= 1;
            }

            // 3. Apply new state count
            if (newStatus === 'DELIVERED') stats.deliveredCount += 1;
            if (newStatus === 'CANCELLED') stats.cancelledCount += 1;
            if (newStatus === 'RETURNED') stats.returnedCount += 1;

            stats.updatedAt = admin.firestore.FieldValue.serverTimestamp();
            transaction.set(perfRef, stats, { merge: true });
        });
        console.log(`Rider performance synchronized for: ${riderId} (${oldData.status} -> ${newData.status})`);
    } catch (error) {
        console.error("CRITICAL: Failed to update rider performance:", error);
        throw error; // Retry
    }
    return null;
});

/**
 * Triggered when a procurement queue item is updated.
 * If all items for an order are RECEIVED, advance order status.
 */
exports.onProcurementQueueUpdated = onDocumentUpdated({ document: "procurement_queue/{itemId}", region: REGION }, async (event) => {
    const change = event.data;
    const newData = change.after.data();
    const oldData = change.before.data();

    if (!newData || !oldData || newData.status === oldData.status) return null;

    if (newData.status === 'RECEIVED' && newData.orderId) {
        const orderId = newData.orderId;
        try {
            await db.runTransaction(async (transaction) => {
                const orderRef = db.collection("orders").doc(orderId);
                const orderSnap = await transaction.get(orderRef);
                
                if (!orderSnap.exists) return;
                const orderData = orderSnap.data();
                
                if (orderData.status !== 'PROCUREMENT_PENDING') return;

                // Check if all queue items for this order are received
                const queueQuery = await transaction.get(db.collection("procurement_queue").where("orderId", "==", orderId));
                let allReceived = true;
                
                queueQuery.docs.forEach(doc => {
                    if (doc.data().status !== 'RECEIVED') {
                        allReceived = false;
                    }
                });

                if (allReceived) {
                    transaction.update(orderRef, {
                        status: 'READY_FOR_PACKING',
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                    console.log(`Order ${orderId} fully received. Transitioned to READY_FOR_PACKING.`);
                }
            });
        } catch (error) {
            console.error(`Failed to update order ${newData.orderId} from procurement queue:`, error);
        }
    }
    return null;
});

function normalizeToE164(raw) {
    if (!raw) return null;
    const str = String(raw).trim();
    const digits = str.replace(/\D/g, '');
    if (digits.length === 10) {
        return `+91${digits}`;
    }
    if (digits.length === 12 && digits.startsWith('91')) {
        return `+${digits}`;
    }
    return str.startsWith('+') ? str : `+${digits}`;
}

/**
 * onOrderRiderAssigned:
 * Triggered when an order's riderId is set or changed.
 * Copies riderName and riderPhone from riders/{riderId} into orders/{orderId}.
 */
exports.onOrderRiderAssigned = onDocumentUpdated({ document: "orders/{orderId}", region: REGION }, async (event) => {
    const change = event.data;
    if (!change) return null;
    const newData = change.after.data();
    const oldData = change.before.data();
    if (!newData) return null;

    const newRiderId = newData.riderId;
    const oldRiderId = oldData ? oldData.riderId : null;

    if (newRiderId && newRiderId !== oldRiderId) {
        if (!newData.riderName || !newData.riderPhone) {
            try {
                const riderDoc = await db.collection("riders").doc(newRiderId).get();
                let name = null;
                let phone = null;
                if (riderDoc.exists) {
                    const rData = riderDoc.data() || {};
                    name = rData.name || null;
                    phone = rData.phone || null;
                }
                if (!phone) {
                    const wSnap = await db.collection("whitelisted_riders").where("uid", "==", newRiderId).limit(1).get();
                    if (!wSnap.empty) {
                        const wData = wSnap.docs[0].data() || {};
                        name = name || wData.name || null;
                        const rawPhone = wData.phone || wSnap.docs[0].id;
                        phone = normalizeToE164(rawPhone);
                    }
                } else {
                    phone = normalizeToE164(phone);
                }
                if (name || phone) {
                    const updates = {};
                    if (name) updates.riderName = name;
                    if (phone) updates.riderPhone = phone;
                    updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
                    await change.after.ref.update(updates);
                    console.log(`[onOrderRiderAssigned] Attached rider info to order ${event.params.orderId}: ${name} (${phone})`);
                }
            } catch (err) {
                console.error(`[onOrderRiderAssigned] Failed to attach rider info for order ${event.params.orderId}:`, err);
            }
        }
    }
    return null;
});
