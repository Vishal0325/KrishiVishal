package com.company.krishivishal.data.local

import androidx.room.*
import com.company.krishivishal.core.model.WishlistItem
import kotlinx.coroutines.flow.Flow

/**
 * DAO for managing Wishlist with offline sync support
 */
@Dao
interface WishlistDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertToWishlist(item: WishlistItem)

    @Delete
    suspend fun removeFromWishlist(item: WishlistItem)

    @Query("SELECT * FROM wishlist_items WHERE userId = :userId ORDER BY timestamp DESC")
    fun getWishlistByUserId(userId: String): Flow<List<WishlistItem>>

    @Query("SELECT EXISTS(SELECT 1 FROM wishlist_items WHERE productId = :productId AND userId = :userId)")
    fun isWishlisted(productId: String, userId: String): Flow<Boolean>

    @Query("SELECT * FROM wishlist_items WHERE userId = 'guest_user'")
    suspend fun getAllGuestItems(): List<WishlistItem>

    @Query("DELETE FROM wishlist_items WHERE userId = 'guest_user'")
    suspend fun clearGuestWishlist()
    
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertProducts(items: List<WishlistItem>)
}
