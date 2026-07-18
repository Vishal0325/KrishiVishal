package com.company.krishivishal.domain.usecase.product

import com.company.krishivishal.data.model.Variant
import com.company.krishivishal.data.repository.ProductRepository
import com.company.krishivishal.utils.Resource
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject

/**
 * UseCase to fetch all available variants for a specific product.
 */
class GetProductVariantsUseCase @Inject constructor(
    private val repository: ProductRepository
) {
    operator fun invoke(productId: String): Flow<Resource<List<Variant>>> {
        return repository.getVariantsByProductId(productId)
    }
}
