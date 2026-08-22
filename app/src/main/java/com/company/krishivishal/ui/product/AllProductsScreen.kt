package com.company.krishivishal.ui.product

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.company.krishivishal.core.model.Product
import com.company.krishivishal.ui.home.HomeViewModel
import com.company.krishivishal.ui.home.components.HomeProductItem
import com.company.krishivishal.ui.theme.Background
import com.company.krishivishal.ui.theme.PrimaryGreen
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.utils.ShareUtils
import androidx.paging.compose.collectAsLazyPagingItems
import androidx.paging.compose.itemKey
import androidx.paging.LoadState
import com.company.krishivishal.ui.components.EmptyState
import androidx.compose.material.icons.filled.SearchOff

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AllProductsScreen(
    onProductClick: (Product) -> Unit,
    onBuyNowClick: (Product) -> Unit,
    onBack: () -> Unit,
    viewModel: HomeViewModel = hiltViewModel()
) {
    val pagedProducts = viewModel.pagedProducts.collectAsLazyPagingItems()
    val wishlistItems by viewModel.wishlistItems.collectAsState()
    val context = LocalContext.current

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        TopAppBar(
            title = { Text("Recommended Products", fontWeight = FontWeight.Bold) },
            navigationIcon = {
                IconButton(onClick = onBack) {
                    Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                }
            },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
        )

        Box(modifier = Modifier.fillMaxSize()) {
            LazyVerticalGrid(
                columns = GridCells.Fixed(2),
                contentPadding = PaddingValues(16.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                modifier = Modifier.fillMaxSize()
            ) {
                items(
                    count = pagedProducts.itemCount,
                    key = pagedProducts.itemKey { it.id }
                ) { index ->
                    val product = pagedProducts[index]
                    if (product != null) {
                        HomeProductItem(
                            product = product,
                            isWishlisted = wishlistItems.any { it.id == product.id },
                            onClick = { onProductClick(product) },
                            onAddToCart = { viewModel.addToCart(product) },
                            onBuyNow = { onBuyNowClick(product) },
                            onWishlistToggle = { viewModel.toggleWishlist(product) },
                            onShare = { ShareUtils.shareProduct(context, product) }
                        )
                    }
                }

                // Loading more state
                if (pagedProducts.loadState.append is LoadState.Loading) {
                    item {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(16.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            CircularProgressIndicator(color = PrimaryGreen, modifier = Modifier.size(32.dp))
                        }
                    }
                }
            }

            // Initial Loading
            if (pagedProducts.loadState.refresh is LoadState.Loading) {
                CircularProgressIndicator(
                    modifier = Modifier.align(Alignment.Center),
                    color = PrimaryGreen
                )
            }

            // Empty State
            if (pagedProducts.loadState.refresh is LoadState.NotLoading && pagedProducts.itemCount == 0) {
                EmptyState(
                    icon = Icons.Default.SearchOff,
                    title = "No products found",
                    description = "We couldn't find any products at the moment. Please check back later.",
                    actionText = "Go Back",
                    onActionClick = onBack
                )
            }

            // Error State
            if (pagedProducts.loadState.refresh is LoadState.Error) {
                val e = pagedProducts.loadState.refresh as LoadState.Error
                Column(
                    modifier = Modifier.align(Alignment.Center).padding(16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text(text = e.error.localizedMessage ?: "Error loading products", color = Color.Red)
                    Spacer(modifier = Modifier.height(8.dp))
                    Button(onClick = { pagedProducts.retry() }, colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen)) {
                        Text("Retry")
                    }
                }
            }
        }
    }
}
