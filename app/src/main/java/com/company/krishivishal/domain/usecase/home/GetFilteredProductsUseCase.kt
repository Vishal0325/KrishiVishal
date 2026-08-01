package com.company.krishivishal.domain.usecase.home

import com.company.krishivishal.core.model.Product
import com.company.krishivishal.data.repository.ProductRepository
import com.company.krishivishal.ui.home.ProductSortOrder
import com.company.krishivishal.core.util.Resource
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import javax.inject.Inject

/**
 * UseCase to handle filtering and sorting of products for the Home screen.
 */
class GetFilteredProductsUseCase @Inject constructor(
    private val productRepository: ProductRepository
) {
    operator fun invoke(
        query: String,
        sortOrder: ProductSortOrder
    ): Flow<Resource<List<Product>>> {
        return productRepository.getProducts().map { resource ->
            when (resource) {
                is Resource.Success -> {
                    var list = resource.data ?: emptyList()
                    
                    // Filtering Logic
                    if (query.isNotEmpty()) {
                        list = list.filter { product ->
                            product.name.contains(query, ignoreCase = true) ||
                                    product.brand.contains(query, ignoreCase = true) ||
                                    product.category.contains(query, ignoreCase = true) ||
                                    product.subCategory.contains(query, ignoreCase = true) ||
                                    product.cropName.contains(query, ignoreCase = true)
                        }
                    }
                    
                    // Sorting Logic
                    list = when (sortOrder) {
                        ProductSortOrder.PRICE_LOW_HIGH -> list.sortedBy { it.discountedPrice.takeIf { p -> p > 0 } ?: it.basePrice }
                        ProductSortOrder.PRICE_HIGH_LOW -> list.sortedByDescending { it.discountedPrice.takeIf { p -> p > 0 } ?: it.basePrice }
                        ProductSortOrder.DISCOUNT -> list.sortedByDescending { it.discountPercent }
                        ProductSortOrder.RATING -> list.sortedByDescending { it.rating }
                        ProductSortOrder.DEFAULT -> list
                    }
                    
                    Resource.Success(list)
                }
                else -> resource
            }
        }
    }
}
