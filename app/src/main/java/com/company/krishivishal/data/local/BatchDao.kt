package com.company.krishivishal.data.local

import androidx.room.*
import com.company.krishivishal.core.model.Batch
import kotlinx.coroutines.flow.Flow

@Dao
interface BatchDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertBatches(batches: List<Batch>)

    @Query("SELECT * FROM batches WHERE skuCode = :skuCode AND isActive = 1 ORDER BY expiryDate ASC")
    fun getBatchesBySku(skuCode: String): Flow<List<Batch>>

    @Query("SELECT * FROM batches WHERE expiryDate IS NOT NULL AND expiryDate <= :thresholdEpoch AND isActive = 1 ORDER BY expiryDate ASC")
    fun getExpiringBatches(thresholdEpoch: Long): Flow<List<Batch>>

    @Query("SELECT * FROM batches WHERE batchId = :batchId")
    suspend fun getBatchById(batchId: String): Batch?

    @Query("DELETE FROM batches WHERE batchId = :batchId")
    suspend fun deleteBatch(batchId: String)
}
