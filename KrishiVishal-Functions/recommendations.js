const functions = require("firebase-functions/v1");
const admin = require("firebase-admin");

// Constants for scoring
const WEIGHTS = {
    TECHNICAL_NAME: 40,
    COMPOSITION: 25,
    CATEGORY: 15,
    SUB_CATEGORY: 10,
    CROP_MATCH: 10,
    CROP_FULL_BONUS: 2,
    PEST_MATCH: 10,
    PEST_FULL_BONUS: 2,
    PRODUCT_TYPE: 5,
    PRICE_BAND: 5,
    PACK_SIZE_BAND: 3,
    POPULARITY: 5
};

const MAX_RECOMMENDATION_SCORE = Object.values(WEIGHTS).reduce((a, b) => a + b, 0);

/**
 * FIX 1: Token-aware Technical Name Normalization
 */
function normalizeTechnicalName(name) {
    if (!name) return "";

    // Formulation tokens and noise to remove (standalone only)
    const noiseTokens = new Set([
        "sl", "ec", "wp", "sc", "gr", "wg", "sg", "sp", "fs", "ds", "cs", "ew", "me", "od", "zc", "zc", "zc",
        "w/w", "w/v", "v/v", "v/w"
    ]);

    return name.toLowerCase()
        .replace(/%/g, " % ") // Separate % symbol
        .replace(/[\/\-_,]/g, " ") // Normalize separators
        .split(/\s+/)
        .filter(token => {
            if (token.length === 0) return false;
            // Remove standalone noise tokens
            if (noiseTokens.has(token)) return false;
            // Remove standalone %
            if (token === "%") return false;
            return true;
        })
        .sort()
        .join(" ")
        .trim()
        .replace(/\s+/g, " ");
}

/**
 * FIX 2: Safe Pack Size Normalization
 */
function parsePackSize(sizeStr) {
    if (!sizeStr) return { dimension: "unknown", value: 0, band: "unknown" };

    const valueMatch = sizeStr.match(/(\d+(\.\d+)?)\s*([a-zA-Z]+)/);
    if (!valueMatch) return { dimension: "unknown", value: 0, band: "unknown" };

    const value = parseFloat(valueMatch[1]);
    const unit = valueMatch[3].toLowerCase();

    let dimension = "unknown";
    let normalizedValue = value;

    if (["mg", "g", "gm", "kg"].includes(unit)) {
        dimension = "mass";
        if (unit === "mg") normalizedValue = value / 1000;
        if (unit === "kg") normalizedValue = value * 1000;
    } else if (["ml", "l", "ltr", "liter"].includes(unit)) {
        dimension = "volume";
        if (unit === "l" || unit === "ltr" || unit === "liter") normalizedValue = value * 1000;
    }

    let band = "unknown";
    if (dimension !== "unknown") {
        if (normalizedValue <= 100) band = "0-100";
        else if (normalizedValue <= 250) band = "100-250";
        else if (normalizedValue <= 500) band = "250-500";
        else if (normalizedValue <= 1000) band = "500-1000";
        else if (normalizedValue <= 5000) band = "1000-5000";
        else band = "5000+";
        band = `${dimension}_${band}`;
    }

    return { dimension, value: normalizedValue, band };
}

function getPriceBand(price) {
    if (price <= 100) return "0-100";
    if (price <= 250) return "100-250";
    if (price <= 500) return "250-500";
    if (price <= 1000) return "500-1000";
    if (price <= 2500) return "1000-2500";
    if (price <= 5000) return "2500-5000";
    return "5000+";
}

/**
 * Scoring Logic
 */
function calculateScore(candidate, target) {
    let score = 0;

    if (candidate.technicalNameNormalized && candidate.technicalNameNormalized === target.technicalNameNormalized) {
        score += WEIGHTS.TECHNICAL_NAME;
    }

    if (candidate.composition && candidate.composition === target.composition) {
        score += WEIGHTS.COMPOSITION;
    }

    if (candidate.category && candidate.category === target.category) {
        score += WEIGHTS.CATEGORY;
    }

    if (candidate.subCategory && candidate.subCategory === target.subCategory) {
        score += WEIGHTS.SUB_CATEGORY;
    }

    const targetCrops = target.associatedCropIds || [];
    const candCrops = candidate.associatedCropIds || [];
    const sharedCrops = candCrops.filter(id => targetCrops.includes(id));
    if (sharedCrops.length > 0) {
        score += WEIGHTS.CROP_MATCH;
        if (sharedCrops.length === targetCrops.length && candCrops.length === targetCrops.length) {
            score += WEIGHTS.CROP_FULL_BONUS;
        }
    }

    const targetPests = target.targetPestIds || [];
    const candPests = candidate.targetPestIds || [];
    const sharedPests = candPests.filter(id => targetPests.includes(id));
    if (sharedPests.length > 0) {
        score += WEIGHTS.PEST_MATCH;
        if (sharedPests.length === targetPests.length && candPests.length === targetPests.length) {
            score += WEIGHTS.PEST_FULL_BONUS;
        }
    }

    if (candidate.productType && candidate.productType === target.productType) {
        score += WEIGHTS.PRODUCT_TYPE;
    }

    if (candidate.priceBand && candidate.priceBand === target.priceBand) {
        score += WEIGHTS.PRICE_BAND;
    }

    if (candidate.packSizeBand && candidate.packSizeBand === target.packSizeBand) {
        score += WEIGHTS.PACK_SIZE_BAND;
    }

    const popularity = candidate.salesCount90d || 0;
    score += Math.min(WEIGHTS.POPULARITY, (popularity / 10));

    return score;
}

/**
 * FIX 12: Bounded candidate and result count
 */
async function getSectionRecommendations(db, target, queryConfig, pins) {
    const { sectionKey, filters, limit = 20 } = queryConfig;

    let query = db.collection("products").where("isActive", "==", true);
    for (const [field, val] of Object.entries(filters)) {
        query = query.where(field, "==", val);
    }

    const snapshot = await query.limit(limit).get();

    const pinnedIds = pins[sectionKey] || [];
    const pinnedDocs = [];
    if (pinnedIds.length > 0) {
        // Limit to 3 pins per section
        const validPins = pinnedIds.slice(0, 3);
        const pinSnaps = await Promise.all(validPins.map(id => db.collection("products").doc(id).get()));
        pinSnaps.forEach(s => {
            if (s.exists && s.data().isActive) {
                pinnedDocs.push({ ...s.data(), id: s.id, isPinned: true, finalScore: 100, recommendationReason: "Featured" });
            }
        });
    }

    const candidates = snapshot.docs
        .filter(doc => doc.id !== target.id && !pinnedIds.includes(doc.id))
        .map(doc => {
            const data = doc.data();
            const score = calculateScore(data, target);
            const finalScore = Math.min(100, Math.round((score / MAX_RECOMMENDATION_SCORE) * 100));

            let reason = "Popular Choice";
            if (data.technicalNameNormalized && data.technicalNameNormalized === target.technicalNameNormalized) reason = "Same Technical";
            else if (sectionKey === "similar") reason = "Similar Product";
            else if (sectionKey === "related") reason = "Matches Crop";

            return { ...data, id: doc.id, finalScore, recommendationReason: reason, rawScore: score };
        })
        .sort((a, b) => b.rawScore - a.rawScore);

    // FIX 6: Brand Diversity (Max 2 per brand)
    const brandCounts = {};
    pinnedDocs.forEach(d => brandCounts[d.brand] = (brandCounts[d.brand] || 0) + 1);

    const diverseAlgos = [];
    for (const res of candidates) {
        if ((brandCounts[res.brand] || 0) < 2) {
            brandCounts[res.brand] = (brandCounts[res.brand] || 0) + 1;
            diverseAlgos.push(res);
        }
        if (diverseAlgos.length >= (6 - pinnedDocs.length)) break;
    }

    return [...pinnedDocs, ...diverseAlgos];
}

exports.onProductWrite = functions.firestore
    .document("products/{productId}")
    .onWrite(async (change, context) => {
        const newData = change.after.exists ? change.after.data() : null;
        if (!newData) return null;

        const techName = newData.technicalName || newData.composition || "";
        const normalizedName = normalizeTechnicalName(techName);
        const priceBand = getPriceBand(newData.price || 0);
        const packInfo = parsePackSize(newData.weight || newData.unit || "");

        if (newData.technicalNameNormalized !== normalizedName ||
            newData.priceBand !== priceBand ||
            newData.packSizeBand !== packInfo.band) {

            await change.after.ref.update({
                technicalNameNormalized: normalizedName,
                priceBand: priceBand,
                packSizeBand: packInfo.band,
                packSizeDimension: packInfo.dimension,
                packSizeValue: packInfo.value,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                // FIX 10: Invalidate cache
                recommendationCache: null
            });
        }

        // P1-1: Price Drop Alert
        const oldData = change.before.exists ? change.before.data() : null;
        if (oldData && newData.price < oldData.price) {
            await handlePriceDrop(newData, oldData.price);
        }

        // P1-1: Restock Alert
        if (oldData && oldData.stockQuantity === 0 && newData.stockQuantity > 0) {
            await handleRestock(newData);
        }

        return null;
    });

/**
 * Handles Price Drop Notifications with Idempotency
 */
async function handlePriceDrop(product, oldPrice) {
    const db = admin.firestore();
    const usersSnap = await db.collectionGroup("wishlist")
        .where("productId", "==", product.id)
        .get();

    if (usersSnap.empty) return;

    for (const doc of usersSnap.docs) {
        const userId = doc.ref.parent.parent.id;
        const eventId = `price_drop_${product.id}_${product.price}_${userId}`;
        const logRef = db.collection("notification_logs").doc(eventId);

        // Server-side Idempotency Guard
        const log = await logRef.get();
        if (log.exists) continue;

        const userDoc = await db.collection("users").doc(userId).get();
        const token = userDoc.data()?.fcmToken;
        if (!token) continue;

        const message = {
            notification: {
                title: "📉 Price Drop Alert!",
                body: `${product.name} price dropped from ₹${oldPrice} to ₹${product.price}!`,
            },
            data: {
                productId: product.id,
                type: "PRICE_DROP",
                click_action: "PRODUCT_DETAIL"
            },
            token: token
        };

        try {
            await admin.messaging().send(message);
            await logRef.set({
                userId, productId: product.id, type: "PRICE_DROP",
                price: product.price, timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
        } catch (error) {
            console.error(`FCM Error for user ${userId}:`, error.message);
            if (error.code === 'messaging/registration-token-not-registered') {
                // Cleanup invalid token
                await db.collection("users").doc(userId).update({ fcmToken: admin.firestore.FieldValue.delete() });
            }
        }
    }
}

/**
 * Handles Restock Notifications with Idempotency
 */
async function handleRestock(product) {
    const db = admin.firestore();
    const requestsSnap = await db.collection("stock_notification_requests")
        .where("productId", "==", product.id)
        .where("status", "==", "PENDING")
        .get();

    if (requestsSnap.empty) return;

    for (const doc of requestsSnap.docs) {
        const data = doc.data();
        const userId = data.userId;
        const eventId = `restock_${product.id}_${userId}`;
        const logRef = db.collection("notification_logs").doc(eventId);

        const log = await logRef.get();
        if (log.exists) continue;

        const userDoc = await db.collection("users").doc(userId).get();
        const token = userDoc.data()?.fcmToken;
        if (!token) continue;

        const message = {
            notification: {
                title: "🔔 Back in Stock!",
                body: `${product.name} is now available. Shop now before it sells out!`,
            },
            data: {
                productId: product.id,
                type: "RESTOCK",
                click_action: "PRODUCT_DETAIL"
            },
            token: token
        };

        try {
            await admin.messaging().send(message);
            await logRef.set({
                userId, productId: product.id, type: "RESTOCK",
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
            await doc.ref.update({ status: "NOTIFIED", notifiedAt: admin.firestore.FieldValue.serverTimestamp() });
        } catch (error) {
            console.error(`FCM Error for user ${userId}:`, error.message);
        }
    }
}

/**
 * FIX 3: Scalable Metadata Backfill
 */
exports.backfillProductMetadata = functions.https.onCall(async (data, context) => {
    if (!context.auth || !context.auth.token.admin) {
        throw new functions.https.HttpsError('permission-denied', 'Admin only.');
    }

    const { dryRun = false } = data;
    const db = admin.firestore();

    // Use limited query to avoid "Billing Bomb" on massive catalogs
    const products = await db.collection("products").limit(5000).get();

    const results = {
        total: products.size,
        processed: 0,
        updated: 0,
        failed: 0,
        errors: []
    };

    if (dryRun) return results;

    // Tune BulkWriter for cost-effective throughput (Max 50 writes per second)
    const bulkWriter = db.bulkWriter({ throttling: { maxOpsPerSecond: 50 } });
    bulkWriter.onWriteError((error) => {
        results.failed++;
        results.errors.push(error.message);
        return false; // Do not retry
    });

    products.forEach(doc => {
        const p = doc.data();
        const techName = p.technicalName || p.composition || "";
        const normName = normalizeTechnicalName(techName);
        const pBand = getPriceBand(p.price || 0);
        const packInfo = parsePackSize(p.weight || p.unit || "");

        const updates = {
            technicalNameNormalized: normName,
            priceBand: pBand,
            packSizeBand: packInfo.band,
            packSizeDimension: packInfo.dimension,
            packSizeValue: packInfo.value,
            salesCount: p.salesCount || 0,
            salesCount90d: p.salesCount90d || 0,
            viewCount: p.viewCount || 0,
            searchCount: p.searchCount || 0,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        bulkWriter.update(doc.ref, updates);
        results.processed++;
    });

    await bulkWriter.close();
    return results;
});

/**
 * FIX 4: Scalable Popularity Engine
 */
exports.refreshPopularity = functions.pubsub.schedule("0 1 * * *") // 1 AM
    .onRun(async (context) => {
        const db = admin.firestore();
        const now = new Date();
        const ninetyDaysAgo = new Date();
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

        // Aggregate from sales_stats collection
        const statsSnap = await db.collection("sales_stats")
            .where("date", ">=", ninetyDaysAgo)
            .get();

        const productAggregates = {};

        statsSnap.forEach(doc => {
            const data = doc.data();
            const productId = data.productId;
            const quantity = data.quantity || 0;
            const date = data.date.toDate();

            const daysDiff = (now - date.getTime()) / (1000 * 60 * 60 * 24);
            const weight = Math.max(0, 1 - (daysDiff / 90));

            if (!productAggregates[productId]) productAggregates[productId] = 0;
            productAggregates[productId] += quantity * weight;
        });

        // Tune BulkWriter for cost-effective throughput (Max 50 writes per second)
        const bulkWriter = db.bulkWriter({ throttling: { maxOpsPerSecond: 50 } });
        for (const [productId, score] of Object.entries(productAggregates)) {
            const productRef = db.collection("products").doc(productId);
            bulkWriter.update(productRef, {
                salesCount90d: Math.round(score * 10) / 10,
                recommendationCache: null // Invalidate cache on popularity change
            });
        }

        await bulkWriter.close();
        console.log(`Updated popularity for ${Object.keys(productAggregates).length} products.`);

        // Trigger Smart Notifications for new bestsellers
        await notifyNewBestsellers(db, productAggregates);
    });

/**
 * Sends notifications to users interested in categories with new popular items.
 */
async function notifyNewBestsellers(db, productAggregates) {
    const BESTSELLER_THRESHOLD = 50; // Threshold for being a "popular" item
    const popularProductIds = Object.entries(productAggregates)
        .filter(([id, score]) => score >= BESTSELLER_THRESHOLD)
        .map(([id, score]) => id);

    if (popularProductIds.length === 0) return;

    for (const productId of popularProductIds) {
        const prodSnap = await db.collection("products").doc(productId).get();
        if (!prodSnap.exists) continue;
        const product = prodSnap.data();
        const category = product.category;

        if (!category) continue;

        // Find users interested in this category
        const usersSnap = await db.collection("users")
            .where("interestedCategories", "array-contains", category)
            .limit(500) // Send to first 500 interested users
            .get();

        if (usersSnap.empty) continue;

        const tokens = usersSnap.docs.map(doc => doc.data().fcmToken).filter(t => !!t);
        if (tokens.length === 0) continue;

        const message = {
            notification: {
                title: `New Bestseller in ${category}!`,
                body: `${product.name} is trending. Get yours before it goes out of stock!`,
            },
            data: {
                productId: productId,
                click_action: "PRODUCT_DETAIL",
            }
        };

        // Firebase messaging multicasting
        try {
            await admin.messaging().sendEachForMulticast({
                tokens: tokens,
                ...message
            });
            console.log(`Sent popular item notification for ${product.name} to ${tokens.length} users.`);
        } catch (error) {
            console.error("Error sending smart notifications:", error);
        }
    }
}

/**
 * FIX 12: Optimized getRecommendations
 */
exports.getRecommendations = functions.https.onCall(async (data, context) => {
    const { productId } = data;
    if (!productId) throw new functions.https.HttpsError('invalid-argument', 'Missing productId');

    const db = admin.firestore();
    const productDoc = await db.collection("products").doc(productId).get();
    if (!productDoc.exists) throw new functions.https.HttpsError('not-found', 'Product not found');

    const product = productDoc.data();

    // FIX 10: 24h Cache check
    if (product.recommendationCache &&
        product.recommendationCache.expiresAt.toDate() > new Date()) {
        return product.recommendationCache.results;
    }

    const pins = product.recommendationPins || {};

    const sections = {
        technical: [],
        similar: [],
        related: []
    };

    // 1. Technical Alternatives
    if (product.technicalNameNormalized) {
        sections.technical = await getSectionRecommendations(db, { ...product, id: productId }, {
            sectionKey: "technical",
            filters: { technicalNameNormalized: product.technicalNameNormalized }
        }, pins);
    }

    // 2. Similar Products
    sections.similar = await getSectionRecommendations(db, { ...product, id: productId }, {
        sectionKey: "similar",
        filters: { category: product.category }
    }, pins);

    // 3. Related Products
    const cropIds = product.associatedCropIds || [];
    if (cropIds.length > 0) {
        // Firestore array-contains-any has 10 element limit
        const topCrops = cropIds.slice(0, 10);
        let query = db.collection("products")
            .where("isActive", "==", true)
            .where("associatedCropIds", "array-contains-any", topCrops)
            .limit(30);

        const relatedSnap = await query.get();
        // Since we can't easily filter by array-contains-any in getSectionRecommendations helper
        // we handle it here
        const candidates = relatedSnap.docs
            .filter(doc => doc.id !== productId)
            .map(doc => {
                const data = doc.data();
                const score = calculateScore(data, product);
                const finalScore = Math.min(100, Math.round((score / MAX_RECOMMENDATION_SCORE) * 100));
                return { ...data, id: doc.id, finalScore, recommendationReason: "Matches Crop", rawScore: score };
            })
            .sort((a, b) => b.rawScore - a.rawScore);

        // Diversity and Pins for related
        const pinnedIds = pins["related"] || [];
        const pinnedDocs = [];
        if (pinnedIds.length > 0) {
            const validPins = pinnedIds.slice(0, 3);
            const pinSnaps = await Promise.all(validPins.map(id => db.collection("products").doc(id).get()));
            pinSnaps.forEach(s => {
                if (s.exists && s.data().isActive) {
                    pinnedDocs.push({ ...s.data(), id: s.id, isPinned: true, finalScore: 100, recommendationReason: "Featured" });
                }
            });
        }

        const filteredCandidates = candidates.filter(c => !pinnedIds.includes(c.id));

        const brandCounts = {};
        pinnedDocs.forEach(d => brandCounts[d.brand] = (brandCounts[d.brand] || 0) + 1);

        const diverseAlgos = [];
        for (const res of filteredCandidates) {
            if ((brandCounts[res.brand] || 0) < 2) {
                brandCounts[res.brand] = (brandCounts[res.brand] || 0) + 1;
                diverseAlgos.push(res);
            }
            if (diverseAlgos.length >= (6 - pinnedDocs.length)) break;
        }

        sections.related = [...pinnedDocs, ...diverseAlgos];
    }

    // Cache results for 24h
    // SECURITY: Ensure cache size doesn't hit 1MB limit by picking only essential fields
    const sanitizedSections = JSON.parse(JSON.stringify(sections));
    const cacheData = {
        results: sanitizedSections,
        expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000))
    };

    // Safety: If somehow cache exceeds 800KB, don't store it to prevent doc corruption
    const cacheSize = Buffer.byteLength(JSON.stringify(cacheData));
    if (cacheSize < 800000) {
        await productDoc.ref.update({ recommendationCache: cacheData });
    }

    return sections;
});
