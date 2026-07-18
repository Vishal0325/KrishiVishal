package com.company.krishivishaldelivery.data.repository

import android.util.Log
import com.company.krishivishaldelivery.data.local.DeliveryDao
import com.company.krishivishaldelivery.data.local.DeliveryOrderEntity
import com.company.krishivishaldelivery.data.model.DeliveryItem
import com.company.krishivishaldelivery.data.model.DeliveryOrder
import com.company.krishivishaldelivery.data.model.IncentiveSlab
import com.company.krishivishaldelivery.data.model.Rider
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.GeoPoint
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.tasks.await
import org.json.JSONArray
import org.json.JSONObject
import java.util.Date
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class DeliveryRepository @Inject constructor(
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
        firestore.collection("riders").document(riderId)
            .update(mapOf("currentLat" to lat, "currentLng" to lng, "lastLocationUpdate" to System.currentTimeMillis()))
            .await()
    }

    suspend fun updateRiderProfile(riderId: String, updates: Map<String, Any>) {
        firestore.collection("riders").document(riderId).update(updates).await()
    }

    fun getAssignedOrders(riderId: String): Flow<List<DeliveryOrder>> {
        return deliveryDao.getAllOrders().map { entities ->
            entities.map { it.toDomainModel() }
        }
    }

    suspend fun syncAssignedOrders(riderId: String) {
        try {
            val snapshot = firestore.collection("orders")
                .whereEqualTo("riderId", riderId)
                .whereIn("status", listOf("ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY"))
                .get().await()
            
            val orders = snapshot.toObjects(DeliveryOrder::class.java)
            val entities = orders.map { it.toEntity() }
            deliveryDao.clearOrders()
            deliveryDao.insertOrders(entities)
        } catch (e: Exception) {
            Log.e("DeliveryRepo", "Sync Error: ${e.message}")
        }
    }

    suspend fun updateOrderStatus(orderId: String, newStatus: String) {
        try {
            deliveryDao.updateOrderStatus(orderId, newStatus, true)
            
            firestore.collection("orders").document(orderId).update("status", newStatus).await()
            deliveryDao.updateOrderStatus(orderId, newStatus, false)

            val doc = firestore.collection("orders").document(orderId).get().await()
            val userId = doc.getString("userId") ?: ""
            if (userId.isNotEmpty()) {
                sendNotificationToUser(userId, "Order Update", "Order #$orderId is now $newStatus")
            }
        } catch (e: Exception) {
            Log.e("DeliveryRepo", "Update failed: ${e.message}")
        }
    }

    suspend fun syncPendingOrders() {
        val pending = deliveryDao.getPendingSyncOrders()
        pending.forEach { entity ->
            try {
                firestore.collection("orders").document(entity.id).update("status", entity.status).await()
                deliveryDao.updateSyncStatus(entity.id, false)
            } catch (e: Exception) {
                Log.e("SyncWorker", "Failed to sync ${entity.id}")
            }
        }
    }

    private suspend fun sendNotificationToUser(userId: String, title: String, message: String) {
        val notification = mapOf("title" to title, "message" to message, "timestamp" to System.currentTimeMillis(), "read" to false)
        firestore.collection("users").document(userId).collection("notifications").add(notification).await()
    }

    suspend fun pickupOrderByScan(orderId: String, riderId: String): DeliveryOrder? {
        val doc = firestore.collection("orders").document(orderId).get().await()
        if (!doc.exists()) return null
        val order = doc.toObject(DeliveryOrder::class.java) ?: return null
        
        firestore.collection("orders").document(orderId).update(mapOf("riderId" to riderId, "status" to "PICKED_UP")).await()
        val updatedOrder = order.copy(riderId = riderId, status = "PICKED_UP")
        deliveryDao.insertOrder(updatedOrder.toEntity())
        return updatedOrder
    }

    suspend fun rejectOrder(orderId: String, riderId: String, reason: String) {
        val rejectionData = mapOf("riderId" to riderId, "reason" to reason, "timestamp" to System.currentTimeMillis())
        firestore.runTransaction { transaction ->
            val docRef = firestore.collection("orders").document(orderId)
            transaction.update(docRef, "status", "CONFIRMED")
            transaction.update(docRef, "riderId", "")
            transaction.update(docRef, "rejectionHistory", com.google.firebase.firestore.FieldValue.arrayUnion(rejectionData))
        }.await()
        deliveryDao.deleteOrderById(orderId)
    }

    suspend fun uploadProofOfDelivery(orderId: String, photoBytes: ByteArray?, signatureBytes: ByteArray?): Boolean {
        return try {
            val storage = com.google.firebase.storage.FirebaseStorage.getInstance()
            if (photoBytes != null) storage.reference.child("deliveries/$orderId/photo.jpg").putBytes(photoBytes).await()
            if (signatureBytes != null) storage.reference.child("signatures/$orderId/sign.png").putBytes(signatureBytes).await()
            true
        } catch (e: Exception) { false }
    }

    // --- Mapper Extensions ---
    private fun DeliveryOrder.toEntity(): DeliveryOrderEntity {
        val itemsJson = JSONArray().apply {
            items.forEach { put(JSONObject().apply { put("productId", it.productId); put("productName", it.productName); put("quantity", it.quantity); put("price", it.price) }) }
        }.toString()
        return DeliveryOrderEntity(id = id, userId = userId, userName = userName, userPhone = userPhone, itemsJson = itemsJson, totalAmount = totalAmount, address = address, status = status, riderId = riderId, createdAtMillis = createdAt.time, customerOTP = customerOTP, isCOD = isCOD, codAmount = codAmount, collectedCash = collectedCash, isCashDeposited = isCashDeposited, targetLat = targetLat, targetLng = targetLng, isPendingSync = false)
    }

    private fun DeliveryOrderEntity.toDomainModel(): DeliveryOrder {
        val itemsList = mutableListOf<DeliveryItem>()
        if (itemsJson.isNotEmpty()) {
            val arr = JSONArray(itemsJson)
            for (i in 0 until arr.length()) {
                val obj = arr.getJSONObject(i)
                itemsList.add(DeliveryItem(productId = obj.optString("productId", ""), productName = obj.optString("productName", ""), quantity = obj.optInt("quantity", 0), price = obj.optDouble("price", 0.0)))
            }
        }
        return DeliveryOrder(id = id, userId = userId, userName = userName, userPhone = userPhone, items = itemsList, totalAmount = totalAmount, address = address, status = status, riderId = riderId, createdAt = Date(createdAtMillis), customerOTP = customerOTP, isCOD = isCOD, codAmount = codAmount, collectedCash = collectedCash, isCashDeposited = isCashDeposited, targetLat = targetLat, targetLng = targetLng)
    }
}
