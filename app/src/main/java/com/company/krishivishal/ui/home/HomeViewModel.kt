package com.company.krishivishal.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.company.krishivishal.core.model.*
import com.company.krishivishal.data.repository.*
import com.company.krishivishal.domain.usecase.home.*
import com.company.krishivishal.analytics.AnalyticsTracker
import com.company.krishivishal.core.util.Constants
import com.company.krishivishal.core.util.Resource
import androidx.paging.PagingData
import androidx.paging.cachedIn
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.util.UUID
import javax.inject.Inject

sealed class HomeUiEvent {
    data class ShowSnackbar(val message: String) : HomeUiEvent()
    data class NavigateToCart(val productId: String) : HomeUiEvent()
    object LoginRequired : HomeUiEvent()
}

enum class ProductSortOrder {
    DEFAULT,
    PRICE_LOW_HIGH,
    PRICE_HIGH_LOW,
    DISCOUNT,
    RATING
}

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val getHomeFeedUseCase: GetHomeFeedUseCase,
    private val getFilteredProductsUseCase: GetFilteredProductsUseCase,
    private val productRepository: ProductRepository,
    private val cartRepository: CartRepository,
    private val authRepository: AuthRepository,
    private val wishlistRepository: WishlistRepository,
    private val configRepository: ConfigRepository,
    private val orderRepository: OrderRepository,
    private val analyticsTracker: AnalyticsTracker,
    private val productDao: com.company.krishivishal.data.local.ProductDao,
    private val userDao: com.company.krishivishal.data.local.UserDao
) : ViewModel() {

    private val _uiState = MutableStateFlow(HomeUiState())
    val uiState: StateFlow<HomeUiState> = _uiState.asStateFlow()

    private val _uiEvent = MutableSharedFlow<HomeUiEvent>()
    val uiEvent: SharedFlow<HomeUiEvent> = _uiEvent.asSharedFlow()

    private val _currentUser = MutableStateFlow<User?>(null)

    // --- Backward Compatibility Properties ---
    val categories: StateFlow<Resource<List<Category>>> = _uiState.map { 
        if (it.isLoadingFeed) Resource.Loading<List<Category>>() else Resource.Success(it.categories) 
    }.stateIn(viewModelScope, SharingStarted.Eagerly, Resource.Loading<List<Category>>())

    val brands: StateFlow<Resource<List<Brand>>> = _uiState.map { 
        if (it.isLoadingFeed) Resource.Loading<List<Brand>>() else Resource.Success(it.brands) 
    }.stateIn(viewModelScope, SharingStarted.Eagerly, Resource.Loading<List<Brand>>())

    val crops: StateFlow<Resource<List<Crop>>> = _uiState.map { 
        if (it.isLoadingFeed) Resource.Loading<List<Crop>>() else Resource.Success(it.crops) 
    }.stateIn(viewModelScope, SharingStarted.Eagerly, Resource.Loading<List<Crop>>())

    val banners: StateFlow<Resource<List<BannerItem>>> = _uiState.map { 
        if (it.isLoadingFeed) Resource.Loading<List<BannerItem>>() else Resource.Success(it.banners) 
    }.stateIn(viewModelScope, SharingStarted.Eagerly, Resource.Loading<List<BannerItem>>())

    val filteredProducts: StateFlow<Resource<List<Product>>> = _uiState.map { it.products }
        .stateIn(viewModelScope, SharingStarted.Eagerly, Resource.Loading<List<Product>>())

    val wishlistItems: StateFlow<List<Product>> = _uiState.map { it.wishlistItems }
        .stateIn(viewModelScope, SharingStarted.Eagerly, emptyList<Product>())

    val searchQuery: StateFlow<String> = _uiState.map { it.searchQuery }
        .stateIn(viewModelScope, SharingStarted.Eagerly, "")

    val sortOrder: StateFlow<ProductSortOrder> = _uiState.map { it.sortOrder }
        .stateIn(viewModelScope, SharingStarted.Eagerly, ProductSortOrder.DEFAULT)

    val cartCount: StateFlow<Int> = _uiState.map { it.cartCount }
        .stateIn(viewModelScope, SharingStarted.Eagerly, 0)
    // ----------------------------------------

    val pagedProducts: Flow<PagingData<Product>> = productRepository.getProductsPaged()
        .cachedIn(viewModelScope)

    init {
        loadHomeFeed()
        observeFilteredProducts()
        getCurrentUser()
        observeCartCount()
        observeWishlist()
        loadConfig()
        observeRecentlyViewed()
        observePersonalizedContent()
    }

    private fun loadConfig() {
        viewModelScope.launch {
            configRepository.getConfig().collect { resource ->
                if (resource is Resource.Success) {
                    _uiState.update { it.copy(config = resource.data) }
                }
            }
        }
    }

    private fun observeRecentlyViewed() {
        viewModelScope.launch {
            _currentUser.collectLatest { user ->
                val userId = user?.id ?: Constants.GUEST_USER_ID
                productDao.getRecentlyViewedProducts(userId)
                    .collectLatest { products ->
                        _uiState.update { it.copy(recentlyViewedProducts = products) }
                    }
            }
        }
    }

    private fun observePersonalizedContent() {
        viewModelScope.launch {
            _currentUser.collectLatest { user ->
                if (user != null) {
                    // Load Buy Again
                    orderRepository.getSuccessfulProducts(user.id).collect { resource ->
                        if (resource is Resource.Success) {
                            _uiState.update { it.copy(buyAgainProducts = resource.data ?: emptyList()) }
                        }
                    }
                    
                    // Load Seasonal Recommendations based on current month
                    val currentMonth = java.util.Calendar.getInstance().get(java.util.Calendar.MONTH)
                    val seasonalCategory = when (currentMonth) {
                        in 5..8 -> "Insecticide" // Monsoon: Pest control focus
                        in 10..1 -> "Seeds" // Winter: Sowing focus
                        else -> "Micro Nutrients" // Default: Nutrition focus
                    }
                    
                    productRepository.getProductsByCategory(seasonalCategory).collect { resource ->
                        if (resource is Resource.Success) {
                            _uiState.update { it.copy(seasonalProducts = resource.data ?: emptyList()) }
                        }
                    }

                    // Load Recommended for Your Crops (Personalized)
                    if (user.interestedCategories.isNotEmpty()) {
                        productRepository.getProductsByCategory(user.interestedCategories.first()).collect { resource ->
                            if (resource is Resource.Success) {
                                _uiState.update { it.copy(personalizedProducts = resource.data ?: emptyList()) }
                            }
                        }
                    }
                }
            }
        }
    }

    fun refreshAll() {
        _uiState.update { it.copy(isRefreshing = true) }
        loadHomeFeed()
    }

    private fun loadHomeFeed() {
        viewModelScope.launch {
            getHomeFeedUseCase().collect { data ->
                _uiState.update { it.copy(
                    banners = data.banners,
                    categories = data.categories,
                    crops = data.crops,
                    brands = data.brands,
                    isLoadingFeed = false,
                    isRefreshing = false
                ) }
            }
        }
    }

    private fun observeFilteredProducts() {
        uiState.map { it.searchQuery to it.sortOrder }
            .distinctUntilChanged()
            .flatMapLatest { (query, sort) ->
                if (query.isNotEmpty()) {
                    analyticsTracker.trackSearch(query)
                }
                getFilteredProductsUseCase(query, sort)
            }
            .onEach { resource ->
                _uiState.update { it.copy(products = resource) }
                if (resource is Resource.Success && resource.data.isNullOrEmpty() && _uiState.value.searchQuery.isNotEmpty()) {
                    analyticsTracker.trackSearch(_uiState.value.searchQuery, 0)
                } else if (resource is Resource.Success) {
                    analyticsTracker.trackSearch(_uiState.value.searchQuery, resource.data?.size ?: 0)
                }
            }
            .launchIn(viewModelScope)
    }

    private fun getCurrentUser() {
        viewModelScope.launch {
            authRepository.getCurrentUser().collectLatest { user ->
                // Check if Firebase Auth has a real user (not anonymous)
                val firebaseUser = com.google.firebase.auth.FirebaseAuth.getInstance().currentUser
                if (firebaseUser != null && !firebaseUser.isAnonymous) {
                    _currentUser.value = user
                } else {
                    _currentUser.value = null
                }
            }
        }
    }

    private fun observeCartCount() {
        viewModelScope.launch {
            _currentUser.collectLatest { user ->
                val userId = user?.id ?: Constants.GUEST_USER_ID
                cartRepository.getCartCount(userId).collectLatest { count ->
                    _uiState.update { it.copy(cartCount = count) }
                }
            }
        }
    }

    private fun observeWishlist() {
        viewModelScope.launch {
            _currentUser.collectLatest { user ->
                val userId = user?.id ?: Constants.GUEST_USER_ID
                wishlistRepository.getWishlist(userId).collectLatest { resource ->
                    if (resource is Resource.Success) {
                        _uiState.update { it.copy(wishlistItems = resource.data ?: emptyList()) }
                    }
                }
            }
        }
    }

    fun onSearchQueryChange(newQuery: String) {
        _uiState.update { it.copy(searchQuery = newQuery) }
    }

    fun onSortOrderChange(newOrder: ProductSortOrder) {
        _uiState.update { it.copy(sortOrder = newOrder) }
    }

    fun toggleWishlist(product: Product) {
        val currentUser = _currentUser.value
        if (currentUser == null || currentUser.id == Constants.GUEST_USER_ID) {
            viewModelScope.launch { _uiEvent.emit(HomeUiEvent.LoginRequired) }
            return
        }

        val userId = currentUser.id
        viewModelScope.launch {
            val isWishlisted = _uiState.value.wishlistItems.any { it.id == product.id }
            val wishlistItem = WishlistItem(
                productId = product.id,
                productName = product.name,
                price = product.basePrice,
                imageUrl = product.imageUrl.ifEmpty { product.images.firstOrNull() ?: "" },
                userId = userId
            )

            if (isWishlisted) {
                wishlistRepository.removeFromWishlist(wishlistItem).collectLatest { resource ->
                    if (resource is Resource.Success) {
                        _uiEvent.emit(HomeUiEvent.ShowSnackbar("${product.name} removed from wishlist"))
                    }
                }
            } else {
                wishlistRepository.addToWishlist(wishlistItem).collectLatest { resource ->
                    if (resource is Resource.Success) {
                        _uiEvent.emit(HomeUiEvent.ShowSnackbar("${product.name} added to wishlist"))
                    }
                }
            }
        }
    }

    fun addToCart(product: Product) {
        val userId = _currentUser.value?.id ?: Constants.GUEST_USER_ID
        
        viewModelScope.launch {
            try {
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
                        handleCartResource(resource, product.name)
                    }
                } else {
                    val cartItem = CartItem(
                        id = UUID.randomUUID().toString(),
                        userId = userId,
                        productId = product.id,
                        variantId = null,
                        quantity = 1
                    )
                    cartRepository.addToCart(cartItem).collectLatest { resource ->
                        handleCartResource(resource, product.name)
                    }
                }
            } catch (e: Exception) {
                _uiEvent.emit(HomeUiEvent.ShowSnackbar("Failed to add to cart: ${e.message}"))
            }
        }
    }

    private suspend fun handleCartResource(resource: Resource<Unit>, productName: String) {
        when (resource) {
            is Resource.Success -> {
                _uiEvent.emit(HomeUiEvent.ShowSnackbar("$productName added to cart"))
            }
            is Resource.Error -> {
                _uiEvent.emit(HomeUiEvent.ShowSnackbar(resource.message ?: "Failed to update cart"))
            }
            else -> {}
        }
    }
}
