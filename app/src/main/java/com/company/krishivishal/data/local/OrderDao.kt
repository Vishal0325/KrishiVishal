package com.company.krishivishal.data.local

import androidx.room.*
import com.company.krishivishal.data.model.Order
import kotlinx.coroutines.flow.Flow

@Dao
interface OrderDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertOrder(order: Order)

    @Query("SELECT * FROM orders WHERE userId = :userId ORDER BY createdAt DESC")
    fun getOrdersByUserId(userId: String): Flow<List<Order>>

    @Query("SELECT * FROM orders WHERE userId = :userId ORDER BY createdAt DESC")
    suspend fun getOrdersByUserIdOnce(userId: String): List<Order>

    @Query("SELECT * FROM orders WHERE id = :orderId")
    suspend fun getOrderById(orderId: String): Order?

    @Query("SELECT * FROM orders WHERE id = :orderId")
    fun getOrderByIdFlow(orderId: String): Flow<Order?>
}
