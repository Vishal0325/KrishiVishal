package com.company.krishivishal.domain.usecase.checkout

import com.company.krishivishal.core.model.Address
import com.company.krishivishal.core.model.Order
import com.company.krishivishal.core.model.OrderItem
import com.company.krishivishal.core.model.CartWithProduct
import com.company.krishivishal.data.repository.OrderRepository
import com.company.krishivishal.domain.usecase.cart.CalculateCartTotalsUseCase
import com.company.krishivishal.core.util.Resource
import kotlinx.coroutines.flow.Flow
import java.util.*
import javax.inject.Inject

/**
 * UseCase to handle the final step of placing an order.
 * Consolidates cart items, selected address, and calculates totals before saving.
 * 
 * Handles variant awareness: if a cart item has a variant selected,
 * both variantId and variantLabel are saved to the OrderItem for
 * accurate order tracking and delivery fulfillment.
 */
class PlaceOrderUseCase @Inject constructor(
    private val orderRepository: OrderRepository,
    private val calculateCartTotalsUseCase: CalculateCartTotalsUseCase
) {
    operator fun invoke(
        userId: String,
        cartItems: List<CartWithProduct>,
        address: Address,
        paymentMethod: String = "CASH_ON_DELIVERY",
        status: String = "PLACED"
    ): Flow<Resource<Unit>> {
        val totals = calculateCartTotalsUseCase(cartItems)
        
        val orderItems = cartItems.map { item ->
            val product = item.product
            val variant = item.variant
            
            // Use variant price if available, otherwise product price
            val price = variant?.price ?: if (product.discountedPrice > 0) product.discountedPrice else if (product.price > 0) product.price else product.basePrice
            
            // Use product image (variants don't have images yet in schema)
            val imageUrl = product.imageUrl.ifEmpty { product.images.firstOrNull() ?: "" }
            
            OrderItem(
                productId = item.cartItem.productId,
                productName = product.name,
                quantity = item.cartItem.quantity,
                price = price,
                imageUrl = imageUrl,
                
                // NEW: Populate variant fields for order tracking
                // If variant is null (legacy order or single-variant product), both will be null
                // This is intentional and backward compatible
                variantId = item.cartItem.variantId,
                variantLabel = variant?.label  // null if variant was deleted or product has no variants
            )
        }

        val order = Order(
            id = UUID.randomUUID().toString(),
            userId = userId,
            items = orderItems,
            totalAmount = totals.grandTotal,
            paymentMethod = paymentMethod,
            address = "${address.fullName}, ${address.houseNo}, ${address.street}, ${address.ward}, ${address.block}, ${address.district}, ${address.state} - ${address.pincode}",
            status = status,
            createdAt = Date(),
            customerOTP = String.format(Locale.US, "%04d", (0..9999).random()),
            userName = address.fullName,
            userPhone = address.mobileNumber
        )

        return orderRepository.placeOrder(order)
    }
}
