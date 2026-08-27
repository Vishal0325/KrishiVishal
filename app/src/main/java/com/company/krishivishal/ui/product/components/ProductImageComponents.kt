package com.company.krishivishal.ui.product.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Favorite
import androidx.compose.material.icons.filled.FavoriteBorder
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.company.krishivishal.R
import com.company.krishivishal.core.model.Product
import com.company.krishivishal.core.model.Variant
import com.company.krishivishal.ui.theme.PoppinsFamily
import com.company.krishivishal.ui.theme.PrimaryGreen
import com.company.krishivishal.ui.theme.SecondaryOrange

@Composable
fun ProductImageSection(
    product: Product,
    variant: Variant?,
    isWishlisted: Boolean,
    onWishlistToggle: () -> Unit,
    onShare: () -> Unit
) {
    val sellingPrice = variant?.price ?: if (product.discountedPrice > 0) product.discountedPrice else if (product.price > 0) product.price else product.basePrice
    val mrp = variant?.basePrice ?: if (product.mrp > 0) product.mrp else product.basePrice

    val discount = if (mrp > sellingPrice) {
        (((mrp - sellingPrice) / mrp) * 100).toInt()
    } else {
        variant?.discountPercent ?: product.discountPercent
    }

    // Combine imageUrl and images list, avoiding duplicates
    val allImages = remember(product.imageUrl, product.images) {
        val list = mutableListOf<String>()
        if (product.imageUrl.isNotBlank()) list.add(product.imageUrl)
        product.images.forEach { if (!list.contains(it)) list.add(it) }
        if (list.isEmpty()) list.add("") // Placeholder
        list
    }

    val pagerState = rememberPagerState(pageCount = { allImages.size })

    Column(modifier = Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surface)) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .height(350.dp)
        ) {
            HorizontalPager(
                state = pagerState,
                modifier = Modifier.fillMaxSize()
            ) { page ->
                AsyncImage(
                    model = allImages[page],
                    contentDescription = product.name,
                    modifier = Modifier.fillMaxSize().padding(16.dp),
                    contentScale = ContentScale.Fit
                )
            }

            // Discount Badge
            if (discount > 0) {
                Surface(
                    color = SecondaryOrange,
                    shape = RoundedCornerShape(topEnd = 8.dp, bottomEnd = 8.dp),
                    modifier = Modifier.padding(top = 16.dp).align(Alignment.TopStart)
                ) {
                    Text(
                        text = stringResource(R.string.discount_percent_format, discount),
                        color = Color.White,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        fontWeight = FontWeight.Bold,
                        fontSize = 12.sp,
                        fontFamily = PoppinsFamily
                    )
                }
            }

            // Top Right Actions - Heart and Share
            Row(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                CircleIconButton(
                    icon = if (isWishlisted) Icons.Default.Favorite else Icons.Default.FavoriteBorder,
                    tint = if (isWishlisted) Color.Red else MaterialTheme.colorScheme.onSurface,
                    onClick = onWishlistToggle
                )
                CircleIconButton(icon = Icons.Default.Share, onClick = onShare)
            }
        }

        // Page Indicator
        if (allImages.size > 1) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 8.dp),
                horizontalArrangement = Arrangement.Center
            ) {
                repeat(allImages.size) { iteration ->
                    val color = if (pagerState.currentPage == iteration) PrimaryGreen else Color.LightGray
                    Box(
                        modifier = Modifier
                            .padding(2.dp)
                            .clip(CircleShape)
                            .background(color)
                            .size(6.dp)
                    )
                }
            }
        }
    }
}

@Composable
fun CircleIconButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    tint: Color = Color.Black,
    onClick: () -> Unit
) {
    Surface(
        modifier = Modifier.size(36.dp),
        shape = CircleShape,
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 2.dp
    ) {
        IconButton(onClick = onClick) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(20.dp), tint = tint)
        }
    }
}
