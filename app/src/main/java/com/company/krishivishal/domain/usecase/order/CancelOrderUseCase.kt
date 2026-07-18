package com.company.krishivishal.domain.usecase.order

import com.company.krishivishal.data.repository.OrderRepository
import com.company.krishivishal.utils.Resource
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject

class CancelOrderUseCase @Inject constructor(
    private val repository: OrderRepository
) {
    operator fun invoke(orderId: String, reason: String): Flow<Resource<Unit>> {
        return repository.cancelOrder(orderId, reason)
    }
}
