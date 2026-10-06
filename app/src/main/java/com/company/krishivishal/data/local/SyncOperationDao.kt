package com.company.krishivishal.data.local

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface SyncOperationDao {
    
    @Insert
    suspend fun insert(operation: SyncOperation)

    @Update
    suspend fun update(operation: SyncOperation)

    @Delete
    suspend fun delete(operation: SyncOperation)

    @Query("SELECT * FROM sync_operations WHERE isSynced = 0 AND (status IS NULL OR status != 'FAILED') ORDER BY createdAt ASC")
    fun getPendingOperations(): Flow<List<SyncOperation>>

    @Query("SELECT * FROM sync_operations WHERE userId = :userId AND isSynced = 0 AND (status IS NULL OR status != 'FAILED') ORDER BY createdAt ASC")
    fun getPendingOperationsByUser(userId: String): Flow<List<SyncOperation>>

    @Query("SELECT * FROM sync_operations WHERE id = :operationId")
    suspend fun getOperationById(operationId: String): SyncOperation?

    @Query("SELECT * FROM sync_operations WHERE userId = :userId AND operationType = 'CREATE_ORDER' AND isSynced = 0 ORDER BY createdAt DESC LIMIT 1")
    suspend fun getPendingCreateOrderOperation(userId: String): SyncOperation?

    @Query("DELETE FROM sync_operations WHERE isSynced = 1 AND createdAt < :cutoffTime")
    suspend fun deleteOldSyncedOperations(cutoffTime: Long)

    @Query("UPDATE sync_operations SET attemptCount = attemptCount + 1, lastAttemptAt = :timestamp WHERE id = :operationId")
    suspend fun incrementRetryCount(operationId: String, timestamp: Long)

    @Query("UPDATE sync_operations SET isSynced = 1, status = 'SYNCED' WHERE id = :operationId")
    suspend fun markAsSynced(operationId: String)

    @Query("UPDATE sync_operations SET status = 'FAILED', errorMessage = :error WHERE id = :operationId")
    suspend fun markAsFailed(operationId: String, error: String)

    @Query("SELECT COUNT(*) FROM sync_operations WHERE isSynced = 0 AND (status IS NULL OR status != 'FAILED')")
    fun getPendingOperationCount(): Flow<Int>

    @Query("SELECT * FROM sync_operations WHERE status = 'FAILED'")
    fun getFailedOperations(): Flow<List<SyncOperation>>

    @Query("SELECT COUNT(*) FROM sync_operations WHERE status = 'FAILED'")
    suspend fun getFailedOperationCount(): Int
}
