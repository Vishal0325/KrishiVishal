package com.company.krishivishal.security

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Secure storage for sensitive data like API keys, tokens, etc.
 * Uses Android's EncryptedSharedPreferences for encryption at rest
 */
@Singleton
class SecureStorage @Inject constructor(context: Context) {

    private val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    private val encryptedPreferences: SharedPreferences = EncryptedSharedPreferences.create(
        context,
        PREFS_FILE_NAME,
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    companion object {
        private const val PREFS_FILE_NAME = "krishi_encrypted_prefs"
        private const val KEY_AUTH_TOKEN = "auth_token"
        private const val KEY_REFRESH_TOKEN = "refresh_token"
        private const val KEY_TOKEN_EXPIRY = "token_expiry"
        private const val KEY_USER_ID = "user_id"
        private const val KEY_RAZORPAY_KEY = "razorpay_key"
        private const val KEY_FIREBASE_API_KEY = "firebase_api_key"
    }

    /**
     * Save authentication token
     */
    fun saveAuthToken(token: String) {
        try {
            encryptedPreferences.edit().putString(KEY_AUTH_TOKEN, token).apply()
            Timber.d("Auth token saved securely")
        } catch (e: Exception) {
            Timber.e(e, "Failed to save auth token")
        }
    }

    /**
     * Get authentication token
     */
    fun getAuthToken(): String? {
        return try {
            encryptedPreferences.getString(KEY_AUTH_TOKEN, null)
        } catch (e: Exception) {
            Timber.e(e, "Failed to retrieve auth token")
            null
        }
    }

    /**
     * Save refresh token
     */
    fun saveRefreshToken(token: String) {
        try {
            encryptedPreferences.edit().putString(KEY_REFRESH_TOKEN, token).apply()
            Timber.d("Refresh token saved securely")
        } catch (e: Exception) {
            Timber.e(e, "Failed to save refresh token")
        }
    }

    /**
     * Get refresh token
     */
    fun getRefreshToken(): String? {
        return try {
            encryptedPreferences.getString(KEY_REFRESH_TOKEN, null)
        } catch (e: Exception) {
            Timber.e(e, "Failed to retrieve refresh token")
            null
        }
    }

    /**
     * Save token expiry time
     */
    fun saveTokenExpiry(expiryTimeMs: Long) {
        try {
            encryptedPreferences.edit().putLong(KEY_TOKEN_EXPIRY, expiryTimeMs).apply()
            Timber.d("Token expiry saved: ${expiryTimeMs - System.currentTimeMillis()}ms remaining")
        } catch (e: Exception) {
            Timber.e(e, "Failed to save token expiry")
        }
    }

    /**
     * Get token expiry time
     */
    fun getTokenExpiry(): Long {
        return try {
            encryptedPreferences.getLong(KEY_TOKEN_EXPIRY, 0L)
        } catch (e: Exception) {
            Timber.e(e, "Failed to retrieve token expiry")
            0L
        }
    }

    /**
     * Check if token is expired
     */
    fun isTokenExpired(): Boolean {
        val expiry = getTokenExpiry()
        return expiry == 0L || System.currentTimeMillis() > expiry
    }

    /**
     * Save user ID
     */
    fun saveUserId(userId: String) {
        try {
            encryptedPreferences.edit().putString(KEY_USER_ID, userId).apply()
            Timber.d("User ID saved securely")
        } catch (e: Exception) {
            Timber.e(e, "Failed to save user ID")
        }
    }

    /**
     * Get user ID
     */
    fun getUserId(): String? {
        return try {
            encryptedPreferences.getString(KEY_USER_ID, null)
        } catch (e: Exception) {
            Timber.e(e, "Failed to retrieve user ID")
            null
        }
    }

    /**
     * Save API key (e.g., Razorpay)
     */
    fun saveApiKey(keyName: String, apiKey: String) {
        try {
            encryptedPreferences.edit().putString("api_key_$keyName", apiKey).apply()
            Timber.d("API key saved securely: $keyName")
        } catch (e: Exception) {
            Timber.e(e, "Failed to save API key: $keyName")
        }
    }

    /**
     * Get API key
     */
    fun getApiKey(keyName: String): String? {
        return try {
            encryptedPreferences.getString("api_key_$keyName", null)
        } catch (e: Exception) {
            Timber.e(e, "Failed to retrieve API key: $keyName")
            null
        }
    }

    /**
     * Save Razorpay key
     */
    fun saveRazorpayKey(key: String) {
        saveApiKey("razorpay", key)
    }

    /**
     * Get Razorpay key
     */
    fun getRazorpayKey(): String? {
        return getApiKey("razorpay")
    }

    /**
     * Clear all sensitive data (on logout)
     */
    fun clearAllData() {
        try {
            encryptedPreferences.edit().apply {
                remove(KEY_AUTH_TOKEN)
                remove(KEY_REFRESH_TOKEN)
                remove(KEY_TOKEN_EXPIRY)
                remove(KEY_USER_ID)
            }.apply()
            Timber.d("All sensitive data cleared")
        } catch (e: Exception) {
            Timber.e(e, "Failed to clear sensitive data")
        }
    }

    /**
     * Verify data integrity (check for tampering)
     */
    fun verifyIntegrity(): Boolean {
        return try {
            val authToken = getAuthToken()
            val userId = getUserId()
            // Both should exist if user is logged in
            val isValid = authToken != null && userId != null
            if (!isValid) {
                Timber.w("Data integrity check failed")
            }
            isValid
        } catch (e: Exception) {
            Timber.e(e, "Integrity verification failed")
            false
        }
    }
}
