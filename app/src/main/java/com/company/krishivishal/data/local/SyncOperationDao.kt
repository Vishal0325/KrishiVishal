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

    @Query("SELECT * FROM sync_operations WHERE isSynced = 0 ORDER BY createdAt ASC")
    fun getPendingOperations(): Flow<List<SyncOperation>>

    @Query("SELECT * FROM sync_operations WHERE userId = :userId AND isSynced = 0 ORDER BY createdAt ASC")
    fun getPendingOperationsByUser(userId: String): Flow<List<SyncOperation>>

    @Query("SELECT * FROM sync_operations WHERE id = :operationId")
    suspend fun getOperationById(operationId: String): SyncOperation?

    @Query("DELETE FROM sync_operations WHERE isSynced = 1 AND createdAt < :cutoffTime")
    suspend fun deleteOldSyncedOperations(cutoffTime: Long)

    @Query("UPDATE sync_operations SET attemptCount = attemptCount + 1, lastAttemptAt = :timestamp WHERE id = :operationId")
    suspend fun incrementRetryCount(operationId: String, timestamp: Long)

    @Query("UPDATE sync_operations SET isSynced = 1 WHERE id = :operationId")
    suspend fun markAsSynced(operationId: String)

    @Query("SELECT COUNT(*) FROM sync_operations WHERE isSynced = 0")
    fun getPendingOperationCount(): Flow<Int>
}
