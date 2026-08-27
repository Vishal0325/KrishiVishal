package com.company.krishivishal.performance

import javax.inject.Inject
import javax.inject.Singleton

/**
 * Manages backoff and circuit breaking for Firestore sync operations.
 */
@Singleton
class SyncResilienceManager @Inject constructor() {
    private var consecutiveFailures = 0
    private var lastAttemptTime = 0L

    fun recordFailure() {
        consecutiveFailures++
        lastAttemptTime = System.currentTimeMillis()
    }

    fun recordSuccess() {
        consecutiveFailures = 0
    }

    fun shouldDelaySync(): Boolean {
        if (consecutiveFailures == 0) return false
        
        val now = System.currentTimeMillis()
        // Exponential backoff: 2^failures * 1000ms (max 1 hour)
        val backoffMs = (Math.pow(2.0, consecutiveFailures.toDouble()) * 1000)
            .toLong()
            .coerceAtMost(3600000L)
            
        return (now - lastAttemptTime) < backoffMs
    }

    fun getFailureCount() = consecutiveFailures
}
