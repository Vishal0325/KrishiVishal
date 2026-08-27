package com.company.krishivishal.ui.product

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.company.krishivishal.R
import com.company.krishivishal.core.model.*
import com.company.krishivishal.data.repository.CartRepository
import com.company.krishivishal.data.repository.CheckoutSessionRepository
import com.company.krishivishal.domain.usecase.auth.GetCurrentUserUseCase
import com.company.krishivishal.domain.usecase.product.*
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.analytics.AnalyticsTracker
import com.company.krishivishal.core.util.Constants
import com.company.krishivishal.data.local.UserDao
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
    private val productRepository: com.company.krishivishal.data.repository.ProductRepository,
    private val configRepository: com.company.krishivishal.data.repository.ConfigRepository,
    private val productDao: com.company.krishivishal.data.local.ProductDao,
    private val userDao: UserDao,
    private val analyticsTracker: AnalyticsTracker
) : ViewModel() {

    private val _uiState = MutableStateFlow(ProductDetailUiState())
    val uiState: StateFlow<ProductDetailUiState> = _uiState.asStateFlow()

    private val _user = getCurrentUserUseCase()
        .stateIn(viewModelScope, SharingStarted.Eagerly, null)
    val user: StateFlow<User?> = _user

    fun loadProduct(productId: String) {
        // Load Config
        viewModelScope.launch {
            configRepository.getConfig().collect { resource ->
                if (resource is Resource.Success) {
                    _uiState.update { it.copy(appConfig = resource.data) }
                }
            }
        }
        
        // Load Product Details
        viewModelScope.launch {
            getProductDetailsUseCase(productId).collect { resource ->
                when (resource) {
                    is Resource.Loading -> {
                        _uiState.update { it.copy(isProductLoading = true, error = null) }
                    }
                    is Resource.Success -> {
                        val product = resource.data
                        if (product != null && !product.isActive) {
                            _uiState.update { it.copy(isProductLoading = false, error = "This product is no longer available.") }
                            // Also remove from local db so it stops showing up in other places
                            viewModelScope.launch {
                                productDao.deleteProductById(product.id)
                            }
                            return@collect
                        }
                        
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
                            val currentUser = _user.value ?: getCurrentUserUseCase().firstOrNull()
                            val userId = currentUser?.id ?: Constants.GUEST_USER_ID
                            checkWishlistStatus(product.id, userId)
                            analyticsTracker.trackViewProduct(
                                product.id, product.name, product.category, product.basePrice
                            )
                            loadRecommendations(product.id)
                            saveRecentlyViewed(product.id, userId)
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
        val product = _uiState.value.product ?: return
        if (!product.isActive) {
            _uiState.update { it.copy(error = "This product is no longer available.") }
            return
        }
        val variant = _uiState.value.selectedVariant

        viewModelScope.launch {
            try {
                val currentUser = _user.value ?: getCurrentUserUseCase().firstOrNull()
                val userId = currentUser?.id ?: Constants.GUEST_USER_ID

                if (userId == Constants.GUEST_USER_ID) {
                    userDao.insertUser(User(id = Constants.GUEST_USER_ID, name = "Guest User"))
                }

                // Ensure product is saved locally in Room
                productRepository.saveProduct(product).collectLatest {}

                val currentCartResource = cartRepository.getCart(userId).first()
                val existingItem = if (currentCartResource is Resource.Success) {
                    currentCartResource.data?.find { it.productId == product.id && it.variantId == variant?.id }
                } else null

                if (existingItem != null) {
                    val updatedItem = existingItem.copy(quantity = existingItem.quantity + quantity)
                    cartRepository.updateCartItem(updatedItem).collectLatest { resource ->
                        if (resource is Resource.Success) {
                            _uiState.update { it.copy(cartMessageRes = R.string.added_to_cart) }
                            analyticsTracker.trackAddToCart(product.id, product.name, product.basePrice, quantity)
                        } else if (resource is Resource.Error) {
                            _uiState.update { it.copy(error = resource.message) }
                        }
                    }
                } else {
                    val cartItem = CartItem(
                        id = UUID.randomUUID().toString(),
                        userId = userId,
                        productId = product.id,
                        variantId = variant?.id,
                        quantity = quantity
                    )
                    cartRepository.addToCart(cartItem).collectLatest { resource ->
                        if (resource is Resource.Success) {
                            _uiState.update { it.copy(cartMessageRes = R.string.added_to_cart) }
                            analyticsTracker.trackAddToCart(product.id, product.name, product.basePrice, quantity)
                        } else if (resource is Resource.Error) {
                            _uiState.update { it.copy(error = resource.message) }
                        }
                    }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.message) }
            }
        }
    }

    fun buyNow(quantity: Int) {
        val product = _uiState.value.product ?: return
        if (!product.isActive) {
            _uiState.update { it.copy(error = "This product is no longer available.") }
            return
        }
        val variant = _uiState.value.selectedVariant

        viewModelScope.launch {
            try {
                val currentUser = _user.value ?: getCurrentUserUseCase().firstOrNull()
                val userId = currentUser?.id ?: Constants.GUEST_USER_ID

                if (userId == Constants.GUEST_USER_ID) {
                    userDao.insertUser(User(id = Constants.GUEST_USER_ID, name = "Guest User"))
                }

                productRepository.saveProduct(product).collectLatest {}

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
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.message) }
            }
        }
    }

    fun onNavigatedToCheckout() {
        _uiState.update { it.copy(navigateToCheckout = false) }
    }

    fun toggleWishlist() {
        viewModelScope.launch {
            val currentUser = _user.value ?: getCurrentUserUseCase().firstOrNull()
            if (currentUser == null || currentUser.id == Constants.GUEST_USER_ID) {
                _uiState.update { it.copy(showLoginPrompt = true) }
                return@launch
            }
            
            val product = _uiState.value.product ?: return@launch
            val userId = currentUser.id

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
        _uiState.update { it.copy(cartMessage = null, cartMessageRes = null) }
    }

    fun trackRecommendationClick(product: Product) {
        analyticsTracker.trackCustomEvent(
            "recommendation_click",
            mapOf(
                "product_id" to product.id,
                "product_name" to product.name,
                "category" to product.category,
                "reason" to product.recommendationReason
            )
        )
    }

    fun trackRecommendationImpression(recommendations: RecommendationResult) {
        val allIds = (recommendations.technical + recommendations.similar + recommendations.related).map { it.id }
        if (allIds.isEmpty()) return
        
        analyticsTracker.trackCustomEvent(
            "recommendation_impression",
            mapOf(
                "product_ids" to allIds.joinToString(","),
                "total_count" to allIds.size
            )
        )
    }

    fun trackRecommendationAddToCart(product: Product) {
        analyticsTracker.trackCustomEvent(
            "recommendation_add_to_cart",
            mapOf(
                "product_id" to product.id,
                "product_name" to product.name,
                "category" to product.category
            )
        )
        // Actual Add to Cart Logic
        viewModelScope.launch {
            try {
                val currentUser = _user.value ?: getCurrentUserUseCase().firstOrNull()
                val userId = currentUser?.id ?: Constants.GUEST_USER_ID

                if (userId == Constants.GUEST_USER_ID) {
                    userDao.insertUser(User(id = Constants.GUEST_USER_ID, name = "Guest User"))
                }

                productRepository.saveProduct(product).collectLatest {}

                val currentCartResource = cartRepository.getCart(userId).first()
                val existingItem = if (currentCartResource is Resource.Success) {
                    currentCartResource.data?.find { it.productId == product.id }
                } else null

                if (existingItem != null) {
                    val updatedItem = existingItem.copy(quantity = existingItem.quantity + 1)
                    cartRepository.updateCartItem(updatedItem).collectLatest { resource ->
                        if (resource is Resource.Success) {
                            _uiState.update { it.copy(cartMessageRes = R.string.added_to_cart) }
                        }
                    }
                } else {
                    val cartItem = CartItem(
                        id = UUID.randomUUID().toString(),
                        userId = userId,
                        productId = product.id,
                        quantity = 1
                    )
                    cartRepository.addToCart(cartItem).collectLatest { resource ->
                        if (resource is Resource.Success) {
                            _uiState.update { it.copy(cartMessageRes = R.string.added_to_cart) }
                        }
                    }
                }
            } catch (e: Exception) {
                _uiState.update { it.copy(error = e.message) }
            }
        }
    }

    private fun loadRecommendations(productId: String) {
        viewModelScope.launch {
            configRepository.getConfig().collect { resource ->
                if (resource is Resource.Success && resource.data?.ff_product_recommendations == true) {
                    productRepository.getRecommendations(productId).collect { recResource ->
                        when (recResource) {
                            is Resource.Loading -> {
                                _uiState.update { it.copy(isRecommendationsLoading = true) }
                            }
                            is Resource.Success -> {
                                _uiState.update { it.copy(
                                    isRecommendationsLoading = false,
                                    recommendations = recResource.data ?: RecommendationResult()
                                ) }
                            }
                            is Resource.Error -> {
                                _uiState.update { it.copy(isRecommendationsLoading = false) }
                            }
                            else -> {}
                        }
                    }
                }
            }
        }
    }

    fun requestStockNotification() {
        val product = _uiState.value.product ?: return

        viewModelScope.launch {
            val currentUser = _user.value ?: getCurrentUserUseCase().firstOrNull()
            val userId = currentUser?.id ?: Constants.GUEST_USER_ID

            _uiState.update { it.copy(isNotifyMeLoading = true) }
            productRepository.requestStockNotification(product.id, userId).collect { resource ->
                when (resource) {
                    is Resource.Success -> {
                        _uiState.update { it.copy(isNotifyMeLoading = false, notifyMeSuccess = true, cartMessageRes = R.string.notify_success_msg) }
                    }
                    is Resource.Error -> {
                        _uiState.update { it.copy(isNotifyMeLoading = false, error = resource.message) }
                    }
                    else -> {}
                }
            }
        }
    }

    private fun saveRecentlyViewed(productId: String, userId: String) {
        viewModelScope.launch {
            productDao.insertRecentlyViewed(RecentlyViewedProduct(userId, productId))
        }
    }

    fun addToCompare() {
        val product = _uiState.value.product
        val currentList = _uiState.value.compareList
        
        if (product == null || currentList.any { it.id == product.id }) return
        
        if (currentList.size >= 3) {
            _uiState.update { it.copy(cartMessage = "Max 3 products allowed for comparison") }
        } else {
            val newList = currentList.toMutableList().apply { add(product) }
            _uiState.update { it.copy(compareList = newList, cartMessage = "Added to comparison list") }
        }
    }

    fun removeFromCompare(productId: String) {
        val currentList = _uiState.value.compareList.filter { it.id != productId }
        _uiState.update { it.copy(compareList = currentList) }
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
    val cartMessageRes: Int? = null,
    val navigateToCheckout: Boolean = false,
    val showLoginPrompt: Boolean = false,
    val isNotifyMeLoading: Boolean = false,
    val notifyMeSuccess: Boolean = false,
    val recommendations: RecommendationResult = RecommendationResult(),
    val isRecommendationsLoading: Boolean = false,
    val appConfig: AppConfig? = null,
    val compareList: List<Product> = emptyList()
)
