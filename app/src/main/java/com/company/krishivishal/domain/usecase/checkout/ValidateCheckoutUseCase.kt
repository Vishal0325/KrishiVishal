package com.company.krishivishal.domain.usecase.checkout

import com.company.krishivishal.core.model.Address
import com.company.krishivishal.core.model.CartWithProduct
import com.company.krishivishal.core.model.availableStock
import javax.inject.Inject

sealed class CheckoutValidationResult {
    object Valid : CheckoutValidationResult()
    data class Invalid(val message: String) : CheckoutValidationResult()
}

/**
 * UseCase to validate if the checkout process can proceed.
 * Checks for empty cart, missing address, and stock availability.
 */
class ValidateCheckoutUseCase @Inject constructor() {
    operator fun invoke(
        cartItems: List<CartWithProduct>,
        selectedAddress: Address?
    ): CheckoutValidationResult {
        if (cartItems.isEmpty()) {
            return CheckoutValidationResult.Invalid("Your cart is empty.")
        }
        if (selectedAddress == null) {
            return CheckoutValidationResult.Invalid("Please select a delivery address.")
        }
        
        // NEW: Check stock availability for each item
        // Uses variant?.stock ?: product.stockQuantity fallback
        for (item in cartItems) {
            val availableStock = item.availableStock()
            if (item.cartItem.quantity > availableStock) {
                val itemName = item.product?.name ?: "Product"
                val variantLabel = item.variant?.label?.let { " ($it)" } ?: ""
                return CheckoutValidationResult.Invalid(
                    "$itemName$variantLabel: Only $availableStock available, but you have ${item.cartItem.quantity} in cart."
                )
            }
        }
        
        return CheckoutValidationResult.Valid
    }
}
