package com.company.krishivishal.ui.home.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import androidx.compose.ui.res.stringResource
import com.company.krishivishal.R
import com.company.krishivishal.core.model.*
import com.company.krishivishal.ui.theme.PrimaryGreen
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.ui.components.AnimatedHeartButton

@Composable
fun SectionHeader(title: String, onViewAll: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            text = title,
            fontSize = 18.sp,
            fontWeight = FontWeight.Bold,
            color = Color.Black
        )
        Text(
            text = stringResource(R.string.view_all),
            fontSize = 14.sp,
            color = PrimaryGreen,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.clickable { onViewAll() }
        )
    }
}

@Composable
fun BannerSection(bannersResource: Resource<List<BannerItem>>) {
    when (val res = bannersResource) {
        is Resource.Success -> {
            val banners = res.data ?: emptyList()
            if (banners.isNotEmpty()) {
                LazyRow(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(180.dp),
                    contentPadding = PaddingValues(horizontal = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(banners) { banner ->
                        Card(
                            modifier = Modifier
                                .width(300.dp)
                                .fillMaxHeight(),
                            shape = RoundedCornerShape(16.dp)
                        ) {
                            AsyncImage(
                                model = banner.imageUrl,
                                contentDescription = null,
                                modifier = Modifier.fillMaxSize(),
                                contentScale = ContentScale.Crop
                            )
                        }
                    }
                }
            }
        }
        else -> {}
    }
}

@Composable
fun HomeProductItem(
    product: Product,
    isWishlisted: Boolean,
    onClick: () -> Unit,
    onAddToCart: () -> Unit,
    onBuyNow: () -> Unit,
    onWishlistToggle: () -> Unit,
    onShare: () -> Unit
) {
    val isOutOfStock = product.stockQuantity <= 0 || !product.isActive
    val firstVariant = product.variants.firstOrNull()
    
    val sellingPrice = when {
        firstVariant != null -> firstVariant.price
        product.discountedPrice > 0 -> product.discountedPrice
        else -> product.basePrice
    }
    
    val mrp = when {
        firstVariant != null -> firstVariant.basePrice
        product.mrp > 0 -> product.mrp
        else -> product.basePrice.coerceAtLeast(sellingPrice)
    }
    
    // Auto-calculate discount percentage
    val discount = if (mrp > sellingPrice) {
        (((mrp - sellingPrice) / mrp) * 100).toInt()
    } else {
        product.discountPercent
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(enabled = !isOutOfStock) { onClick() },
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = if (isOutOfStock) Color(0xFFFAFAFA) else Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(120.dp)
                    .background(if (isOutOfStock) Color(0xFFF5F5F5) else Color.White)
            ) {
                AsyncImage(
                    model = product.imageUrl.ifEmpty { product.images.firstOrNull() },
                    contentDescription = product.name,
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(8.dp),
                    contentScale = ContentScale.Fit,
                    alpha = if (isOutOfStock) 0.5f else 1f
                )
                
                // Discount Badge
                if (discount > 0 && !isOutOfStock) {
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
// ... rest of Box content ...

                // Out of stock overlay
                if (isOutOfStock) {
                    Surface(
                        color = Color.Black.copy(alpha = 0.6f),
                        modifier = Modifier.align(Alignment.Center),
                        shape = RoundedCornerShape(4.dp)
                    ) {
                        Text(
                            text = stringResource(R.string.out_of_stock),
                            color = Color.White,
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                        )
                    }
                }
                
                Row(
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(
                        onClick = onShare,
                        modifier = Modifier.size(32.dp)
                    ) {
                        Icon(
                            imageVector = Icons.Default.Share,
                            contentDescription = "Share",
                            tint = Color.Gray,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                    AnimatedHeartButton(
                        isWishlisted = isWishlisted,
                        onClick = onWishlistToggle,
                        size = 28
                    )
                }
            }
            
            Column(modifier = Modifier.padding(10.dp)) {
                // Brand Name
                if (product.brand.isNotBlank()) {
                    Text(
                        text = product.brand,
                        fontSize = 10.sp,
                        color = Color.Gray,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                }

                Text(
                    text = product.name,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )

                // Rating
                if (product.rating > 0) {
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier.padding(top = 2.dp)
                    ) {
                        Surface(
                            color = Color(0xFF4CAF50),
                            shape = RoundedCornerShape(4.dp)
                        ) {
                            Row(
                                modifier = Modifier.padding(horizontal = 4.dp, vertical = 1.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text("${product.rating}", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 9.sp)
                                Text("★", color = Color.White, fontSize = 9.sp, modifier = Modifier.padding(start = 2.dp))
                            }
                        }
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = "(${product.reviewsCount})",
                            fontSize = 10.sp,
                            color = Color.Gray
                        )
                    }
                } else if (product.composition.isNotEmpty()) {
                    // Fallback to composition if no rating
                    Text(
                        text = product.composition,
                        fontSize = 10.sp,
                        color = Color.DarkGray,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(top = 2.dp)
                    )
                } else {
                    Spacer(modifier = Modifier.height(14.dp)) // Maintain height
                }

                Row(
                    modifier = Modifier.fillMaxWidth().padding(top = 4.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Row(verticalAlignment = Alignment.Bottom) {
                            Text(
                                text = "₹${sellingPrice.toInt()}",
                                fontSize = 16.sp,
                                fontWeight = FontWeight.Bold,
                                color = if (isOutOfStock) Color.Gray else PrimaryGreen
                            )
                            if (mrp > sellingPrice) {
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = "₹${mrp.toInt()}",
                                    fontSize = 12.sp,
                                    color = Color.Gray,
                                    textDecoration = TextDecoration.LineThrough
                                )
                            }
                        }
                        
                        val displaySize = remember(product) {
                            val w = product.weight.removeSuffix(".0").trim()
                            val u = product.unit.trim()
                            val firstVariant = product.variants.firstOrNull()
                            
                            when {
                                firstVariant != null -> {
                                    val vLabel = firstVariant.label.ifBlank { firstVariant.size }.removeSuffix(".0").trim()
                                    if (product.variants.size > 1) "Variants available" else vLabel
                                }
                                w.isNotBlank() && u.isNotBlank() -> {
                                    if (w.contains(u, ignoreCase = true)) w else "$w $u"
                                }
                                w.isNotBlank() -> w
                                u.isNotBlank() -> u
                                else -> ""
                            }
                        }
                        
                        if (displaySize.isNotBlank()) {
                            Text(
                                text = displaySize,
                                fontSize = 10.sp,
                                color = Color.Black,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                    
                    if (!isOutOfStock) {
                        IconButton(
                            onClick = onAddToCart,
                            modifier = Modifier.size(32.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.ShoppingCart,
                                contentDescription = stringResource(R.string.add_to_cart),
                                tint = PrimaryGreen,
                                modifier = Modifier.size(20.dp)
                            )
                        }
                    }
                }
                
                Spacer(modifier = Modifier.height(8.dp))
                
                Button(
                    onClick = onBuyNow,
                    enabled = !isOutOfStock,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(32.dp),
                    contentPadding = PaddingValues(0.dp),
                    shape = RoundedCornerShape(6.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = PrimaryGreen,
                        disabledContainerColor = Color(0xFFE0E0E0)
                    )
                ) {
                    Text(
                        text = if (isOutOfStock) stringResource(R.string.out_of_stock) else stringResource(R.string.buy_now),
                        fontSize = 12.sp, 
                        fontWeight = FontWeight.Bold,
                        color = if (isOutOfStock) Color.Gray else Color.White
                    )
                }
            }
        }
    }
}

@Composable
fun HomeCategoryItem(category: Category, onClick: () -> Unit) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .width(80.dp)
            .clickable { onClick() }
    ) {
        Box(
            modifier = Modifier
                .size(70.dp)
                .clip(CircleShape)
                .background(Color(0xFFF5F5F5)),
            contentAlignment = Alignment.Center
        ) {
            AsyncImage(
                model = category.imageUrl,
                contentDescription = category.name,
                modifier = Modifier
                    .size(50.dp)
                    .clip(CircleShape),
                contentScale = ContentScale.Crop
            )
        }
        
        Spacer(modifier = Modifier.height(8.dp))
        
        Text(
            text = category.name,
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
            textAlign = TextAlign.Center,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            color = Color.Black
        )
    }
}

@Composable
fun HomeCropItem(crop: Crop, onClick: () -> Unit) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .width(80.dp)
            .clickable { onClick() }
    ) {
        Box(
            modifier = Modifier
                .size(70.dp)
                .clip(CircleShape)
                .background(Color(0xFFF5F5F5)),
            contentAlignment = Alignment.Center
        ) {
            AsyncImage(
                model = crop.imageUrl,
                contentDescription = crop.name,
                modifier = Modifier
                    .size(50.dp)
                    .clip(CircleShape),
                contentScale = ContentScale.Crop
            )
        }
        
        Spacer(modifier = Modifier.height(8.dp))
        
        Text(
            text = crop.name,
            fontSize = 12.sp,
            fontWeight = FontWeight.Medium,
            textAlign = TextAlign.Center,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            color = Color.Black
        )
    }
}

@Composable
fun BrandItem(brand: Brand, onClick: () -> Unit) {
    Card(
        modifier = Modifier
            .width(100.dp)
            .height(60.dp)
            .clickable { onClick() },
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Box(
            modifier = Modifier.fillMaxSize(),
            contentAlignment = Alignment.Center
        ) {
            AsyncImage(
                model = brand.imageUrl,
                contentDescription = brand.name,
                modifier = Modifier
                    .size(80.dp, 40.dp)
                    .padding(4.dp),
                contentScale = ContentScale.Fit
            )
        }
    }
}

@Composable
fun SearchSuggestionProductItem(
    product: Product,
    onClick: () -> Unit
) {
    Card(
        modifier = Modifier
            .width(140.dp)
            .clickable { onClick() },
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(
            modifier = Modifier.padding(8.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            AsyncImage(
                model = product.imageUrl.ifEmpty { product.images.firstOrNull() },
                contentDescription = product.name,
                modifier = Modifier
                    .size(100.dp)
                    .clip(RoundedCornerShape(4.dp)),
                contentScale = ContentScale.Fit
            )
            
            Spacer(modifier = Modifier.height(4.dp))
            
            Text(
                text = product.name,
                fontSize = 12.sp,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                textAlign = TextAlign.Center,
                modifier = Modifier.fillMaxWidth()
            )
            
            Text(
                text = "₹${(if (product.discountedPrice > 0) product.discountedPrice else product.basePrice).toInt()}",
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                color = PrimaryGreen,
                textAlign = TextAlign.Center
            )
        }
    }
}

@Composable
fun SearchSuggestionsRow(
    products: List<Product>,
    onProductClick: (Product) -> Unit
) {
    Column {
        SectionHeader(
            title = "Top Matches",
            onViewAll = { /* Handle view all if needed */ }
        )
        LazyRow(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 16.dp),
            contentPadding = PaddingValues(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            items(products, key = { it.id }) { product ->
                SearchSuggestionProductItem(
                    product = product,
                    onClick = { onProductClick(product) }
                )
            }
        }
        HorizontalDivider(
            modifier = Modifier.padding(horizontal = 16.dp),
            thickness = 1.dp,
            color = Color.LightGray.copy(alpha = 0.5f)
        )
    }
}
