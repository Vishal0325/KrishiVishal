package com.company.krishivishal.analytics

import android.util.Log
import com.company.krishivishal.crashlytics.CrashlyticsErrorReporter
import com.google.firebase.crashlytics.FirebaseCrashlytics
import timber.log.Timber

/**
 * Custom Timber tree for integrating with Crashlytics
 * Automatically reports errors to Crashlytics and adds breadcrumbs
 */
class CrashlyticsTree(private val errorReporter: CrashlyticsErrorReporter) : Timber.Tree() {

    override fun log(priority: Int, tag: String?, message: String, t: Throwable?) {
        // Skip VERBOSE and DEBUG logs
        if (priority <= Log.DEBUG) return

        // Skip internal error reporting tags to prevent infinite recursion/StackOverflow
        if (tag == "NetworkErrorHandler" || tag == "CrashlyticsReporter" || tag == "CrashlyticsTree") return

        try {
            val logMessage = "${tag ?: "App"}: $message"
            
            when (priority) {
                Log.INFO -> FirebaseCrashlytics.getInstance().log(logMessage)
                Log.WARN -> {
                    FirebaseCrashlytics.getInstance().log("WARN: $logMessage")
                    t?.let { errorReporter.reportError(it) }
                }
                Log.ERROR -> {
                    FirebaseCrashlytics.getInstance().log("ERROR: $logMessage")
                    t?.let { errorReporter.reportError(it) }
                }
                Log.ASSERT -> {
                    FirebaseCrashlytics.getInstance().log("ASSERT: $logMessage")
                    t?.let { errorReporter.reportError(it) }
                }
            }
        } catch (e: Exception) {
            Log.e("CrashlyticsTree", "Error logging to Crashlytics", e)
        }
    }
}
