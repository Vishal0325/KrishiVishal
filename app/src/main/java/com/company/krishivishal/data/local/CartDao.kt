package com.company.krishivishal.data.local

import androidx.room.*
import com.company.krishivishal.core.model.CartItem
import kotlinx.coroutines.flow.Flow

@Dao
interface CartDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun addToCart(cartItem: CartItem)

    @Update
    suspend fun updateCartItem(cartItem: CartItem)

    @Delete
    suspend fun deleteCartItem(cartItem: CartItem)

    @Query("SELECT * FROM cart_items WHERE userId = :userId")
    fun getCartByUserId(userId: String): Flow<List<CartItem>>

    @Transaction
    @Query("SELECT * FROM cart_items WHERE userId = :userId")
    fun getCartWithProducts(userId: String): Flow<List<com.company.krishivishal.core.model.CartWithProduct>>

    @Query("SELECT SUM(quantity) FROM cart_items WHERE userId = :userId")
    fun getCartCount(userId: String): Flow<Int?>

    @Query("UPDATE cart_items SET isSelected = :isSelected WHERE id = :itemId")
    suspend fun updateSelection(itemId: String, isSelected: Boolean)

    @Query("UPDATE cart_items SET isSelected = :isSelected WHERE userId = :userId")
    suspend fun selectAll(userId: String, isSelected: Boolean)

    @Query("DELETE FROM cart_items WHERE userId = :userId AND isSelected = 1")
    suspend fun deleteSelected(userId: String)

    @Query("DELETE FROM cart_items WHERE userId = :userId")
    suspend fun clearCart(userId: String)
}
