package com.company.krishivishal.domain.usecase.checkout

import com.company.krishivishal.core.model.Address
import com.company.krishivishal.core.model.CartWithProduct
import com.company.krishivishal.data.repository.OrderRepository
import com.company.krishivishal.core.util.Resource
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject

/**
 * UseCase to handle the final step of placing an order.
 * Consolidates cart items, selected address, and calculates totals before saving.
 */
class PlaceOrderUseCase @Inject constructor(
    private val orderRepository: OrderRepository
) {
    operator fun invoke(
        userId: String,
        cartItems: List<CartWithProduct>,
        address: Address,
        paymentMethod: String = "CASH_ON_DELIVERY",
        lat: Double = 0.0,
        lng: Double = 0.0
    ): Flow<Resource<Triple<String, Double, String>>> {
        val addressString = "${address.fullName}, ${address.houseNo}, ${address.street}, ${address.ward}, ${address.block}, ${address.district}, ${address.state} - ${address.pincode}"
        
        return this.orderRepository.createOrderViaFunction(
            cartItems = cartItems.map { it.cartItem },
            address = addressString,
            paymentMethod = paymentMethod,
            userName = address.fullName,
            userPhone = address.mobileNumber,
            lat = lat,
            lng = lng
        )
    }
}
