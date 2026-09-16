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
            orderRepository.createOrderViaFunction(any(), any(), any(), any(), any(), any(), any())
        } returns flowOf(Resource.Success(com.company.krishivishal.data.repository.CreateOrderResult("orderId", 140.0, "123456", null)))

        useCase(userId, items, address).collect {}

        verify {
            orderRepository.createOrderViaFunction(
                cartItems = match { it.size == 1 && (it[0].cartItem.productId == "p1" || it[0].product?.id == "p1") },
                address = match {
                    val map = it as Map<String, Any?>
                    map["pincode"] == "123456" && map["city"] == "D1"
                },
                paymentMethod = "COD",
                userName = "John Doe",
                userPhone = "9876543210"
            )
        }
    }

    @Test
    fun `placeOrder with ONLINE payment method should map to RAZORPAY_ONLINE for backend compatibility`() = runTest {
        val userId = "u1"
        val product = Product(id = "p1", name = "Product 1", basePrice = 100.0)
        val cartItem = CartItem(id = "c1", userId = userId, productId = "p1", variantId = null, quantity = 1)
        val items = listOf(CartWithProduct(cartItem, product, null))
        val address = Address(
            fullName = "Ramesh Kumar",
            houseNo = "45",
            street = "Main Road",
            ward = "W2",
            block = "B2",
            district = "Patna",
            state = "Bihar",
            pincode = "800001",
            landmark = "Near Mandir",
            mobileNumber = "9876543210"
        )

        every {
            orderRepository.createOrderViaFunction(any(), any(), any(), any(), any(), any(), any())
        } returns flowOf(Resource.Success(com.company.krishivishal.data.repository.CreateOrderResult("orderId", 150.0, "654321", "rzp_order_123")))

        useCase(userId, items, address, paymentMethod = "ONLINE").collect {}

        verify {
            orderRepository.createOrderViaFunction(
                cartItems = match { it.size == 1 },
                address = match {
                    val map = it as Map<String, Any?>
                    map["pincode"] == "800001" && map["city"] == "Patna" && map["landmark"] == "Near Mandir"
                },
                paymentMethod = "RAZORPAY_ONLINE", // Verifies fix #4
                userName = "Ramesh Kumar",
                userPhone = "9876543210"
            )
        }
    }
}
