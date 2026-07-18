package com.company.krishivishal.domain.usecase.product

import com.company.krishivishal.data.model.Product
import com.company.krishivishal.data.repository.ProductRepository
import com.company.krishivishal.utils.Resource
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject

/**
 * UseCase to fetch detailed information for a specific product.
 */
class GetProductDetailsUseCase @Inject constructor(
    private val repository: ProductRepository
) {
    operator fun invoke(productId: String): Flow<Resource<Product?>> {
        return repository.getProductDetails(productId)
    }
}
