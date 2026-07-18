package com.company.krishivishal.domain.usecase.admin

import com.company.krishivishal.data.model.Product
import com.company.krishivishal.data.repository.ProductRepository
import com.company.krishivishal.utils.Resource
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject

/**
 * UseCase for administrative product updates, ensuring sync and local cache consistency.
 */
class UpdateProductUseCase @Inject constructor(
    private val repository: ProductRepository
) {
    suspend operator fun invoke(product: Product): Flow<Resource<Unit>> {
        return repository.saveProduct(product)
    }
}
