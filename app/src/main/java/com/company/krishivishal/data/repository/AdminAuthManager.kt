package com.company.krishivishal.data.repository

import com.google.firebase.auth.FirebaseAuth
import kotlinx.coroutines.tasks.await
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AdminAuthManager @Inject constructor(
    private val auth: FirebaseAuth
) {
    suspend fun isCurrentUserAdmin(): Boolean {
        val user = auth.currentUser ?: return false
        return try {
            val tokenResult = user.getIdToken(false).await()
            val claims = tokenResult.claims
            val role = claims["role"] as? String
            val isAdminClaim = claims["isAdmin"] as? Boolean ?: false
            val adminClaim = claims["admin"] as? Boolean ?: false
            val isSuperAdminClaim = claims["isSuperAdmin"] as? Boolean ?: false

            isAdminClaim || adminClaim || isSuperAdminClaim || role in listOf(
                "SuperAdmin", "SUPER_ADMIN", "Admin", "ADMIN", "FinanceAdmin",
                "CatalogManager", "OrderManager", "Viewer"
            )
        } catch (e: Exception) {
            false
        }
    }
}
