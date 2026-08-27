package com.company.krishivishal.utils

import com.company.krishivishal.KrishiVishalApp
import com.company.krishivishal.R
import com.google.firebase.FirebaseException
import com.google.firebase.auth.FirebaseAuthException
import com.google.firebase.firestore.FirebaseFirestoreException
import timber.log.Timber
import java.net.ConnectException
import java.net.SocketTimeoutException
import java.net.UnknownHostException

/**
 * Handles network errors and converts technical exceptions into friendly Hindi messages
 */
object NetworkErrorHandler {

    fun asFriendlyError(throwable: Throwable): String {
        val context = KrishiVishalApp.instance

        // 1. Prevent StackOverflow by checking for it first
        if (throwable is StackOverflowError) {
            return context.getString(R.string.error_technical)
        }

        // 2. Log the full technical error to Logcat safely
        try {
            android.util.Log.e("NetworkErrorHandler", "Technical Error [${throwable.javaClass.simpleName}]: ${throwable.message}")
        } catch (e: Exception) {
            // Silence logging errors to prevent recursive crashes
        }
        
        return when (throwable) {
            is FirebaseAuthException -> when (throwable.errorCode) {
                "ERROR_INVALID_VERIFICATION_CODE" -> context.getString(R.string.error_invalid_otp)
                "ERROR_SESSION_EXPIRED" -> context.getString(R.string.error_otp_expired)
                "ERROR_TOO_MANY_REQUESTS" -> context.getString(R.string.error_too_many_requests)
                else -> context.getString(R.string.error_login_failed, throwable.errorCode)
            }

            is com.google.firebase.functions.FirebaseFunctionsException -> {
                when (throwable.code) {
                    com.google.firebase.functions.FirebaseFunctionsException.Code.UNAUTHENTICATED ->
                        context.getString(R.string.error_session_expired)
                    com.google.firebase.functions.FirebaseFunctionsException.Code.RESOURCE_EXHAUSTED ->
                        context.getString(R.string.error_server_overload)
                    com.google.firebase.functions.FirebaseFunctionsException.Code.UNAVAILABLE ->
                        context.getString(R.string.error_server_unavailable)
                    else -> throwable.message ?: context.getString(R.string.error_server_contact)
                }
            }

            is FirebaseException -> {
                when {
                    throwable.message?.contains("App Check", true) == true -> "App Check Blocked: Please use a real device."
                    throwable.message?.contains("quota", true) == true -> "SMS quota exceeded."
                    throwable.message?.contains("UNAUTHENTICATED", true) == true -> context.getString(R.string.error_session_expired)
                    throwable.message?.contains("NOT_FOUND", ignoreCase = true) == true -> context.getString(R.string.error_not_found)
                    throwable.message?.contains("out-of-resource", ignoreCase = true) == true -> context.getString(R.string.error_out_of_stock)
                    else -> throwable.message ?: context.getString(R.string.error_firebase)
                }
            }

            is UnknownHostException, is ConnectException -> 
                context.getString(R.string.error_no_internet)
            
            is SocketTimeoutException -> 
                context.getString(R.string.error_timeout)
            
            is FirebaseFirestoreException -> {
                when (throwable.code) {
                    FirebaseFirestoreException.Code.PERMISSION_DENIED -> context.getString(R.string.error_db_permission)
                    FirebaseFirestoreException.Code.UNAVAILABLE -> context.getString(R.string.error_db_unavailable)
                    else -> context.getString(R.string.error_db_generic, throwable.code.toString())
                }
            }

            is java.util.concurrent.CancellationException ->
                context.getString(R.string.error_task_cancelled)

            is java.io.IOException -> 
                context.getString(R.string.error_network_generic)
            
            else -> throwable.message?.takeIf { it.isNotBlank() }
                ?: context.getString(R.string.error_generic_with_code, throwable.javaClass.simpleName)
        }
    }
}

/**
 * Extension function for easy access in Repositories
 */
fun Throwable.asFriendlyError(): String = NetworkErrorHandler.asFriendlyError(this)
