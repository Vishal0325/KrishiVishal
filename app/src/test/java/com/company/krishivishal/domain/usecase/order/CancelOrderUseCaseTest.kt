package com.company.krishivishal.domain.usecase.order

import com.company.krishivishal.data.repository.OrderRepository
import com.company.krishivishal.core.util.Resource
import io.mockk.every
import io.mockk.mockk
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertTrue
import org.junit.Test

class CancelOrderUseCaseTest {

    private val repository = mockk<OrderRepository>()
    private val useCase = CancelOrderUseCase(repository)

    @Test
    fun `invoke should call repository cancelOrder`() = runTest {
        val orderId = "o1"
        val reason = "Changed mind"
        
        every { repository.cancelOrder(orderId, reason) } returns flowOf(Resource.Success(Unit))

        useCase(orderId, reason).collect { resource ->
            assertTrue(resource is Resource.Success)
        }
    }
}
