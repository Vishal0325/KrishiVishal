package com.company.krishivishal.ui.product

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import com.company.krishivishal.data.model.Product
import com.company.krishivishal.ui.theme.PrimaryGreen
import com.company.krishivishal.utils.Resource
import com.company.krishivishal.utils.ShareUtils
import androidx.compose.material.icons.filled.Share


@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BrandProductScreen(
    brandName: String,
    onBack: () -> Unit,
    onProductClick: (Product) -> Unit,
    viewModel: ProductViewModel = hiltViewModel()
) {
    val productsResource by viewModel.brandProducts.collectAsState()
    val context = LocalContext.current

    LaunchedEffect(brandName) {
        viewModel.loadProductsByBrand(brandName)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(brandName, fontWeight = FontWeight.Bold) },
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
                        Text("No products found for $brandName", modifier = Modifier.align(Alignment.Center))
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

@Composable
fun ProductItem(product: Product, onClick: () -> Unit, onShare: () -> Unit) {
    val displayPrice = if (product.price > 0) product.price else if (product.discountedPrice > 0) product.discountedPrice else product.basePrice
    val displayMrp = if (product.mrp > 0) product.mrp else product.basePrice
    
    val discount = if (displayMrp > displayPrice) {
        (((displayMrp - displayPrice) / displayMrp) * 100).toInt()
    } else {
        product.discountPercent
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onClick() },
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(150.dp)
                    .background(Color.White),
                contentAlignment = Alignment.Center
            ) {
                AsyncImage(
                    model = product.imageUrl.ifEmpty { product.images.firstOrNull() },
                    contentDescription = product.name,
                    modifier = Modifier.fillMaxSize().padding(8.dp),
                    contentScale = ContentScale.Fit
                )

                // Discount Badge
                if (discount > 0) {
                    Surface(
                        color = Color(0xFFFF9800),
                        shape = RoundedCornerShape(topStart = 12.dp, bottomEnd = 8.dp),
                        modifier = Modifier.align(Alignment.TopStart)
                    ) {
                        Text(
                            text = "$discount% OFF",
                            color = Color.White,
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp)
                        )
                    }
                }

                // Share Button Overlay
                IconButton(
// ... rest of IconButton ...
                    onClick = onShare,
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(4.dp)
                        .size(30.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Share,
                        contentDescription = "Share",
                        tint = Color.Gray,
                        modifier = Modifier.size(16.dp)
                    )
                }
            }
            
            Column(modifier = Modifier.padding(12.dp)) {
                Text(
                    text = product.name,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    minLines = 2
                )

                if (product.composition.isNotEmpty()) {
                    Text(
                        text = product.composition,
                        fontSize = 11.sp,
                        color = Color.DarkGray,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(top = 2.dp)
                    )
                }
                
                Spacer(modifier = Modifier.height(4.dp))
                
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "₹${displayPrice.toInt()}",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = PrimaryGreen
                    )
                    if (displayMrp > displayPrice) {
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "₹${displayMrp.toInt()}",
                            fontSize = 12.sp,
                            color = Color.Gray,
                            style = MaterialTheme.typography.bodySmall.copy(
                                textDecoration = androidx.compose.ui.text.style.TextDecoration.LineThrough
                            )
                        )
                    }
                }
                
                Spacer(modifier = Modifier.height(4.dp))
                
                Text(
                    text = when {
                        product.weight.isNotBlank() -> product.weight
                        product.unit.isNotBlank() -> product.unit
                        product.variants.firstOrNull { it.size.isNotBlank() } != null -> product.variants.first { it.size.isNotBlank() }.size
                        else -> "N/A"
                    },
                    fontSize = 12.sp,
                    color = Color.Gray
                )
            }
        }
    }
}
