package com.company.krishivishaldelivery.data.repository

import android.net.Uri
import com.company.krishivishal.core.model.Order
import com.company.krishivishal.core.model.OrderItem
import com.company.krishivishal.core.model.OrderStatus
import com.company.krishivishal.core.model.ReturnRequest
import com.company.krishivishal.core.model.ReturnStatus
import com.company.krishivishal.core.util.Resource
import com.company.krishivishaldelivery.data.local.DeliveryDao
import com.company.krishivishaldelivery.data.local.DeliveryOrderEntity
import com.company.krishivishaldelivery.data.local.GPSLogEntity
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.GeoPoint
import com.google.firebase.functions.FirebaseFunctions
import com.google.firebase.storage.FirebaseStorage
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.tasks.await
import timber.log.Timber
import java.util.Date
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class OrderRepository @Inject constructor(
    private val firestore: FirebaseFirestore,
    private val functions: FirebaseFunctions,
    private val deliveryDao: DeliveryDao
) {
    fun getAssignedOrders(): Flow<List<Order>> {
        return deliveryDao.getAllOrders().map { entities ->
            entities.map { it.toDomainModel() }
        }
    }

    fun getPendingSyncCount(): Flow<Int> = deliveryDao.getPendingSyncCount()

    suspend fun syncAssignedOrders(riderId: String) {
        try {
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

            val activeStatuses = listOf(
                OrderStatus.ASSIGNED.name,
                OrderStatus.PICKED_UP.name,
                OrderStatus.OUT_FOR_DELIVERY.name,
                OrderStatus.DELIVERED.name
            )
            val filteredOrders = orders.filter { it.status in activeStatuses }
            val entities = filteredOrders.map { it.toEntity() }

            // Atomic: clear + insert ek hi transaction mein — data loss nahi hoga
            deliveryDao.clearAndInsertOrders(entities)
        } catch (e: Exception) {
            Timber.e(e, "syncAssignedOrders failed for rider: $riderId")
        }
    }

    suspend fun updateOrderStatus(orderId: String, newStatus: String) {
        if (newStatus == OrderStatus.DELIVERED.name) return
        try {
            deliveryDao.updateOrderStatus(orderId, newStatus, true)

            val data = hashMapOf(
                "orderId" to orderId,
                "targetStatus" to newStatus
            )
            functions.getHttpsCallable("updateOrderStatus").call(data).await()

            deliveryDao.updateSyncStatus(orderId, false)
        } catch (e: Exception) {
            Timber.e(e, "updateOrderStatus failed for order: $orderId, status: $newStatus")
        }
    }

    suspend fun verifyOrderDelivery(orderId: String, otp: String): Resource<Unit> {
        return try {
            val data = hashMapOf("orderId" to orderId, "otp" to otp)
            functions.getHttpsCallable("verifyDeliveryOTP").call(data).await()
            deliveryDao.updateOrderStatus(orderId, OrderStatus.DELIVERED.name, false)
            Resource.Success(Unit)
        } catch (e: Exception) {
            Resource.Error(e.localizedMessage ?: "OTP Verification failed")
        }
    }

    suspend fun syncPendingOrders() {
        val pending = deliveryDao.getPendingSyncOrders()
        pending.forEach { entity ->
            try {
                if (entity.status != OrderStatus.DELIVERED.name) {
                    val data = hashMapOf(
                        "orderId" to entity.id,
                        "targetStatus" to entity.status
                    )
                    functions.getHttpsCallable("updateOrderStatus").call(data).await()
                }

                if (entity.status == OrderStatus.DELIVERED.name) {
                    entity.localPodPhotoPath?.let { path ->
                        val storageRef = FirebaseStorage.getInstance().reference.child("pod/${entity.id}_photo.jpg")
                        storageRef.putFile(Uri.fromFile(java.io.File(path))).await()
                        val downloadUrl = storageRef.downloadUrl.await().toString()
                        firestore.collection("orders").document(entity.id).update("podPhotoUrl", downloadUrl).await()
                    }
                }
                deliveryDao.updateSyncStatus(entity.id, false)
            } catch (e: Exception) {
                Timber.e(e, "syncPendingOrders: failed to sync order ${entity.id}")
            }
        }

        val unsyncedLogs = deliveryDao.getUnsyncedGPSLogs()
        if (unsyncedLogs.isNotEmpty()) {
            unsyncedLogs.chunked(100).forEach { chunk ->
                try {
                    val batch = firestore.batch()
                    chunk.forEach { log ->
                        val ref = firestore.collection("rider_location_history").document()
                        batch.set(ref, mapOf(
                            "riderId" to log.riderId,
                            "location" to GeoPoint(log.lat, log.lng),
                            "timestamp" to log.timestamp,
                            "orderId" to (log.orderId ?: "")
                        ))
                    }
                    batch.commit().await()
                    deliveryDao.markGPSLogsSynced(chunk.map { it.id })
                } catch (e: Exception) {
                    Timber.e(e, "syncPendingOrders: failed to sync GPS log chunk")
                }
            }
        }
    }

    suspend fun fetchOrderForPreview(scannedRawText: String): Order? {
        val cleanId = extractOrderIdFromScan(scannedRawText)
        val doc = firestore.collection("orders").document(cleanId).get().await()
        if (doc.exists()) {
            return doc.toObject(Order::class.java)
        }
        // Fallback: check if id matches prefix
        return try {
            val snap = firestore.collection("orders").whereEqualTo("id", cleanId).get().await()
            snap.documents.firstOrNull()?.toObject(Order::class.java)
        } catch (e: Exception) {
            null
        }
    }

    private fun extractOrderIdFromScan(raw: String): String {
        val trimmed = raw.trim()
        if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
            try {
                val json = org.json.JSONObject(trimmed)
                if (json.has("orderId")) return json.getString("orderId")
                if (json.has("id")) return json.getString("id")
            } catch (e: Exception) {
                Timber.w(e, "JSON parse fallback on scanned raw text")
            }
        }
        if (trimmed.startsWith("AWB-")) {
            val parts = trimmed.split("-")
            if (parts.size >= 2) return parts[1]
        }
        return trimmed
    }

    suspend fun acceptOrderByScan(orderId: String, riderId: String): Order {
        val doc = firestore.collection("orders").document(orderId).get().await()
        val order = doc.toObject(Order::class.java) ?: throw Exception("Order not found")

        if (order.status != OrderStatus.PLACED.name && order.status != OrderStatus.CONFIRMED.name) throw Exception("Invalid status")
        if (order.riderId.isNotEmpty() && order.riderId != riderId) throw Exception("Already assigned")

        firestore.collection("orders").document(orderId).update(
            mapOf("riderId" to riderId, "status" to OrderStatus.ASSIGNED.name)
        ).await()

        val updatedOrder = order.copy(riderId = riderId, status = OrderStatus.ASSIGNED.name)
        deliveryDao.insertOrder(updatedOrder.toEntity())
        return updatedOrder
    }

    suspend fun rejectOrder(orderId: String, riderId: String, reason: String) {
        val rejectionData = mapOf("riderId" to riderId, "reason" to reason, "timestamp" to System.currentTimeMillis())
        firestore.runTransaction { transaction ->
            val docRef = firestore.collection("orders").document(orderId)
            transaction.update(docRef, "status", OrderStatus.CONFIRMED.name)
            transaction.update(docRef, "riderId", "")
            transaction.update(docRef, "rejectionHistory", FieldValue.arrayUnion(rejectionData))
        }.await()
        deliveryDao.deleteOrderById(orderId)
    }

    fun getAssignedReturns(riderId: String): Flow<List<ReturnRequest>> = callbackFlow {
        val listener = firestore.collection("returns")
            .whereEqualTo("riderId", riderId)
            .whereIn("status", listOf(ReturnStatus.PICKUP_SCHEDULED.name, ReturnStatus.PICKED_UP.name))
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    close(error)
                    return@addSnapshotListener
                }
                trySend(snapshot?.toObjects(ReturnRequest::class.java) ?: emptyList())
            }
        awaitClose { listener.remove() }
    }

    suspend fun updateReturnStatus(returnId: String, newStatus: String) {
        firestore.collection("returns").document(returnId).update(
            "status", newStatus,
            "updatedAt", FieldValue.serverTimestamp()
        ).await()
    }

    suspend fun reportDeliveryFailure(
        orderId: String,
        riderId: String,
        reason: String,
        notes: String,
        isRTO: Boolean
    ): Boolean {
        return try {
            val targetStatus = if (isRTO) "RTO_INITIATED" else "REATTEMPT_SCHEDULED"
            val attemptLog = mapOf(
                "riderId" to riderId,
                "reason" to reason,
                "notes" to notes,
                "status" to targetStatus,
                "timestamp" to System.currentTimeMillis()
            )

            // 1. Update Firestore
            firestore.collection("orders").document(orderId).update(
                mapOf(
                    "status" to targetStatus,
                    "ndrReason" to reason,
                    "ndrNotes" to notes,
                    "lastAttemptAt" to FieldValue.serverTimestamp(),
                    "attemptHistory" to FieldValue.arrayUnion(attemptLog)
                )
            ).await()

            // 2. Update local DB
            deliveryDao.updateOrderStatus(orderId, targetStatus, false)
            true
        } catch (e: Exception) {
            Timber.e(e, "reportDeliveryFailure failed for order $orderId")
            false
        }
    }

    suspend fun uploadProofOfDelivery(orderId: String, photoBytes: ByteArray?, signatureBytes: ByteArray?): Boolean {
        return try {
            val storage = FirebaseStorage.getInstance()
            val updates = mutableMapOf<String, Any>("updatedAt" to FieldValue.serverTimestamp())

            photoBytes?.let {
                val ref = storage.reference.child("orders/$orderId/pod_photo.jpg")
                ref.putBytes(it).await()
                val url = ref.downloadUrl.await().toString()
                updates["podPhoto"] = url
                updates["podPhotoUrl"] = url
            }

            signatureBytes?.let {
                val ref = storage.reference.child("orders/$orderId/signature.png")
                ref.putBytes(it).await()
                val url = ref.downloadUrl.await().toString()
                updates["podSignature"] = url
                updates["podSignatureUrl"] = url
            }

            if (updates.size > 1) {
                firestore.collection("orders").document(orderId).update(updates).await()
            }
            true
        } catch (e: Exception) {
            Timber.e(e, "uploadProofOfDelivery failed for order: $orderId")
            false
        }
    }

    suspend fun markCashAsDeposited(riderId: String): Boolean {
        return try {
            deliveryDao.markOrdersAsDeposited(riderId, false)
            val snapshot = firestore.collection("orders")
                .whereEqualTo("riderId", riderId)
                .whereEqualTo("status", OrderStatus.DELIVERED.name)
                .whereEqualTo("isCOD", true)
                .whereEqualTo("isCashDeposited", false)
                .get().await()

            var totalDeposited = 0.0
            val batch = firestore.batch()
            snapshot.documents.forEach { doc ->
                val amt = doc.getDouble("codAmount") ?: 0.0
                totalDeposited += amt
                batch.update(doc.reference, "isCashDeposited", true, "cashDepositedAt", FieldValue.serverTimestamp())
            }
            if (!snapshot.isEmpty) {
                val depositLogRef = firestore.collection("cash_deposits").document()
                batch.set(depositLogRef, mapOf(
                    "riderId" to riderId,
                    "amount" to totalDeposited,
                    "ordersCount" to snapshot.size(),
                    "orderIds" to snapshot.documents.map { it.id },
                    "status" to "DEPOSITED_AT_WAREHOUSE",
                    "depositedAt" to FieldValue.serverTimestamp()
                ))
                batch.commit().await()
            }
            true
        } catch (e: Exception) {
            Timber.e(e, "markCashAsDeposited failed for rider: $riderId")
            false
        }
    }

    private fun Order.toEntity(): DeliveryOrderEntity {
        return DeliveryOrderEntity(
            id = id, userId = userId, userName = userName, userPhone = userPhone,
            items = items, totalAmount = totalAmount, address = address,
            landmark = landmark.ifBlank { getEffectiveLandmark() },
            status = status, riderId = riderId, createdAtMillis = createdAt.time,
            customerOTP = customerOTP, isCOD = isCOD, codAmount = codAmount,
            collectedCash = collectedCash, isCashDeposited = isCashDeposited,
            targetLat = targetLat, targetLng = targetLng, isPendingSync = false
        )
    }

    private fun DeliveryOrderEntity.toDomainModel(): Order {
        return Order(
            id = id, userId = userId, userName = userName, userPhone = userPhone,
            items = items, totalAmount = totalAmount, address = address,
            landmark = landmark,
            status = status, riderId = riderId, createdAt = Date(createdAtMillis),
            customerOTP = customerOTP, isCOD = isCOD, codAmount = codAmount,
            collectedCash = collectedCash, isCashDeposited = isCashDeposited,
            targetLat = targetLat, targetLng = targetLng
        )
    }
}
