package com.company.krishivishal.domain.usecase.cart

import com.company.krishivishal.data.model.CartWithProduct
import com.company.krishivishal.data.repository.CartRepository
import com.company.krishivishal.utils.Resource
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject

/**
 * UseCase to fetch cart items with associated product and variant details.
 */
class GetCartUseCase @Inject constructor(
    private val repository: CartRepository
) {
    operator fun invoke(userId: String): Flow<Resource<List<CartWithProduct>>> {
        return repository.getCartWithProducts(userId)
    }
}
