package com.company.krishivishal.ui.product.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import androidx.compose.ui.res.stringResource
import com.company.krishivishal.R
import com.company.krishivishal.core.model.Product
import com.company.krishivishal.ui.theme.*

@Composable
fun RecommendationSection(
    title: String,
    products: List<Product>,
    onProductClick: (Product) -> Unit,
    onAddToCart: (Product) -> Unit
) {
    if (products.isEmpty()) return

    Column(modifier = Modifier.padding(vertical = 8.dp)) {
        Text(
            text = title,
            fontSize = 18.sp,
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp),
            fontFamily = PoppinsFamily
        )
        LazyRow(
            contentPadding = PaddingValues(horizontal = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            items(products) { product ->
                RecommendedProductCard(
                    product = product, 
                    onClick = { onProductClick(product) },
                    onAddToCart = onAddToCart
                )
            }
        }
    }
}

@Composable
fun RecommendedProductCard(
    product: Product,
    onClick: () -> Unit,
    onAddToCart: (Product) -> Unit
) {
    Card(
        modifier = Modifier
            .width(180.dp)
            .clickable { onClick() },
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
    ) {
        Column {
            Box(modifier = Modifier.height(130.dp).fillMaxWidth()) {
                AsyncImage(
                    model = product.imageUrl,
                    contentDescription = product.name,
                    modifier = Modifier.fillMaxSize().padding(8.dp),
                    contentScale = ContentScale.Fit
                )
                
                val badgeText = when (product.recommendationReason) {
                    "Same Technical" -> stringResource(R.string.badge_same_technical)
                    "Similar Product" -> stringResource(R.string.badge_similar)
                    "Matches Crop" -> stringResource(R.string.badge_matches_crop)
                    "Featured" -> stringResource(R.string.badge_featured)
                    "Popular Choice" -> stringResource(R.string.badge_popular)
                    else -> stringResource(R.string.badge_similar)
                }

                Surface(
                    color = PrimaryGreen.copy(alpha = 0.9f),
                    shape = RoundedCornerShape(bottomEnd = 8.dp),
                    modifier = Modifier.align(Alignment.TopStart)
                ) {
                    Text(
                        text = badgeText,
                        color = Color.White,
                        fontSize = 9.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                    )
                }
            }

            Column(modifier = Modifier.padding(10.dp)) {
                Text(
                    text = product.name,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    fontFamily = PoppinsFamily
                )
                Text(
                    text = product.brand,
                    fontSize = 11.sp,
                    color = GrayText,
                    fontFamily = PoppinsFamily
                )
                Text(
                    text = product.composition.ifBlank { stringResource(R.string.not_available_short) },
                    fontSize = 10.sp,
                    color = GrayText,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                
                Row(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = product.weight.ifBlank { product.unit }.ifBlank { stringResource(R.string.not_available_short) },
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Medium,
                        color = MaterialTheme.colorScheme.secondary
                    )
                    if (product.stockQuantity > 0) {
                        Text(stringResource(R.string.in_stock), fontSize = 9.sp, color = PrimaryGreen, fontWeight = FontWeight.Bold)
                    } else {
                        Text(stringResource(R.string.out_of_stock), fontSize = 9.sp, color = Color.Red, fontWeight = FontWeight.Bold)
                    }
                }
                
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "₹${product.price.toInt()}",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    if (product.mrp > product.price) {
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = "₹${product.mrp.toInt()}",
                            fontSize = 11.sp,
                            color = GrayText,
                            textDecoration = TextDecoration.LineThrough
                        )
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))
                
                Button(
                    onClick = { onAddToCart(product) },
                    modifier = Modifier.fillMaxWidth().height(32.dp),
                    contentPadding = PaddingValues(0.dp),
                    shape = RoundedCornerShape(6.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen),
                    enabled = product.stockQuantity > 0
                ) {
                    Text(stringResource(R.string.add_to_cart), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}
