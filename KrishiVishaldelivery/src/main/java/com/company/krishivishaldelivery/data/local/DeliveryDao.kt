package com.company.krishivishaldelivery.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface DeliveryDao {
    @Query("SELECT * FROM delivery_orders")
    fun getAllOrders(): Flow<List<DeliveryOrderEntity>>

    @Query("SELECT * FROM delivery_orders WHERE id = :orderId")
    suspend fun getOrderById(orderId: String): DeliveryOrderEntity?

    @Query("SELECT * FROM delivery_orders WHERE isPendingSync = 1")
    suspend fun getPendingSyncOrders(): List<DeliveryOrderEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertOrders(orders: List<DeliveryOrderEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertOrder(order: DeliveryOrderEntity)

    @Query("UPDATE delivery_orders SET status = :status, isPendingSync = :isPendingSync WHERE id = :orderId")
    suspend fun updateOrderStatus(orderId: String, status: String, isPendingSync: Boolean = true)

    @Query("UPDATE delivery_orders SET isCashDeposited = 1, isPendingSync = :isPendingSync WHERE riderId = :riderId AND isCOD = 1 AND status = 'DELIVERED'")
    suspend fun markOrdersAsDeposited(riderId: String, isPendingSync: Boolean = true)

    @Query("UPDATE delivery_orders SET isPendingSync = :isPendingSync WHERE id = :orderId")
    suspend fun updateSyncStatus(orderId: String, isPendingSync: Boolean)

    @Query("DELETE FROM delivery_orders WHERE id = :orderId")
    suspend fun deleteOrderById(orderId: String)

    @Query("DELETE FROM delivery_orders")
    suspend fun clearOrders()
}
