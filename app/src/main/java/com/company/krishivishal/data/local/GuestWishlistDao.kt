package com.company.krishivishal.data.local

import androidx.room.*
import com.company.krishivishal.data.model.WishlistItem
import kotlinx.coroutines.flow.Flow

/**
 * DAO for managing Wishlist during guest mode and merging with cloud
 */
@Dao
interface GuestWishlistDao {

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertToWishlist(item: WishlistItem)

    /**
     * Fetch all items saved in guest mode (userId = 'guest_user')
     */
    @Query("SELECT * FROM wishlist_items WHERE userId = 'guest_user'")
    suspend fun getAllLocalWishlistItems(): List<WishlistItem>

    /**
     * Clear the guest wishlist after successful merge to Firestore
     */
    @Query("DELETE FROM wishlist_items WHERE userId = 'guest_user'")
    suspend fun clearLocalWishlist()

    @Delete
    suspend fun removeFromWishlist(item: WishlistItem)

    @Query("SELECT * FROM wishlist_items WHERE userId = :userId")
    fun getWishlistByUserId(userId: String): Flow<List<WishlistItem>>
}
