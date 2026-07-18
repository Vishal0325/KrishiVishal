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
import com.company.krishivishal.data.model.Product
import com.company.krishivishal.ui.home.HomeViewModel
import com.company.krishivishal.ui.home.components.HomeProductItem
import com.company.krishivishal.ui.theme.Background
import com.company.krishivishal.ui.theme.PrimaryGreen
import com.company.krishivishal.utils.Resource
import com.company.krishivishal.utils.ShareUtils

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AllProductsScreen(
    onProductClick: (Product) -> Unit,
    onBuyNowClick: (Product) -> Unit,
    onBack: () -> Unit,
    viewModel: HomeViewModel = hiltViewModel()
) {
    val productsResource by viewModel.filteredProducts.collectAsState()
    val wishlistItems by viewModel.wishlistItems.collectAsState()
    val context = LocalContext.current

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Background)
    ) {
        TopAppBar(
            title = { Text("Recommended Products", fontWeight = FontWeight.Bold) },
            navigationIcon = {
                IconButton(onClick = onBack) {
                    Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                }
            },
            colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White)
        )

        when (val res = productsResource) {
            is Resource.Loading -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = PrimaryGreen)
                }
            }
            is Resource.Success -> {
                val products = res.data ?: emptyList()
                if (products.isEmpty()) {
                    Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                        Text("No products found.")
                    }
                } else {
                    LazyVerticalGrid(
                        columns = GridCells.Fixed(2),
                        contentPadding = PaddingValues(16.dp),
                        horizontalArrangement = Arrangement.spacedBy(12.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp),
                        modifier = Modifier.fillMaxSize()
                    ) {
                        items(products) { product ->
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
                }
            }
            is Resource.Error -> {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text(text = res.message ?: "Error loading products")
                }
            }
            else -> {}
        }
    }
}
