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
        lng: Double = 0.0,
        deliverySlotId: String? = null
    ): Flow<Resource<CreateOrderResult>> {
        val addressMap = hashMapOf<String, Any?>(
            "line1" to "${address.houseNo} ${address.street}".trim().ifEmpty { address.ward.ifEmpty { "Main Road" } },
            "line2" to "${address.ward} ${address.block}".trim(),
            "city" to address.district.ifEmpty { "Patna" },
            "state" to address.state.ifEmpty { "Bihar" },
            "pincode" to address.pincode,
            "landmark" to address.landmark,
            "lat" to lat,
            "lng" to lng
        )

        // FIX (DB Alignment #4): Cloud Function accepts "RAZORPAY_ONLINE" not "ONLINE".
        // Map the local enum string to the server-accepted value before sending.
        val mappedPaymentMethod = when (paymentMethod.uppercase()) {
            "ONLINE" -> "RAZORPAY_ONLINE"
            else -> paymentMethod
        }
        
        return this.orderRepository.createOrderViaFunction(
            cartItems = cartItems,
            address = addressMap,
            paymentMethod = mappedPaymentMethod,
            userName = address.fullName,
            userPhone = address.mobileNumber,
            lat = lat,
            lng = lng,
            deliverySlotId = deliverySlotId
        )
    }
}
