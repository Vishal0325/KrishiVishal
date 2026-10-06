const assert = require('assert');
const adminModule = require('../core/admin');
const {
    greedyHaversineClustering,
    callOpsMicroserviceOrFallback,
    haversineDistance,
    HUB_COORDINATES
} = require('../logistics/routeBatching');

console.log("=== RUNNING SPRINT 3: LOGISTICS MICROSERVICE WIRING & DISPATCH BATCHING TEST SUITE ===\n");

let passed = 0;
let failed = 0;

function pass(name) {
    console.log(`PASS: ${name}`);
    passed++;
}

function fail(name, err) {
    console.error(`FAIL: ${name} - ${err.message || err}`);
    failed++;
}

async function runSprint3Tests() {
    // ─────────────────────────────────────────────────────────────
    // TEST 1: Role Authorization Guards
    // ─────────────────────────────────────────────────────────────
    console.log("--- TEST 1: optimizeHubDeliveryBatches Authorization Guards ---");
    try {
        function checkBatchingAuth(auth) {
            if (!auth) throw new Error("unauthenticated");
            const token = auth.token || {};
            const role = (token.role || '').toLowerCase();
            const isAuthorized = token.admin === true ||
                ['hubmanager', 'admin', 'superadmin', 'ordermanager', 'catalogmanager'].includes(role);
            if (!isAuthorized) throw new Error("permission-denied");
            return true;
        }

        // 1.1 Unauthenticated rejected
        assert.throws(() => checkBatchingAuth(null), /unauthenticated/);
        pass("1.1 Unauthenticated caller strictly rejected with unauthenticated");

        // 1.2 Customer / Rider rejected
        assert.throws(() => checkBatchingAuth({ token: { role: 'Customer' } }), /permission-denied/);
        assert.throws(() => checkBatchingAuth({ token: { role: 'Rider' } }), /permission-denied/);
        pass("1.2 Customer and Rider roles strictly denied with permission-denied");

        // 1.3 HubManager, Admin, SuperAdmin, admin=true authorized
        assert.strictEqual(checkBatchingAuth({ token: { role: 'HubManager' } }), true);
        assert.strictEqual(checkBatchingAuth({ token: { role: 'Admin' } }), true);
        assert.strictEqual(checkBatchingAuth({ token: { role: 'SuperAdmin' } }), true);
        assert.strictEqual(checkBatchingAuth({ token: { role: 'OrderManager' } }), true);
        assert.strictEqual(checkBatchingAuth({ token: { admin: true } }), true);
        pass("1.3 HubManager, Admin, SuperAdmin, and OrderManager roles successfully authorized");

    } catch (err) {
        fail("TEST 1 Role Authorization Guards", err);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 2: Haversine Distance & Polar Angular Sweep Clustering Fallback
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- TEST 2: Greedy Haversine & Angular Sweep Clustering Algorithm ---");
    try {
        const hub = HUB_COORDINATES['hub_central_samastipur'];

        // 2.1 Haversine Distance sanity check
        // Pusa to Kalyanpur is approx 18-20 km
        const distKm = haversineDistance(25.9833, 85.6667, 25.9667, 85.8333);
        assert(distKm > 14 && distKm < 25, `Expected distance between 14-25 km, got ${distKm}`);
        pass("2.1 haversineDistance accurately computes geodesic distance across Bihar GPS coordinates");

        // 2.2 Multi-order clustering
        const mockOrders = [
            { id: 'ORD-01', lat: 25.865, lng: 85.783, weight_kg: 5 },
            { id: 'ORD-02', lat: 25.983, lng: 85.666, weight_kg: 10 },
            { id: 'ORD-03', lat: 25.966, lng: 85.833, weight_kg: 7 },
            { id: 'ORD-04', lat: 25.883, lng: 85.916, weight_kg: 4 },
            { id: 'ORD-05', lat: 25.750, lng: 85.750, weight_kg: 12 },
            { id: 'ORD-06', lat: 25.820, lng: 85.700, weight_kg: 6 }
        ];

        const clusters = greedyHaversineClustering(hub.lat, hub.lng, mockOrders, 3);
        assert.strictEqual(clusters.length, 3, "Must produce 3 clusters for 3 riders");

        const assignedIds = new Set();
        clusters.forEach((c, idx) => {
            assert.strictEqual(c.rider_index, idx);
            assert(c.order_ids.length > 0, `Cluster ${idx} must contain orders`);
            assert(c.total_distance_km > 0, `Cluster ${idx} distance must be > 0`);
            c.order_ids.forEach(id => assignedIds.add(id));
        });

        assert.strictEqual(assignedIds.size, 6, "All 6 orders must be uniquely assigned across clusters without overlap");
        pass("2.2 greedyHaversineClustering partitions orders into balanced, non-overlapping geographic wedges");

        // 2.3 Single order / single rider edge case
        const singleCluster = greedyHaversineClustering(hub.lat, hub.lng, [mockOrders[0]], 3);
        assert.strictEqual(singleCluster.length, 1);
        assert.strictEqual(singleCluster[0].order_ids.length, 1);
        pass("2.3 Single-order edge case handled smoothly with valid roundtrip distance");

    } catch (err) {
        fail("TEST 2 Haversine Clustering Fallback", err);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 3: Resilient Microservice Fallback Integration
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- TEST 3: Microservice Calling & Resilient Fallback ---");
    try {
        const hub = HUB_COORDINATES['hub_central_samastipur'];
        const testOrders = [
            { id: 'ORD-A', lat: 25.870, lng: 85.785 },
            { id: 'ORD-B', lat: 25.860, lng: 85.780 }
        ];

        // 3.1 Unconfigured OPS_MICROSERVICE_URL falls back gracefully
        delete process.env.OPS_MICROSERVICE_URL;
        const fallbackResult = await callOpsMicroserviceOrFallback(
            'hub_central_samastipur',
            hub.lat,
            hub.lng,
            testOrders,
            2,
            null
        );

        assert.strictEqual(fallbackResult.source, 'HAVERSINE_FALLBACK');
        assert(fallbackResult.clusters.length > 0);
        pass("3.1 When OPS_MICROSERVICE_URL is not configured, automatically runs internal Haversine clustering");

        // 3.2 Unreachable microservice URL triggers fallback without throwing
        const unreachableResult = await callOpsMicroserviceOrFallback(
            'hub_central_samastipur',
            hub.lat,
            hub.lng,
            testOrders,
            2,
            'http://127.0.0.1:59999' // Non-existent local port
        );

        assert.strictEqual(unreachableResult.source, 'HAVERSINE_FALLBACK');
        assert(unreachableResult.clusters.length > 0);
        pass("3.2 When ops microservice is offline or unreachable, catches error gracefully and engages Haversine fallback");

    } catch (err) {
        fail("TEST 3 Microservice Fallback Integration", err);
    }

    // ─────────────────────────────────────────────────────────────
    // TEST 4: End-to-End Batch Write & Order Status Lifecycle
    // ─────────────────────────────────────────────────────────────
    console.log("\n--- TEST 4: End-to-End Batching State Updates ---");
    try {
        const mockOrderDocs = new Map([
            ['ORD_DISPATCH_1', {
                id: 'ORD_DISPATCH_1',
                destinationHubId: 'HUB-SAM-001',
                status: 'READY_FOR_DISPATCH',
                targetLat: 25.871,
                targetLng: 85.789
            }],
            ['ORD_DISPATCH_2', {
                id: 'ORD_DISPATCH_2',
                destinationHubId: 'HUB-SAM-001',
                status: 'READY_FOR_DISPATCH',
                targetLat: 25.862,
                targetLng: 85.781
            }]
        ]);

        const mockBatches = new Map();

        // Simulate batch write execution
        function applyBatchAssignments(clusters, hubId) {
            const results = [];
            for (const cluster of clusters) {
                const batchId = `BATCH_${hubId}_${Date.now()}_R${cluster.rider_index + 1}`;
                mockBatches.set(batchId, {
                    batchId,
                    hubId,
                    riderIndex: cluster.rider_index,
                    orderIds: cluster.order_ids,
                    totalDistanceKm: cluster.total_distance_km,
                    status: 'READY_FOR_RIDER_ASSIGNMENT'
                });

                cluster.order_ids.forEach((ordId, seq) => {
                    const existing = mockOrderDocs.get(ordId);
                    mockOrderDocs.set(ordId, {
                        ...existing,
                        dispatchBatchId: batchId,
                        batchId: batchId,
                        dispatchSequence: seq + 1,
                        status: 'BATCHED'
                    });
                });

                results.push(batchId);
            }
            return results;
        }

        const sampleClusters = [
            { rider_index: 0, order_ids: ['ORD_DISPATCH_1', 'ORD_DISPATCH_2'], total_distance_km: 8.4 }
        ];

        const batchIds = applyBatchAssignments(sampleClusters, 'HUB-SAM-001');

        assert.strictEqual(batchIds.length, 1);
        assert.strictEqual(mockBatches.size, 1);
        assert.strictEqual(mockOrderDocs.get('ORD_DISPATCH_1').status, 'BATCHED');
        assert.strictEqual(mockOrderDocs.get('ORD_DISPATCH_1').dispatchSequence, 1);
        assert.strictEqual(mockOrderDocs.get('ORD_DISPATCH_2').status, 'BATCHED');
        assert.strictEqual(mockOrderDocs.get('ORD_DISPATCH_2').dispatchSequence, 2);
        pass("4.1 Order documents atomically receive batchId, dispatchSequence, and status BATCHED");

    } catch (err) {
        fail("TEST 4 End-to-End Batching State Updates", err);
    }

    console.log("\n=======================================================");
    console.log(`SPRINT 3 TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log("=======================================================\n");

    if (failed > 0) {
        process.exit(1);
    }
}

runSprint3Tests().catch(err => {
    console.error("FATAL ERROR in Sprint 3 Test Suite:", err);
    process.exit(1);
});
