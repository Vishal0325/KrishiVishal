package com.company.krishivishal.data.repository

import com.company.krishivishal.data.local.OrderDao
import com.company.krishivishal.data.local.CartDao
import com.company.krishivishal.data.model.Order
import com.company.krishivishal.data.model.OrderStatus
import com.company.krishivishal.utils.Resource
import com.company.krishivishal.utils.networkBoundResource
import com.company.krishivishal.utils.safeCall
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.FieldValue
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.tasks.await
import javax.inject.Inject
import javax.inject.Singleton
import com.company.krishivishal.di.IoDispatcher
import kotlinx.coroutines.CoroutineDispatcher

interface OrderRepository {
    fun getOrders(userId: String): Flow<Resource<List<Order>>>
    fun placeOrder(order: Order): Flow<Resource<Unit>>
    fun getOrderDetails(orderId: String): Flow<Resource<Order?>>
    fun updateOrderStatus(orderId: String, status: OrderStatus): Flow<Resource<Unit>>
    fun cancelOrder(orderId: String, reason: String): Flow<Resource<Unit>>
}

@Singleton
class OrderRepositoryImpl @Inject constructor(
    private val firestore: FirebaseFirestore,
    private val orderDao: OrderDao,
    private val cartDao: CartDao,
    @param:IoDispatcher private val ioDispatcher: CoroutineDispatcher
) : OrderRepository {

    override fun getOrders(userId: String): Flow<Resource<List<Order>>> = networkBoundResource(
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
            
            // Deduct stock
            order.items.forEach { item ->
                val productRef = firestore.collection("products").document(item.productId)
                transaction.update(productRef, "stockQuantity", FieldValue.increment(-item.quantity.toLong()))
            }
        }.await()

        orderDao.insertOrder(order)
        cartDao.clearCart(order.userId)
    }

    override fun getOrderDetails(orderId: String): Flow<Resource<Order?>> = networkBoundResource(
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
    }

    override fun cancelOrder(orderId: String, reason: String): Flow<Resource<Unit>> = safeCall(ioDispatcher) {
        val orderRef = firestore.collection("orders").document(orderId)
        
        firestore.runTransaction { transaction ->
            val snapshot = transaction.get(orderRef)
            val order = snapshot.toObject(Order::class.java) ?: throw Exception("Order not found")
            val currentStatus = OrderStatus.fromString(order.status)
            
            if (currentStatus in listOf(OrderStatus.SHIPPED, OrderStatus.DELIVERED, OrderStatus.CANCELLED)) {
                throw Exception("Order cannot be cancelled in $currentStatus status")
            }
            
            transaction.update(orderRef, mapOf(
                "status" to OrderStatus.CANCELLED.name,
                "cancellationReason" to reason,
                "cancelledAt" to FieldValue.serverTimestamp()
            ))

            // Revert stock
            order.items.forEach { item ->
                val productRef = firestore.collection("products").document(item.productId)
                transaction.update(productRef, "stockQuantity", FieldValue.increment(item.quantity.toLong()))
            }
        }.await()
        
        val localOrder = orderDao.getOrderById(orderId)
        if (localOrder != null) {
            orderDao.insertOrder(localOrder.copy(status = OrderStatus.CANCELLED.name))
        }
    }
}
