package com.company.krishivishal.ui.product

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.company.krishivishal.core.model.*
import com.company.krishivishal.data.repository.CartRepository
import com.company.krishivishal.data.repository.CheckoutSessionRepository
import com.company.krishivishal.domain.usecase.auth.GetCurrentUserUseCase
import com.company.krishivishal.domain.usecase.product.*
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.analytics.AnalyticsTracker
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject
import java.util.UUID

@HiltViewModel
class ProductDetailViewModel @Inject constructor(
    private val getProductDetailsUseCase: GetProductDetailsUseCase,
    private val getProductVariantsUseCase: GetProductVariantsUseCase,
    private val getProductReviewsUseCase: GetProductReviewsUseCase,
    private val toggleProductWishlistUseCase: ToggleProductWishlistUseCase,
    private val getCurrentUserUseCase: GetCurrentUserUseCase,
    private val cartRepository: CartRepository,
    private val checkoutSessionRepository: CheckoutSessionRepository,
    private val wishlistRepository: com.company.krishivishal.data.repository.WishlistRepository,
    private val analyticsTracker: AnalyticsTracker
) : ViewModel() {

    private val _uiState = MutableStateFlow(ProductDetailUiState())
    val uiState: StateFlow<ProductDetailUiState> = _uiState.asStateFlow()

    private val _user = getCurrentUserUseCase()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)
    val user: StateFlow<User?> = _user

    fun loadProduct(productId: String) {
        val userId = _user.value?.id ?: "guest_user"
        
        // Load Product Details
        viewModelScope.launch {
            getProductDetailsUseCase(productId).collect { resource ->
                when (resource) {
                    is Resource.Loading -> {
                        _uiState.update { it.copy(isProductLoading = true, error = null) }
                    }
                    is Resource.Success -> {
                        val product = resource.data
                        _uiState.update { currentState ->
                            val currentVariants = if (currentState.variants.isNotEmpty()) {
                                currentState.variants
                            } else {
                                product?.variants ?: emptyList()
                            }
                            val initialVariant = currentState.selectedVariant 
                                ?: currentVariants.firstOrNull { it.isBestSeller } 
                                ?: currentVariants.firstOrNull()
                                
                            currentState.copy(
                                isProductLoading = false,
                                product = product,
                                variants = currentVariants,
                                selectedVariant = initialVariant,
                                error = null
                            )
                        }
                        if (product != null) {
                            checkWishlistStatus(product.id, userId)
                            analyticsTracker.trackViewProduct(
                                product.id, product.name, product.category, product.basePrice
                            )
                        }
                    }
                    is Resource.Error -> {
                        _uiState.update { it.copy(isProductLoading = false, error = resource.message) }
                    }
                    else -> {}
                }
            }
        }

        // Load Variants independently
        viewModelScope.launch {
            getProductVariantsUseCase(productId).collect { resource ->
                when (resource) {
                    is Resource.Loading -> {
                        _uiState.update { it.copy(isVariantsLoading = true) }
                    }
                    is Resource.Success -> {
                        val fetchedVariants = resource.data ?: emptyList()
                        _uiState.update { currentState ->
                            val variants = if (fetchedVariants.isNotEmpty()) {
                                fetchedVariants
                            } else {
                                currentState.product?.variants ?: emptyList()
                            }
                            val currentSelected = currentState.selectedVariant
                            val initialVariant = if (currentSelected == null || variants.none { it.id == currentSelected.id }) {
                                variants.firstOrNull { it.isBestSeller } ?: variants.firstOrNull()
                            } else {
                                currentSelected
                            }
                            currentState.copy(
                                isVariantsLoading = false,
                                variants = variants,
                                selectedVariant = initialVariant
                            )
                        }
                    }
                    is Resource.Error -> {
                        _uiState.update { it.copy(isVariantsLoading = false) }
                    }
                    else -> {}
                }
            }
        }

        // Load Reviews independently
        viewModelScope.launch {
            getProductReviewsUseCase(productId).collect { resource ->
                when (resource) {
                    is Resource.Loading -> {
                        _uiState.update { it.copy(isReviewsLoading = true) }
                    }
                    is Resource.Success -> {
                        _uiState.update { it.copy(
                            isReviewsLoading = false,
                            reviews = resource.data ?: emptyList()
                        ) }
                    }
                    is Resource.Error -> {
                        _uiState.update { it.copy(isReviewsLoading = false) }
                    }
                    else -> {}
                }
            }
        }
    }

    private fun checkWishlistStatus(productId: String, userId: String) {
        viewModelScope.launch {
            wishlistRepository.getWishlist(userId).collect { resource ->
                if (resource is Resource.Success) {
                    val isWishlisted = resource.data?.any { it.id == productId } ?: false
                    _uiState.update { it.copy(isWishlisted = isWishlisted) }
                }
            }
        }
    }

    fun selectVariant(variant: Variant) {
        _uiState.update { it.copy(selectedVariant = variant) }
    }

    fun setTab(index: Int) {
        _uiState.update { it.copy(selectedTabIndex = index) }
    }

    fun addToCart(quantity: Int) {
        val currentUser = _user.value
        val product = _uiState.value.product ?: return
        val variant = _uiState.value.selectedVariant

        val userId = currentUser?.id ?: "guest_user"

        viewModelScope.launch {
            val cartItem = CartItem(
                id = UUID.randomUUID().toString(),
                userId = userId,
                productId = product.id,
                variantId = variant?.id,
                quantity = quantity
            )
            cartRepository.addToCart(cartItem).collect { resource ->
                if (resource is Resource.Success) {
                    _uiState.update { it.copy(cartMessage = "Added to cart successfully!") }
                    analyticsTracker.trackAddToCart(product.id, product.name, product.basePrice, quantity)
                } else if (resource is Resource.Error) {
                    _uiState.update { it.copy(error = resource.message) }
                }
            }
        }
    }

    fun buyNow(quantity: Int) {
        val currentUser = _user.value
        val product = _uiState.value.product ?: return
        val variant = _uiState.value.selectedVariant

        val userId = currentUser?.id ?: "guest_user"

        viewModelScope.launch {
            val buyNowItem = CartWithProduct(
                cartItem = CartItem(
                    id = UUID.randomUUID().toString(),
                    userId = userId,
                    productId = product.id,
                    variantId = variant?.id,
                    quantity = quantity,
                    isSelected = true
                ),
                product = product,
                variant = variant
            )
            
            checkoutSessionRepository.setBuyNowItem(buyNowItem)
            _uiState.update { it.copy(navigateToCheckout = true) }
            analyticsTracker.trackAddToCart(product.id, product.name, product.basePrice, quantity)
        }
    }

    fun onNavigatedToCheckout() {
        _uiState.update { it.copy(navigateToCheckout = false) }
    }

    fun toggleWishlist() {
        val currentUser = _user.value
        if (currentUser == null || currentUser.id == "guest_user") {
            _uiState.update { it.copy(showLoginPrompt = true) }
            return
        }
        
        val product = _uiState.value.product ?: return
        val userId = currentUser.id

        viewModelScope.launch {
            toggleProductWishlistUseCase(product, userId).collect { resource ->
                if (resource is Resource.Success) {
                    val newStatus = !_uiState.value.isWishlisted
                    _uiState.update { it.copy(isWishlisted = newStatus) }
                    analyticsTracker.trackWishlistToggle(product.id, product.name, newStatus)
                }
            }
        }
    }

    fun onLoginPromptShown() {
        _uiState.update { it.copy(showLoginPrompt = false) }
    }

    fun clearCartMessage() {
        _uiState.update { it.copy(cartMessage = null) }
    }
}

data class ProductDetailUiState(
    val isProductLoading: Boolean = false,
    val isVariantsLoading: Boolean = false,
    val isReviewsLoading: Boolean = false,
    val product: Product? = null,
    val variants: List<Variant> = emptyList(),
    val reviews: List<Review> = emptyList(),
    val selectedVariant: Variant? = null,
    val selectedTabIndex: Int = 0, // 0 for Overview, 1 for Description, 2 for Technical
    val isWishlisted: Boolean = false,
    val error: String? = null,
    val cartMessage: String? = null,
    val navigateToCheckout: Boolean = false,
    val showLoginPrompt: Boolean = false
)
