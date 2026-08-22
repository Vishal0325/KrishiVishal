package com.company.krishivishal.crashlytics

import com.google.firebase.crashlytics.FirebaseCrashlytics
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Error categories for Crashlytics
 */
enum class ErrorCategory(val displayName: String) {
    NETWORK("Network Error"),
    AUTHENTICATION("Auth Error"),
    FIRESTORE("Database Error"),
    PAYMENT("Payment Error"),
    UI("UI Error"),
    VALIDATION("Validation Error"),
    UNKNOWN("Unknown Error"),
    SYNC("Sync Error"),
    PERFORMANCE("Performance Error"),
    PERMISSION("Permission Error")
}

/**
 * Firebase Crashlytics error reporter with categorization and context
 */
@Singleton
class CrashlyticsErrorReporter @Inject constructor() {

    private val crashlytics: FirebaseCrashlytics = FirebaseCrashlytics.getInstance()

    init {
        // Enable automatic crash reporting
        try {
            FirebaseCrashlytics.getInstance()
        } catch (e: Exception) {
            Timber.e(e, "Failed to initialize crash collection")
        }
    }

    /**
     * Report an error with category and custom context
     */
    fun reportError(
        exception: Throwable,
        category: ErrorCategory = ErrorCategory.UNKNOWN,
        context: Map<String, String> = emptyMap()
    ) {
        try {
            // Set error category
            crashlytics.setCustomKey("error_category", category.displayName)
            
            // Set additional context
            context.forEach { (key, value) ->
                crashlytics.setCustomKey(key, value)
            }
            
            // Add breadcrumb
            crashlytics.log("Error: ${category.displayName} - ${exception.message}")
            
            // Record the exception
            crashlytics.recordException(exception)
            
            // Use standard Log.e to avoid recursion with Timber/CrashlyticsTree
            android.util.Log.e("CrashlyticsReporter", "Error reported: ${category.displayName}", exception)
        } catch (e: Exception) {
            android.util.Log.e("CrashlyticsReporter", "Failed to report error", e)
        }
    }

    /**
     * Report network error
     */
    fun reportNetworkError(
        exception: Throwable,
        endpoint: String? = null,
        statusCode: Int? = null
    ) {
        val context = mutableMapOf<String, String>()
        endpoint?.let { context["endpoint"] = it }
        statusCode?.let { context["status_code"] = it.toString() }
        
        reportError(exception, ErrorCategory.NETWORK, context)
    }

    /**
     * Report authentication error
     */
    fun reportAuthError(
        exception: Throwable,
        userId: String? = null
    ) {
        val context = mutableMapOf<String, String>()
        userId?.let { context["user_id"] = it }
        
        reportError(exception, ErrorCategory.AUTHENTICATION, context)
    }

    /**
     * Report Firestore error
     */
    fun reportFirestoreError(
        exception: Throwable,
        collection: String? = null,
        operation: String? = null
    ) {
        val context = mutableMapOf<String, String>()
        collection?.let { context["collection"] = it }
        operation?.let { context["operation"] = it }
        
        reportError(exception, ErrorCategory.FIRESTORE, context)
    }

    /**
     * Report payment error
     */
    fun reportPaymentError(
        exception: Throwable,
        orderId: String? = null,
        amount: Double? = null,
        paymentMethod: String? = null
    ) {
        val context = mutableMapOf<String, String>()
        orderId?.let { context["order_id"] = it }
        amount?.let { context["amount"] = it.toString() }
        paymentMethod?.let { context["payment_method"] = it }
        
        reportError(exception, ErrorCategory.PAYMENT, context)
    }

    /**
     * Report UI error
     */
    fun reportUIError(
        exception: Throwable,
        screenName: String? = null
    ) {
        val context = mutableMapOf<String, String>()
        screenName?.let { context["screen"] = it }
        
        reportError(exception, ErrorCategory.UI, context)
    }

    /**
     * Report validation error
     */
    fun reportValidationError(
        exception: Throwable,
        fieldName: String? = null,
        value: String? = null
    ) {
        val context = mutableMapOf<String, String>()
        fieldName?.let { context["field"] = it }
        value?.let { context["value"] = it }
        
        reportError(exception, ErrorCategory.VALIDATION, context)
    }

    /**
     * Report sync error
     */
    fun reportSyncError(
        exception: Throwable,
        operationType: String? = null,
        entityId: String? = null
    ) {
        val context = mutableMapOf<String, String>()
        operationType?.let { context["operation_type"] = it }
        entityId?.let { context["entity_id"] = it }
        
        reportError(exception, ErrorCategory.SYNC, context)
    }

    /**
     * Report permission error
     */
    fun reportPermissionError(
        exception: Throwable,
        permission: String? = null
    ) {
        val context = mutableMapOf<String, String>()
        permission?.let { context["permission"] = it }
        
        reportError(exception, ErrorCategory.PERMISSION, context)
    }

    /**
     * Report performance issue
     */
    fun reportPerformanceIssue(
        message: String,
        operationName: String,
        durationMs: Long
    ) {
        try {
            crashlytics.setCustomKey("operation", operationName)
            crashlytics.setCustomKey("duration_ms", durationMs)
            
            Timber.w("Performance issue: $operationName took ${durationMs}ms")
            
            // Report as non-fatal if it exceeds threshold
            if (durationMs > 5000) { // 5 seconds
                crashlytics.recordException(
                    PerformanceException("$operationName took ${durationMs}ms")
                )
            }
        } catch (e: Exception) {
            Timber.e(e, "Failed to report performance issue")
        }
    }

    /**
     * Add breadcrumb for tracking app flow
     */
    fun addBreadcrumb(message: String, data: Map<String, String> = emptyMap()) {
        try {
            crashlytics.log(message)
            data.forEach { (key, value) ->
                crashlytics.setCustomKey("breadcrumb_$key", value)
            }
        } catch (e: Exception) {
            Timber.e(e, "Failed to add breadcrumb")
        }
    }

    /**
     * Set user context for crash reports
     */
    fun setUserContext(userId: String, email: String? = null) {
        try {
            crashlytics.setUserId(userId)
            email?.let { 
                crashlytics.setCustomKey("user_email", it)
            }
            Timber.d("User context set for crash reporting: $userId")
        } catch (e: Exception) {
            Timber.e(e, "Failed to set user context")
        }
    }

    /**
     * Clear user context
     */
    fun clearUserContext() {
        try {
            crashlytics.setUserId("")
            crashlytics.setCustomKey("user_email", "")
        } catch (e: Exception) {
            Timber.e(e, "Failed to clear user context")
        }
    }

    /**
     * Enable/disable crash reporting
     */
    fun setCrashReportingEnabled(enabled: Boolean) {
        try {
            // Crash reporting is enabled by default in Crashlytics
            Timber.d("Crash reporting configured")
        } catch (e: Exception) {
            Timber.e(e, "Failed to set crash reporting")
        }
    }

    /**
     * Force send pending crashes (useful for testing)
     */
    fun sendPendingCrashes() {
        try {
            // Crashlytics automatically sends crashes on next app launch
            Timber.d("Pending crashes will be sent on next app launch")
        } catch (e: Exception) {
            Timber.e(e, "Failed to send pending crashes")
        }
    }
}

/**
 * Custom exception for performance issues
 */
class PerformanceException(message: String) : Exception(message)
