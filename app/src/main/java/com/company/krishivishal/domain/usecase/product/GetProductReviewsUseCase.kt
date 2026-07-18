package com.company.krishivishal.domain.usecase.product

import com.company.krishivishal.data.model.Review
import com.company.krishivishal.data.repository.ProductRepository
import com.company.krishivishal.utils.Resource
import kotlinx.coroutines.flow.Flow
import javax.inject.Inject

/**
 * UseCase to fetch user reviews for a specific product.
 */
class GetProductReviewsUseCase @Inject constructor(
    private val repository: ProductRepository
) {
    operator fun invoke(productId: String): Flow<Resource<List<Review>>> {
        return repository.getReviews(productId)
    }
}
