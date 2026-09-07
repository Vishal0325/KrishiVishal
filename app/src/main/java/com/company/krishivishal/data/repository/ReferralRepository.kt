package com.company.krishivishal.data.repository

import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.utils.safeCall
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.tasks.await
import javax.inject.Inject
import javax.inject.Singleton
import com.company.krishivishal.di.IoDispatcher
import kotlinx.coroutines.CoroutineDispatcher

import com.company.krishivishal.core.model.Referral
import com.google.firebase.functions.FirebaseFunctions
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.launch

interface ReferralRepository {
    fun getWalletBalance(userId: String): Flow<Resource<Double>>
    fun applyReferralCode(code: String): Flow<Resource<Unit>>
    fun getReferrals(userId: String): Flow<Resource<List<Referral>>>
    fun getUserReferralCode(userId: String): Flow<Resource<String>>
}

@Singleton
class ReferralRepositoryImpl @Inject constructor(
    private val firestore: FirebaseFirestore,
    private val functions: FirebaseFunctions,
    @IoDispatcher private val ioDispatcher: CoroutineDispatcher
) : ReferralRepository {

    override fun getWalletBalance(userId: String): Flow<Resource<Double>> = safeCall(ioDispatcher) {
        val doc = firestore.collection("users").document(userId).get().await()
        doc.getDouble("walletBalance") ?: 0.0
    }

    override fun applyReferralCode(code: String): Flow<Resource<Unit>> = safeCall(ioDispatcher) {
        val data = mapOf("referralCodeEntered" to code)
        functions.getHttpsCallable("applyReferralCode").call(data).await()
    }

    override fun getReferrals(userId: String): Flow<Resource<List<Referral>>> = callbackFlow {
        val listener = firestore.collection("referrals")
            .whereEqualTo("referrerUid", userId)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    trySend(Resource.Error(error.message ?: "Unknown error"))
                    return@addSnapshotListener
                }
                
                if (snapshot != null) {
                    val referrals = snapshot.documents.mapNotNull { doc ->
                        doc.toObject(Referral::class.java)?.copy(id = doc.id)
                    }.sortedByDescending { it.createdAt }
                    trySend(Resource.Success(referrals))
                }
            }
        
        awaitClose { listener.remove() }
    }

    override fun getUserReferralCode(userId: String): Flow<Resource<String>> = callbackFlow {
        val userDocRef = firestore.collection("users").document(userId)
        var hasAttemptedGeneration = false

        val listener = userDocRef.addSnapshotListener { snapshot, error ->
            if (error != null) {
                trySend(Resource.Error(error.message ?: "Failed to load referral code"))
                return@addSnapshotListener
            }

            val existingCode = snapshot?.getString("referralCode")
            if (!existingCode.isNullOrBlank()) {
                trySend(Resource.Success(existingCode))
                return@addSnapshotListener
            }

            if (!hasAttemptedGeneration && snapshot != null && snapshot.exists()) {
                hasAttemptedGeneration = true

                // Deterministic fallback code based on user UID - ALWAYS CONSTANT for this user!
                val name = snapshot.getString("name") ?: snapshot.getString("displayName") ?: "USER"
                val prefix = name.split(" ")
                    .firstOrNull()
                    ?.uppercase()
                    ?.replace(Regex("[^A-Z]"), "")
                    ?.take(6)
                    ?.ifBlank { "USER" } ?: "USER"
                val numericSuffix = ((userId.hashCode().toLong() and 0x7FFFFFFFL) % 900 + 100).toString()
                val deterministicCode = "KV-$prefix$numericSuffix"

                // Emit stable code immediately to UI
                trySend(Resource.Success(deterministicCode))

                // Attempt to persist in background once
                kotlinx.coroutines.CoroutineScope(ioDispatcher).launch {
                    try {
                        val res = functions.getHttpsCallable("getOrCreateReferralCode").call().await()
                        @Suppress("UNCHECKED_CAST")
                        val data = res.data as? Map<String, Any>
                        val serverCode = data?.get("referralCode") as? String
                        if (!serverCode.isNullOrBlank()) {
                            trySend(Resource.Success(serverCode))
                            return@launch
                        }
                    } catch (_: Exception) {
                        try {
                            userDocRef.update("referralCode", deterministicCode).await()
                        } catch (_: Exception) {
                            // Ignored: code is already emitted and stable
                        }
                    }
                }
            }
        }

        awaitClose { listener.remove() }
    }
}
