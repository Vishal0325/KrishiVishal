package com.company.krishivishal.domain.usecase.order

import com.company.krishivishal.core.model.Order
import com.company.krishivishal.core.model.OrderStatus
import com.company.krishivishal.data.repository.OrderRepository
import com.company.krishivishal.core.util.Resource
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

class GetOrdersUseCaseTest {

    private val repository = mockk<OrderRepository>()
    private val useCase = GetOrdersUseCase(repository)

    @Test
    fun `invoke with status filter should return filtered orders`() = runTest {
        val userId = "u1"
        val orders = listOf(
            Order(id = "1", status = OrderStatus.PLACED.name),
            Order(id = "2", status = OrderStatus.SHIPPED.name)
        )
        
        every { repository.getOrders(userId) } returns flowOf(Resource.Success(orders))

        useCase(userId, OrderStatus.SHIPPED).collect { resource ->
            if (resource is Resource.Success) {
                assertEquals(1, resource.data?.size)
                assertEquals("2", resource.data?.first()?.id)
            }
        }
    }
}
