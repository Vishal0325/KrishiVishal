package com.company.krishivishal.domain.usecase.cart

import com.company.krishivishal.core.model.CartItem
import com.company.krishivishal.data.repository.CartRepository
import com.company.krishivishal.core.util.Resource
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject

/**
 * UseCase to add an item to the user's cart.
 */
class AddToCartUseCase @Inject constructor(
    private val repository: CartRepository
) {
    operator fun invoke(cartItem: CartItem): Flow<Resource<Unit>> {
        // We could add validation here (e.g., check stock if available in CartItem)
        return repository.addToCart(cartItem)
    }
}
