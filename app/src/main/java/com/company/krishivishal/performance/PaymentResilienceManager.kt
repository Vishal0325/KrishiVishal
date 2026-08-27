package com.company.krishivishal.performance

import javax.inject.Inject
import javax.inject.Singleton

/**
 * Implements a Circuit Breaker for Payment flows to prevent repeated failed charges
 * and reduce user frustration during Razorpay or Backend downtime.
 */
@Singleton
class PaymentResilienceManager @Inject constructor() {
    private var failureCount = 0
    private val threshold = 3
    private var lastFailureTime = 0L
    private val coolDownTime = 600000L // 10 minutes

    fun recordFailure() {
        failureCount++
        lastFailureTime = System.currentTimeMillis()
    }

    fun recordSuccess() {
        failureCount = 0
    }

    fun canAttemptPayment(): Boolean {
        if (failureCount >= threshold) {
            val now = System.currentTimeMillis()
            if (now - lastFailureTime > coolDownTime) {
                // Allow a retry after cooldown (Half-Open state)
                return true
            }
            return false
        }
        return true
    }

    fun getRemainingCooldownMinutes(): Int {
        val now = System.currentTimeMillis()
        val remainingMs = coolDownTime - (now - lastFailureTime)
        return if (remainingMs > 0) (remainingMs / 60000).toInt() + 1 else 0
    }
}
