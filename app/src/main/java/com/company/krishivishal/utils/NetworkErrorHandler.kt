package com.company.krishivishal.utils

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
        Timber.e(throwable, "Technical Error Caught")
        
        return when (throwable) {
            is UnknownHostException, is ConnectException -> 
                "कृपया अपना इंटरनेट कनेक्शन जांचें! 🌾"
            
            is SocketTimeoutException -> 
                "सर्वर का समय समाप्त हो गया, कृपया पुनः प्रयास करें। ⏳"
            
            is FirebaseFirestoreException -> {
                when (throwable.code) {
                    FirebaseFirestoreException.Code.UNAVAILABLE -> "सर्वर उपलब्ध नहीं है, कृपया इंटरनेट चेक करें। 📡"
                    FirebaseFirestoreException.Code.PERMISSION_DENIED -> "आपको यह जानकारी देखने की अनुमति नहीं है।"
                    else -> "डेटाबेस एरर: कृपया बाद में प्रयास करें।"
                }
            }
            
            is java.io.IOException -> 
                "नेटवर्क में समस्या है, कृपया पुनः प्रयास करें।"
            
            else -> "कुछ गड़बड़ हुई, कृपया बाद में प्रयास करें। 🙏"
        }
    }
}

/**
 * Extension function for easy access in Repositories
 */
fun Throwable.asFriendlyError(): String = NetworkErrorHandler.asFriendlyError(this)
