package com.company.krishivishal.domain.usecase.checkout

import com.company.krishivishal.data.model.Address
import com.company.krishivishal.data.model.CartWithProduct
import javax.inject.Inject

sealed class CheckoutValidationResult {
    object Valid : CheckoutValidationResult()
    data class Invalid(val message: String) : CheckoutValidationResult()
}

/**
 * UseCase to validate if the checkout process can proceed.
 * Checks for empty cart, missing address, etc.
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
        // Additional checks like stock availability could be added here
        return CheckoutValidationResult.Valid
    }
}
