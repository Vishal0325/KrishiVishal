package com.company.krishivishaldelivery.data.repository

import android.net.Uri
import android.util.Log
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
            deliveryDao.clearOrders()
            deliveryDao.insertOrders(entities)
        } catch (e: Exception) {
            Log.e("OrderRepo", "Sync Error: ${e.message}")
        }
    }

    suspend fun updateOrderStatus(orderId: String, newStatus: String) {
        if (newStatus == OrderStatus.DELIVERED.name) return
        try {
            deliveryDao.updateOrderStatus(orderId, newStatus, true)

            val doc = firestore.collection("orders").document(orderId).get().await()
            val serverStatus = doc.getString("status") ?: ""

            if (isStatusAdvanced(serverStatus, newStatus)) {
                deliveryDao.updateOrderStatus(orderId, serverStatus, false)
                return
            }

            firestore.collection("orders").document(orderId).update(
                "status", newStatus,
                "updatedAt", FieldValue.serverTimestamp()
            ).await()

            deliveryDao.updateSyncStatus(orderId, false)
        } catch (e: Exception) {
            Log.e("OrderRepo", "Update failed: ${e.message}")
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

    private fun isStatusAdvanced(current: String, incoming: String): Boolean {
        val priority = mapOf(
            OrderStatus.PLACED.name to 0,
            OrderStatus.CONFIRMED.name to 1,
            OrderStatus.ASSIGNED.name to 2,
            OrderStatus.PICKED_UP.name to 3,
            OrderStatus.OUT_FOR_DELIVERY.name to 4,
            OrderStatus.DELIVERED.name to 5
        )
        return (priority[current] ?: -1) > (priority[incoming] ?: -1)
    }

    suspend fun syncPendingOrders() {
        val pending = deliveryDao.getPendingSyncOrders()
        pending.forEach { entity ->
            try {
                val doc = firestore.collection("orders").document(entity.id).get().await()
                if (doc.exists()) {
                    val serverStatus = doc.getString("status") ?: ""
                    if (!isStatusAdvanced(serverStatus, entity.status)) {
                        firestore.collection("orders").document(entity.id).update(
                            "status", entity.status,
                            "updatedAt", FieldValue.serverTimestamp()
                        ).await()
                    }
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
                Log.e("SyncWorker", "Failed to sync ${entity.id}: ${e.message}")
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
                    Log.e("SyncWorker", "Failed to sync GPS logs: ${e.message}")
                }
            }
        }
    }

    suspend fun fetchOrderForPreview(orderId: String): Order? {
        val doc = firestore.collection("orders").document(orderId).get().await()
        return doc.toObject(Order::class.java)
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

    suspend fun uploadProofOfDelivery(orderId: String, photoBytes: ByteArray?, signatureBytes: ByteArray?): Boolean {
        return try {
            val storage = FirebaseStorage.getInstance()
            val updates = mutableMapOf<String, Any>("updatedAt" to FieldValue.serverTimestamp())

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
            false
        }
    }

    private fun Order.toEntity(): DeliveryOrderEntity {
        return DeliveryOrderEntity(
            id = id, userId = userId, userName = userName, userPhone = userPhone,
            items = items, totalAmount = totalAmount, address = address,
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
            status = status, riderId = riderId, createdAt = Date(createdAtMillis),
            customerOTP = customerOTP, isCOD = isCOD, codAmount = codAmount,
            collectedCash = collectedCash, isCashDeposited = isCashDeposited,
            targetLat = targetLat, targetLng = targetLng
        )
    }
}
