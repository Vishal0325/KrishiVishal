package com.company.krishivishal.ui.product.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.BorderStroke
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.disabled
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.company.krishivishal.R
import com.company.krishivishal.core.model.Product
import com.company.krishivishal.core.model.Variant
import com.company.krishivishal.ui.theme.DividerColor
import com.company.krishivishal.ui.theme.PoppinsFamily
import com.company.krishivishal.ui.theme.PrimaryGreen
import com.company.krishivishal.ui.theme.SecondaryOrange
import java.text.SimpleDateFormat
import java.util.*

/**
 * Accessible variant selector with 48dp touch targets and TalkBack support.
 * 
 * Features:
 * - 48dp × 120dp touch targets for each variant chip
 * - TalkBack announces selected/out-of-stock states
 * - Keyboard and D-pad navigation support
 * - Out-of-stock variants are visually and behaviorally disabled
 * 
 * Price updates are announced via live region on ProductInfoSection price Text.
 */
@Composable
fun ProductVariantSelector(
    variants: List<Variant>,
    selectedVariant: Variant?,
    onVariantSelect: (Variant) -> Unit,
    product: Product,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier.padding(vertical = 12.dp)) {
        // Section heading with accessibility semantics
        Text(
            text = stringResource(R.string.select_variant),
            fontWeight = FontWeight.Bold,
            fontSize = 15.sp,
            modifier = Modifier
                .padding(horizontal = 16.dp)
                .semantics {
                    heading()  // TalkBack: "Heading"
                },
            fontFamily = PoppinsFamily
        )
        
        LazyRow(
            contentPadding = PaddingValues(16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp),
            modifier = Modifier.semantics(mergeDescendants = false) { }
        ) {
            items(
                variants.size,
                key = { index -> variants[index].id }
            ) { index ->
                val variant = variants[index]
                val isSelected = selectedVariant?.id == variant.id
                val isOutOfStock = variant.stock <= 0
                
                VariantChip(
                    variant = variant,
                    isSelected = isSelected,
                    isOutOfStock = isOutOfStock,
                    onClick = { if (!isOutOfStock) onVariantSelect(variant) },
                    position = "${index + 1} of ${variants.size}",
                    product = product
                )
            }
        }
    }
}

/**
 * Individual variant chip with accessibility semantics.
 * 
 * Accessibility features:
 * - 48dp × 120dp touch target (exceeds Material Design minimum)
 * - TalkBack announces: selected state, out-of-stock status, price
 * - Disabled state for out-of-stock variants
 * - Keyboard/D-pad navigation via clickable(role = Role.Button)
 */
@Composable
fun VariantChip(
    variant: Variant,
    isSelected: Boolean,
    isOutOfStock: Boolean,
    onClick: () -> Unit,
    position: String,
    product: Product,
    modifier: Modifier = Modifier
) {
    val dateFormat = remember { SimpleDateFormat("MMM yy", Locale.getDefault()) }
    
    // 48dp height + padding = minimum touch target
    val chipHeight = 48.dp
    val chipWidth = 120.dp
    
    Card(
        modifier = modifier
            .size(width = chipWidth, height = chipHeight)
            .clip(RoundedCornerShape(12.dp))
            .clickable(
                enabled = !isOutOfStock,
                role = Role.Button,
                onClickLabel = when {
                    isOutOfStock -> "Out of Stock"
                    isSelected -> "Selected, ${variant.label}, ₹${variant.price.toInt()}"
                    else -> "Select ${variant.label}, ₹${variant.price.toInt()}"
                }
            ) {
                onClick()
            }
            .semantics(mergeDescendants = true) {
                // Accessibility state announcements
                if (isOutOfStock) {
                    disabled()  // TalkBack: "button, disabled"
                    contentDescription = "${variant.label} - Out of Stock, $position"
                } else if (isSelected) {
                    stateDescription = "Selected"
                    contentDescription = "${variant.label}, ₹${variant.price.toInt()}, $position"
                } else {
                    contentDescription = "${variant.label}, ₹${variant.price.toInt()}, $position"
                }
            },
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(
            containerColor = when {
                isOutOfStock -> Color(0xFFEEEEEE)  // Grey for disabled
                isSelected -> Color.White
                variant.isBestSeller -> Color(0xFFF1F8E9)
                else -> Color.White
            }
        ),
        border = BorderStroke(
            width = if (isSelected || variant.isBestSeller) 2.dp else 1.dp,
            color = when {
                isOutOfStock -> Color.LightGray
                isSelected -> PrimaryGreen
                variant.isBestSeller -> Color(0xFF81C784)
                else -> DividerColor
            }
        ),
        elevation = CardDefaults.cardElevation(
            defaultElevation = if (isSelected) 4.dp else 1.dp
        )
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
            Column(
                modifier = Modifier
                    .padding(8.dp)
                    .align(Alignment.Center),
                horizontalAlignment = Alignment.CenterHorizontally,
                verticalArrangement = Arrangement.Center
            ) {
                // Variant label (main text)
                Text(
                    text = variant.label
                        .ifBlank { variant.size }
                        .ifBlank { "${product.weight} ${product.unit}".trim() }
                        .ifBlank { "N/A" },
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = if (isOutOfStock) 14.sp else 16.sp,
                    color = if (isOutOfStock) Color.Gray else PrimaryGreen,
                    textDecoration = if (isOutOfStock) TextDecoration.LineThrough else TextDecoration.None
                )
                
                Spacer(modifier = Modifier.height(2.dp))
                
                // Price (smaller text)
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center
                ) {
                    Text(
                        text = "₹${variant.price.toInt()}",
                        fontWeight = FontWeight.Bold,
                        color = if (isOutOfStock) Color.Gray else Color.Black,
                        fontSize = 12.sp
                    )
                    if (variant.basePrice > variant.price) {
                        Spacer(modifier = Modifier.width(3.dp))
                        Text(
                            text = "₹${variant.basePrice.toInt()}",
                            textDecoration = TextDecoration.LineThrough,
                            color = Color.LightGray,
                            fontSize = 9.sp
                        )
                    }
                }
            }
            
            // Out of Stock overlay
            if (isOutOfStock) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .background(Color.White.copy(alpha = 0.7f))
                        .align(Alignment.Center),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "Out of Stock",
                        color = Color.Red,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Center
                    )
                }
            }
            
            // Discount badge
            if (variant.discountPercent > 0) {
                Surface(
                    color = SecondaryOrange,
                    modifier = Modifier.align(Alignment.TopEnd),
                    shape = RoundedCornerShape(bottomStart = 8.dp)
                ) {
                    Text(
                        "${variant.discountPercent}%",
                        color = Color.White,
                        fontSize = 8.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 4.dp, vertical = 2.dp)
                    )
                }
            }
            
            // Best Seller label
            if (variant.isBestSeller && !isOutOfStock) {
                Surface(
                    color = Color(0xFF2E7D32),
                    modifier = Modifier
                        .fillMaxWidth()
                        .align(Alignment.BottomCenter),
                    shape = RoundedCornerShape(bottomStart = 12.dp, bottomEnd = 12.dp)
                ) {
                    Text(
                        text = stringResource(R.string.best_seller),
                        color = Color.White,
                        fontSize = 8.sp,
                        fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(vertical = 2.dp)
                    )
                }
            }
        }
    }
}

