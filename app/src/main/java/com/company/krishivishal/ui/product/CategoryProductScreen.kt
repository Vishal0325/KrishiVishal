package com.company.krishivishal.ui.product

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.company.krishivishal.core.model.Product
import com.company.krishivishal.ui.theme.PrimaryGreen
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.utils.ShareUtils
import com.company.krishivishal.ui.home.components.HomeProductItem

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CategoryProductScreen(
    categoryName: String,
    subCategoryName: String? = null,
    onBack: () -> Unit,
    onProductClick: (Product) -> Unit,
    viewModel: ProductViewModel = hiltViewModel()
) {
    val productsResource by viewModel.categoryProducts.collectAsState()
    val context = LocalContext.current

    LaunchedEffect(categoryName, subCategoryName) {
        if (subCategoryName != null) {
            viewModel.loadProductsBySubCategory(categoryName, subCategoryName)
        } else {
            viewModel.loadProductsByCategory(categoryName)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(subCategoryName ?: categoryName, fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
            )
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
                .background(MaterialTheme.colorScheme.background)
        ) {
            when (val res = productsResource) {
                is Resource.Loading -> {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.Center), color = PrimaryGreen)
                }
                is Resource.Success -> {
                    val products = res.data ?: emptyList()
                    if (products.isEmpty()) {
                        Text("No products found.", modifier = Modifier.align(Alignment.Center))
                    } else {
                        LazyVerticalGrid(
                            columns = GridCells.Fixed(2),
                            contentPadding = PaddingValues(16.dp),
                            horizontalArrangement = Arrangement.spacedBy(16.dp),
                            verticalArrangement = Arrangement.spacedBy(16.dp)
                        ) {
                            items(products) { product ->
                                HomeProductItem(
                                    product = product,
                                    isWishlisted = false, // Simplified
                                    onClick = { onProductClick(product) },
                                    onAddToCart = { /* Add to cart */ },
                                    onBuyNow = { /* Buy now */ },
                                    onWishlistToggle = { /* Toggle */ },
                                    onShare = { ShareUtils.shareProduct(context, product) }
                                )
                            }
                        }
                    }
                }
                is Resource.Error -> {
                    Text("Error: ${res.message}", modifier = Modifier.align(Alignment.Center), color = Color.Red)
                }
                else -> {}
            }
        }
    }
}
