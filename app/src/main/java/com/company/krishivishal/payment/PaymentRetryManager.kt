package com.company.krishivishal.payment

import com.company.krishivishal.crashlytics.CrashlyticsErrorReporter
import kotlinx.coroutines.delay
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.math.pow

/**
 * Payment retry manager with exponential backoff
 * Handles failed payment attempts with intelligent retry strategy
 */
@Singleton
class PaymentRetryManager @Inject constructor(
    private val errorReporter: CrashlyticsErrorReporter
) {

    companion object {
        private const val MAX_RETRY_ATTEMPTS = 3
        private const val INITIAL_RETRY_DELAY_MS = 1000L  // 1 second
        private const val MAX_RETRY_DELAY_MS = 30000L     // 30 seconds
    }

    /**
     * Payment retry attempt with details
     */
    data class PaymentRetryAttempt(
        val attemptNumber: Int,
        val orderId: String,
        val amount: Double,
        val failureReason: String,
        val lastErrorMessage: String? = null,
        val nextRetryDelayMs: Long = 0
    )

    /**
     * Retry payment with exponential backoff
     */
    suspend fun retryPayment(
        orderId: String,
        amount: Double,
        failureReason: String,
        paymentOperation: suspend () -> Boolean
    ): Boolean {
        var lastError: Exception? = null

        for (attempt in 1..MAX_RETRY_ATTEMPTS) {
            try {
                Timber.d("Payment retry attempt $attempt/$MAX_RETRY_ATTEMPTS for order: $orderId")

                val result = paymentOperation()
                
                if (result) {
                    Timber.d("Payment successful on attempt $attempt")
                    return true
                }

                // Payment failed, will retry
                if (attempt < MAX_RETRY_ATTEMPTS) {
                    val delayMs = calculateBackoffDelay(attempt)
                    Timber.d("Payment failed, retrying in ${delayMs}ms...")
                    delay(delayMs)
                }
            } catch (e: Exception) {
                lastError = e
                Timber.e(e, "Payment attempt $attempt failed with exception")

                errorReporter.reportPaymentError(
                    exception = e,
                    orderId = orderId,
                    amount = amount,
                    paymentMethod = failureReason
                )

                if (attempt < MAX_RETRY_ATTEMPTS) {
                    val delayMs = calculateBackoffDelay(attempt)
                    Timber.d("Retry delay: ${delayMs}ms")
                    delay(delayMs)
                }
            }
        }

        // All retries exhausted
        val finalError = lastError ?: Exception("Payment failed after $MAX_RETRY_ATTEMPTS attempts")
        Timber.e(finalError, "Payment failed for order $orderId after all retry attempts")
        
        errorReporter.reportPaymentError(
            exception = finalError,
            orderId = orderId,
            amount = amount,
            paymentMethod = "retry_exhausted"
        )

        return false
    }

    /**
     * Calculate exponential backoff delay
     * Delay = initial * (2 ^ (attempt - 1)), capped at MAX_RETRY_DELAY_MS
     */
    private fun calculateBackoffDelay(attempt: Int): Long {
        val exponentialDelay = INITIAL_RETRY_DELAY_MS * (2.0.pow((attempt - 1).toDouble())).toLong()
        return minOf(exponentialDelay, MAX_RETRY_DELAY_MS)
    }

    /**
     * Get next retry delay for a specific attempt
     */
    fun getNextRetryDelay(attemptNumber: Int): Long {
        return if (attemptNumber < MAX_RETRY_ATTEMPTS) {
            calculateBackoffDelay(attemptNumber + 1)
        } else {
            0L
        }
    }

    /**
     * Check if payment can be retried
     */
    fun canRetry(attemptNumber: Int): Boolean {
        return attemptNumber < MAX_RETRY_ATTEMPTS
    }

    /**
     * Determine if error is retryable
     */
    fun isRetryableError(errorMessage: String): Boolean {
        val retryablePatterns = listOf(
            "timeout",
            "network",
            "connection",
            "temporarily",
            "unavailable",
            "rate limit",
            "503",
            "502",
            "504",
            "408"
        )

        return retryablePatterns.any { pattern ->
            errorMessage.contains(pattern, ignoreCase = true)
        }
    }

    /**
     * Get human-readable retry message
     */
    fun getRetryMessage(attemptNumber: Int, maxAttempts: Int): String {
        return when {
            attemptNumber == 1 -> "Payment processing. Please wait..."
            attemptNumber < maxAttempts -> "Retrying payment (attempt $attemptNumber/$maxAttempts)"
            else -> "Payment could not be completed. Please try again."
        }
    }
}
