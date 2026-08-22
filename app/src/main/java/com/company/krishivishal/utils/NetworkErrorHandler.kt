package com.company.krishivishal.utils

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
        // 1. Prevent StackOverflow by checking for it first
        if (throwable is StackOverflowError) {
            return "ऐप में तकनीकी समस्या आई है। कृपया इसे रिस्टार्ट करें।"
        }

        // 2. Log the full technical error to Logcat safely
        try {
            android.util.Log.e("NetworkErrorHandler", "Technical Error [${throwable.javaClass.simpleName}]: ${throwable.message}")
        } catch (e: Exception) {
            // Silence logging errors to prevent recursive crashes
        }
        
        return when (throwable) {
            is FirebaseAuthException -> when (throwable.errorCode) {
                "ERROR_INVALID_VERIFICATION_CODE" -> "गलत ओटीपी! कृपया सही कोड डालें।"
                "ERROR_SESSION_EXPIRED" -> "ओटीपी की समय सीमा समाप्त हो गई है।"
                "ERROR_TOO_MANY_REQUESTS" -> "बहुत अधिक प्रयास! थोड़ी देर बाद कोशिश करें।"
                else -> "लॉगिन एरर: ${throwable.errorCode}"
            }

            is com.google.firebase.functions.FirebaseFunctionsException -> {
                when (throwable.code) {
                    com.google.firebase.functions.FirebaseFunctionsException.Code.UNAUTHENTICATED ->
                        "सेशन समाप्त हो गया है! कृपया दोबारा लॉगिन करें।"
                    com.google.firebase.functions.FirebaseFunctionsException.Code.RESOURCE_EXHAUSTED ->
                        "सर्वर पर अत्यधिक लोड है, कृपया कुछ समय पश्चात प्रयास करें।"
                    com.google.firebase.functions.FirebaseFunctionsException.Code.UNAVAILABLE ->
                        "सर्वर उपलब्ध नहीं है, कृपया इंटरनेट जांचें।"
                    else -> throwable.message ?: "सर्वर से संपर्क करने में समस्या आई।"
                }
            }

            is FirebaseException -> {
                when {
                    throwable.message?.contains("App Check", true) == true -> "App Check Blocked: Please use a real device."
                    throwable.message?.contains("quota", true) == true -> "SMS quota exceeded."
                    throwable.message?.contains("UNAUTHENTICATED", true) == true -> "सेशन समाप्त हो गया है! कृपया दोबारा लॉगिन करें।"
                    throwable.message?.contains("NOT_FOUND", ignoreCase = true) == true -> "सर्वर समस्या: सर्विस नहीं मिली।"
                    throwable.message?.contains("out-of-resource", ignoreCase = true) == true -> "स्टॉक उपलब्ध नहीं है! कृपया संख्या कम करें।"
                    else -> throwable.message ?: "Firebase Error"
                }
            }

            is UnknownHostException, is ConnectException -> 
                "इंटरनेट कनेक्शन नहीं मिल रहा है! 🌾"
            
            is SocketTimeoutException -> 
                "सर्वर से संपर्क टूट गया, कृपया पुनः प्रयास करें।"
            
            is FirebaseFirestoreException -> {
                when (throwable.code) {
                    FirebaseFirestoreException.Code.PERMISSION_DENIED -> "डेटाबेस एक्सेस की अनुमति नहीं है।"
                    FirebaseFirestoreException.Code.UNAVAILABLE -> "डेटाबेस सर्वर बंद है।"
                    else -> "डेटाबेस समस्या: ${throwable.code}"
                }
            }
            
            is java.io.IOException -> 
                "नेटवर्क कनेक्शन फेल हो गया।"
            
            else -> throwable.message?.takeIf { it.isNotBlank() }
                ?: "कुछ गड़बड़ हुई [${throwable.javaClass.simpleName}], कृपया बाद में प्रयास करें। 🙏"
        }
    }
}

/**
 * Extension function for easy access in Repositories
 */
fun Throwable.asFriendlyError(): String = NetworkErrorHandler.asFriendlyError(this)
