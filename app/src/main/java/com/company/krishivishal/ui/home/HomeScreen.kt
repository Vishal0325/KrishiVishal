package com.company.krishivishal.ui.home

import androidx.compose.animation.*
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.company.krishivishal.R
import com.company.krishivishal.core.model.Product
import com.company.krishivishal.ui.components.EmptyState
import com.company.krishivishal.ui.components.ErrorState
import com.company.krishivishal.ui.components.LoginRequiredDialog
import com.company.krishivishal.ui.home.components.*
import com.company.krishivishal.ui.theme.PrimaryGreen
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.utils.ShareUtils
import kotlinx.coroutines.flow.collectLatest

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    onBrandClick: (String) -> Unit,
    onCategoryClick: (com.company.krishivishal.core.model.Category) -> Unit,
    onCropClick: (com.company.krishivishal.core.model.Crop) -> Unit,
    onProductClick: (Product) -> Unit,
    onBuyNowClick: (Product) -> Unit,
    onCartClick: () -> Unit,
    onWishlistClick: () -> Unit,
    onNotificationClick: () -> Unit,
    onViewAllCategories: () -> Unit = {},
    onViewAllCrops: () -> Unit = {},
    onViewAllBrands: () -> Unit = {},
    onViewAllProducts: () -> Unit = {},
    viewModel: HomeViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val snackbarHostState = remember { SnackbarHostState() }
    var showLoginDialog by remember { mutableStateOf(false) }
    
    val pullToRefreshState = rememberPullToRefreshState()

    LaunchedEffect(Unit) {
        viewModel.uiEvent.collectLatest { event ->
            when (event) {
                is HomeUiEvent.ShowSnackbar -> {
                    snackbarHostState.showSnackbar(event.message)
                }
                is HomeUiEvent.LoginRequired -> {
                    showLoginDialog = true
                }
                else -> {}
            }
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        containerColor = MaterialTheme.colorScheme.background,
        modifier = Modifier.fillMaxSize()
    ) { padding ->
        PullToRefreshBox(
            isRefreshing = uiState.isRefreshing,
            onRefresh = { viewModel.refreshAll() },
            state = pullToRefreshState,
            modifier = Modifier.padding(padding),
            indicator = {
                PullToRefreshDefaults.Indicator(
                    state = pullToRefreshState,
                    isRefreshing = uiState.isRefreshing,
                    containerColor = MaterialTheme.colorScheme.surface,
                    color = PrimaryGreen,
                    modifier = Modifier.align(Alignment.TopCenter)
                )
            }
        ) {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .background(MaterialTheme.colorScheme.background)
            ) {
                // Header
                item {
                    val notificationViewModel: com.company.krishivishal.ui.notification.NotificationViewModel = hiltViewModel()
                    val unreadCount by notificationViewModel.unreadCount.collectAsState(initial = 0)
                    
                    HomeHeader(
                        cartCount = uiState.cartCount,
                        unreadNotifications = unreadCount,
                        onWishlistClick = onWishlistClick,
                        onCartClick = onCartClick,
                        onNotificationClick = onNotificationClick
                    )
                }

                // Search Bar
                item {
                    SearchBarSection(
                        query = uiState.searchQuery,
                        onQueryChange = viewModel::onSearchQueryChange
                    )
                }

                // Horizontal Search Suggestions
                if (uiState.searchQuery.isNotEmpty()) {
                    val searchResults = (uiState.products as? Resource.Success)?.data ?: emptyList()
                    if (searchResults.isNotEmpty()) {
                        item {
                            SearchSuggestionsRow(
                                products = searchResults,
                                onProductClick = onProductClick
                            )
                        }
                    }
                }

                // Sorting Options
                item {
                    SortingSection(
                        selectedOrder = uiState.sortOrder,
                        onOrderChange = viewModel::onSortOrderChange
                    )
                }

                if (uiState.searchQuery.isEmpty()) {
                    // Banners
                    item {
                        if (uiState.isLoadingFeed) {
                            BannerShimmer()
                        } else {
                            BannerSection(Resource.Success(uiState.banners))
                        }
                    }

                    // Categories
                    item {
                        SectionHeader(
                            title = stringResource(R.string.top_categories),
                            onViewAll = onViewAllCategories
                        )
                        if (uiState.isLoadingFeed) {
                            CategoryRowShimmer()
                        } else {
                            LazyRow(
                                contentPadding = PaddingValues(horizontal = 16.dp),
                                horizontalArrangement = Arrangement.spacedBy(16.dp)
                            ) {
                                items(uiState.categories, key = { it.id }) { category ->
                                    HomeCategoryItem(
                                        category = category,
                                        onClick = { onCategoryClick(category) })
                                }
                            }
                        }
                    }

                    // Crops
                    item {
                        SectionHeader(
                            title = stringResource(R.string.crops_label),
                            onViewAll = onViewAllCrops
                        )
                        if (uiState.isLoadingFeed) {
                            CategoryRowShimmer()
                        } else {
                            LazyRow(
                                contentPadding = PaddingValues(horizontal = 16.dp),
                                horizontalArrangement = Arrangement.spacedBy(16.dp)
                            ) {
                                items(uiState.crops, key = { it.id }) { crop ->
                                    HomeCropItem(crop = crop, onClick = { onCropClick(crop) })
                                }
                            }
                        }
                    }

                    // Brands
                    item {
                        SectionHeader(
                            title = stringResource(R.string.popular_brands),
                            onViewAll = onViewAllBrands
                        )
                        if (uiState.isLoadingFeed) {
                            CategoryRowShimmer() // Reusing category shimmer for brands
                        } else {
                            LazyRow(
                                contentPadding = PaddingValues(horizontal = 16.dp),
                                horizontalArrangement = Arrangement.spacedBy(16.dp)
                            ) {
                                items(uiState.brands, key = { it.id }) { brand ->
                                    BrandItem(brand = brand, onClick = { onBrandClick(brand.name) })
                                }
                            }
                        }
                    }
                }

                // Products Section
                item {
                    val title = if (uiState.searchQuery.isEmpty()) {
                        stringResource(R.string.recommended_products)
                    } else {
                        "Search Results"
                    }
                    SectionHeader(title = title, onViewAll = onViewAllProducts)
                }

                when (val res = uiState.products) {
                    is Resource.Loading -> item { ProductGridShimmer() }
                    is Resource.Success -> {
                        val products = res.data ?: emptyList()
                        if (products.isEmpty()) {
                            item {
                                EmptyState(
                                    message = stringResource(R.string.no_products_found),
                                    icon = Icons.Default.Inventory
                                )
                            }
                        } else {
                            val rows = products.chunked(2)
                            items(rows.size) { rowIndex ->
                                val row = rows[rowIndex]
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(horizontal = 16.dp, vertical = 8.dp),
                                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                                ) {
                                    row.forEach { product ->
                                        AnimatedProductItem(
                                            product = product,
                                            isWishlisted = uiState.wishlistItems.any { it.id == product.id },
                                            onClick = { onProductClick(product) },
                                            onAddToCart = { viewModel.addToCart(product) },
                                            onBuyNow = { onBuyNowClick(product) },
                                            onWishlistToggle = { viewModel.toggleWishlist(product) },
                                            onShare = { ShareUtils.shareProduct(context, product) }
                                        )
                                    }
                                    if (row.size == 1) {
                                        Spacer(modifier = Modifier.weight(1f))
                                    }
                                }
                            }
                        }
                    }
                    is Resource.Error -> item { 
                        ErrorState(
                            message = res.message ?: stringResource(R.string.something_went_wrong),
                            onRetry = { viewModel.refreshAll() }
                        )
                    }
                    else -> {}
                }
                
                item { Spacer(modifier = Modifier.height(20.dp)) }
            }
        }

        if (showLoginDialog) {
            LoginRequiredDialog(
                onDismiss = { showLoginDialog = false },
                onLoginClick = { 
                    // Set state in main screen to show login
                    // For now we'll just navigate if we had the callback, 
                    // but HomeScreen usually doesn't have onLoginClick.
                    // Assuming we'll add it or use a shared state.
                }
            )
        }
    }
}

@Composable
fun HomeHeader(
    cartCount: Int,
    unreadNotifications: Int,
    onWishlistClick: () -> Unit,
    onCartClick: () -> Unit,
    onNotificationClick: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = stringResource(R.string.app_name),
            style = MaterialTheme.typography.titleLarge,
            fontWeight = FontWeight.Bold,
            color = PrimaryGreen
        )
        
        Row {
            IconButton(onClick = onWishlistClick) {
                Icon(
                    imageVector = Icons.Default.FavoriteBorder,
                    contentDescription = stringResource(R.string.my_wishlist)
                )
            }
            
            BadgedBox(
                badge = {
                    if (unreadNotifications > 0) {
                        Badge(containerColor = MaterialTheme.colorScheme.error) {
                            val count = if (unreadNotifications > 9) "9+" else unreadNotifications.toString()
                            Text(text = count, color = Color.White)
                        }
                    }
                }
            ) {
                IconButton(onClick = onNotificationClick) {
                    Icon(
                        imageVector = Icons.Default.NotificationsNone,
                        contentDescription = "Notifications"
                    )
                }
            }
            
            BadgedBox(
                badge = {
                    if (cartCount > 0) {
                        Badge(containerColor = MaterialTheme.colorScheme.error) {
                            Text(text = cartCount.toString(), color = Color.White)
                        }
                    }
                }
            ) {
                IconButton(onClick = onCartClick) {
                    Icon(
                        imageVector = Icons.Default.ShoppingCart,
                        contentDescription = stringResource(R.string.my_cart)
                    )
                }
            }
        }
    }
}

@Composable
fun SearchBarSection(
    query: String,
    onQueryChange: (String) -> Unit
) {
    OutlinedTextField(
        value = query,
        onValueChange = onQueryChange,
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        placeholder = { Text(stringResource(R.string.search_products)) },
        leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
        shape = RoundedCornerShape(16.dp),
        colors = OutlinedTextFieldDefaults.colors(
            focusedBorderColor = PrimaryGreen,
            unfocusedBorderColor = MaterialTheme.colorScheme.outlineVariant
        ),
        singleLine = true
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SortingSection(
    selectedOrder: ProductSortOrder,
    onOrderChange: (ProductSortOrder) -> Unit
) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = 16.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier.padding(vertical = 4.dp)
    ) {
        ProductSortOrder.entries.forEach { order ->
            item {
                FilterChip(
                    selected = selectedOrder == order,
                    onClick = { onOrderChange(order) },
                    label = { 
                        Text(
                            when(order) {
                                ProductSortOrder.DEFAULT -> "All"
                                ProductSortOrder.PRICE_LOW_HIGH -> "Price: Low to High"
                                ProductSortOrder.PRICE_HIGH_LOW -> "Price: High to Low"
                                ProductSortOrder.RATING -> "Top Rated"
                                ProductSortOrder.DISCOUNT -> "Best Discount"
                            }
                        ) 
                    },
                    leadingIcon = if (selectedOrder == order) {
                        { Icon(Icons.Default.Done, contentDescription = null, modifier = Modifier.size(FilterChipDefaults.IconSize)) }
                    } else null
                )
            }
        }
    }
}

@Composable
fun RowScope.AnimatedProductItem(
    product: Product,
    isWishlisted: Boolean,
    onClick: () -> Unit,
    onAddToCart: () -> Unit,
    onBuyNow: () -> Unit,
    onWishlistToggle: () -> Unit,
    onShare: () -> Unit
) {
    Box(modifier = Modifier.weight(1f)) {
        var visible by remember { mutableStateOf(false) }
        LaunchedEffect(Unit) { visible = true }
        
        androidx.compose.animation.AnimatedVisibility(
            visible = visible,
            enter = fadeIn(animationSpec = tween(500)) + scaleIn(initialScale = 0.9f)
        ) {
            HomeProductItem(
                product = product,
                isWishlisted = isWishlisted,
                onClick = onClick,
                onAddToCart = onAddToCart,
                onBuyNow = onBuyNow,
                onWishlistToggle = onWishlistToggle,
                onShare = onShare
            )
        }
    }
}
