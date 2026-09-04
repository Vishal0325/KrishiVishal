package com.company.krishivishal.data.repository

import com.company.krishivishal.data.local.OrderDao
import com.company.krishivishal.data.local.CartDao
import com.company.krishivishal.core.model.Order
import com.company.krishivishal.core.model.OrderStatus
import com.company.krishivishal.core.model.Product
import com.company.krishivishal.data.mapper.toProduct
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.utils.networkBoundResource
import com.company.krishivishal.utils.safeCall
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FieldValue
import com.google.firebase.functions.FirebaseFunctions
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.tasks.await
import javax.inject.Inject
import javax.inject.Singleton
import com.company.krishivishal.di.IoDispatcher
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn

/**
 * Result of a successful order creation.
 * @param orderId       Our internal Firestore order document ID.
 * @param totalAmount   Final payable amount in INR.
 * @param customerOtp   OTP for delivery verification.
 * @param razorpayOrderId  Server-locked Razorpay Order ID. Non-null only for
 *                         RAZORPAY_ONLINE payments. The Razorpay SDK MUST use
 *                         this ID — amount is enforced server-side.
 */
data class CreateOrderResult(
    val orderId: String,
    val totalAmount: Double,
    val customerOtp: String,
    val razorpayOrderId: String? = null
)

interface OrderRepository {
    fun getOrders(userId: String): Flow<Resource<List<Order>>>
    // V4: placeOrder (Direct Write) is deprecated and blocked by security rules.
    // Use createOrderViaFunction instead for secure, server-side validated orders.
    fun createOrderViaFunction(
        cartItems: List<com.company.krishivishal.core.model.CartItem>,
        address: String,
        paymentMethod: String,
        userName: String,
        userPhone: String,
        lat: Double = 0.0,
        lng: Double = 0.0
    ): Flow<Resource<CreateOrderResult>>
    fun verifyPayment(
        orderId: String,
        paymentId: String,
        orderRazorpayId: String,
        signature: String
    ): Flow<Resource<Unit>>
    fun getOrderDetails(orderId: String): Flow<Resource<Order?>>
    fun updateOrderStatus(orderId: String, status: OrderStatus): Flow<Resource<Unit>>
    fun cancelOrder(orderId: String, reason: String): Flow<Resource<Unit>>
    fun getSuccessfulProducts(userId: String): Flow<Resource<List<Product>>>
}

@Singleton
class OrderRepositoryImpl @Inject constructor(
    private val firestore: FirebaseFirestore,
    private val functions: FirebaseFunctions,
    private val orderDao: OrderDao,
    @param:IoDispatcher private val ioDispatcher: CoroutineDispatcher
) : OrderRepository {

    override fun getOrders(userId: String): Flow<Resource<List<Order>>> = networkBoundResource<List<Order>, List<Order>>(
        query = { orderDao.getOrdersByUserId(userId) },
        fetch = {
            val snapshot = firestore.collection("orders")
                .whereEqualTo("userId", userId)
                .get()
                .await()
            snapshot.toObjects(Order::class.java)
        },
        saveFetchResult = { orders ->
            orders.forEach { orderDao.insertOrder(it) }
        },
        dispatcher = ioDispatcher
    )

    override fun createOrderViaFunction(
        cartItems: List<com.company.krishivishal.core.model.CartItem>,
        address: String,
        paymentMethod: String,
        userName: String,
        userPhone: String,
        lat: Double,
        lng: Double
    ): Flow<Resource<CreateOrderResult>> = flow {
        emit(Resource.Loading())

        // Step 1: Ensure user is authenticated with a fresh, valid token
        val auth = com.google.firebase.auth.FirebaseAuth.getInstance()
        val currentUser = auth.currentUser
        if (currentUser == null) {
            emit(Resource.Error("लॉगिन ज़रूरी है! कृपया लॉगिन करें।"))
            return@flow
        }

        // Force-refresh the ID token with retry (up to 3 attempts)
        var freshToken: String? = null
        for (attempt in 1..3) {
            try {
                val tokenResult = currentUser.getIdToken(true).await()
                freshToken = tokenResult.token
                if (!freshToken.isNullOrBlank()) {
                    android.util.Log.d("OrderRepo", "Token refreshed on attempt $attempt: ${freshToken.take(10)}...")
                    break
                }
            } catch (e: Exception) {
                android.util.Log.w("OrderRepo", "Token refresh attempt $attempt failed: ${e.message}")
                if (attempt < 3) kotlinx.coroutines.delay(500L * attempt)
            }
        }

        if (freshToken.isNullOrBlank()) {
            android.util.Log.e("OrderRepo", "Token refresh completely failed after 3 attempts")
            emit(Resource.Error("Authentication failed. Please logout and login again."))
            return@flow
        }

        // Small wait for Firebase SDK to propagate the refreshed auth state internally
        kotlinx.coroutines.delay(300)

        // Step 2: Build the data payload
        val data = hashMapOf(
            "cartItems" to cartItems.map {
                hashMapOf(
                    "productId" to it.productId,
                    "quantity" to it.quantity,
                    "variantId" to it.variantId
                )
            },
            "address" to address,
            "paymentMethod" to paymentMethod,
            "userName" to userName,
            "userPhone" to userPhone,
            "targetLat" to lat,
            "targetLng" to lng
        )

        // Step 3: Call Cloud Function via Firebase SDK (handles auth token automatically)
        var lastException: Exception? = null
        for (attempt in 1..2) {
            try {
                android.util.Log.d("OrderRepo", "Calling createOrder via Firebase SDK (attempt $attempt)...")

                val result = functions
                    .getHttpsCallable("createOrder")
                    .call(data)
                    .await()

                @Suppress("UNCHECKED_CAST")
                val resultMap = result.data as? Map<String, Any>
                    ?: throw Exception("Invalid response from server")

                val orderId = resultMap["orderId"] as? String
                    ?: throw Exception("orderId missing in response")
                val totalAmount = when (val amt = resultMap["totalAmount"]) {
                    is Double -> amt
                    is Long -> amt.toDouble()
                    is Int -> amt.toDouble()
                    else -> throw Exception("totalAmount missing in response")
                }
                val customerOTP = resultMap["customerOTP"] as? String ?: ""
                val razorpayOrderId = resultMap["razorpayOrderId"] as? String

                android.util.Log.d("OrderRepo", "Order Success! ID: $orderId, RZP Order: $razorpayOrderId")
                emit(Resource.Success(CreateOrderResult(
                    orderId = orderId,
                    totalAmount = totalAmount,
                    customerOtp = customerOTP,
                    razorpayOrderId = razorpayOrderId
                )))
                return@flow
            } catch (e: Exception) {
                android.util.Log.e("OrderRepo", "Order attempt $attempt - Error: ${e.javaClass.simpleName}: ${e.message}")
                lastException = e
                // If UNAUTHENTICATED on first attempt, refresh token once more and retry
                if (attempt == 1 && e.message?.contains("UNAUTHENTICATED", ignoreCase = true) == true) {
                    android.util.Log.w("OrderRepo", "UNAUTHENTICATED on attempt 1, refreshing token and retrying...")
                    try {
                        currentUser.getIdToken(true).await()
                        kotlinx.coroutines.delay(800)
                    } catch (tokenEx: Exception) {
                        android.util.Log.e("OrderRepo", "Retry token refresh also failed: ${tokenEx.message}")
                    }
                } else if (attempt == 1) {
                    // Retry with small backoff for transient network errors
                    kotlinx.coroutines.delay(1000)
                }
            }
        }

        // Emit clear friendly error if all attempts fail
        val friendlyMsg = com.company.krishivishal.utils.NetworkErrorHandler.asFriendlyError(lastException ?: Exception("Order creation failed."))
        emit(Resource.Error(friendlyMsg))
    }.flowOn(ioDispatcher)



    override fun verifyPayment(
        orderId: String,
        paymentId: String,
        orderRazorpayId: String,
        signature: String
    ): Flow<Resource<Unit>> = flow {
        emit(Resource.Loading())
        try {
            val data = hashMapOf(
                "orderId" to orderId,
                "razorpayPaymentId" to paymentId,
                "razorpayOrderId" to orderRazorpayId,
                "razorpaySignature" to signature
            )

            // Firebase SDK automatically attaches the auth token — no manual token needed
            functions
                .getHttpsCallable("verifyPayment")
                .call(data)
                .await()

            emit(Resource.Success(Unit))
        } catch (e: Exception) {
            emit(Resource.Error(com.company.krishivishal.utils.NetworkErrorHandler.asFriendlyError(e)))
        }
    }.flowOn(ioDispatcher)


    override fun getOrderDetails(orderId: String): Flow<Resource<Order?>> = networkBoundResource<Order?, Order?>(
        query = { orderDao.getOrderByIdFlow(orderId) },
        fetch = {
            firestore.collection("orders").document(orderId)
                .get()
                .await()
                .toObject(Order::class.java)
        },
        saveFetchResult = { order ->
            order?.let { orderDao.insertOrder(it) }
        },
        dispatcher = ioDispatcher
    )

    override fun updateOrderStatus(orderId: String, status: OrderStatus): Flow<Resource<Unit>> = safeCall(ioDispatcher) {
        firestore.collection("orders").document(orderId).update("status", status.name).await()
        
        val localOrder = orderDao.getOrderById(orderId)
        if (localOrder != null) {
            orderDao.insertOrder(localOrder.copy(status = status.name))
        }
        Unit
    }

    override fun cancelOrder(orderId: String, reason: String): Flow<Resource<Unit>> = flow {
        emit(Resource.Loading())
        try {
            val data = hashMapOf(
                "orderId" to orderId,
                "reason" to reason
            )

            functions.getHttpsCallable("cancelOrder")
                .call(data)
                .await()

            // Update local DB
            val localOrder = orderDao.getOrderById(orderId)
            if (localOrder != null) {
                orderDao.insertOrder(localOrder.copy(status = OrderStatus.CANCELLED.name))
            }
            
            emit(Resource.Success(Unit))
        } catch (e: Exception) {
            emit(Resource.Error(com.company.krishivishal.utils.NetworkErrorHandler.asFriendlyError(e)))
        }
    }.flowOn(ioDispatcher)

    override fun getSuccessfulProducts(userId: String): Flow<Resource<List<Product>>> = flow {
        emit(Resource.Loading())
        try {
            val snapshot = firestore.collection("orders")
                .whereEqualTo("userId", userId)
                .whereIn("status", listOf("DELIVERED", "PAID", "CONFIRMED"))
                .get()
                .await()
            
            val orders = snapshot.toObjects(Order::class.java)
            val productIds = orders.flatMap { it.items }.map { it.productId }.distinct().take(10)
            
            if (productIds.isEmpty()) {
                emit(Resource.Success(emptyList()))
                return@flow
            }
            
            val products = firestore.collection("products")
                .whereIn("id", productIds)
                .get()
                .await()
                .documents
                .mapNotNull { it.toProduct() }
                .filter { it.isActive }
            emit(Resource.Success(products))
        } catch (e: Exception) {
            emit(Resource.Error(e.localizedMessage ?: "Error fetching previous purchases"))
        }
    }.flowOn(ioDispatcher)
}
