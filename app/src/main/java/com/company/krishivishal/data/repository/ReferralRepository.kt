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

interface ReferralRepository {
    fun getWalletBalance(userId: String): Flow<Resource<Double>>
    fun processReferral(newUserId: String, referralCode: String): Flow<Resource<Unit>>
    fun applyReward(userId: String, amount: Double, reason: String): Flow<Resource<Unit>>
}

@Singleton
class ReferralRepositoryImpl @Inject constructor(
    private val firestore: FirebaseFirestore,
    @IoDispatcher private val ioDispatcher: CoroutineDispatcher
) : ReferralRepository {

    override fun getWalletBalance(userId: String): Flow<Resource<Double>> = safeCall(ioDispatcher) {
        val doc = firestore.collection("users").document(userId).get().await()
        doc.getDouble("walletBalance") ?: 0.0
    }

    override fun processReferral(newUserId: String, referralCode: String): Flow<Resource<Unit>> = safeCall(ioDispatcher) {
        // 1. Find user with this referral code
        val query = firestore.collection("users").whereEqualTo("referralCode", referralCode).limit(1).get().await()
        val referrer = query.documents.firstOrNull() ?: throw Exception("Invalid referral code")
        val referrerId = referrer.id

        // 2. Update new user's referredBy
        firestore.collection("users").document(newUserId).update("referredBy", referrerId).await()

        // 3. Reward Referrer (₹50 for signup)
        val currentBalance = referrer.getDouble("walletBalance") ?: 0.0
        firestore.collection("users").document(referrerId).update("walletBalance", currentBalance + 50.0).await()

        // 4. Reward New User (₹50 for using code)
        firestore.collection("users").document(newUserId).update("walletBalance", 50.0).await()
    }

    override fun applyReward(userId: String, amount: Double, reason: String): Flow<Resource<Unit>> = safeCall(ioDispatcher) {
        firestore.runTransaction { transaction ->
            val ref = firestore.collection("users").document(userId)
            val current = transaction.get(ref).getDouble("walletBalance") ?: 0.0
            transaction.update(ref, "walletBalance", current + amount)
            
            // Log reward
            val logRef = firestore.collection("wallet_history").document()
            transaction.set(logRef, mapOf(
                "userId" to userId,
                "amount" to amount,
                "reason" to reason,
                "timestamp" to com.google.firebase.Timestamp.now()
            ))
        }.await()
    }
}
