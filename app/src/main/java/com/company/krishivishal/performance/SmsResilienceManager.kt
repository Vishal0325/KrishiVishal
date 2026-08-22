package com.company.krishivishal.performance

import javax.inject.Inject
import javax.inject.Singleton

/**
 * Manages SMS gateway health and handles circuit breaking for OTP flows.
 */
@Singleton
class SmsResilienceManager @Inject constructor() {
    private var quotaExceeded = false
    private var lastFailureTime = 0L
    private val coolDownTime = 3600000L // 1 hour if quota exceeded

    fun recordQuotaExceeded() {
        quotaExceeded = true
        lastFailureTime = System.currentTimeMillis()
    }

    fun canSendSms(): Boolean {
        if (quotaExceeded) {
            val now = System.currentTimeMillis()
            if (now - lastFailureTime > coolDownTime) {
                quotaExceeded = false
                return true
            }
            return false
        }
        return true
    }
}
