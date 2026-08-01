package com.company.krishivishal.data.repository

import com.company.krishivishal.data.local.WishlistDao
import com.company.krishivishal.core.model.Product
import com.company.krishivishal.core.model.WishlistItem
import com.company.krishivishal.data.sync.SyncManager
import com.company.krishivishal.di.IoDispatcher
import com.company.krishivishal.core.util.Constants
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.utils.networkBoundResource
import com.company.krishivishal.utils.safeCall
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.tasks.await
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

interface WishlistRepository {
    fun getWishlist(userId: String): Flow<Resource<List<Product>>>
    fun addToWishlist(item: WishlistItem): Flow<Resource<Unit>>
    fun removeFromWishlist(item: WishlistItem): Flow<Resource<Unit>>
    fun isWishlisted(productId: String, userId: String): Flow<Boolean>
}

@Singleton
class WishlistRepositoryImpl @Inject constructor(
    private val firestore: FirebaseFirestore,
    private val wishlistDao: WishlistDao,
    private val productDao: com.company.krishivishal.data.local.ProductDao,
    private val syncManager: SyncManager,
    @IoDispatcher private val ioDispatcher: CoroutineDispatcher
) : WishlistRepository {

    override fun getWishlist(userId: String): Flow<Resource<List<Product>>> = networkBoundResource(
        query = { productDao.getWishlistProducts(userId) },
        fetch = {
            firestore.collection("users")
                .document(userId)
                .collection("wishlist")
                .get()
                .await()
                .toObjects(WishlistItem::class.java)
        },
        saveFetchResult = { items ->
            wishlistDao.insertProducts(items)
        },
        shouldFetch = { userId != Constants.GUEST_USER_ID },
        dispatcher = ioDispatcher
    )

    override fun addToWishlist(item: WishlistItem): Flow<Resource<Unit>> = safeCall(ioDispatcher) {
        wishlistDao.insertToWishlist(item)
        Timber.d("Item added to local wishlist")

        syncManager.queueOperation(
            operationType = "ADD_TO_WISHLIST",
            entityType = "wishlist_item",
            entityId = item.productId,
            userId = item.userId,
            payload = mapOf(
                "productId" to item.productId,
                "productName" to item.productName,
                "price" to item.price,
                "imageUrl" to item.imageUrl,
                "timestamp" to item.timestamp
            )
        )
    }

    override fun removeFromWishlist(item: WishlistItem): Flow<Resource<Unit>> = safeCall(ioDispatcher) {
        wishlistDao.removeFromWishlist(item)
        Timber.d("Item removed from local wishlist")

        syncManager.queueOperation(
            operationType = "REMOVE_FROM_WISHLIST",
            entityType = "wishlist_item",
            entityId = item.productId,
            userId = item.userId,
            payload = emptyMap<String, Any>()
        )
    }

    override fun isWishlisted(productId: String, userId: String): Flow<Boolean> = 
        wishlistDao.isWishlisted(productId, userId)
}
