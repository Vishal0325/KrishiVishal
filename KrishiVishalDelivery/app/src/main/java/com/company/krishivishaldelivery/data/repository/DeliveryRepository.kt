package com.company.krishivishaldelivery.data.repository

import android.util.Log
import android.net.Uri
import com.company.krishivishal.core.util.Resource
import com.company.krishivishaldelivery.data.local.DeliveryDao
import com.company.krishivishaldelivery.data.local.DeliveryOrderEntity
import com.company.krishivishaldelivery.data.local.GPSLogEntity
import com.company.krishivishal.core.model.OrderItem
import com.company.krishivishal.core.model.Order
import com.company.krishivishal.core.model.ReturnRequest
import com.company.krishivishal.core.model.ReturnStatus
import com.company.krishivishaldelivery.data.model.IncentiveSlab
import com.company.krishivishaldelivery.data.model.Rider
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.GeoPoint
import com.google.firebase.firestore.FieldValue
import com.google.firebase.functions.FirebaseFunctions
import com.google.firebase.storage.FirebaseStorage
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
    private val functions: FirebaseFunctions,
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
            // 1. Try updating firestore directly for live tracking
            firestore.collection("riders").document(riderId)
                .update(mapOf("currentLat" to lat, "currentLng" to lng, "lastLocationUpdate" to System.currentTimeMillis()))
                .await()
        } catch (e: Exception) {
            // 2. Queue locally if firestore fails (offline)
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

    fun getAssignedOrders(riderId: String): Flow<List<Order>> {
        return deliveryDao.getAllOrders().map { entities ->
            entities.map { it.toDomainModel() }
        }
    }

    suspend fun syncAssignedOrders(riderId: String) {
        try {
            // SYNC V4: Fetch all orders for this rider that are:
            // 1. In Progress (ASSIGNED, PICKED_UP, OUT_FOR_DELIVERY)
            // 2. Delivered TODAY (to restore Earnings/Incentives progress)
            val todayStart = java.util.Calendar.getInstance().apply {
                set(java.util.Calendar.HOUR_OF_DAY, 0)
                set(java.util.Calendar.MINUTE, 0)
                set(java.util.Calendar.SECOND, 0)
            }.time

            val snapshot = firestore.collection("orders")
                .whereEqualTo("riderId", riderId)
                .whereGreaterThanOrEqualTo("updatedAt", todayStart)
                .get().await()
            
            val orders = snapshot.toObjects(Order::class.java)
            
            // Filter relevant orders: Active ones OR those delivered today
            val activeStatuses = listOf("ASSIGNED", "PICKED_UP", "OUT_FOR_DELIVERY", "DELIVERED")
            val filteredOrders = orders.filter { it.status in activeStatuses }
            
            val entities = filteredOrders.map { it.toEntity() }
            deliveryDao.clearOrders()
            deliveryDao.insertOrders(entities)
            Log.d("DeliveryRepo", "Synced ${entities.size} orders from cloud for rider $riderId")
        } catch (e: Exception) {
            Log.e("DeliveryRepo", "Sync Error: ${e.message}")
        }
    }

    suspend fun updateOrderStatus(orderId: String, newStatus: String) {
        if (newStatus == "DELIVERED") {
            Log.w("DeliveryRepo", "DELIVERED status must be updated via verifyOrderDelivery with OTP")
            return
        }
        try {
            // Optimistic update local
            deliveryDao.updateOrderStatus(orderId, newStatus, true)
            
            // Server conflict resolution: Check if order status is already more advanced
            val doc = firestore.collection("orders").document(orderId).get().await()
            val serverStatus = doc.getString("status") ?: ""
            
            if (isStatusAdvanced(serverStatus, newStatus)) {
                Log.w("DeliveryRepo", "Conflict detected: Server status '$serverStatus' is newer than '$newStatus'")
                deliveryDao.updateOrderStatus(orderId, serverStatus, false)
                return
            }

            firestore.collection("orders").document(orderId).update(
                "status", newStatus,
                "updatedAt", FieldValue.serverTimestamp()
            ).await()
            
            deliveryDao.updateSyncStatus(orderId, false)

            val userId = doc.getString("userId") ?: ""
            if (userId.isNotEmpty()) {
                sendNotificationToUser(userId, "Order Update", "Order #$orderId is now $newStatus")
            }
        } catch (e: Exception) {
            Log.e("DeliveryRepo", "Update failed: ${e.message}, status queued for sync")
        }
    }

    suspend fun verifyOrderDelivery(orderId: String, otp: String): Resource<Unit> {
        return try {
            val data = hashMapOf(
                "orderId" to orderId,
                "otp" to otp
            )

            functions.getHttpsCallable("verifyDeliveryOTP")
                .call(data)
                .await()

            // Update local DB after successful cloud verification
            deliveryDao.updateOrderStatus(orderId, "DELIVERED", false)
            Resource.Success(Unit)
        } catch (e: Exception) {
            Log.e("DeliveryRepo", "OTP Verification failed: ${e.message}")
            Resource.Error(e.localizedMessage ?: "OTP Verification failed")
        }
    }

    private fun isStatusAdvanced(current: String, incoming: String): Boolean {
        val priority = mapOf(
            "PLACED" to 0, 
            "CONFIRMED" to 1, 
            "ASSIGNED" to 2, 
            "PICKED_UP" to 3, 
            "OUT_FOR_DELIVERY" to 4, 
            "DELIVERED" to 5, 
            "RETURNED" to 6, 
            "CANCELLED" to 7,
            "REFUNDED" to 8
        )
        return (priority[current] ?: -1) > (priority[incoming] ?: -1)
    }

    suspend fun syncPendingOrders() {
        // 1. Sync Order Statuses
        val pending = deliveryDao.getPendingSyncOrders()
        pending.forEach { entity ->
            try {
                // IDEMPOTENCY: Check server status first to prevent overwriting more advanced states
                val doc = firestore.collection("orders").document(entity.id).get().await()
                if (doc.exists()) {
                    val serverStatus = doc.getString("status") ?: ""
                    
                    if (!isStatusAdvanced(serverStatus, entity.status)) {
                        firestore.collection("orders").document(entity.id).update(
                            "status", entity.status,
                            "updatedAt", FieldValue.serverTimestamp(),
                            "syncId", "sync_${System.currentTimeMillis()}" // Idempotency tag
                        ).await()
                    }
                }
                
                // POD Verification & Upload
                if (entity.status == "DELIVERED") {
                    entity.localPodPhotoPath?.let { path ->
                        val file = java.io.File(path)
                        if (file.exists()) {
                            val storageRef = FirebaseStorage.getInstance().reference.child("pod/${entity.id}_photo.jpg")
                            storageRef.putFile(Uri.fromFile(file)).await()
                            // Update order with remote URL
                            val downloadUrl = storageRef.downloadUrl.await().toString()
                            firestore.collection("orders").document(entity.id).update("podPhotoUrl", downloadUrl).await()
                        }
                    }
                }

                deliveryDao.updateSyncStatus(entity.id, false)
            } catch (e: Exception) {
                Log.e("SyncWorker", "Failed to sync status for ${entity.id}: ${e.message}")
            }
        }

        // 2. Sync GPS Logs with Batching (Cap at 100 per pass)
        val unsyncedLogs = deliveryDao.getUnsyncedGPSLogs()
        if (unsyncedLogs.isNotEmpty()) {
            val batchSize = 100
            val chunks = unsyncedLogs.chunked(batchSize)
            
            chunks.forEach { chunk ->
                try {
                    val batch = firestore.batch()
                    chunk.forEach { log ->
                        val ref = firestore.collection("rider_location_history").document()
                        batch.set(ref, mapOf(
                            "riderId" to log.riderId,
                            "location" to GeoPoint(log.lat, log.lng),
                            "timestamp" to log.timestamp,
                            "orderId" to (log.orderId ?: ""),
                            "syncSource" to "WorkerV2"
                        ))
                    }
                    batch.commit().await()
                    deliveryDao.markGPSLogsSynced(chunk.map { it.id })
                } catch (e: Exception) {
                    Log.e("SyncWorker", "Failed to sync GPS log batch: ${e.message}")
                }
            }
        }
    }

    private suspend fun sendNotificationToUser(userId: String, title: String, message: String) {
        val notification = mapOf("title" to title, "message" to message, "timestamp" to System.currentTimeMillis(), "read" to false)
        firestore.collection("users").document(userId).collection("notifications").add(notification).await()
    }

    suspend fun fetchOrderForPreview(orderId: String): Order? {
        val doc = firestore.collection("orders").document(orderId).get().await()
        if (!doc.exists()) return null
        return doc.toObject(Order::class.java)
    }

    suspend fun acceptOrderByScan(orderId: String, riderId: String): Order {
        val doc = firestore.collection("orders").document(orderId).get().await()
        if (!doc.exists()) throw Exception("Order not found")
        val order = doc.toObject(Order::class.java) ?: throw Exception("Invalid order data")
        
        if (order.status != "PLACED" && order.status != "CONFIRMED") {
            throw Exception("Order cannot be assigned in its current status: ${order.status}")
        }
        if (order.riderId.isNotEmpty() && order.riderId != riderId) {
            throw Exception("Order is already assigned to another rider")
        }

        firestore.collection("orders").document(orderId).update(
            mapOf("riderId" to riderId, "status" to "ASSIGNED")
        ).await()
        
        val updatedOrder = order.copy(riderId = riderId, status = "ASSIGNED")
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

    fun getAssignedReturns(riderId: String): Flow<List<ReturnRequest>> = callbackFlow {
        val listener = firestore.collection("returns")
            .whereEqualTo("riderId", riderId)
            .whereIn("status", listOf("PICKUP_SCHEDULED", "PICKED_UP"))
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    close(error)
                    return@addSnapshotListener
                }
                val returns = snapshot?.toObjects(ReturnRequest::class.java) ?: emptyList()
                trySend(returns)
            }
        awaitClose { listener.remove() }
    }

    suspend fun updateReturnStatus(returnId: String, newStatus: String) {
        val returnRef = firestore.collection("returns").document(returnId)
        val snapshot = returnRef.get().await()
        val userId = snapshot.getString("userId") ?: ""

        returnRef.update(
            "status", newStatus,
            "updatedAt", FieldValue.serverTimestamp()
        ).await()

        if (userId.isNotEmpty()) {
            sendNotificationToUser(userId, "Return Update", "Aapka return request ab $newStatus hai.")
        }
    }

    suspend fun uploadProofOfDelivery(orderId: String, photoBytes: ByteArray?, signatureBytes: ByteArray?): Boolean {
        return try {
            val storage = FirebaseStorage.getInstance()
            val updates = mutableMapOf<String, Any>(
                "updatedAt" to FieldValue.serverTimestamp()
            )

            photoBytes?.let {
                val ref = storage.reference.child("orders/$orderId/pod_photo.jpg")
                ref.putBytes(it).await()
                updates["podPhoto"] = ref.downloadUrl.await().toString()
            }

            signatureBytes?.let {
                val ref = storage.reference.child("orders/$orderId/signature.png")
                ref.putBytes(it).await()
                updates["podSignature"] = ref.downloadUrl.await().toString()
            }

            if (updates.size > 1) {
                firestore.collection("orders").document(orderId).update(updates).await()
            }
            true
        } catch (e: Exception) {
            Log.e("DeliveryRepo", "POD Upload failed: ${e.message}")
            false
        }
    }

    suspend fun confirmReturnPickup(returnId: String, photoBytes: ByteArray?): Boolean {
        return try {
            val storage = FirebaseStorage.getInstance()
            val proofUrl = if (photoBytes != null) {
                val ref = storage.reference.child("returns/$returnId/pickup_photo.jpg")
                ref.putBytes(photoBytes).await()
                ref.downloadUrl.await().toString()
            } else null

            val updates = mutableMapOf<String, Any>(
                "status" to ReturnStatus.PICKED_UP.name,
                "updatedAt" to FieldValue.serverTimestamp()
            )
            proofUrl?.let { updates["qcPhotos"] = com.google.firebase.firestore.FieldValue.arrayUnion(it) }

            firestore.collection("returns").document(returnId).update(updates).await()
            true
        } catch (e: Exception) {
            Log.e("DeliveryRepo", "Pickup failed: ${e.message}")
            false
        }
    }

    // --- Mapper Extensions ---
    private fun Order.toEntity(): DeliveryOrderEntity {
        val itemsJson = JSONArray().apply {
            items.forEach { put(JSONObject().apply { put("productId", it.productId); put("productName", it.productName); put("quantity", it.quantity); put("price", it.price) }) }
        }.toString()
        return DeliveryOrderEntity(id = id, userId = userId, userName = userName, userPhone = userPhone, itemsJson = itemsJson, totalAmount = totalAmount, address = address, status = status, riderId = riderId, createdAtMillis = createdAt.time, customerOTP = customerOTP, isCOD = isCOD, codAmount = codAmount, collectedCash = collectedCash, isCashDeposited = isCashDeposited, targetLat = targetLat, targetLng = targetLng, isPendingSync = false)
    }

    private fun DeliveryOrderEntity.toDomainModel(): Order {
        val itemsList = mutableListOf<OrderItem>()
        if (itemsJson.isNotEmpty()) {
            val arr = JSONArray(itemsJson)
            for (i in 0 until arr.length()) {
                val obj = arr.getJSONObject(i)
                itemsList.add(OrderItem(productId = obj.optString("productId", ""), productName = obj.optString("productName", ""), quantity = obj.optInt("quantity", 0), price = obj.optDouble("price", 0.0)))
            }
        }
        return Order(id = id, userId = userId, userName = userName, userPhone = userPhone, items = itemsList, totalAmount = totalAmount, address = address, status = status, riderId = riderId, createdAt = Date(createdAtMillis), customerOTP = customerOTP, isCOD = isCOD, codAmount = codAmount, collectedCash = collectedCash, isCashDeposited = isCashDeposited, targetLat = targetLat, targetLng = targetLng)
    }
}
