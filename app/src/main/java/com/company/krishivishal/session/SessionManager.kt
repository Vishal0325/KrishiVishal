package com.company.krishivishal.session

import com.company.krishivishal.crashlytics.CrashlyticsErrorReporter
import com.company.krishivishal.security.SecureStorage
import com.company.krishivishal.security.TokenManager
import timber.log.Timber
import java.util.Timer
import java.util.TimerTask
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Session manager for handling user sessions
 * Manages login/logout, token expiry, and session timeout
 */
@Singleton
class SessionManager @Inject constructor(
    private val secureStorage: SecureStorage,
    private val tokenManager: TokenManager,
    private val errorReporter: CrashlyticsErrorReporter
) {

    companion object {
        // Session timeout after 30 minutes of inactivity
        private const val SESSION_TIMEOUT_MS = 30 * 60 * 1000L
        // Check token expiry every 5 minutes
        private const val TOKEN_CHECK_INTERVAL_MS = 5 * 60 * 1000L
    }

    private var sessionTimer: Timer? = null
    private var tokenCheckTimer: Timer? = null
    private var lastActivityTime = System.currentTimeMillis()
    
    private var sessionTimeoutListener: ((reason: SessionTimeoutReason) -> Unit)? = null

    enum class SessionTimeoutReason {
        INACTIVITY,
        TOKEN_EXPIRED,
        LOGOUT,
        SECURITY_CONCERN
    }

    /**
     * Start user session
     */
    fun startSession(userId: String) {
        try {
            secureStorage.saveUserId(userId)
            lastActivityTime = System.currentTimeMillis()
            
            // Start session timeout monitoring
            startSessionTimeoutMonitor()
            // Start token expiry monitoring
            startTokenExpiryMonitor()
            
            Timber.d("Session started for user: $userId")
        } catch (e: Exception) {
            errorReporter.reportAuthError(e)
            Timber.e(e, "Failed to start session")
        }
    }

    /**
     * End session
     */
    fun endSession() {
        try {
            stopSessionTimeoutMonitor()
            stopTokenExpiryMonitor()
            tokenManager.clearTokens()
            secureStorage.clearAllData()
            
            Timber.d("Session ended")
        } catch (e: Exception) {
            errorReporter.reportAuthError(e)
            Timber.e(e, "Failed to end session")
        }
    }

    /**
     * Mark activity to reset inactivity timer
     */
    fun recordActivity() {
        lastActivityTime = System.currentTimeMillis()
    }

    /**
     * Check if session is active
     */
    fun isSessionActive(): Boolean {
        return tokenManager.isAuthenticated()
    }

    /**
     * Get current session user ID
     */
    fun getCurrentUserId(): String? {
        return secureStorage.getUserId()
    }

    /**
     * Get time until session timeout
     */
    fun getTimeUntilTimeout(): Long {
        val elapsedTime = System.currentTimeMillis() - lastActivityTime
        val timeRemaining = SESSION_TIMEOUT_MS - elapsedTime
        return if (timeRemaining > 0) timeRemaining else 0
    }

    /**
     * Set session timeout listener
     */
    fun setSessionTimeoutListener(listener: (SessionTimeoutReason) -> Unit) {
        this.sessionTimeoutListener = listener
    }

    /**
     * Start monitoring session timeout
     */
    private fun startSessionTimeoutMonitor() {
        stopSessionTimeoutMonitor()
        
        sessionTimer = Timer().apply {
            scheduleAtFixedRate(
                object : TimerTask() {
                    override fun run() {
                        checkSessionTimeout()
                    }
                },
                SESSION_TIMEOUT_MS,
                SESSION_TIMEOUT_MS
            )
        }
        
        Timber.d("Session timeout monitor started")
    }

    /**
     * Check if session has timed out due to inactivity
     */
    private fun checkSessionTimeout() {
        val elapsedTime = System.currentTimeMillis() - lastActivityTime
        
        if (elapsedTime > SESSION_TIMEOUT_MS) {
            Timber.w("Session timeout due to inactivity")
            endSession()
            sessionTimeoutListener?.invoke(SessionTimeoutReason.INACTIVITY)
        }
    }

    /**
     * Stop session timeout monitor
     */
    private fun stopSessionTimeoutMonitor() {
        sessionTimer?.cancel()
        sessionTimer = null
    }

    /**
     * Start monitoring token expiry
     */
    private fun startTokenExpiryMonitor() {
        stopTokenExpiryMonitor()
        
        tokenCheckTimer = Timer().apply {
            scheduleAtFixedRate(
                object : TimerTask() {
                    override fun run() {
                        checkTokenExpiry()
                    }
                },
                TOKEN_CHECK_INTERVAL_MS,
                TOKEN_CHECK_INTERVAL_MS
            )
        }
        
        Timber.d("Token expiry monitor started")
    }

    /**
     * Check if token has expired
     */
    private fun checkTokenExpiry() {
        if (secureStorage.isTokenExpired()) {
            Timber.w("Token expired")
            endSession()
            sessionTimeoutListener?.invoke(SessionTimeoutReason.TOKEN_EXPIRED)
        } else {
            val timeToExpiry = tokenManager.getTimeToExpiry()
            Timber.d("Token expires in: ${timeToExpiry}s")
        }
    }

    /**
     * Stop token expiry monitor
     */
    private fun stopTokenExpiryMonitor() {
        tokenCheckTimer?.cancel()
        tokenCheckTimer = null
    }

    /**
     * Force logout due to security concern
     */
    fun forceLogout(reason: String = "Security concern") {
        try {
            Timber.w("Forced logout: $reason")
            endSession()
            sessionTimeoutListener?.invoke(SessionTimeoutReason.SECURITY_CONCERN)
            errorReporter.reportAuthError(Exception(reason))
        } catch (e: Exception) {
            Timber.e(e, "Failed to force logout")
        }
    }

    /**
     * Get session info for debugging
     */
    fun getSessionInfo(): SessionInfo {
        return SessionInfo(
            userId = getCurrentUserId(),
            isActive = isSessionActive(),
            timeUntilTimeout = getTimeUntilTimeout(),
            tokenTimeToExpiry = tokenManager.getTimeToExpiry(),
            lastActivityTime = lastActivityTime
        )
    }

    data class SessionInfo(
        val userId: String?,
        val isActive: Boolean,
        val timeUntilTimeout: Long,
        val tokenTimeToExpiry: Long,
        val lastActivityTime: Long
    )
}
