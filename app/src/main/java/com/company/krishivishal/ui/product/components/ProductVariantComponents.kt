package com.company.krishivishal.ui.product.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.company.krishivishal.R
import com.company.krishivishal.core.model.Product
import com.company.krishivishal.core.model.Variant
import com.company.krishivishal.ui.theme.DividerColor
import com.company.krishivishal.ui.theme.GrayText
import com.company.krishivishal.ui.theme.PoppinsFamily
import com.company.krishivishal.ui.theme.PrimaryGreen
import com.company.krishivishal.ui.theme.SecondaryOrange
import java.text.SimpleDateFormat
import java.util.*

@Composable
fun VariantsSection(variants: List<Variant>, selectedVariant: Variant?, onVariantSelect: (Variant) -> Unit, product: Product) {
    Column(modifier = Modifier.padding(vertical = 12.dp)) {
        Text(
            text = stringResource(R.string.select_variant),
            fontWeight = FontWeight.Bold,
            fontSize = 15.sp,
            modifier = Modifier.padding(horizontal = 16.dp),
            fontFamily = PoppinsFamily
        )
        LazyRow(
            contentPadding = PaddingValues(16.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            items(variants) { variant ->
                val isSelected = selectedVariant?.id == variant.id
                VariantCard(
                    variant = variant,
                    isSelected = isSelected,
                    onClick = { onVariantSelect(variant) },
                    product = product
                )
            }
        }
    }
}

@Composable
fun VariantCard(variant: Variant, isSelected: Boolean, onClick: () -> Unit, product: Product) {
    val dateFormat = remember { SimpleDateFormat("MMM yy", Locale.getDefault()) }
    // Light green border for best seller, Primary green for selected
    val borderColor = when {
        isSelected -> PrimaryGreen
        variant.isBestSeller -> Color(0xFF81C784)
        else -> DividerColor
    }
    val borderWidth = if (isSelected || variant.isBestSeller) 1.5.dp else 1.dp
    val backgroundColor = if (variant.isBestSeller) {
        if (isSystemInDarkTheme()) Color(0xFF1B3D1B) else Color(0xFFF1F8E9)
    } else {
        MaterialTheme.colorScheme.surface
    }

    Card(
        modifier = Modifier.width(120.dp).clickable { onClick() },
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = backgroundColor),
        border = BorderStroke(borderWidth, borderColor),
        elevation = CardDefaults.cardElevation(defaultElevation = if (isSelected) 4.dp else 1.dp)
    ) {
        Box(modifier = Modifier.fillMaxSize()) {
            Column(modifier = Modifier.padding(10.dp)) {
                // Show exactly the label/size/weight of the variant
                val labelText = when {
                    isValidSizeValue(variant.label) -> variant.label
                    isValidSizeValue(variant.size) -> variant.size
                    isValidSizeValue(variant.weight.toString()) -> "${variant.weight} ${variant.unit}".trim()
                    isValidSizeValue(product.weight.toString()) -> "${product.weight} ${product.unit}".trim()
                    else -> "N/A"
                }
                Text(
                    text = labelText,
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 16.sp,
                    color = PrimaryGreen
                )

                Spacer(modifier = Modifier.height(4.dp))

                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "₹${variant.price.toInt()}",
                        fontWeight = FontWeight.ExtraBold,
                        color = MaterialTheme.colorScheme.onSurface,
                        fontSize = 14.sp
                    )
                    if (variant.basePrice > variant.price) {
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = "₹${variant.basePrice.toInt()}",
                            textDecoration = TextDecoration.LineThrough,
                            color = GrayText,
                            fontSize = 11.sp
                        )
                    }
                }

                // Mfg/Exp Dates
                Spacer(modifier = Modifier.height(6.dp))
                Column {
                    variant.mfgDate?.let {
                        Text(
                            "MFG: ${dateFormat.format(it.toDate())}",
                            fontSize = 9.sp,
                            color = GrayText,
                            fontWeight = FontWeight.Medium
                        )
                    }
                    variant.expiryDate?.let {
                        Text(
                            "EXP: ${dateFormat.format(it.toDate())}",
                            fontSize = 9.sp,
                            color = Color.Red.copy(alpha = 0.7f),
                            fontWeight = FontWeight.Medium
                        )
                    }
                }

                if (variant.isBestSeller) {
                    Spacer(modifier = Modifier.height(20.dp)) // Space for Best Seller label
                }
            }

            // Discount badge on variant (Orange)
            if (variant.discountPercent > 0) {
                Surface(
                    color = SecondaryOrange,
                    modifier = Modifier.align(Alignment.TopEnd),
                    shape = RoundedCornerShape(bottomStart = 8.dp)
                ) {
                    Text(
                        text = stringResource(R.string.discount_percent_format, variant.discountPercent),
                        color = Color.White,
                        fontSize = 9.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 3.dp)
                    )
                }
            }

            // Best Seller label
            if (variant.isBestSeller) {
                Surface(
                    color = Color(0xFF2E7D32),
                    modifier = Modifier.fillMaxWidth().align(Alignment.BottomCenter)
                ) {
                    Text(
                        text = stringResource(R.string.best_seller),
                        color = Color.White,
                        fontSize = 10.sp,
                        fontWeight = FontWeight.Bold,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.padding(vertical = 4.dp)
                    )
                }
            }
        }
    }
}
