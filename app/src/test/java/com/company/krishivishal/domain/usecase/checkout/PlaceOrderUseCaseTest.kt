package com.company.krishivishal.domain.usecase.checkout

import com.company.krishivishal.core.model.*
import com.company.krishivishal.data.repository.OrderRepository
import com.company.krishivishal.core.util.Resource
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.test.runTest
import org.junit.Test

class PlaceOrderUseCaseTest {

    private val orderRepository = mockk<OrderRepository>()
    private val useCase = PlaceOrderUseCase(orderRepository)

    @Test
    fun `placeOrder should call repository createOrderViaFunction with correct parameters`() = runTest {
        val userId = "u1"
        val product = Product(id = "p1", name = "Product 1", basePrice = 100.0)
        val cartItem = CartItem(id = "c1", userId = userId, productId = "p1", variantId = null, quantity = 1)
        val items = listOf(CartWithProduct(cartItem, product, null))
        val address = Address(
            fullName = "John Doe",
            houseNo = "123",
            street = "Street",
            ward = "W1",
            block = "B1",
            district = "D1",
            state = "S1",
            pincode = "123456",
            mobileNumber = "9876543210"
        )

        every {
            orderRepository.createOrderViaFunction(any(), any(), any(), any(), any())
        } returns flowOf(Resource.Success(Pair("orderId", 140.0)))

        useCase(userId, items, address).collect {}

        verify {
            orderRepository.createOrderViaFunction(
                cartItems = match { it.size == 1 && it[0].productId == "p1" },
                address = "John Doe, 123, Street, W1, B1, D1, S1 - 123456",
                paymentMethod = "CASH_ON_DELIVERY",
                userName = "John Doe",
                userPhone = "9876543210"
            )
        }
    }
}
