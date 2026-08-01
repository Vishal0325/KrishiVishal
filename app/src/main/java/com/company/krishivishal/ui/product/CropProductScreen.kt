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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.navigation.compose.hiltViewModel
import com.company.krishivishal.core.model.Product
import com.company.krishivishal.ui.theme.PrimaryGreen
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.utils.ShareUtils

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CropProductScreen(
    cropId: String,
    cropName: String,
    onBack: () -> Unit,
    onProductClick: (Product) -> Unit,
    viewModel: ProductViewModel = hiltViewModel()
) {
    val productsResource by viewModel.cropProducts.collectAsState()
    val context = LocalContext.current

    LaunchedEffect(cropId, cropName) {
        viewModel.loadProductsByCrop(cropId, cropName)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(cropName, fontWeight = FontWeight.Bold) },
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
                .padding(padding)
                .fillMaxSize()
                .background(Color(0xFFF5F5F5))
        ) {
            when (val res = productsResource) {
                is Resource.Loading -> {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.Center), color = PrimaryGreen)
                }
                is Resource.Success -> {
                    val products = res.data ?: emptyList()
                    if (products.isEmpty()) {
                        Text("No products found for $cropName", modifier = Modifier.align(Alignment.Center))
                    } else {
                        LazyVerticalGrid(
                            columns = GridCells.Fixed(2),
                            contentPadding = PaddingValues(16.dp),
                            horizontalArrangement = Arrangement.spacedBy(16.dp),
                            verticalArrangement = Arrangement.spacedBy(16.dp)
                        ) {
                            items(products) { product ->
                                ProductItem(
                                    product = product, 
                                    onClick = { onProductClick(product) },
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
