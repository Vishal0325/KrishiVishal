package com.company.krishivishal.performance

import javax.inject.Inject
import javax.inject.Singleton

/**
 * Manages the health of Maps API calls and provides fallback signals.
 */
@Singleton
class MapsResilienceManager @Inject constructor() {
    private var failureCount = 0
    private val threshold = 3
    private var lastFailureTime = 0L
    private val resetTimeout = 300000L // 5 minutes

    fun recordFailure() {
        failureCount++
        lastFailureTime = System.currentTimeMillis()
    }

    fun isMapsHealthy(): Boolean {
        val now = System.currentTimeMillis()
        val hasReset = failureCount >= threshold && now - lastFailureTime > resetTimeout
        if (hasReset) failureCount = 0
        return failureCount < threshold || hasReset
    }

    fun reset() {
        failureCount = 0
    }
}
