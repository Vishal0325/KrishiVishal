package com.company.krishivishal.domain.usecase.order

import com.company.krishivishal.core.model.Order
import com.company.krishivishal.core.model.OrderStatus
import com.company.krishivishal.data.repository.OrderRepository
import com.company.krishivishal.core.util.Resource
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject

class GetOrdersUseCase @Inject constructor(
    private val repository: OrderRepository
) {
    operator fun invoke(userId: String, status: OrderStatus? = null): Flow<Resource<List<Order>>> {
        return repository.getOrders(userId).map { resource ->
            if (status != null && resource is Resource.Success) {
                Resource.Success(resource.data?.filter { it.orderStatus == status } ?: emptyList())
            } else resource
        }
    }
}
