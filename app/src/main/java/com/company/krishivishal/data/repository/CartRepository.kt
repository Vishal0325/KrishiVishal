package com.company.krishivishal.data.repository

import com.company.krishivishal.data.local.CartDao
import com.company.krishivishal.core.model.CartItem
import com.company.krishivishal.core.model.CartWithProduct
import com.company.krishivishal.data.sync.SyncManager
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.utils.safeCall
import com.company.krishivishal.di.IoDispatcher
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

interface CartRepository {
    fun getCart(userId: String): Flow<Resource<List<CartItem>>>
    fun getCartWithProducts(userId: String): Flow<Resource<List<CartWithProduct>>>
    fun getCartCount(userId: String): Flow<Int>
    fun addToCart(cartItem: CartItem): Flow<Resource<Unit>>
    fun updateCartItem(cartItem: CartItem): Flow<Resource<Unit>>
    fun removeFromCart(cartItem: CartItem): Flow<Resource<Unit>>
    fun clearCart(userId: String): Flow<Resource<Unit>>
    fun updateSelection(itemId: String, isSelected: Boolean): Flow<Resource<Unit>>
    fun selectAll(userId: String, isSelected: Boolean): Flow<Resource<Unit>>
    fun deleteSelected(userId: String): Flow<Resource<Unit>>
}

@Singleton
class CartRepositoryImpl @Inject constructor(
    private val cartDao: CartDao,
    private val syncManager: SyncManager,
    @IoDispatcher private val ioDispatcher: CoroutineDispatcher
) : CartRepository {

    override fun getCart(userId: String): Flow<Resource<List<CartItem>>> = 
        cartDao.getCartByUserId(userId).map { Resource.Success(it) }

    override fun getCartWithProducts(userId: String): Flow<Resource<List<CartWithProduct>>> =
        cartDao.getCartWithProducts(userId).map { Resource.Success(it) }

    override fun getCartCount(userId: String): Flow<Int> = 
        cartDao.getCartCount(userId).map { it ?: 0 }

    override fun addToCart(cartItem: CartItem): Flow<Resource<Unit>> = safeCall(ioDispatcher) {
        cartDao.addToCart(cartItem)
        Timber.d("Item added to local cart")

        syncManager.queueOperation(
            operationType = "ADD_TO_CART",
            entityType = "cart_item",
            entityId = cartItem.id,
            userId = cartItem.userId,
            payload = mapOf(
                "productId" to cartItem.productId,
                "quantity" to cartItem.quantity,
                "variantId" to (cartItem.variantId ?: ""),
                "timestamp" to System.currentTimeMillis()
            )
        )
    }

    override fun updateCartItem(cartItem: CartItem): Flow<Resource<Unit>> = safeCall(ioDispatcher) {
        cartDao.updateCartItem(cartItem)
        Timber.d("Item updated in local cart")

        syncManager.queueOperation(
            operationType = "UPDATE_CART",
            entityType = "cart_item",
            entityId = cartItem.id,
            userId = cartItem.userId,
            payload = mapOf(
                "quantity" to cartItem.quantity,
                "timestamp" to System.currentTimeMillis()
            )
        )
    }

    override fun removeFromCart(cartItem: CartItem): Flow<Resource<Unit>> = safeCall(ioDispatcher) {
        cartDao.deleteCartItem(cartItem)
        Timber.d("Item removed from local cart")

        syncManager.queueOperation(
            operationType = "REMOVE_CART",
            entityType = "cart_item",
            entityId = cartItem.id,
            userId = cartItem.userId,
            payload = mapOf(
                "deletedAt" to System.currentTimeMillis()
            )
        )
    }

    override fun clearCart(userId: String): Flow<Resource<Unit>> = safeCall(ioDispatcher) {
        cartDao.clearCart(userId)
        Timber.d("Local cart cleared")

        syncManager.queueOperation(
            operationType = "CLEAR_CART",
            entityType = "cart",
            entityId = userId,
            userId = userId,
            payload = mapOf(
                "clearedAt" to System.currentTimeMillis()
            )
        )
    }

    override fun updateSelection(itemId: String, isSelected: Boolean): Flow<Resource<Unit>> = safeCall(ioDispatcher) {
        cartDao.updateSelection(itemId, isSelected)
    }

    override fun selectAll(userId: String, isSelected: Boolean): Flow<Resource<Unit>> = safeCall(ioDispatcher) {
        cartDao.selectAll(userId, isSelected)
    }

    override fun deleteSelected(userId: String): Flow<Resource<Unit>> = safeCall(ioDispatcher) {
        cartDao.deleteSelected(userId)
    }
}
