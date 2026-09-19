package com.company.krishivishaldelivery.data.repository

import com.company.krishivishaldelivery.data.model.ServiceBooking
import com.company.krishivishaldelivery.data.model.PartnerWallet
import com.company.krishivishaldelivery.data.model.PartnerWalletTransaction
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.functions.FirebaseFunctions
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await
import timber.log.Timber
import javax.inject.Inject

class ServiceBookingRepositoryImpl @Inject constructor(
    private val firestore: FirebaseFirestore
) : ServiceBookingRepository {

    private val functions: FirebaseFunctions by lazy {
        FirebaseFunctions.getInstance("asia-south1")
    }

    override fun getActiveBooking(partnerId: String): Flow<ServiceBooking?> = callbackFlow {
        if (partnerId.isBlank()) {
            trySend(null)
            return@callbackFlow
        }

        val listener = firestore.collection("service_bookings")
            .whereEqualTo("assignedPartnerId", partnerId)
            .whereIn("status", listOf("ASSIGNED", "ON_THE_WAY", "IN_PROGRESS"))
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    Timber.e(error, "Error listening to active service booking")
                    trySend(null)
                    return@addSnapshotListener
                }

                if (snapshot != null && !snapshot.isEmpty) {
                    val doc = snapshot.documents.firstOrNull()
                    val booking = doc?.toObject(ServiceBooking::class.java)?.copy(id = doc.id)
                    trySend(booking)
                } else {
                    trySend(null)
                }
            }

        awaitClose { listener.remove() }
    }

    override suspend fun acceptBooking(bookingId: String): Boolean {
        return try {
            val data = hashMapOf("bookingId" to bookingId)
            functions.getHttpsCallable("acceptBooking")
                .call(data)
                .await()
            true
        } catch (e: Exception) {
            Timber.e(e, "Error accepting booking via Cloud Function")
            false
        }
    }

    override suspend fun rejectBooking(bookingId: String, reason: String?): Boolean {
        return try {
            val data = hashMapOf(
                "bookingId" to bookingId,
                "reason" to (reason ?: "Partner declined")
            )
            functions.getHttpsCallable("rejectBooking")
                .call(data)
                .await()
            true
        } catch (e: Exception) {
            Timber.e(e, "Error rejecting booking via Cloud Function")
            false
        }
    }

    override suspend fun verifyStartOtp(bookingId: String, otp: String): Boolean {
        return try {
            val data = hashMapOf(
                "bookingId" to bookingId,
                "otp" to otp
            )
            functions.getHttpsCallable("verifyStartOtp")
                .call(data)
                .await()
            true
        } catch (e: Exception) {
            Timber.e(e, "Error verifying start OTP via Cloud Function")
            false
        }
    }

    override suspend fun updateActualArea(bookingId: String, area: Double): Boolean {
        return try {
            // Note: Actual area is submitted during verifyEndOtp or pre-completion
            true
        } catch (e: Exception) {
            Timber.e(e, "Error updating actual area")
            false
        }
    }

    override suspend fun verifyEndOtp(bookingId: String, otp: String): Boolean {
        return try {
            val data = hashMapOf(
                "bookingId" to bookingId,
                "otp" to otp
            )
            functions.getHttpsCallable("verifyEndOtp")
                .call(data)
                .await()
            true
        } catch (e: Exception) {
            Timber.e(e, "Error verifying end OTP via Cloud Function")
            false
        }
    }

    override fun getPartnerWallet(partnerId: String): Flow<PartnerWallet?> = callbackFlow {
        if (partnerId.isBlank()) {
            trySend(null)
            return@callbackFlow
        }

        val listener = firestore.collection("partner_wallets")
            .document(partnerId)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    Timber.e(error, "Error listening to partner wallet")
                    trySend(null)
                    return@addSnapshotListener
                }

                if (snapshot != null && snapshot.exists()) {
                    val wallet = snapshot.toObject(PartnerWallet::class.java)?.copy(partnerId = snapshot.id)
                    trySend(wallet)
                } else {
                    trySend(null)
                }
            }

        awaitClose { listener.remove() }
    }

    override fun getWalletTransactions(partnerId: String): Flow<List<PartnerWalletTransaction>> = callbackFlow {
        if (partnerId.isBlank()) {
            trySend(emptyList())
            return@callbackFlow
        }

        val listener = firestore.collection("partner_wallet_transactions")
            .whereEqualTo("partnerId", partnerId)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    Timber.e(error, "Error listening to wallet transactions")
                    trySend(emptyList())
                    return@addSnapshotListener
                }

                if (snapshot != null && !snapshot.isEmpty) {
                    val txns = snapshot.documents.mapNotNull { doc ->
                        doc.toObject(PartnerWalletTransaction::class.java)?.copy(id = doc.id)
                    }
                    trySend(txns)
                } else {
                    trySend(emptyList())
                }
            }

        awaitClose { listener.remove() }
    }

    override suspend fun rechargeWallet(partnerId: String, amount: Double): Boolean {
        return try {
            val data = hashMapOf(
                "amount" to amount
            )
            functions.getHttpsCallable("rechargePartnerWallet")
                .call(data)
                .await()
            true
        } catch (e: Exception) {
            Timber.e(e, "Error recharging partner wallet via Cloud Function")
            false
        }
    }

    override suspend fun updatePartnerSkills(
        partnerId: String,
        skills: List<String>,
        equipment: List<String>
    ): Boolean {
        return try {
            val updateData = mapOf(
                "serviceSkills" to skills,
                "serviceEquipment" to equipment,
                "equipment" to equipment,
                "updatedAt" to System.currentTimeMillis()
            )
            val batch = firestore.batch()
            val riderRef = firestore.collection("riders").document(partnerId)
            val userRef = firestore.collection("users").document(partnerId)
            batch.set(riderRef, updateData, com.google.firebase.firestore.SetOptions.merge())
            batch.set(userRef, updateData, com.google.firebase.firestore.SetOptions.merge())
            batch.commit().await()
            true
        } catch (e: Exception) {
            Timber.e(e, "Error updating partner skills")
            false
        }
    }
}

