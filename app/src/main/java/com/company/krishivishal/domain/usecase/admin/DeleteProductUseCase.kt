package com.company.krishivishal.domain.usecase.admin

import com.company.krishivishal.data.repository.ProductRepository
import com.company.krishivishal.utils.Resource
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject

class DeleteProductUseCase @Inject constructor(
    private val repository: ProductRepository
) {
    suspend operator fun invoke(productId: String): Flow<Resource<Unit>> {
        return repository.deleteProduct(productId)
    }
}
