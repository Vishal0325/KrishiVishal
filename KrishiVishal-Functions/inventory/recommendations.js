const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { db, admin } = require("../core/admin");
const { isAdminRequest } = require("../core/utils");

const REGION = 'asia-south1';

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

    const noiseTokens = new Set([
        "sl", "ec", "wp", "sc", "gr", "wg", "sg", "sp", "fs", "ds", "cs", "ew", "me", "od", "zc",
        "w/w", "w/v", "v/v", "v/w"
    ]);

    return name.toLowerCase()
        .replace(/%/g, " % ")
        .replace(/[\/\-_,]/g, " ")
        .split(/\s+/)
        .filter(token => {
            if (token.length === 0) return false;
            if (noiseTokens.has(token)) return false;
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

const SCORE_RELEVANT_FIELDS = [
    "category", "subCategory", "composition", "associatedCropIds",
    "targetPestIds", "productType"
];

exports.onProductWrite = onDocumentWritten({ document: "products/{productId}", region: REGION }, async (event) => {
    const change = event.data;
    if (!change) return null;

    const newData = change.after.exists ? change.after.data() : null;
    if (!newData) return null;

    const oldData = change.before.exists ? change.before.data() : null;

    const techName = newData.technicalName || newData.composition || "";
    const normalizedName = normalizeTechnicalName(techName);
    const priceBand = getPriceBand(newData.price || 0);
    const packInfo = parsePackSize(newData.weight || newData.unit || "");

    const derivedFieldsStale =
        newData.technicalNameNormalized !== normalizedName ||
        newData.priceBand !== priceBand ||
        newData.packSizeBand !== packInfo.band;

    const scoreFieldsChanged = oldData
        ? SCORE_RELEVANT_FIELDS.some(
              f => JSON.stringify(oldData[f]) !== JSON.stringify(newData[f])
          )
        : false;

    if (derivedFieldsStale || scoreFieldsChanged) {
        const updates = {
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            recommendationCache: null
        };
        if (derivedFieldsStale) {
            updates.technicalNameNormalized = normalizedName;
            updates.priceBand = priceBand;
            updates.packSizeBand = packInfo.band;
            updates.packSizeDimension = packInfo.dimension;
            updates.packSizeValue = packInfo.value;
        }
        return change.after.ref.update(updates);
    }
    return null;
});

exports.backfillProductMetadata = onCall({ region: REGION }, async (request) => {
    const context = { auth: request.auth };
    if (!(await isAdminRequest(context))) {
        throw new HttpsError('permission-denied', 'Admin only.');
    }

    const data = request.data || {};
    const { dryRun = false } = data;

    const products = await db.collection("products").limit(5000).get();

    const results = {
        total: products.size,
        processed: 0,
        updated: 0,
        failed: 0,
        errors: []
    };

    if (dryRun) {
        results.processed = products.size;
        return results;
    }

    const bulkWriter = db.bulkWriter({ throttling: { maxOpsPerSecond: 50 } });
    bulkWriter.onWriteError((error) => {
        results.failed++;
        results.errors.push(error.message);
        return false;
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

exports.refreshPopularity = onSchedule({ schedule: "0 1 * * *", region: REGION }, async (event) => {
    const now = new Date();
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

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

    const bulkWriter = db.bulkWriter({ throttling: { maxOpsPerSecond: 50 } });
    for (const [productId, score] of Object.entries(productAggregates)) {
        const productRef = db.collection("products").doc(productId);
        bulkWriter.update(productRef, {
            salesCount90d: Math.round(score * 10) / 10,
            recommendationCache: null
        });
    }

    await bulkWriter.close();
    console.log(`Updated popularity for ${Object.keys(productAggregates).length} products.`);
});

async function getRelatedSection(db, product, productId, pins) {
    const cropIds = product.associatedCropIds || [];
    if (cropIds.length === 0) return [];

    const topCrops = cropIds.slice(0, 10);
    let query = db.collection("products")
        .where("isActive", "==", true)
        .where("associatedCropIds", "array-contains-any", topCrops)
        .limit(30);

    const relatedSnap = await query.get();
    const candidates = relatedSnap.docs
        .filter(doc => doc.id !== productId)
        .map(doc => {
            const data = doc.data();
            const score = calculateScore(data, product);
            const finalScore = Math.min(100, Math.round((score / MAX_RECOMMENDATION_SCORE) * 100));
            return { ...data, id: doc.id, finalScore, recommendationReason: "Matches Crop", rawScore: score };
        })
        .sort((a, b) => b.rawScore - a.rawScore);

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

    return [...pinnedDocs, ...diverseAlgos];
}

exports.getRecommendations = onCall({ region: REGION }, async (request) => {
    const data = request.data || {};
    const { productId } = data;
    if (!productId) throw new HttpsError('invalid-argument', 'Missing productId');

    const productDoc = await db.collection("products").doc(productId).get();
    if (!productDoc.exists) throw new HttpsError('not-found', 'Product not found');

    const product = productDoc.data();

    if (product.recommendationCache &&
        product.recommendationCache.expiresAt.toDate() > new Date()) {
        return product.recommendationCache.results;
    }

    const pins = product.recommendationPins || {};
    const productWithId = { ...product, id: productId };

    const [technical, similar, related] = await Promise.all([
        product.technicalNameNormalized
            ? getSectionRecommendations(db, productWithId, {
                  sectionKey: "technical",
                  filters: { technicalNameNormalized: product.technicalNameNormalized }
              }, pins)
            : Promise.resolve([]),
        getSectionRecommendations(db, productWithId, {
            sectionKey: "similar",
            filters: { category: product.category }
        }, pins),
        getRelatedSection(db, product, productId, pins)
    ]);

    const sections = { technical, similar, related };

    const sanitizedSections = JSON.parse(JSON.stringify(sections));
    const cacheData = {
        results: sanitizedSections,
        expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000))
    };

    const cacheSize = Buffer.byteLength(JSON.stringify(cacheData));
    if (cacheSize < 800000) {
        await productDoc.ref.update({ recommendationCache: cacheData });
    }

    return sections;
});
