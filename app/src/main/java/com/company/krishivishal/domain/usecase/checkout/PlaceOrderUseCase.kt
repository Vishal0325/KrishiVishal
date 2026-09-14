package com.company.krishivishal.domain.usecase.checkout

import com.company.krishivishal.core.model.Address
import com.company.krishivishal.core.model.CartWithProduct
import com.company.krishivishal.data.repository.OrderRepository
import com.company.krishivishal.data.repository.CreateOrderResult
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
        paymentMethod: String = "COD",
        lat: Double = 0.0,
        lng: Double = 0.0
    ): Flow<Resource<CreateOrderResult>> {
        val landmarkPart = if (address.landmark.isNotBlank()) " (Landmark: ${address.landmark})" else ""
        val addressString = "${address.fullName}, ${address.houseNo}, ${address.street}, ${address.ward}, ${address.block}, ${address.district}, ${address.state} - ${address.pincode}$landmarkPart"

        // FIX (DB Alignment #4): Cloud Function accepts "RAZORPAY_ONLINE" not "ONLINE".
        // Map the local enum string to the server-accepted value before sending.
        val mappedPaymentMethod = when (paymentMethod.uppercase()) {
            "ONLINE" -> "RAZORPAY_ONLINE"
            else -> paymentMethod
        }
        
        return this.orderRepository.createOrderViaFunction(
            cartItems = cartItems.map { it.cartItem },
            address = addressString,
            paymentMethod = mappedPaymentMethod,
            userName = address.fullName,
            userPhone = address.mobileNumber,
            lat = lat,
            lng = lng
        )
    }
}
