package com.company.krishivishaldelivery.data.repository

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.util.concurrent.ConcurrentHashMap

class OrderRepositoryLocationThrottleTest {

    // Test harness for throttle evaluation without needing full Android/Firestore dependencies
    class ThrottleEvaluator {
        val throttleMap = ConcurrentHashMap<String, OrderRepository.OrderLocationThrottleState>()

        fun shouldThrottle(
            orderId: String,
            lat: Double,
            lng: Double,
            nowMs: Long
        ): Boolean {
            val lastState = throttleMap[orderId] ?: return false
            val elapsed = nowMs - lastState.timestampMs
            if (elapsed >= 30000L) return false

            val dist = OrderRepository.calculateDistanceMeters(lastState.lat, lastState.lng, lat, lng)
            return dist < 30.0 && elapsed < 15000L
        }

        fun record(orderId: String, lat: Double, lng: Double, nowMs: Long) {
            throttleMap[orderId] = OrderRepository.OrderLocationThrottleState(nowMs, lat, lng)
        }
    }

    private lateinit var evaluator: ThrottleEvaluator

    @Before
    fun setUp() {
        evaluator = ThrottleEvaluator()
    }

    @Test
    fun testTwoActiveOrdersIndependentLocationThrottling() {
        val order1 = "order-test-101"
        val order2 = "order-test-102"
        val t0 = 1000000L

        val purneaLat = 25.7711
        val purneaLng = 87.4753

        // 1. Initial location update for order1 -> MUST NOT be throttled
        val throttle1Initial = evaluator.shouldThrottle(order1, purneaLat, purneaLng, t0)
        assertFalse("Order 1 first update should never be throttled", throttle1Initial)
        evaluator.record(order1, purneaLat, purneaLng, t0)

        // 2. Second location update for order1 5 seconds later at same location -> MUST be throttled
        val t1 = t0 + 5000L
        val throttle1Quick = evaluator.shouldThrottle(order1, purneaLat, purneaLng, t1)
        assertTrue("Order 1 update within 5s and 0m moved should be throttled", throttle1Quick)

        // 3. Location update for order2 at t1 -> MUST NOT be throttled (proves throttle is per-order, not global!)
        val throttle2Initial = evaluator.shouldThrottle(order2, purneaLat, purneaLng, t1)
        assertFalse("Order 2 must NOT be throttled by Order 1's recent update", throttle2Initial)
        evaluator.record(order2, purneaLat, purneaLng, t1)

        // 4. Second location update for order2 3 seconds later (t1 + 3s) -> MUST be throttled
        val t2 = t1 + 3000L
        val throttle2Quick = evaluator.shouldThrottle(order2, purneaLat, purneaLng, t2)
        assertTrue("Order 2 quick update should be throttled", throttle2Quick)

        // 5. Update for order1 after 35 seconds (t0 + 35s) -> MUST NOT be throttled (elapsed >= 30s)
        val t3 = t0 + 35000L
        val throttle1AfterTimeout = evaluator.shouldThrottle(order1, purneaLat, purneaLng, t3)
        assertFalse("Order 1 update after 35s should be allowed", throttle1AfterTimeout)

        // 6. Update for order2 after 18 seconds with 100 meters movement -> MUST NOT be throttled (elapsed >= 15s and dist >= 30m)
        val t4 = t1 + 18000L
        val movedLat = purneaLat + 0.001 // ~111 meters away
        val distMoved = OrderRepository.calculateDistanceMeters(purneaLat, purneaLng, movedLat, purneaLng)
        assertTrue("Distance should exceed 30 meters", distMoved >= 30.0)

        val throttle2Moved = evaluator.shouldThrottle(order2, movedLat, purneaLng, t4)
        assertFalse("Order 2 update after 18s with >30m movement should be allowed", throttle2Moved)
    }

    @Test
    fun testHaversineDistanceCalculationAccuracy() {
        // Point A: Purnea (25.7711, 87.4753), Point B: shifted by ~0.001 deg lat
        val lat1 = 25.7711
        val lon1 = 87.4753
        val lat2 = 25.7721
        val lon2 = 87.4753

        val dist = OrderRepository.calculateDistanceMeters(lat1, lon1, lat2, lon2)
        // 0.001 deg latitude is approximately 111.19 meters
        assertEquals(111.19, dist, 5.0)
    }
}
