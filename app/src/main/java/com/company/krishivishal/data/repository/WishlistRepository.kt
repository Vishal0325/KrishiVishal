package com.company.krishivishal.data.repository

import com.company.krishivishal.data.local.ProductDao
import com.company.krishivishal.data.model.Product
import com.company.krishivishal.data.model.WishlistItem
import com.company.krishivishal.utils.Resource
import com.company.krishivishal.utils.networkBoundResource
import com.company.krishivishal.utils.safeCall
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.tasks.await
import javax.inject.Inject
import javax.inject.Singleton

interface WishlistRepository {
    fun getWishlist(userId: String): Flow<Resource<List<Product>>>
    fun addToWishlist(item: WishlistItem): Flow<Resource<Unit>>
    fun removeFromWishlist(item: WishlistItem): Flow<Resource<Unit>>
}

@Singleton
class WishlistRepositoryImpl @Inject constructor(
    private val firestore: FirebaseFirestore,
    private val productDao: com.company.krishivishal.data.local.ProductDao,
    private val guestWishlistDao: com.company.krishivishal.data.local.GuestWishlistDao
) : WishlistRepository {

    override fun getWishlist(userId: String): Flow<Resource<List<Product>>> = networkBoundResource(
        query = { productDao.getWishlistProducts(userId) },
        fetch = {
            val snapshot = firestore.collection("wishlist")
                .whereEqualTo("userId", userId)
                .get()
                .await()
            snapshot.toObjects(WishlistItem::class.java)
        },
        saveFetchResult = { items ->
            items.forEach { guestWishlistDao.insertToWishlist(it) }
        }
    )

    override fun addToWishlist(item: WishlistItem): Flow<Resource<Unit>> = safeCall {
        firestore.collection("wishlist").document(item.productId).set(item).await()
        guestWishlistDao.insertToWishlist(item)
    }

    override fun removeFromWishlist(item: WishlistItem): Flow<Resource<Unit>> = safeCall {
        firestore.collection("wishlist").document(item.productId).delete().await()
        guestWishlistDao.removeFromWishlist(item)
    }
}
