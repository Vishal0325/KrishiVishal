const { onCall, HttpsError } = require("firebase-functions/v2/https");
const axios = require("axios");
const { db, admin } = require("../core/admin");

const REGION = 'asia-south1';

const HUB_COORDINATES = {
    'HUB-SAM-001': { lat: 25.8633, lng: 85.7818, name: 'Samastipur Central Hub' },
    'hub_central_samastipur': { lat: 25.8633, lng: 85.7818, name: 'Samastipur Central Hub' },
    'REG-RAH-002': { lat: 26.3750, lng: 86.0680, name: 'Rahika Spoke Hub' },
    'REG-KHA-003': { lat: 25.9610, lng: 85.8340, name: 'Kalyanpur Spoke Hub' },
    'REG-TAJ-004': { lat: 25.8750, lng: 85.6420, name: 'Tajpur Spoke Hub' }
};

const DEFAULT_HUB_LAT = 25.8633;
const DEFAULT_HUB_LNG = 85.7818;
const MAX_RIDER_CASH_LIMIT = 15000; // Maximum floating in-hand cash ceiling in INR

/**
 * Evaluates whether a rider can be assigned an order based on the floating cash ceiling.
 * Prepaid orders (non-COD) are always allowed.
 * COD orders are blocked if rider.cashInHand >= MAX_RIDER_CASH_LIMIT or (rider.cashInHand + codAmount) > MAX_RIDER_CASH_LIMIT.
 */
function evaluateRiderCashCeiling(rider, order) {
    const isCOD = (order.paymentMethod || order.paymentMode || (order.payment && order.payment.method) || (order.isCod ? 'COD' : '')).toUpperCase() === 'COD' || order.isCOD === true;

    if (!isCOD) {
        return {
            allowed: true,
            eligible: true,
            cashLimitExceeded: false,
            projectedCash: Number(rider?.cashInHand || 0),
            projectedCashInHand: Number(rider?.cashInHand || 0),
            reason: 'PREPAID_ORDER_BYPASS'
        };
    }

    const currentCash = Number(rider?.cashInHand || 0);
    const codAmount = Number(order.codAmount || order.totalAmount || 0);
    const projectedCash = currentCash + codAmount;

    if (currentCash >= MAX_RIDER_CASH_LIMIT || projectedCash > MAX_RIDER_CASH_LIMIT) {
        return {
            allowed: false,
            eligible: false,
            cashLimitExceeded: true,
            currentCashInHand: currentCash,
            orderCodAmount: codAmount,
            projectedCash: projectedCash,
            projectedCashInHand: projectedCash,
            limit: MAX_RIDER_CASH_LIMIT,
            reason: 'CASH_LIMIT_EXCEEDED'
        };
    }

    return {
        allowed: true,
        eligible: true,
        cashLimitExceeded: false,
        currentCashInHand: currentCash,
        orderCodAmount: codAmount,
        projectedCash: projectedCash,
        projectedCashInHand: projectedCash,
        limit: MAX_RIDER_CASH_LIMIT,
        reason: 'WITHIN_CASH_LIMIT'
    };
}

/**
 * Routes order to the first candidate rider whose cashInHand remains within MAX_RIDER_CASH_LIMIT.
 */
function assignOrderWithCashCeiling(riders = [], order) {
    for (const rider of riders) {
        const evaluation = evaluateRiderCashCeiling(rider, order);
        if (evaluation.allowed) {
            return {
                assigned: true,
                cashLimitExceeded: false,
                riderId: rider.id || rider.riderId,
                rider,
                evaluation
            };
        }
    }
    return {
        assigned: false,
        cashLimitExceeded: true,
        reason: 'All candidate riders exceed maximum floating cash limit of ₹15,000'
    };
}

/**
 * Calculates great-circle Haversine distance between two coordinates in kilometers.
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Fallback clustering: Polar Angular Sweep + Nearest Neighbor sequencing.
 * Guarantees distinct geographic wedges per delivery rider without cross-overs.
 */
function greedyHaversineClustering(hubLat, hubLng, orders, maxRiders) {
    if (!orders || orders.length === 0) return [];
    const k = Math.max(1, Math.min(maxRiders, orders.length));

    // Sort orders by polar angle relative to hub center
    const sortedOrders = [...orders].sort((a, b) => {
        const angleA = Math.atan2(a.lat - hubLat, a.lng - hubLng);
        const angleB = Math.atan2(b.lat - hubLat, b.lng - hubLng);
        return angleA - angleB;
    });

    const chunkSize = sortedOrders.length / k;
    const clusters = [];

    for (let i = 0; i < k; i++) {
        const startIdx = Math.round(i * chunkSize);
        const endIdx = Math.round((i + 1) * chunkSize);
        const subset = sortedOrders.slice(startIdx, endIdx);
        if (subset.length === 0) continue;

        // Sequence via Nearest Neighbor from Hub
        const unvisited = [...subset];
        const seq = [];
        let currLat = hubLat;
        let currLng = hubLng;
        let totalKm = 0;

        while (unvisited.length > 0) {
            let bestIdx = 0;
            let bestDist = Infinity;
            for (let j = 0; j < unvisited.length; j++) {
                const d = haversineDistance(currLat, currLng, unvisited[j].lat, unvisited[j].lng);
                if (d < bestDist) {
                    bestDist = d;
                    bestIdx = j;
                }
            }
            totalKm += bestDist;
            const chosen = unvisited.splice(bestIdx, 1)[0];
            currLat = chosen.lat;
            currLng = chosen.lng;
            seq.push(chosen);
        }
        // Roundtrip return to hub
        totalKm += haversineDistance(currLat, currLng, hubLat, hubLng);

        clusters.push({
            rider_index: i,
            order_ids: seq.map(o => o.id),
            total_distance_km: Math.round(totalKm * 100) / 100
        });
    }

    return clusters;
}

/**
 * Invokes python ops microservice if available, falling back to Haversine clustering on timeout/failure.
 */
async function callOpsMicroserviceOrFallback(hubId, hubLat, hubLng, orderPayloads, maxRiders, microserviceUrl = null) {
    const url = microserviceUrl || process.env.OPS_MICROSERVICE_URL;

    if (url && url.trim().length > 0) {
        try {
            console.log(`[routeBatching] Calling ops microservice at ${url}/api/v1/optimize-cluster`);
            const response = await axios.post(
                `${url.replace(/\/$/, '')}/api/v1/optimize-cluster`,
                {
                    hub_id: hubId,
                    max_riders: maxRiders,
                    orders: orderPayloads
                },
                {
                    timeout: 5000, // 5 second timeout
                    headers: { 'Content-Type': 'application/json' }
                }
            );

            if (response.data && Array.isArray(response.data.clusters) && response.data.clusters.length > 0) {
                return {
                    source: 'OPS_MICROSERVICE',
                    clusters: response.data.clusters
                };
            }
        } catch (err) {
            console.warn(`[routeBatching] Ops microservice call failed (${err.message}). Engaging resilient Haversine fallback.`);
        }
    } else {
        console.log(`[routeBatching] OPS_MICROSERVICE_URL not configured. Running internal Haversine clustering.`);
    }

    const clusters = greedyHaversineClustering(hubLat, hubLng, orderPayloads, maxRiders);
    return {
        source: 'HAVERSINE_FALLBACK',
        clusters
    };
}

/**
 * Checks authorization role: HubManager, Admin, SuperAdmin, OrderManager.
 */
function requireBatchingRole(auth) {
    if (!auth) {
        throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }
    const token = auth.token || {};
    const role = (token.role || '').toLowerCase();
    const isAuthorized = token.admin === true ||
        ['hubmanager', 'admin', 'superadmin', 'ordermanager', 'catalogmanager'].includes(role);

    if (!isAuthorized) {
        throw new HttpsError('permission-denied', 'Only HubManager or Admin can optimize dispatch batches.');
    }
}

/**
 * Callable Function: optimizeHubDeliveryBatches
 * Clusters pending dispatch orders into optimized delivery batches.
 */
const optimizeHubDeliveryBatches = onCall({ region: REGION, timeoutSeconds: 60, memory: '256MiB' }, async (request) => {
    requireBatchingRole(request.auth);

    const { hubId = 'hub_central_samastipur', maxRiders = 3 } = request.data || {};
    const hubConfig = HUB_COORDINATES[hubId] || { lat: DEFAULT_HUB_LAT, lng: DEFAULT_HUB_LNG };
    const hubLat = hubConfig.lat;
    const hubLng = hubConfig.lng;

    // 1. Fetch pending dispatch orders for hub
    // Check both destinationHubId and legacy spokeHubId/warehouseId
    const ordersSnap = await db.collection("orders")
        .where("status", "in", ["READY_FOR_DISPATCH", "PACKED", "CONFIRMED"])
        .get();

    const hubOrders = [];
    ordersSnap.forEach(doc => {
        const data = doc.data();
        const orderHub = data.destinationHubId || data.spokeHubId || data.warehouseId || data.hubId || 'hub_central_samastipur';
        if (orderHub === hubId || (!data.destinationHubId && hubId === 'hub_central_samastipur')) {
            // Already batched check
            if (!data.dispatchBatchId) {
                const lat = Number(data.targetLat || data.lat || (data.location && data.location.lat) || (hubLat + (Math.random() - 0.5) * 0.05));
                const lng = Number(data.targetLng || data.lng || (data.location && data.location.lng) || (hubLng + (Math.random() - 0.5) * 0.05));
                hubOrders.push({
                    id: doc.id,
                    lat,
                    lng,
                    weight_kg: Number(data.totalWeightKg || data.weight || 2.0),
                    totalAmount: Number(data.totalAmount || 0)
                });
            }
        }
    });

    if (hubOrders.length === 0) {
        return {
            success: true,
            hubId,
            message: "No unbatched orders ready for dispatch at this hub.",
            count: 0,
            clusters: []
        };
    }

    // 2. Invoke microservice or fallback
    const { source, clusters } = await callOpsMicroserviceOrFallback(
        hubId,
        hubLat,
        hubLng,
        hubOrders,
        maxRiders
    );

    // 3. Atomically write batch assignments to orders and create dispatch_batches docs
    const batchOps = db.batch();
    const generatedBatches = [];
    const timestamp = admin.firestore.FieldValue.serverTimestamp();

    for (const cluster of clusters) {
        const batchNum = cluster.rider_index + 1;
        const cleanHub = hubId.replace(/[^a-zA-Z0-9]/g, '_');
        const batchId = `BATCH_${cleanHub}_${Date.now()}_R${batchNum}`;

        const batchDocRef = db.collection("dispatch_batches").doc(batchId);
        batchOps.set(batchDocRef, {
            batchId,
            hubId,
            riderIndex: cluster.rider_index,
            orderIds: cluster.order_ids,
            totalDistanceKm: cluster.total_distance_km,
            clusterSource: source,
            status: 'READY_FOR_RIDER_ASSIGNMENT',
            createdAt: timestamp
        });

        cluster.order_ids.forEach((orderId, seqIndex) => {
            const orderRef = db.collection("orders").doc(orderId);
            batchOps.update(orderRef, {
                dispatchBatchId: batchId,
                batchId: batchId,
                dispatchSequence: seqIndex + 1,
                status: 'BATCHED',
                batchAssignedAt: timestamp
            });
        });

        generatedBatches.push({
            batchId,
            riderIndex: cluster.rider_index,
            orderIds: cluster.order_ids,
            totalDistanceKm: cluster.total_distance_km
        });
    }

    await batchOps.commit();

    console.log(`[routeBatching] Successfully batched ${hubOrders.length} orders into ${generatedBatches.length} dispatch batches for hub ${hubId} via ${source}`);

    return {
        success: true,
        hubId,
        source,
        totalOrders: hubOrders.length,
        batchesCount: generatedBatches.length,
        batches: generatedBatches
    };
});

module.exports = {
    optimizeHubDeliveryBatches,
    greedyHaversineClustering,
    callOpsMicroserviceOrFallback,
    haversineDistance,
    HUB_COORDINATES,
    MAX_RIDER_CASH_LIMIT,
    evaluateRiderCashCeiling,
    assignOrderWithCashCeiling
};
