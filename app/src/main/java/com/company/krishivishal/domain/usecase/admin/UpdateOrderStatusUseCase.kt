package com.company.krishivishal.domain.usecase.admin

import com.company.krishivishal.core.model.OrderStatus
import com.company.krishivishal.data.repository.OrderRepository
import com.company.krishivishal.core.util.Resource
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject

import com.company.krishivishal.data.repository.NotificationRepository
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

class UpdateOrderStatusUseCase @Inject constructor(
    private val repository: OrderRepository,
    private val notificationRepository: NotificationRepository
) {
    private val scope = CoroutineScope(Dispatchers.IO)

    operator fun invoke(orderId: String, status: OrderStatus): Flow<Resource<Unit>> {
        return repository.updateOrderStatus(orderId, status).onEach { res ->
            if (res is Resource.Success) {
                scope.launch {
                    repository.getOrderDetails(orderId).collect { orderRes ->
                        if (orderRes is Resource.Success) {
                            val order = orderRes.data
                            if (order != null) {
                                notificationRepository.sendNotification(
                                    userId = order.userId,
                                    title = "Order Update",
                                    message = "Your order #${orderId.takeLast(6).uppercase()} is now ${status.name}",
                                    type = "ORDER_STATUS"
                                )
                            }
                        }
                    }
                }
            }
        }
    }
}
