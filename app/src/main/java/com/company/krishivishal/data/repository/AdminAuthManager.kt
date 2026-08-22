package com.company.krishivishal.data.repository

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
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
            val tokenResult = user.getIdTokenResult(false).await()
            val role = tokenResult.claims["role"] as? String
            role in listOf("SuperAdmin", "CatalogManager", "OrderManager", "Viewer")
        } catch (e: Exception) {
            false
        }
    }
}
