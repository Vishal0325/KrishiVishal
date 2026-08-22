package com.company.krishivishal.ui.home

import androidx.compose.animation.*
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.*
import androidx.compose.runtime.*
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.company.krishivishal.R
import com.company.krishivishal.core.model.Product
import com.company.krishivishal.core.model.Category
import com.company.krishivishal.core.model.Crop
import com.company.krishivishal.core.model.BannerItem
import com.company.krishivishal.ui.components.EmptyState
import com.company.krishivishal.ui.components.ErrorState
import com.company.krishivishal.ui.components.LoginRequiredDialog
import com.company.krishivishal.ui.home.components.*
import com.company.krishivishal.ui.theme.PrimaryGreen
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.utils.ShareUtils
import com.company.krishivishal.ui.notification.NotificationViewModel
import kotlinx.coroutines.flow.collectLatest

import androidx.paging.compose.collectAsLazyPagingItems
import androidx.paging.compose.itemContentType
import androidx.paging.compose.itemKey
import androidx.paging.LoadState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HomeScreen(
    onBrandClick: (String) -> Unit,
    onCategoryClick: (Category) -> Unit,
    onCropClick: (Crop) -> Unit,
    onProductClick: (Product) -> Unit,
    onBuyNowClick: (Product) -> Unit,
    onCartClick: () -> Unit,
    onWishlistClick: () -> Unit,
    onNotificationClick: () -> Unit,
    onViewAllCategories: () -> Unit = {},
    onViewAllCrops: () -> Unit = {},
    onViewAllBrands: () -> Unit = {},
    onViewAllProducts: () -> Unit = {},
    onSearchClick: () -> Unit = {},
    viewModel: HomeViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsStateWithLifecycle()
    val pagedProducts = viewModel.pagedProducts.collectAsLazyPagingItems()
    
    // Move notification logic to top level for stability
    val notificationViewModel: NotificationViewModel = hiltViewModel()
    val unreadCount by notificationViewModel.unreadCount.collectAsState(initial = 0)
    
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
            onRefresh = { 
                viewModel.refreshAll()
                pagedProducts.refresh()
            },
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
                // Header, Search Bar, Suggestions, Sorting, Banners, Categories, Crops, Brands (Same as before)
                item {
                    HomeHeader(
                        cartCount = uiState.cartCount,
                        unreadNotifications = unreadCount,
                        onWishlistClick = onWishlistClick,
                        onCartClick = onCartClick,
                        onNotificationClick = onNotificationClick
                    )
                }

                item {
                    SearchBarSection(
                        onSearchClick = onSearchClick
                    )
                }


                item {
                    SortingSection(
                        selectedOrder = uiState.sortOrder,
                        onOrderChange = viewModel::onSortOrderChange
                    )
                }

                if (uiState.searchQuery.isEmpty()) {
                    item {
                        if (uiState.isLoadingFeed) BannerShimmer()
                        else BannerSection(Resource.Success(uiState.banners))
                    }

                    item {
                        SectionHeader(title = stringResource(R.string.top_categories), onViewAll = onViewAllCategories)
                        if (uiState.isLoadingFeed) CategoryRowShimmer()
                        else {
                            LazyRow(
                                contentPadding = PaddingValues(horizontal = 16.dp),
                                horizontalArrangement = Arrangement.spacedBy(16.dp)
                            ) {
                                items(uiState.categories, key = { it.id.ifEmpty { "cat_${it.name}" } }) { category ->
                                    HomeCategoryItem(category = category, onClick = { onCategoryClick(category) })
                                }
                            }
                        }
                    }

                    item {
                        SectionHeader(title = stringResource(R.string.crops_label), onViewAll = onViewAllCrops)
                        if (uiState.isLoadingFeed) CategoryRowShimmer()
                        else {
                            LazyRow(
                                contentPadding = PaddingValues(horizontal = 16.dp),
                                horizontalArrangement = Arrangement.spacedBy(16.dp)
                            ) {
                                items(uiState.crops, key = { it.id.ifEmpty { "crop_${it.name}" } }) { crop ->
                                    HomeCropItem(crop = crop, onClick = { onCropClick(crop) })
                                }
                            }
                        }
                    }

                    // P1-4 Buy Again Section
                    if (uiState.buyAgainProducts.isNotEmpty() && uiState.config?.ff_buy_again == true) {
                        item {
                            SectionHeader(title = stringResource(R.string.buy_again_title), onViewAll = {})
                            LazyRow(
                                contentPadding = PaddingValues(horizontal = 16.dp),
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                items(uiState.buyAgainProducts) { product ->
                                    Box(modifier = Modifier.width(160.dp)) {
                                        HomeProductItem(
                                            product = product,
                                            isWishlisted = uiState.wishlistItems.any { it.id == product.id },
                                            onClick = { onProductClick(product) },
                                            onAddToCart = { viewModel.addToCart(product) },
                                            onBuyNow = { onBuyNowClick(product) },
                                            onWishlistToggle = { viewModel.toggleWishlist(product) },
                                            onShare = { ShareUtils.shareProduct(context, product) }
                                        )
                                    }
                                }
                            }
                        }
                    }

                    // P2-1 Seasonal Picks
                    if (uiState.seasonalProducts.isNotEmpty() && uiState.config?.ff_seasonal_recommendations == true) {
                        item {
                            SectionHeader(title = stringResource(R.string.seasonal_picks_title), onViewAll = {})
                            LazyRow(
                                contentPadding = PaddingValues(horizontal = 16.dp),
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                items(uiState.seasonalProducts) { product ->
                                    Box(modifier = Modifier.width(160.dp)) {
                                        HomeProductItem(
                                            product = product,
                                            isWishlisted = uiState.wishlistItems.any { it.id == product.id },
                                            onClick = { onProductClick(product) },
                                            onAddToCart = { viewModel.addToCart(product) },
                                            onBuyNow = { onBuyNowClick(product) },
                                            onWishlistToggle = { viewModel.toggleWishlist(product) },
                                            onShare = { ShareUtils.shareProduct(context, product) }
                                        )
                                    }
                                }
                            }
                        }
                    }

                    // P2-2 Recently Viewed
                    if (uiState.recentlyViewedProducts.isNotEmpty() && uiState.config?.ff_personalized_home == true) {
                        item {
                            SectionHeader(title = stringResource(R.string.recently_viewed_title), onViewAll = {})
                            LazyRow(
                                contentPadding = PaddingValues(horizontal = 16.dp),
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                items(uiState.recentlyViewedProducts) { product ->
                                    Box(modifier = Modifier.width(160.dp)) {
                                        HomeProductItem(
                                            product = product,
                                            isWishlisted = uiState.wishlistItems.any { it.id == product.id },
                                            onClick = { onProductClick(product) },
                                            onAddToCart = { viewModel.addToCart(product) },
                                            onBuyNow = { onBuyNowClick(product) },
                                            onWishlistToggle = { viewModel.toggleWishlist(product) },
                                            onShare = { ShareUtils.shareProduct(context, product) }
                                        )
                                    }
                                }
                            }
                        }
                    }

                    // P2-2 Recommended for You
                    if (uiState.personalizedProducts.isNotEmpty() && uiState.config?.ff_personalized_home == true) {
                        item {
                            SectionHeader(title = stringResource(R.string.recommended_for_you_title), onViewAll = {})
                            LazyRow(
                                contentPadding = PaddingValues(horizontal = 16.dp),
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                items(uiState.personalizedProducts) { product ->
                                    Box(modifier = Modifier.width(160.dp)) {
                                        HomeProductItem(
                                            product = product,
                                            isWishlisted = uiState.wishlistItems.any { it.id == product.id },
                                            onClick = { onProductClick(product) },
                                            onAddToCart = { viewModel.addToCart(product) },
                                            onBuyNow = { onBuyNowClick(product) },
                                            onWishlistToggle = { viewModel.toggleWishlist(product) },
                                            onShare = { ShareUtils.shareProduct(context, product) }
                                        )
                                    }
                                }
                            }
                        }
                    }

                    item {
                        SectionHeader(title = stringResource(R.string.popular_brands), onViewAll = onViewAllBrands)
                        if (uiState.isLoadingFeed) CategoryRowShimmer()
                        else {
                            LazyRow(
                                contentPadding = PaddingValues(horizontal = 16.dp),
                                horizontalArrangement = Arrangement.spacedBy(16.dp)
                            ) {
                                items(uiState.brands, key = { it.id.ifEmpty { "brand_${it.name}" } }) { brand ->
                                    BrandItem(brand = brand, onClick = { onBrandClick(brand.name) })
                                }
                            }
                        }
                    }
                }

                // Products Section with Paging Support
                item {
                    val title = if (uiState.searchQuery.isEmpty()) {
                        stringResource(R.string.recommended_products)
                    } else {
                        "Search Results"
                    }
                    SectionHeader(title = title, onViewAll = onViewAllProducts)
                }

                if (uiState.searchQuery.isEmpty()) {
                    // Optimized 2-column Grid for Paging3
                    val itemCount = pagedProducts.itemCount
                    
                    items(
                        count = (itemCount + 1) / 2,
                        key = { index -> "row_$index" } // Added stable key for performance
                    ) { rowIndex ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(horizontal = 16.dp, vertical = 8.dp),
                            horizontalArrangement = Arrangement.spacedBy(16.dp)
                        ) {
                            val firstIndex = rowIndex * 2
                            val secondIndex = firstIndex + 1
                            
                            // First Column
                            val product1 = pagedProducts[firstIndex]
                            if (product1 != null) {
                                AnimatedProductItem(
                                    product = product1,
                                    isWishlisted = uiState.wishlistItems.any { it.id == product1.id },
                                    onClick = { onProductClick(product1) },
                                    onAddToCart = { viewModel.addToCart(product1) },
                                    onBuyNow = { onBuyNowClick(product1) },
                                    onWishlistToggle = { viewModel.toggleWishlist(product1) },
                                    onShare = { ShareUtils.shareProduct(context, product1) }
                                )
                            } else if (firstIndex < itemCount) {
                                Box(modifier = Modifier.weight(1f)) { ProductItemShimmer() }
                            }

                            // Second Column
                            if (secondIndex < itemCount) {
                                val product2 = pagedProducts[secondIndex]
                                if (product2 != null) {
                                    AnimatedProductItem(
                                        product = product2,
                                        isWishlisted = uiState.wishlistItems.any { it.id == product2.id },
                                        onClick = { onProductClick(product2) },
                                        onAddToCart = { viewModel.addToCart(product2) },
                                        onBuyNow = { onBuyNowClick(product2) },
                                        onWishlistToggle = { viewModel.toggleWishlist(product2) },
                                        onShare = { ShareUtils.shareProduct(context, product2) }
                                    )
                                } else {
                                    Box(modifier = Modifier.weight(1f)) { ProductItemShimmer() }
                                }
                            } else {
                                Spacer(modifier = Modifier.weight(1f))
                            }
                        }
                    }

                    // Handle Loading & Error states for Paging
                    when (pagedProducts.loadState.append) {
                        is LoadState.Loading -> item { ProductGridShimmer() }
                        is LoadState.Error -> item { 
                            ErrorState(
                                message = "Error loading more products",
                                onRetry = { pagedProducts.retry() }
                            )
                        }
                        else -> {}
                    }
                    
                    if (pagedProducts.loadState.refresh is LoadState.Loading && pagedProducts.itemCount == 0) {
                        item { ProductGridShimmer() }
                    }
                } else {
                    // Search Results logic
                    val res = uiState.products
                    if (res is Resource.Success) {
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
                                    for (product in row) {
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
                                    if (row.size == 1) Spacer(modifier = Modifier.weight(1f))
                                }
                            }
                        }
                    }
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
    onSearchClick: () -> Unit
) {
    OutlinedCard(
        onClick = onSearchClick,
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        shape = RoundedCornerShape(16.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        colors = CardDefaults.outlinedCardColors(containerColor = Color.Transparent)
    ) {
        Row(
            modifier = Modifier
                .padding(horizontal = 16.dp, vertical = 14.dp)
                .fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = Icons.Default.Search,
                contentDescription = null,
                tint = Color.Gray
            )
            Spacer(modifier = Modifier.width(12.dp))
            Text(
                text = "क्या खोज रहे हैं? (Search...)",
                color = Color.Gray,
                style = MaterialTheme.typography.bodyLarge,
                modifier = Modifier.weight(1f)
            )
            IconButton(onClick = onSearchClick, modifier = Modifier.size(28.dp)) {
                Icon(Icons.Default.Mic, contentDescription = "Voice Search", tint = PrimaryGreen)
            }
        }
    }
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
        ProductSortOrder.values().forEach { order ->
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
