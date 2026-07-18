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
        try {
            // Add breadcrumb
            val logMessage = "$tag: $message"
            
            when (priority) {
                Log.VERBOSE -> FirebaseCrashlytics.getInstance().log(logMessage)
                Log.DEBUG -> FirebaseCrashlytics.getInstance().log(logMessage)
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
