package com.company.krishivishal.domain.usecase.checkout

import com.company.krishivishal.data.model.*
import com.company.krishivishal.data.repository.OrderRepository
import com.company.krishivishal.domain.usecase.cart.CalculateCartTotalsUseCase
import com.company.krishivishal.utils.Resource
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import org.junit.Test

class PlaceOrderUseCaseTest {

    private val orderRepository = mockk<OrderRepository>()
    private val calculateCartTotalsUseCase = CalculateCartTotalsUseCase()
    private val useCase = PlaceOrderUseCase(orderRepository, calculateCartTotalsUseCase)

    @Test
    fun `placeOrder should call repository with correctly mapped order`() = runTest {
        val userId = "u1"
        val product = Product(id = "p1", name = "Product 1", basePrice = 100.0)
        val cartItem = CartItem(id = "c1", userId = userId, productId = "p1", variantId = null, quantity = 1)
        val items = listOf(CartWithProduct(cartItem, product, null))
        val address = Address(fullName = "John Doe", houseNo = "123", street = "Street", pincode = "123456")

        every { orderRepository.placeOrder(any()) } returns flowOf(Resource.Success(Unit))

        useCase(userId, items, address).collect {}

        verify { 
            orderRepository.placeOrder(match { order ->
                order.userId == userId && 
                order.items.size == 1 && 
                order.totalAmount == 140.0 // 100 + 40 delivery
            }) 
        }
    }
}
