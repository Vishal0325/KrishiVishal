package com.company.krishivishal.domain.usecase.checkout

import com.company.krishivishal.data.model.Address
import com.company.krishivishal.data.model.Order
import com.company.krishivishal.data.model.OrderItem
import com.company.krishivishal.data.model.CartWithProduct
import com.company.krishivishal.data.repository.OrderRepository
import com.company.krishivishal.domain.usecase.cart.CalculateCartTotalsUseCase
import com.company.krishivishal.utils.Resource
import kotlinx.coroutines.flow.Flow
import java.util.*
import javax.inject.Inject

/**
 * UseCase to handle the final step of placing an order.
 * Consolidates cart items, selected address, and calculates totals before saving.
 */
class PlaceOrderUseCase @Inject constructor(
    private val orderRepository: OrderRepository,
    private val calculateCartTotalsUseCase: CalculateCartTotalsUseCase
) {
    operator fun invoke(
        userId: String,
        cartItems: List<CartWithProduct>,
        address: Address,
        paymentMethod: String = "CASH_ON_DELIVERY"
    ): Flow<Resource<Unit>> {
        val totals = calculateCartTotalsUseCase(cartItems)
        
        val orderItems = cartItems.map { item ->
            val product = item.product
            val variant = item.variant
            val price = variant?.price ?: if (product.discountedPrice > 0) product.discountedPrice else if (product.price > 0) product.price else product.basePrice
            
            OrderItem(
                productId = item.cartItem.productId,
                productName = product.name,
                quantity = item.cartItem.quantity,
                price = price,
                imageUrl = product.imageUrl.ifEmpty { product.images.firstOrNull() ?: "" }
            )
        }

        val order = Order(
            id = UUID.randomUUID().toString(),
            userId = userId,
            items = orderItems,
            totalAmount = totals.grandTotal,
            paymentMethod = paymentMethod,
            address = "${address.fullName}, ${address.houseNo}, ${address.street}, ${address.ward}, ${address.block}, ${address.district}, ${address.state} - ${address.pincode}",
            status = "PLACED",
            createdAt = Date()
        )

        return orderRepository.placeOrder(order)
    }
}
