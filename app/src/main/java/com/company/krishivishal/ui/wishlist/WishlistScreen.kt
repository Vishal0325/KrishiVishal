package com.company.krishivishal.ui.wishlist

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.navigation.compose.hiltViewModel
import com.company.krishivishal.core.model.Product
import com.company.krishivishal.ui.home.components.HomeProductItem
import com.company.krishivishal.ui.theme.PrimaryGreen
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.utils.ShareUtils
import com.company.krishivishal.ui.components.EmptyState


@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WishlistScreen(
    onBack: () -> Unit,
    onProductClick: (Product) -> Unit,
    onAddToCart: (Product) -> Unit,
    onBuyNow: (Product) -> Unit,
    viewModel: WishlistViewModel = hiltViewModel()
) {
    val wishlistResource by viewModel.wishlistItems.collectAsState()
    val context = LocalContext.current

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("My Wishlist", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White)
            )
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(Color(0xFFF5F5F5))
        ) {
            val items = wishlistResource.data ?: emptyList()

            if (items.isEmpty()) {
                when (val res = wishlistResource) {
                    is Resource.Loading -> {
                        CircularProgressIndicator(
                            modifier = Modifier.align(Alignment.Center),
                            color = PrimaryGreen
                        )
                    }
                    is Resource.Error -> {
                        Text(
                            text = "Error: ${res.message}",
                            modifier = Modifier.align(Alignment.Center).padding(16.dp),
                            color = Color.Red
                        )
                    }
                    else -> {
                        EmptyState(
                            icon = Icons.Default.Favorite,
                            title = "Your wishlist is empty",
                            description = "Explore products and add them to your wishlist to buy later.",
                            actionText = "Go Shopping",
                            onActionClick = onBack
                        )
                    }
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    // Display items in 2 columns
                    val chunkedItems = items.chunked(2)
                    items(chunkedItems) { row ->
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.spacedBy(16.dp)
                        ) {
                            row.forEach { product ->
                                Box(modifier = Modifier.weight(1f)) {
                                    HomeProductItem(
                                        product = product,
                                        isWishlisted = true,
                                        onClick = { onProductClick(product) },
                                        onAddToCart = { onAddToCart(product) },
                                        onBuyNow = { onBuyNow(product) },
                                        onWishlistToggle = { viewModel.removeFromWishlist(product) },
                                        onShare = { ShareUtils.shareProduct(context, product) }
                                    )
                                }
                            }
                            if (row.size == 1) {
                                Spacer(modifier = Modifier.weight(1f))
                            }
                        }
                    }
                }
            }
        }
    }
}
