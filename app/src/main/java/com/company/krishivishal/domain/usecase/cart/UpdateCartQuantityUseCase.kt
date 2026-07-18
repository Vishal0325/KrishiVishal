package com.company.krishivishal.domain.usecase.cart

import com.company.krishivishal.data.model.CartItem
import com.company.krishivishal.data.repository.CartRepository
import com.company.krishivishal.utils.Resource
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject

/**
 * UseCase to update the quantity of an item in the user's cart.
 */
class UpdateCartQuantityUseCase @Inject constructor(
    private val repository: CartRepository
) {
    operator fun invoke(cartItem: CartItem, newQuantity: Int): Flow<Resource<Unit>> {
        if (newQuantity <= 0) {
            return repository.removeFromCart(cartItem)
        }
        return repository.updateCartItem(cartItem.copy(quantity = newQuantity))
    }
}
