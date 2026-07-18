package com.company.krishivishal.security

import com.company.krishivishal.crashlytics.CrashlyticsErrorReporter
import com.google.firebase.auth.FirebaseAuth
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Manages authentication tokens and automatic refresh
 * Handles token expiry and renewal automatically
 */
@Singleton
class TokenManager @Inject constructor(
    private val secureStorage: SecureStorage,
    private val firebaseAuth: FirebaseAuth,
    private val errorReporter: CrashlyticsErrorReporter
) {

    companion object {
        // Token refresh threshold: refresh 5 minutes before expiry
        private const val REFRESH_THRESHOLD_MS = 5 * 60 * 1000L
    }

    /**
     * Get current auth token, refresh if expired
     */
    suspend fun getValidToken(): String? {
        return try {
            val currentToken = secureStorage.getAuthToken()
            
            // Check if token needs refresh
            if (shouldRefreshToken()) {
                Timber.d("Token expired or expiring soon, refreshing...")
                refreshToken()
            } else {
                currentToken
            }
        } catch (e: Exception) {
            errorReporter.reportAuthError(e)
            Timber.e(e, "Failed to get valid token")
            null
        }
    }

    /**
     * Check if token should be refreshed
     */
    private fun shouldRefreshToken(): Boolean {
        val expiry = secureStorage.getTokenExpiry()
        val timeUntilExpiry = expiry - System.currentTimeMillis()
        return timeUntilExpiry < REFRESH_THRESHOLD_MS
    }

    /**
     * Refresh authentication token
     */
    private suspend fun refreshToken(): String? {
        return try {
            val refreshToken = secureStorage.getRefreshToken()
            if (refreshToken.isNullOrEmpty()) {
                Timber.w("No refresh token available")
                return null
            }

            // Firebase automatically handles token refresh
            val user = firebaseAuth.currentUser
            user?.getIdToken(false)?.addOnSuccessListener { result ->
                val newToken = result.token
                val expiryTime = System.currentTimeMillis() + (60 * 60 * 1000L) // 1 hour
                
                if (newToken != null) {
                    secureStorage.saveAuthToken(newToken)
                    secureStorage.saveTokenExpiry(expiryTime)
                    Timber.d("Token refreshed successfully")
                }
            }?.addOnFailureListener { e ->
                errorReporter.reportAuthError(e)
                Timber.e(e, "Token refresh failed")
            }

            secureStorage.getAuthToken()
        } catch (e: Exception) {
            errorReporter.reportAuthError(e)
            Timber.e(e, "Error refreshing token")
            null
        }
    }

    /**
     * Save token from login
     */
    fun saveToken(authToken: String, refreshToken: String, expiryMs: Long) {
        try {
            secureStorage.saveAuthToken(authToken)
            secureStorage.saveRefreshToken(refreshToken)
            secureStorage.saveTokenExpiry(expiryMs)
            Timber.d("Tokens saved securely")
        } catch (e: Exception) {
            errorReporter.reportAuthError(e)
            Timber.e(e, "Failed to save tokens")
        }
    }

    /**
     * Clear tokens on logout
     */
    fun clearTokens() {
        try {
            secureStorage.clearAllData()
            Timber.d("Tokens cleared on logout")
        } catch (e: Exception) {
            errorReporter.reportAuthError(e)
            Timber.e(e, "Failed to clear tokens")
        }
    }

    /**
     * Get token expiry time remaining in seconds
     */
    fun getTimeToExpiry(): Long {
        val expiry = secureStorage.getTokenExpiry()
        val remaining = expiry - System.currentTimeMillis()
        return if (remaining > 0) remaining / 1000 else 0
    }

    /**
     * Check if user is still authenticated
     */
    fun isAuthenticated(): Boolean {
        val token = secureStorage.getAuthToken()
        val userId = secureStorage.getUserId()
        return !token.isNullOrEmpty() && !userId.isNullOrEmpty() && !secureStorage.isTokenExpired()
    }
}
