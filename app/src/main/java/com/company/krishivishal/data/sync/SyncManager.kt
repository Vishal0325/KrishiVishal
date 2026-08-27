package com.company.krishivishal.data.sync

import android.content.Context
import com.company.krishivishal.data.local.AppDatabase
import com.company.krishivishal.data.local.SyncOperation
import com.company.krishivishal.utils.ConnectivityObserver
import com.company.krishivishal.core.util.Constants
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FirebaseFirestoreException
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.firstOrNull
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import com.company.krishivishal.performance.SyncResilienceManager
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import androidx.work.*
import com.company.krishivishal.worker.SyncWorker
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.math.pow

/**
 * Manages synchronization between local Room database and remote Firestore
 * Handles offline operations queue and retries with exponential backoff
 */
@Singleton
class SyncManager @Inject constructor(
    private val database: AppDatabase,
    private val firestore: FirebaseFirestore,
    private val connectivityObserver: ConnectivityObserver,
    private val syncResilienceManager: SyncResilienceManager,
    @dagger.hilt.android.qualifiers.ApplicationContext private val context: Context,
    @param:com.company.krishivishal.di.IoDispatcher private val dispatcher: kotlinx.coroutines.CoroutineDispatcher = kotlinx.coroutines.Dispatchers.IO
) {
    private val syncScope = CoroutineScope(dispatcher + SupervisorJob())
    private val syncOperationDao = database.syncOperationDao()
    private val gson = Gson()
    
    private companion object {
        const val MAX_RETRY_ATTEMPTS = 3
        const val INITIAL_RETRY_DELAY_MS = 1000L
        const val CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000L // 24 hours
    }

    init {
        observeConnectivityAndSync()
        startCleanupTask()
    }

    /**
     * Queue an operation for offline sync
     */
    suspend fun queueOperation(
        operationType: String,
        entityType: String,
        entityId: String,
        userId: String,
        payload: Any
    ) {
        if (userId == Constants.GUEST_USER_ID) {
            Timber.d("Skipping sync queue for guest user: $operationType")
            return
        }

        try {
            val jsonPayload = when (payload) {
                is String -> payload
                else -> gson.toJson(payload)
            }

            val operation = SyncOperation(
                operationType = operationType,
                entityType = entityType,
                entityId = entityId,
                userId = userId,
                payload = jsonPayload
            )

            syncOperationDao.insert(operation)
            Timber.d("Operation queued: $operationType for $entityType:$entityId")
            
            // Trigger background sync
            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()
                
            val syncRequest = OneTimeWorkRequestBuilder<SyncWorker>()
                .setConstraints(constraints)
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 1, java.util.concurrent.TimeUnit.MINUTES)
                .build()
                
            WorkManager.getInstance(context).enqueueUniqueWork(
                "sync_pending_ops",
                ExistingWorkPolicy.REPLACE,
                syncRequest
            )
        } catch (e: Exception) {
            Timber.e(e, "Failed to queue operation: $operationType")
        }
    }

    /**
     * Observe connectivity and trigger sync when online
     */
    private fun observeConnectivityAndSync() {
        syncScope.launch {
            connectivityObserver.observe().collect { status ->
                when (status) {
                    ConnectivityObserver.Status.Available -> {
                        Timber.d("Network available, triggering WorkManager sync")
                        val constraints = Constraints.Builder()
                            .setRequiredNetworkType(NetworkType.CONNECTED)
                            .build()
                            
                        val syncRequest = OneTimeWorkRequestBuilder<SyncWorker>()
                            .setConstraints(constraints)
                            .build()
                            
                        WorkManager.getInstance(context).enqueueUniqueWork(
                            "sync_on_connectivity",
                            ExistingWorkPolicy.KEEP,
                            syncRequest
                        )
                    }
                    else -> {
                        Timber.d("Network unavailable: $status")
                    }
                }
            }
        }
    }

    /**
     * Sync all pending operations
     */
    internal suspend fun syncPendingOperations() {
        if (syncResilienceManager.shouldDelaySync()) {
            Timber.d("Sync delayed by circuit breaker (failures: ${syncResilienceManager.getFailureCount()})")
            return
        }

        try {
            val pendingOps = syncOperationDao.getPendingOperations().firstOrNull() ?: emptyList()
            
            if (pendingOps.isEmpty()) {
                Timber.d("No pending operations to sync")
                return
            }

            Timber.d("Syncing ${pendingOps.size} pending operations")

            for (operation in pendingOps) {
                syncOperation(operation)
            }
        } catch (e: Exception) {
            Timber.e(e, "Failed to sync pending operations")
        }
    }

    /**
     * Sync a single operation with retry logic
     */
    private suspend fun syncOperation(operation: SyncOperation) {
        try {
            if (operation.attemptCount >= MAX_RETRY_ATTEMPTS) {
                Timber.w("Max retry attempts reached for operation: ${operation.id}")
                return
            }

            val result = executeRemoteOperation(operation)

            if (result) {
                syncOperationDao.markAsSynced(operation.id)
                Timber.d("Operation synced successfully: ${operation.id}")
            } else {
                retryOperation(operation)
            }
        } catch (e: Exception) {
            Timber.e(e, "Error syncing operation: ${operation.id}")
            retryOperation(operation)
        }
    }

    /**
     * Execute operation on remote (Firestore)
     */
    private suspend fun executeRemoteOperation(operation: SyncOperation): Boolean {
        return try {
            val type = object : TypeToken<Map<String, Any?>>() {}.type
            val payload: Map<String, Any?> = gson.fromJson(operation.payload, type)

            when (operation.operationType.uppercase()) {
                "ADD_TO_CART" -> {
                    firestore.collection("users")
                        .document(operation.userId)
                        .collection("cart")
                        .document(operation.entityId)
                        .set(payload)
                        .await()
                    Timber.d("Cart item added to Firestore")
                    true
                }
                "UPDATE_CART" -> {
                    firestore.collection("users")
                        .document(operation.userId)
                        .collection("cart")
                        .document(operation.entityId)
                        .update(payload)
                        .await()
                    Timber.d("Cart item updated in Firestore")
                    true
                }
                "REMOVE_CART" -> {
                    firestore.collection("users")
                        .document(operation.userId)
                        .collection("cart")
                        .document(operation.entityId)
                        .delete()
                        .await()
                    Timber.d("Cart item removed from Firestore")
                    true
                }
                "CLEAR_CART" -> {
                    val cartRef = firestore.collection("users")
                        .document(operation.userId)
                        .collection("cart")
                    val snapshot = cartRef.get().await()
                    firestore.runBatch { batch ->
                        for (doc in snapshot.documents) {
                            batch.delete(doc.reference)
                        }
                    }.await()
                    Timber.d("Cart cleared in Firestore")
                    true
                }
                "ADD_TO_WISHLIST" -> {
                    firestore.collection("users")
                        .document(operation.userId)
                        .collection("wishlist")
                        .document(operation.entityId)
                        .set(payload)
                        .await()
                    Timber.d("Wishlist item added to Firestore")
                    true
                }
                "REMOVE_FROM_WISHLIST" -> {
                    firestore.collection("users")
                        .document(operation.userId)
                        .collection("wishlist")
                        .document(operation.entityId)
                        .delete()
                        .await()
                    Timber.d("Wishlist item removed from Firestore")
                    true
                }
                "UPDATE_ORDER" -> {
                    firestore.collection("orders")
                        .document(operation.entityId)
                        .update(payload)
                        .await()
                    true
                }
                "CREATE_ORDER" -> {
                    firestore.collection("orders")
                        .document(operation.entityId)
                        .set(payload)
                        .await()
                    Timber.d("Offline order synced to Firestore: ${operation.entityId}")
                    true
                }
                else -> {
                    Timber.w("Unknown operation type: ${operation.operationType}")
                    false
                }
            }
        } catch (e: FirebaseFirestoreException) {
            Timber.e(e, "Firestore error: ${e.code}")
            // Permanent failures shouldn't retry (Permission Denied, Not Found)
            if (e.code == FirebaseFirestoreException.Code.PERMISSION_DENIED || 
                e.code == FirebaseFirestoreException.Code.NOT_FOUND) {
                syncOperationDao.markAsSynced(operation.id) // Skip from queue
                return true
            }
            false
        } catch (e: Exception) {
            Timber.e(e, "Error executing remote operation")
            false
        }
    }

    /**
     * Retry operation with exponential backoff
     */
    private suspend fun retryOperation(operation: SyncOperation) {
        try {
            val newAttemptCount = operation.attemptCount + 1
            val delayMs = INITIAL_RETRY_DELAY_MS * (2.0.pow(newAttemptCount.toDouble()).toLong())

            syncOperationDao.incrementRetryCount(operation.id, System.currentTimeMillis())
            
            Timber.d("Retrying operation ${operation.id}, attempt $newAttemptCount/$MAX_RETRY_ATTEMPTS in ${delayMs}ms")

            delay(delayMs)

            val updatedOperation = syncOperationDao.getOperationById(operation.id) ?: return
            syncOperation(updatedOperation)
        } catch (e: Exception) {
            Timber.e(e, "Error retrying operation")
        }
    }

    /**
     * Clean up old synced operations periodically
     */
    private fun startCleanupTask() {
        syncScope.launch {
            while (true) {
                try {
                    delay(CLEANUP_INTERVAL_MS)
                    val cutoffTime = System.currentTimeMillis() - (7 * 24 * 60 * 60 * 1000L) // 7 days
                    syncOperationDao.deleteOldSyncedOperations(cutoffTime)
                    Timber.d("Cleaned up old sync operations")
                } catch (e: Exception) {
                    Timber.e(e, "Error cleaning up sync operations")
                }
            }
        }
    }

    /**
     * Get count of pending operations
     */
    fun getPendingOperationCount() = syncOperationDao.getPendingOperationCount()
}
