package com.company.krishivishal.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.company.krishivishal.core.model.InventoryMovement
import kotlinx.coroutines.flow.Flow

@Dao
interface InventoryMovementDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertMovement(movement: InventoryMovement)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertMovements(movements: List<InventoryMovement>)

    @Query("SELECT * FROM inventory_movements WHERE skuCode = :skuCode ORDER BY timestamp DESC")
    fun getMovementsBySkuCode(skuCode: String): Flow<List<InventoryMovement>>

    @Query("SELECT * FROM inventory_movements WHERE referenceId = :referenceId ORDER BY timestamp DESC")
    fun getMovementsByReferenceId(referenceId: String): Flow<List<InventoryMovement>>

    @Query("SELECT * FROM inventory_movements ORDER BY timestamp DESC LIMIT :limit")
    fun getRecentMovements(limit: Int = 50): Flow<List<InventoryMovement>>

    @Query("DELETE FROM inventory_movements WHERE timestamp < :beforeTimestamp")
    suspend fun deleteOldMovements(beforeTimestamp: Long)
}
