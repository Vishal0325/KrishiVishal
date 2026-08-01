package com.company.krishivishal.domain.usecase.cart

import com.company.krishivishal.core.model.CartItem
import com.company.krishivishal.data.repository.CartRepository
import com.company.krishivishal.core.util.Resource
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject

/**
 * UseCase to remove an item from the user's cart.
 */
class RemoveFromCartUseCase @Inject constructor(
    private val repository: CartRepository
) {
    operator fun invoke(cartItem: CartItem): Flow<Resource<Unit>> {
        return repository.removeFromCart(cartItem)
    }
}
