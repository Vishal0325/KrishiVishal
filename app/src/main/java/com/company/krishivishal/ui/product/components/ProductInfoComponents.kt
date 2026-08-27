package com.company.krishivishal.ui.product.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.res.stringResource
import com.company.krishivishal.R
import com.company.krishivishal.core.model.Product
import com.company.krishivishal.core.model.Variant
import com.company.krishivishal.ui.theme.*

/**
 * Helper to validate size/weight values. Rejects "0", "0.0", negative numbers, and blank strings.
 */
fun isValidSizeValue(value: String): Boolean {
    val cleaned = value.removeSuffix(".0").trim()
    if (cleaned.isBlank()) return false
    val numeric = cleaned.toDoubleOrNull()
    return numeric == null || numeric > 0.0
}

@Composable
fun ProductInfoSection(product: Product, variant: Variant?) {
    val sellingPrice = variant?.price ?: if (product.discountedPrice > 0) product.discountedPrice else if (product.price > 0) product.price else product.basePrice
    val mrp = variant?.basePrice ?: if (product.mrp > 0) product.mrp else product.basePrice

    // Ensure mrp is at least sellingPrice to avoid negative savings
    val finalMrp = mrp.coerceAtLeast(sellingPrice)
    val saved = (finalMrp - sellingPrice).coerceAtLeast(0.0)

    Column(modifier = Modifier.padding(16.dp)) {
        Text(
            text = product.name,
            fontSize = 20.sp,
            fontWeight = FontWeight.Bold,
            fontFamily = PoppinsFamily
        )
        Text(
            text = stringResource(R.string.brand_label, product.brand),
            fontSize = 14.sp,
            color = GrayText,
            fontFamily = PoppinsFamily
        )
        Text(
            text = product.composition,
            fontSize = 12.sp,
            color = GrayText,
            fontFamily = PoppinsFamily,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.padding(top = 4.dp)
        )

        // Rating
        if (product.reviewsCount > 0) {
            Row(
                modifier = Modifier.padding(vertical = 8.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                Surface(
                    color = Color(0xFF4CAF50),
                    shape = RoundedCornerShape(4.dp)
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("${product.rating}", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 12.sp)
                        Spacer(modifier = Modifier.width(2.dp))
                        Icon(Icons.Default.Star, null, tint = Color.White, modifier = Modifier.size(10.dp))
                    }
                }
                Spacer(modifier = Modifier.width(8.dp))
                Row {
                    repeat(5) {
                        Icon(
                            Icons.Default.Star,
                            null,
                            tint = if (it < product.rating.toInt()) Color(0xFFFFB300) else Color.LightGray,
                            modifier = Modifier.size(14.dp)
                        )
                    }
                }
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = stringResource(R.string.reviews_count, product.reviewsCount),
                    color = GrayText,
                    fontSize = 12.sp,
                    fontFamily = PoppinsFamily
                )
            }
        } else {
            Text(
                text = "No ratings yet",
                color = GrayText,
                fontSize = 12.sp,
                fontFamily = PoppinsFamily,
                modifier = Modifier.padding(vertical = 8.dp)
            )
        }

        // Price
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                text = "₹${sellingPrice.toInt()}",
                fontSize = 24.sp,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }
            )

            if (finalMrp > sellingPrice) {
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "₹${finalMrp.toInt()}",
                    fontSize = 16.sp,
                    color = GrayText,
                    textDecoration = TextDecoration.LineThrough
                )
                Spacer(modifier = Modifier.width(12.dp))
                Surface(color = LightGreenBg, shape = RoundedCornerShape(4.dp)) {
                    Row(modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.CheckCircle, null, tint = Color(0xFF4CAF50), modifier = Modifier.size(12.dp))
                        Spacer(modifier = Modifier.width(4.dp))
                        Text(
                            text = stringResource(R.string.saved_price_format, saved.toInt()),
                            color = Color(0xFF2E7D32),
                            fontSize = 11.sp,
                            fontWeight = FontWeight.Medium
                        )
                    }
                }
            }
        }

        // Simple display logic: Show cleaned size
        val displaySize = remember(product, variant) {
            val w = product.weight.removeSuffix(".0").trim()
            val u = product.unit.trim()

            when {
                variant != null && isValidSizeValue(variant.label) -> variant.label.removeSuffix(".0")
                variant != null && isValidSizeValue(variant.size) -> variant.size.removeSuffix(".0")
                isValidSizeValue(w) && u.isNotBlank() -> {
                    if (w.contains(u, ignoreCase = true)) w else "$w $u"
                }
                isValidSizeValue(w) -> w
                u.isNotBlank() -> u
                else -> "N/A"
            }
        }

        Surface(
            color = MaterialTheme.colorScheme.surfaceVariant,
            shape = RoundedCornerShape(4.dp),
            modifier = Modifier.padding(top = 12.dp)
        ) {
            Text(
                text = stringResource(R.string.size_label, displaySize),
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
            )
        }
    }
}

@Composable
fun CompositionCard(composition: String) {
    Card(
        modifier = Modifier
            .padding(horizontal = 16.dp, vertical = 8.dp)
            .fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
        shape = RoundedCornerShape(12.dp)
    ) {
        Row(
            modifier = Modifier
                .padding(16.dp)
                .fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Default.Science,
                        null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = stringResource(R.string.composition_label),
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp,
                        fontFamily = PoppinsFamily,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = composition,
                    fontSize = 14.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontFamily = PoppinsFamily,
                    lineHeight = 20.sp
                )
            }

            // Toxicity Diamond Icon - Even Larger as requested
            Box(
                modifier = Modifier
                    .padding(start = 12.dp)
                    .size(90.dp), // Massive size for impact
                contentAlignment = Alignment.Center
            ) {
                // Background Diamond Shape (Rotated Square)
                Surface(
                    modifier = Modifier
                        .size(64.dp) // Much larger diamond
                        .rotate(45f),
                    color = MaterialTheme.colorScheme.surface,
                    border = BorderStroke(2.dp, Color.Gray.copy(alpha = 0.5f)),
                    shape = RoundedCornerShape(4.dp)
                ) {}

                // Toxicity Icon (Inside the large diamond)
                Icon(
                    Icons.Default.Warning,
                    contentDescription = null,
                    tint = Color(0xFFFFB300),
                    modifier = Modifier.size(36.dp) // Large visible icon
                )
            }
        }
    }
}

@Composable
fun FeatureBoxesSection(product: Product) {
    val features = product.features
    val isReturnable = product.isReturnable

    // Add return info to features if it's not already there
    val displayFeatures = features.toMutableList()

    Row(
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp).fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        // Show Return status as the first feature
        FeatureBox(
            emoji = if (isReturnable) "🔄" else "🚫",
            text = if (isReturnable) stringResource(R.string.return_policy_7days) else stringResource(R.string.no_return),
            modifier = Modifier.weight(1f)
        )

        displayFeatures.take(2).forEach { feature ->
            val emoji = when {
                feature.contains("Expiry", true) -> "📅"
                feature.contains("Cash", true) -> "📦"
                feature.contains("QR", true) -> "🔳"
                else -> "✅"
            }
            FeatureBox(emoji = emoji, text = feature, modifier = Modifier.weight(1f))
        }
    }
}

@Composable
fun FeatureBox(emoji: String, text: String, modifier: Modifier = Modifier) {
    Surface(
        modifier = modifier,
        color = Color(0xFFF9F9F9),
        shape = RoundedCornerShape(8.dp),
        border = BorderStroke(0.5.dp, DividerColor)
    ) {
        Column(
            modifier = Modifier.padding(8.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(emoji, fontSize = 18.sp)
            Text(
                text = text,
                fontSize = 10.sp,
                textAlign = TextAlign.Center,
                lineHeight = 12.sp,
                fontWeight = FontWeight.Medium,
                fontFamily = PoppinsFamily
            )
        }
    }
}

@Composable
fun DeliveryInfoSection(location: String, date: String) {
    Column(modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(stringResource(R.string.deliver_to), fontSize = 14.sp, fontFamily = PoppinsFamily)
            Text(location, fontWeight = FontWeight.Bold, fontSize = 14.sp, fontFamily = PoppinsFamily)
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = stringResource(R.string.change),
                color = PrimaryGreen,
                fontSize = 13.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.clickable { }
            )
        }
        Spacer(modifier = Modifier.height(8.dp))
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.LocalShipping, null, tint = GrayText, modifier = Modifier.size(18.dp))
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = if (date.isNotBlank()) stringResource(R.string.delivery_by_format, date) else stringResource(R.string.delivery_details_on_call),
                fontSize = 14.sp,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.onSurface
            )
        }
        HorizontalDivider(modifier = Modifier.padding(top = 16.dp), color = DividerColor)
    }
}

@Composable
fun OverviewRow(label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth()) {
        Text(label, modifier = Modifier.weight(0.4f), color = GrayText, fontSize = 13.sp)
        Text(value, modifier = Modifier.weight(0.6f), fontWeight = FontWeight.Medium, fontSize = 13.sp)
    }
}
