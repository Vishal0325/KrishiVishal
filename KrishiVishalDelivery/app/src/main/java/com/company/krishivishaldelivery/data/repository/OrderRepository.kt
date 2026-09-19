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
import android.content.Context
import android.graphics.Bitmap
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.company.krishivishaldelivery.utils.PodStorageHelper
import com.company.krishivishaldelivery.worker.SyncWorker
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class OrderRepository @Inject constructor(
    @ApplicationContext private val context: Context,
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
                if (entity.status == OrderStatus.DELIVERED.name) {
                    val updates = mutableMapOf<String, Any>(
                        "status" to OrderStatus.DELIVERED.name,
                        "deliveredAt" to FieldValue.serverTimestamp()
                    )

                    // Upload Photo from local storage if available
                    entity.localPodPhotoPath?.let { path ->
                        val file = java.io.File(path)
                        if (file.exists()) {
                            val storageRef = FirebaseStorage.getInstance().reference.child("orders/${entity.id}/pod_photo.jpg")
                            storageRef.putFile(Uri.fromFile(file)).await()
                            val downloadUrl = storageRef.downloadUrl.await().toString()
                            updates["podPhoto"] = downloadUrl
                            updates["podPhotoUrl"] = downloadUrl
                        }
                    }

                    // Upload Signature from local storage if available
                    entity.localPodSignaturePath?.let { path ->
                        val file = java.io.File(path)
                        if (file.exists()) {
                            val storageRef = FirebaseStorage.getInstance().reference.child("orders/${entity.id}/signature.png")
                            storageRef.putFile(Uri.fromFile(file)).await()
                            val downloadUrl = storageRef.downloadUrl.await().toString()
                            updates["podSignature"] = downloadUrl
                            updates["podSignatureUrl"] = downloadUrl
                        }
                    }

                    firestore.collection("orders").document(entity.id).update(updates).await()

                    // Cleanup local disk cache and reset Room pending state
                    PodStorageHelper.deleteFileIfExists(entity.localPodPhotoPath)
                    PodStorageHelper.deleteFileIfExists(entity.localPodSignaturePath)
                    deliveryDao.clearPodLocalPaths(entity.id)
                } else if (entity.status == "RTO_INITIATED" || entity.status == "REATTEMPT_SCHEDULED") {
                    val updates = mutableMapOf<String, Any>(
                        "status" to entity.status,
                        "lastAttemptAt" to FieldValue.serverTimestamp()
                    )
                    entity.ndrReason?.let { updates["ndrReason"] = it }
                    entity.ndrNotes?.let { updates["ndrNotes"] = it }

                    val attemptLog = mapOf(
                        "riderId" to entity.riderId,
                        "reason" to (entity.ndrReason ?: ""),
                        "notes" to (entity.ndrNotes ?: ""),
                        "status" to entity.status,
                        "timestamp" to System.currentTimeMillis()
                    )
                    updates["attemptHistory"] = FieldValue.arrayUnion(attemptLog)

                    entity.localFailurePhotoPath?.let { path ->
                        val file = java.io.File(path)
                        if (file.exists()) {
                            val storageRef = FirebaseStorage.getInstance().reference.child("rto_proofs/${entity.id}_rto.jpg")
                            storageRef.putFile(Uri.fromFile(file)).await()
                            val downloadUrl = storageRef.downloadUrl.await().toString()
                            updates["rtoPhotoUrl"] = downloadUrl
                            updates["failurePhotoUrl"] = downloadUrl
                        }
                    }

                    firestore.collection("orders").document(entity.id).update(updates).await()

                    PodStorageHelper.deleteFileIfExists(entity.localFailurePhotoPath)
                    deliveryDao.clearFailureLocalPaths(entity.id)
                } else {
                    val data = hashMapOf(
                        "orderId" to entity.id,
                        "targetStatus" to entity.status
                    )
                    functions.getHttpsCallable("updateOrderStatus").call(data).await()
                    deliveryDao.updateSyncStatus(entity.id, false)
                }
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
        val trimmed = scannedRawText.trim()
        if (trimmed.startsWith("{") && trimmed.endsWith("}") && trimmed.contains("checksum")) {
            try {
                val callResult = functions.getHttpsCallable("verifyScannedQR").call(mapOf("qrPayload" to trimmed)).await()
                val data = callResult.data as? Map<String, Any>
                val verifiedOrderId = data?.get("orderId") as? String
                if (!verifiedOrderId.isNullOrBlank()) {
                    val doc = firestore.collection("orders").document(verifiedOrderId).get().await()
                    if (doc.exists()) return doc.toObject(Order::class.java)
                }
            } catch (e: Exception) {
                Timber.w(e, "verifyScannedQR failed or offline, falling back to local/direct lookup")
            }
        }

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

    suspend fun updateOrderLocation(orderId: String, lat: Double, lng: Double) {
        if (orderId.isBlank()) return
        try {
            firestore.collection("orders").document(orderId).update(
                mapOf(
                    "riderLocation" to GeoPoint(lat, lng),
                    "updatedAt" to FieldValue.serverTimestamp()
                )
            ).await()
        } catch (e: Exception) {
            Timber.w(e, "updateOrderLocation failed for order $orderId")
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

    suspend fun completeReturnPickupQC(
        returnId: String,
        status: String,
        qcStatus: String,
        qcNote: String,
        qcPhotos: List<String> = emptyList()
    ): Boolean {
        return try {
            firestore.collection("returns").document(returnId).update(
                mapOf(
                    "status" to status,
                    "qcStatus" to qcStatus,
                    "qcNote" to qcNote,
                    "qcPhotos" to qcPhotos,
                    "qcCompletedAt" to FieldValue.serverTimestamp(),
                    "updatedAt" to FieldValue.serverTimestamp()
                )
            ).await()
            true
        } catch (e: Exception) {
            false
        }
    }

    suspend fun reportDeliveryFailure(
        orderId: String,
        riderId: String,
        reason: String,
        notes: String,
        isRTO: Boolean,
        photoBitmap: Bitmap? = null
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

            // 1. Save failure photo locally if provided
            val localPhotoPath = photoBitmap?.let {
                PodStorageHelper.saveFailurePhotoLocally(context, orderId, it)
            }

            // 2. Save locally in Room database with pending sync flag
            deliveryDao.markOrderFailedWithEvidence(
                orderId = orderId,
                reason = reason,
                notes = notes,
                failurePhotoPath = localPhotoPath,
                status = targetStatus,
                isPendingSync = true
            )

            // 3. Try live online update if network is available
            var isSyncedLive = false
            try {
                val updates = mutableMapOf<String, Any>(
                    "status" to targetStatus,
                    "ndrReason" to reason,
                    "ndrNotes" to notes,
                    "lastAttemptAt" to FieldValue.serverTimestamp(),
                    "attemptHistory" to FieldValue.arrayUnion(attemptLog)
                )

                if (localPhotoPath != null) {
                    val file = java.io.File(localPhotoPath)
                    if (file.exists()) {
                        val ref = FirebaseStorage.getInstance().reference.child("rto_proofs/${orderId}_rto.jpg")
                        ref.putFile(Uri.fromFile(file)).await()
                        val url = ref.downloadUrl.await().toString()
                        updates["rtoPhotoUrl"] = url
                        updates["failurePhotoUrl"] = url
                    }
                }

                firestore.collection("orders").document(orderId).update(updates).await()

                // Cleanup local disk cache and reset Room pending state
                PodStorageHelper.deleteFileIfExists(localPhotoPath)
                deliveryDao.clearFailureLocalPaths(orderId)
                isSyncedLive = true
            } catch (e: Exception) {
                Timber.w(e, "Live upload for failure proof failed for order $orderId, queued for background sync")
            }

            // 4. If offline or upload failed, schedule background WorkManager sync
            if (!isSyncedLive) {
                scheduleBackgroundSync()
            }
            true
        } catch (e: Exception) {
            Timber.e(e, "reportDeliveryFailure failed for order $orderId")
            false
        }
    }

    /**
     * Completes delivery with POD by saving compressed images locally first,
     * verifying OTP (online or fallback offline), marking status as DELIVERED,
     * and attempting instant cloud sync or scheduling background WorkManager.
     */
    suspend fun completeDeliveryWithPOD(
        orderId: String,
        otp: String,
        photoBitmap: Bitmap?,
        signatureBitmap: Bitmap?
    ): Resource<String> {
        return try {
            val localOrder = deliveryDao.getOrderById(orderId)
                ?: return Resource.Error("Order not found locally")

            // 1. Verify OTP: try online functions call first, fallback to cached local OTP if offline
            var isOnlineVerified = false
            try {
                val data = hashMapOf("orderId" to orderId, "otp" to otp.trim())
                functions.getHttpsCallable("verifyDeliveryOTP").call(data).await()
                isOnlineVerified = true
            } catch (e: Exception) {
                Timber.w(e, "Online OTP verification failed, trying local OTP fallback")
                val cleanOtp = otp.trim()
                val cachedOtp = localOrder.customerOTP.trim()
                val isOfflineMatch = cachedOtp.isNotBlank() && (cleanOtp == cachedOtp || (cachedOtp.length >= 4 && cleanOtp.endsWith(cachedOtp.takeLast(4))))
                
                if (!isOfflineMatch) {
                    return Resource.Error("Invalid delivery PIN/OTP. Please check with customer.")
                }
            }

            // 2. Compress and save Photo and Signature locally
            val localPhotoPath = photoBitmap?.let {
                PodStorageHelper.saveCompressedBitmap(context, it, orderId, "pod_photo")
            }
            val localSignaturePath = signatureBitmap?.let {
                PodStorageHelper.saveCompressedBitmap(context, it, orderId, "pod_signature")
            }

            // 3. Mark DELIVERED locally in Room with pending sync flag
            deliveryDao.markOrderDeliveredWithPOD(
                orderId = orderId,
                photoPath = localPhotoPath,
                signaturePath = localSignaturePath,
                isPendingSync = true
            )

            // 4. Try instant online sync if online
            var isSyncedLive = false
            if (isOnlineVerified) {
                try {
                    val updates = mutableMapOf<String, Any>(
                        "status" to OrderStatus.DELIVERED.name,
                        "deliveredAt" to FieldValue.serverTimestamp()
                    )
                    localPhotoPath?.let { path ->
                        val file = java.io.File(path)
                        if (file.exists()) {
                            val ref = FirebaseStorage.getInstance().reference.child("orders/$orderId/pod_photo.jpg")
                            ref.putFile(Uri.fromFile(file)).await()
                            val url = ref.downloadUrl.await().toString()
                            updates["podPhoto"] = url
                            updates["podPhotoUrl"] = url
                        }
                    }
                    localSignaturePath?.let { path ->
                        val file = java.io.File(path)
                        if (file.exists()) {
                            val ref = FirebaseStorage.getInstance().reference.child("orders/$orderId/signature.png")
                            ref.putFile(Uri.fromFile(file)).await()
                            val url = ref.downloadUrl.await().toString()
                            updates["podSignature"] = url
                            updates["podSignatureUrl"] = url
                        }
                    }
                    firestore.collection("orders").document(orderId).update(updates).await()

                    // Cleanup local disk files
                    PodStorageHelper.deleteFileIfExists(localPhotoPath)
                    PodStorageHelper.deleteFileIfExists(localSignaturePath)
                    deliveryDao.clearPodLocalPaths(orderId)
                    isSyncedLive = true
                } catch (e: Exception) {
                    Timber.w(e, "Live cloud upload failed after OTP verification, queued for background sync")
                }
            }

            // 5. If not synced live, schedule WorkManager
            if (!isSyncedLive) {
                scheduleBackgroundSync()
                Resource.Success("Delivery marked complete offline. Photos will sync automatically.")
            } else {
                Resource.Success("Delivery completed & synced successfully!")
            }
        } catch (e: Exception) {
            Timber.e(e, "completeDeliveryWithPOD unexpected error for order: $orderId")
            Resource.Error(e.localizedMessage ?: "Failed to complete delivery")
        }
    }

    private fun scheduleBackgroundSync() {
        try {
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()
            val syncRequest = OneTimeWorkRequestBuilder<SyncWorker>()
                .setConstraints(constraints)
                .build()
            WorkManager.getInstance(context).enqueueUniqueWork(
                "PODSyncWork",
                ExistingWorkPolicy.REPLACE,
                syncRequest
            )
        } catch (e: Exception) {
            Timber.e(e, "Failed to schedule PODSyncWork")
        }
    }

    fun getCashDepositHistory(riderId: String): Flow<List<com.company.krishivishaldelivery.data.model.CashDepositRecord>> = callbackFlow {
        val listener = firestore.collection("cash_deposits")
            .whereEqualTo("riderId", riderId)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    close(error)
                    return@addSnapshotListener
                }
                val records = snapshot?.documents?.mapNotNull { doc ->
                    val id = doc.id
                    val rider = doc.getString("riderId") ?: ""
                    val amount = doc.getDouble("amount") ?: 0.0
                    val count = doc.getLong("ordersCount")?.toInt() ?: 0
                    @Suppress("UNCHECKED_CAST")
                    val orderIds = doc.get("orderIds") as? List<String> ?: emptyList()
                    val status = doc.getString("status") ?: "DEPOSITED_AT_WAREHOUSE"
                    val timestamp = doc.getTimestamp("depositedAt")?.toDate()?.time ?: System.currentTimeMillis()
                    com.company.krishivishaldelivery.data.model.CashDepositRecord(id, rider, amount, count, orderIds, status, timestamp)
                }?.sortedByDescending { it.depositedAtMillis } ?: emptyList()

                trySend(records)
            }
        awaitClose { listener.remove() }
    }

    suspend fun markCashAsDeposited(riderId: String): com.company.krishivishaldelivery.data.model.CashDepositRecord? {
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
                val recordId = depositLogRef.id
                val orderIds = snapshot.documents.map { it.id }
                val now = System.currentTimeMillis()
                batch.set(depositLogRef, mapOf(
                    "riderId" to riderId,
                    "amount" to totalDeposited,
                    "ordersCount" to snapshot.size(),
                    "orderIds" to orderIds,
                    "status" to "DEPOSITED_AT_WAREHOUSE",
                    "depositedAt" to FieldValue.serverTimestamp()
                ))
                batch.commit().await()
                com.company.krishivishaldelivery.data.model.CashDepositRecord(
                    id = recordId,
                    riderId = riderId,
                    amount = totalDeposited,
                    ordersCount = snapshot.size(),
                    orderIds = orderIds,
                    status = "DEPOSITED_AT_WAREHOUSE",
                    depositedAtMillis = now
                )
            } else null
        } catch (e: Exception) {
            Timber.e(e, "markCashAsDeposited failed for rider: $riderId")
            null
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
