package com.company.krishivishal.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.company.krishivishal.core.model.Warehouse
import kotlinx.coroutines.flow.Flow

@Dao
interface WarehouseDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertWarehouse(warehouse: Warehouse)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertWarehouses(warehouses: List<Warehouse>)

    @Query("SELECT * FROM warehouses WHERE isActive = 1")
    fun getActiveWarehouses(): Flow<List<Warehouse>>

    @Query("SELECT * FROM warehouses WHERE id = :id")
    suspend fun getWarehouseById(id: String): Warehouse?

    @Query("DELETE FROM warehouses")
    suspend fun clearAll()
}
