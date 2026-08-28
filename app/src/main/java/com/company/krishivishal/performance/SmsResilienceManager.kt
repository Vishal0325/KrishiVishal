package com.company.krishivishal.performance

import javax.inject.Inject
import javax.inject.Singleton
import java.util.concurrent.ConcurrentHashMap

/**
 * A5: Manages SMS gateway health, rate limiting per phone number, and circuit breaking for OTP flows.
 */
@Singleton
class SmsResilienceManager @Inject constructor() {
    private var quotaExceeded = false
    private var lastFailureTime = 0L
    private val coolDownTime = 3600000L // 1 hour if quota exceeded

    // Per-phone attempt history: phone -> list of timestamps
    private val phoneAttemptMap = ConcurrentHashMap<String, MutableList<Long>>()

    companion object {
        private const val MAX_ATTEMPTS_PER_WINDOW = 3
        private const val WINDOW_DURATION_MS = 5 * 60 * 1000L // 5 minutes
    }

    fun recordQuotaExceeded() {
        quotaExceeded = true
        lastFailureTime = System.currentTimeMillis()
    }

    fun canSendSms(phoneNumber: String = ""): Boolean {
        val now = System.currentTimeMillis()
        val hasReset = quotaExceeded && now - lastFailureTime > coolDownTime
        if (hasReset) quotaExceeded = false

        if (quotaExceeded && !hasReset) return false

        if (phoneNumber.isNotBlank()) {
            val cleanPhone = phoneNumber.replace(Regex("\\D"), "")
            val attempts = phoneAttemptMap.getOrPut(cleanPhone) { mutableListOf() }
            synchronized(attempts) {
                // Remove timestamps older than the sliding window
                attempts.removeAll { now - it > WINDOW_DURATION_MS }
                if (attempts.size >= MAX_ATTEMPTS_PER_WINDOW) {
                    return false
                }
                attempts.add(now)
            }
        }

        return true
    }

    fun getRemainingCooldownSeconds(phoneNumber: String): Long {
        val cleanPhone = phoneNumber.replace(Regex("\\D"), "")
        val attempts = phoneAttemptMap[cleanPhone] ?: return 0L
        val now = System.currentTimeMillis()
        synchronized(attempts) {
            val oldestInWindow = attempts.minOrNull() ?: return 0L
            val elapsed = now - oldestInWindow
            val remaining = WINDOW_DURATION_MS - elapsed
            return if (remaining > 0) remaining / 1000 else 0L
        }
    }
}

