package com.company.krishivishal.domain.usecase.product

import com.company.krishivishal.core.model.Product
import com.company.krishivishal.core.model.WishlistItem
import com.company.krishivishal.data.repository.WishlistRepository
import com.company.krishivishal.core.util.Resource
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import javax.inject.Inject

/**
 * UseCase to add or remove a product from the user's wishlist.
 */
class ToggleProductWishlistUseCase @Inject constructor(
    private val wishlistRepository: WishlistRepository
) {
    suspend operator fun invoke(product: Product, userId: String): Flow<Resource<Unit>> {
        val currentWishlist = wishlistRepository.getWishlist(userId).first()
        val isWishlisted = if (currentWishlist is Resource.Success) {
            currentWishlist.data?.any { it.id == product.id } ?: false
        } else false

        val item = WishlistItem(
            productId = product.id,
            productName = product.name,
            price = product.basePrice,
            imageUrl = product.imageUrl.ifEmpty { product.images.firstOrNull() ?: "" },
            userId = userId
        )

        return if (isWishlisted) {
            wishlistRepository.removeFromWishlist(item)
        } else {
            wishlistRepository.addToWishlist(item)
        }
    }
}
