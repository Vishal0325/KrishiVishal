package com.company.krishivishal.data.repository

import com.company.krishivishal.data.local.OrderDao
import com.company.krishivishal.data.local.CartDao
import com.company.krishivishal.core.model.Order
import com.company.krishivishal.core.model.OrderStatus
import com.company.krishivishal.core.model.Product
import com.google.firebase.firestore.DocumentSnapshot
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
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.RequestBody.Companion.toRequestBody
import com.company.krishivishal.di.IoDispatcher
import com.company.krishivishal.BuildConfig
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope

interface OrderRepository {
    fun getOrders(userId: String): Flow<Resource<List<Order>>>
    fun placeOrder(order: Order): Flow<Resource<Unit>>
    fun createOrderViaFunction(
        cartItems: List<com.company.krishivishal.core.model.CartItem>,
        address: String,
        paymentMethod: String,
        userName: String,
        userPhone: String,
        lat: Double = 0.0,
        lng: Double = 0.0
    ): Flow<Resource<Triple<String, Double, String>>>
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
    private val cartDao: CartDao,
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

    override fun placeOrder(order: Order): Flow<Resource<Unit>> = safeCall(ioDispatcher) {
        firestore.runTransaction { transaction ->
            val orderRef = firestore.collection("orders").document(order.id)
            transaction.set(orderRef, order)
            
            // Deduct stock (Product and Variant specific)
            order.items.forEach { item ->
                val productRef = firestore.collection("products").document(item.productId)
                val productSnap = transaction.get(productRef)
                val product = productSnap.toProduct() ?: return@forEach
                
                // 1. Update main product document's overall stock
                transaction.update(productRef, "stockQuantity", FieldValue.increment(-item.quantity.toLong()))
                
                // 2. If this is a variant, update its specific stock in sub-collection AND embedded list
                val variantId = item.variantId
                if (!variantId.isNullOrBlank()) {
                    // Update sub-collection (standalone)
                    val variantRef = productRef.collection("variants").document(variantId)
                    transaction.update(variantRef, "stock", FieldValue.increment(-item.quantity.toLong()))
                    
                    // Update embedded list in product document for search consistency
                    val updatedVariants = product.variants.map { v ->
                        if (v.id == variantId) v.copy(stock = v.stock - item.quantity) else v
                    }
                    transaction.update(productRef, "variants", updatedVariants)
                }
            }
        }.await()

        orderDao.insertOrder(order)
        cartDao.clearCart(order.userId)
        Unit
    }

    override fun createOrderViaFunction(
        cartItems: List<com.company.krishivishal.core.model.CartItem>,
        address: String,
        paymentMethod: String,
        userName: String,
        userPhone: String,
        lat: Double,
        lng: Double
    ): Flow<Resource<Triple<String, Double, String>>> = flow {
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
            "userPhone" to userPhone
        )

        // Step 3: Call Cloud Function with retry on UNAUTHENTICATED (using REST fallback to bypass SDK issues)
        var lastException: Exception? = null
        for (attempt in 1..2) {
            try {
                android.util.Log.d("OrderRepo", "Calling createOrder REST (attempt $attempt)...")
                
                val client = okhttp3.OkHttpClient()
                val jsonBody = org.json.JSONObject()
                val dataObj = org.json.JSONObject()
                val cartArray = org.json.JSONArray()
                cartItems.forEach {
                    val itemObj = org.json.JSONObject()
                    itemObj.put("productId", it.productId)
                    itemObj.put("quantity", it.quantity)
                    itemObj.put("variantId", it.variantId ?: org.json.JSONObject.NULL)
                    cartArray.put(itemObj)
                }
                dataObj.put("cartItems", cartArray)
                dataObj.put("address", address)
                dataObj.put("paymentMethod", paymentMethod)
                dataObj.put("userName", userName)
                dataObj.put("userPhone", userPhone)
                dataObj.put("targetLat", lat)
                dataObj.put("targetLng", lng)
                jsonBody.put("data", dataObj)

                val mediaType = "application/json; charset=utf-8".toMediaType()
                val requestBody = jsonBody.toString().toRequestBody(mediaType)

                val request = okhttp3.Request.Builder()
                    .url("${BuildConfig.FUNCTIONS_BASE_URL}createOrder")
                    .addHeader("Authorization", "Bearer $freshToken")
                    .post(requestBody)
                    .build()

                val response = client.newCall(request).execute()

                if (!response.isSuccessful) {
                    val errorBody = response.body?.string() ?: ""
                    val code = response.code
                    if (code == 401 || code == 403 || errorBody.contains("UNAUTHENTICATED", true)) {
                        throw Exception("UNAUTHENTICATED")
                    }
                    throw Exception("HTTP $code: $errorBody")
                }

                val responseStr = response.body?.string() ?: ""
                val resJson = org.json.JSONObject(responseStr).getJSONObject("result")
                val orderId = resJson.getString("orderId")
                val totalAmount = resJson.getDouble("totalAmount")
                val customerOTP = resJson.optString("customerOTP", "")

                android.util.Log.d("OrderRepo", "Order Success! ID: $orderId, PIN: $customerOTP")
                emit(Resource.Success(Triple(orderId, totalAmount, customerOTP)))
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
                    break // Non-auth errors should not be retried
                }
            }
        }

        // All attempts exhausted — emit a user-friendly error
        val e = lastException
        android.util.Log.e("OrderRepo", "All order attempts failed. Last error: ${e?.message}")
        val friendlyMsg = com.company.krishivishal.utils.NetworkErrorHandler.asFriendlyError(e ?: Exception("Unknown error"))
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
            val auth = com.google.firebase.auth.FirebaseAuth.getInstance()
            val token = auth.currentUser?.getIdToken(false)?.await()?.token ?: throw Exception("UNAUTHENTICATED")

            val client = okhttp3.OkHttpClient()
            val jsonBody = org.json.JSONObject()
            val dataObj = org.json.JSONObject()
            dataObj.put("orderId", orderId)
            dataObj.put("razorpayPaymentId", paymentId)
            dataObj.put("razorpayOrderId", orderRazorpayId)
            dataObj.put("razorpaySignature", signature)
            jsonBody.put("data", dataObj)

            val mediaType = "application/json; charset=utf-8".toMediaType()
            val requestBody = jsonBody.toString().toRequestBody(mediaType)

            val request = okhttp3.Request.Builder()
                .url("${BuildConfig.FUNCTIONS_BASE_URL}verifyPayment")
                .addHeader("Authorization", "Bearer $token")
                .post(requestBody)
                .build()

            val response = client.newCall(request).execute()

            if (!response.isSuccessful) {
                val errorBody = response.body?.string() ?: ""
                val code = response.code
                if (code == 401 || code == 403 || errorBody.contains("UNAUTHENTICATED", true)) {
                    throw Exception("UNAUTHENTICATED")
                }
                throw Exception("HTTP $code: $errorBody")
            }
            
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
            
            val productSnaps = coroutineScope {
                productIds.map { id ->
                    async { firestore.collection("products").document(id).get().await() }
                }.awaitAll()
            }
            
            val products = productSnaps.mapNotNull { it.toProduct() }.filter { it.isActive }
            emit(Resource.Success(products))
        } catch (e: Exception) {
            emit(Resource.Error(e.localizedMessage ?: "Error fetching previous purchases"))
        }
    }.flowOn(ioDispatcher)
}
