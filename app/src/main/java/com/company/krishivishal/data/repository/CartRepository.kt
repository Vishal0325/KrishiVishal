package com.company.krishivishal.data.repository

import com.company.krishivishal.data.local.CartDao
import com.company.krishivishal.core.model.CartItem
import com.company.krishivishal.core.model.CartWithProduct
import com.company.krishivishal.data.sync.SyncManager
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.utils.networkBoundResource
import com.company.krishivishal.utils.safeCall
import com.company.krishivishal.di.IoDispatcher
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.tasks.await
import com.company.krishivishal.utils.asFriendlyError
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

import com.company.krishivishal.core.model.Product

interface CartRepository {
    fun getCart(userId: String): Flow<Resource<List<CartItem>>>
    fun getCartWithProducts(userId: String): Flow<Resource<List<CartWithProduct>>>
    fun getCartCount(userId: String): Flow<Int>
    fun addToCart(cartItem: CartItem): Flow<Resource<Unit>>
    fun addToCart(product: Product, quantity: Int = 1, variantId: String? = null): Flow<Resource<Unit>>
    fun updateCartItem(cartItem: CartItem): Flow<Resource<Unit>>
    fun removeFromCart(cartItem: CartItem): Flow<Resource<Unit>>
    fun clearCart(userId: String): Flow<Resource<Unit>>
    fun updateSelection(itemId: String, isSelected: Boolean): Flow<Resource<Unit>>
    fun selectAll(userId: String, isSelected: Boolean): Flow<Resource<Unit>>
    fun deleteSelected(userId: String): Flow<Resource<Unit>>
}

@Singleton
class CartRepositoryImpl @Inject constructor(
    private val firestore: FirebaseFirestore,
    private val cartDao: CartDao,
    private val productDao: com.company.krishivishal.data.local.ProductDao,
    private val syncManager: SyncManager,
    @param:IoDispatcher private val ioDispatcher: CoroutineDispatcher
) : CartRepository {

    override fun getCart(userId: String): Flow<Resource<List<CartItem>>> = 
        cartDao.getCartByUserId(userId).map { Resource.Success(it) }

    override fun getCartWithProducts(userId: String): Flow<Resource<List<CartWithProduct>>> = networkBoundResource(
        query = { cartDao.getCartWithProducts(userId) },
        fetch = {
            // Also sync from Firestore to handle cross-device cart
            val snapshot = firestore.collection("users").document(userId).collection("cart").get().await()
            val remoteItems = snapshot.toObjects(CartItem::class.java)

            // Ensure Product and Variant exist locally in Room for all cart items
            for (item in remoteItems) {
                if (item.productId.isNotBlank()) {
                    val localProd = productDao.getProductById(item.productId)
                    if (localProd == null) {
                        try {
                            val prodDoc = firestore.collection("products").document(item.productId).get().await()
                            val remoteProd = prodDoc.toObject(Product::class.java)
                            if (remoteProd != null) {
                                productDao.insertProduct(remoteProd)
                            }
                        } catch (e: Exception) {
                            Timber.w("Failed to fetch product ${item.productId} for cart: ${e.message}")
                        }
                    }
                }
                if (!item.variantId.isNullOrBlank() && item.productId.isNotBlank()) {
                    val localVariants = productDao.getVariantsByProductIdOnce(item.productId)
                    if (localVariants.none { it.id == item.variantId }) {
                        try {
                            val varDoc = firestore.collection("products").document(item.productId)
                                .collection("variants").document(item.variantId!!).get().await()
                            val remoteVar = varDoc.toObject(com.company.krishivishal.core.model.Variant::class.java)
                            if (remoteVar != null) {
                                productDao.insertVariants(listOf(remoteVar))
                            }
                        } catch (e: Exception) {
                            Timber.w("Failed to fetch variant ${item.variantId} for cart: ${e.message}")
                        }
                    }
                }
            }
            remoteItems
        },
        saveFetchResult = { remoteItems ->
            if (remoteItems.isNotEmpty()) {
                cartDao.insertCartItems(remoteItems)
            }
        },
        dispatcher = ioDispatcher
    )

    override fun getCartCount(userId: String): Flow<Int> = 
        cartDao.getCartCount(userId).map { it ?: 0 }

    override fun addToCart(cartItem: CartItem): Flow<Resource<Unit>> = safeCall(ioDispatcher) {
        cartDao.addToCart(cartItem)
        Timber.d("Item added to local cart")

        try {
            com.google.firebase.messaging.FirebaseMessaging.getInstance().subscribeToTopic("segment_abandoned_cart")
        } catch (e: Exception) {
            Timber.w("Failed to subscribe to segment_abandoned_cart: ${e.message}")
        }

        syncManager.queueOperation(
            operationType = "ADD_TO_CART",
            entityType = "cart_item",
            entityId = cartItem.id,
            userId = cartItem.userId,
            payload = mapOf(
                "id" to cartItem.id,
                "user_id" to cartItem.userId,
                "userId" to cartItem.userId,
                "product_id" to cartItem.productId,
                "productId" to cartItem.productId,
                "variant_id" to (cartItem.variantId ?: ""),
                "variantId" to (cartItem.variantId ?: ""),
                "quantity" to cartItem.quantity,
                "sku_code" to (cartItem.skuCode ?: ""),
                "skuCode" to (cartItem.skuCode ?: ""),
                "is_selected" to cartItem.isSelected,
                "isSelected" to cartItem.isSelected,
                "timestamp" to System.currentTimeMillis()
            )
        )
    }

    override fun addToCart(product: Product, quantity: Int, variantId: String?): Flow<Resource<Unit>> {
        val currentUserId = com.google.firebase.auth.FirebaseAuth.getInstance().currentUser?.uid
            ?: com.company.krishivishal.core.util.Constants.GUEST_USER_ID
        val cartItem = CartItem(
            id = java.util.UUID.randomUUID().toString(),
            userId = currentUserId,
            productId = product.id,
            variantId = variantId,
            quantity = quantity,
            skuCode = product.variants.find { it.id == variantId }?.skuCode ?: product.hsnCode
        )
        return addToCart(cartItem)
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

        try {
            com.google.firebase.messaging.FirebaseMessaging.getInstance().unsubscribeFromTopic("segment_abandoned_cart")
        } catch (e: Exception) {
            Timber.w("Failed to unsubscribe from segment_abandoned_cart: ${e.message}")
        }

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

    override fun deleteSelected(userId: String): Flow<Resource<Unit>> = flow<Resource<Unit>> {
        emit(Resource.Loading())
        try {
            val selectedIds = cartDao.getSelectedCartItemIds(userId)
            cartDao.deleteSelected(userId)
            
            selectedIds.forEach { id ->
                syncManager.queueOperation(
                    operationType = "REMOVE_CART",
                    entityType = "cart_item",
                    entityId = id,
                    userId = userId,
                    payload = mapOf(
                        "deletedAt" to System.currentTimeMillis()
                    )
                )
            }
            emit(Resource.Success(Unit))
        } catch (e: Exception) {
            emit(Resource.Error(e.asFriendlyError()))
        }
    }.flowOn(ioDispatcher)
}
