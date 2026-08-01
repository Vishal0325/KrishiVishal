package com.company.krishivishal.data.repository

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.tasks.await
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AdminAuthManager @Inject constructor(
    private val firestore: FirebaseFirestore,
    private val auth: FirebaseAuth
) {
    suspend fun isCurrentUserAdmin(): Boolean {
        val uid = auth.currentUser?.uid ?: return false
        return try {
            val doc = firestore
                .collection("users")
                .document(uid)
                .get()
                .await()
            val role = doc.getString("role")
            role == "ADMIN" || doc.getBoolean("isAdmin") == true
        } catch (e: Exception) {
            false
        }
    }
}
