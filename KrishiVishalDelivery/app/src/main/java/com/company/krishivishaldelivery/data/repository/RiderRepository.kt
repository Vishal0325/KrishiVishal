package com.company.krishivishaldelivery.data.repository

import com.company.krishivishal.core.util.Resource
import com.company.krishivishaldelivery.data.local.DeliveryDao
import com.company.krishivishaldelivery.data.local.GPSLogEntity
import com.company.krishivishaldelivery.data.model.IncentiveSlab
import com.company.krishivishaldelivery.data.model.Rider
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.GeoPoint
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.tasks.await
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class RiderRepository @Inject constructor(
    private val firestore: FirebaseFirestore,
    private val deliveryDao: DeliveryDao
) {
    fun getRiderProfile(riderId: String): Flow<Rider?> = callbackFlow {
        val listener = firestore.collection("riders").document(riderId)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    close(error)
                    return@addSnapshotListener
                }
                trySend(snapshot?.toObject(Rider::class.java))
            }
        awaitClose { listener.remove() }
    }

    suspend fun getIncentiveSlabs(): List<IncentiveSlab> {
        return try {
            val snapshot = firestore.collection("app_config").document("incentive_slabs").get().await()
            val list = snapshot.get("slabs") as? List<Map<String, Any>>
            list?.map {
                IncentiveSlab(
                    ordersRequired = (it["ordersRequired"] as? Long)?.toInt() ?: 0,
                    bonusAmount = (it["bonusAmount"] as? Number)?.toDouble() ?: 0.0
                )
            } ?: emptyList()
        } catch (e: Exception) {
            emptyList()
        }
    }

    suspend fun triggerSOS(riderId: String, lat: Double, lng: Double, riderName: String, orderId: String?) {
        val alert = mapOf(
            "riderId" to riderId,
            "riderName" to riderName,
            "location" to GeoPoint(lat, lng),
            "timestamp" to System.currentTimeMillis(),
            "activeOrderId" to (orderId ?: ""),
            "status" to "ACTIVE"
        )
        firestore.collection("emergency_alerts").add(alert).await()
    }

    suspend fun updateRiderStatus(riderId: String, isOnline: Boolean) {
        val updates = mutableMapOf<String, Any>("online" to isOnline)
        if (isOnline) {
            updates["shiftStartTime"] = System.currentTimeMillis()
        } else {
            updates["shiftEndTime"] = System.currentTimeMillis()
        }
        firestore.collection("riders").document(riderId).update(updates).await()
    }

    suspend fun updateRiderLocation(riderId: String, lat: Double, lng: Double) {
        try {
            firestore.collection("riders").document(riderId)
                .update(mapOf("currentLat" to lat, "currentLng" to lng, "lastLocationUpdate" to System.currentTimeMillis()))
                .await()
        } catch (e: Exception) {
            Timber.w(e, "updateRiderLocation: Firestore failed, saving to local GPS log (riderId: $riderId)")
            deliveryDao.insertGPSLog(GPSLogEntity(
                riderId = riderId,
                orderId = null,
                lat = lat,
                lng = lng,
                timestamp = System.currentTimeMillis()
            ))
        }
    }

    suspend fun updateRiderProfile(riderId: String, updates: Map<String, Any>) {
        firestore.collection("riders").document(riderId).update(updates).await()
    }

    suspend fun deleteRiderAccount(riderId: String) {
        firestore.collection("riders").document(riderId).delete().await()
    }

    fun getRiderPayouts(riderId: String): Flow<Resource<List<Map<String, Any>>>> = callbackFlow {
        val listener = firestore.collection("payout_logs")
            .whereEqualTo("riderId", riderId)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    trySend(Resource.Error(error.message ?: "Failed to fetch payouts"))
                    return@addSnapshotListener
                }
                val logs = snapshot?.documents?.map { it.data ?: emptyMap() } ?: emptyList()
                trySend(Resource.Success(logs))
            }
        awaitClose { listener.remove() }
    }
}
