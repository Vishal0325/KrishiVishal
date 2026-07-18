package com.company.krishivishal.ui.wishlist

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.company.krishivishal.data.model.Product
import com.company.krishivishal.data.model.WishlistItem
import com.company.krishivishal.data.repository.AuthRepository
import com.company.krishivishal.data.repository.WishlistRepository
import com.company.krishivishal.utils.Resource
import com.company.krishivishal.ui.home.HomeViewModel
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class WishlistViewModel @Inject constructor(
    private val wishlistRepository: WishlistRepository,
    private val authRepository: AuthRepository
) : ViewModel() {

    private val _wishlistItems = MutableStateFlow<Resource<List<Product>>>(Resource.Loading())
    val wishlistItems: StateFlow<Resource<List<Product>>> = _wishlistItems.asStateFlow()

    init {
        loadWishlist()
    }

    private fun loadWishlist() {
        viewModelScope.launch {
            authRepository.getCurrentUser().collectLatest { user ->
                val userId = user?.id ?: HomeViewModel.GUEST_USER_ID
                wishlistRepository.getWishlist(userId).collectLatest { resource ->
                    _wishlistItems.value = resource
                }
            }
        }
    }

    fun removeFromWishlist(product: Product) {
        viewModelScope.launch {
            authRepository.getCurrentUser().collectLatest { user ->
                val userId = user?.id ?: HomeViewModel.GUEST_USER_ID
                val wishlistItem = WishlistItem(
                    productId = product.id,
                    productName = product.name,
                    price = product.basePrice,
                    imageUrl = product.imageUrl.ifEmpty { product.images.firstOrNull() ?: "" },
                    userId = userId
                )
                wishlistRepository.removeFromWishlist(wishlistItem).collectLatest { }
            }
        }
    }
}
