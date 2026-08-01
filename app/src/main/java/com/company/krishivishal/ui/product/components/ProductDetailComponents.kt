package com.company.krishivishal.ui.product.components

import androidx.compose.foundation.*
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.material3.TabRowDefaults.tabIndicatorOffset
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
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
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import com.company.krishivishal.R
import com.company.krishivishal.core.model.Product
import com.company.krishivishal.core.model.Variant
import com.company.krishivishal.core.model.Review
import com.company.krishivishal.ui.theme.*
import com.company.krishivishal.ui.components.*
import java.text.SimpleDateFormat
import java.util.*
import androidx.compose.ui.draw.clip

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

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(350.dp)
            .background(Color.White)
    ) {
        AsyncImage(
            model = product.imageUrl.ifEmpty { product.images.firstOrNull() },
            contentDescription = product.name,
            modifier = Modifier.fillMaxSize(),
            contentScale = ContentScale.Fit
        )

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
                tint = if (isWishlisted) Color.Red else Color.Black,
                onClick = onWishlistToggle
            )
            CircleIconButton(icon = Icons.Default.Share, onClick = onShare)
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
        color = Color.White,
        shadowElevation = 2.dp
    ) {
        IconButton(onClick = onClick) {
            Icon(icon, contentDescription = null, modifier = Modifier.size(20.dp), tint = tint)
        }
    }
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
            Text(text = "₹${sellingPrice.toInt()}", fontSize = 24.sp, fontWeight = FontWeight.Bold, color = Color.Black, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite })
            
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
            color = Color(0xFFF5F5F5),
            shape = RoundedCornerShape(4.dp),
            modifier = Modifier.padding(top = 12.dp)
        ) {
            Text(
                text = stringResource(R.string.size_label, displaySize),
                fontSize = 14.sp,
                fontWeight = FontWeight.Bold,
                color = Color.Black,
                modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
            )
        }
    }
}

@Composable
fun CompositionCard(composition: String) {
    Card(
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp).fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        border = BorderStroke(1.dp, DividerColor),
        shape = RoundedCornerShape(12.dp)
    ) {
        Box(modifier = Modifier.padding(16.dp)) {
            Column {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Science, null, tint = Color.Black, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        text = stringResource(R.string.composition_label),
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp,
                        fontFamily = PoppinsFamily
                    )
                }
                Spacer(modifier = Modifier.height(8.dp))
                Text(text = composition, fontSize = 13.sp, color = Color.DarkGray, fontFamily = PoppinsFamily)
            }
            
            // Diamond Icon Placeholder
            Icon(
                Icons.Default.Warning, 
                contentDescription = null, 
                tint = Color(0xFFFFEB3B), 
                modifier = Modifier.size(24.dp).align(Alignment.TopEnd)
            )
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
                color = Color.Black
            )
        }
        HorizontalDivider(modifier = Modifier.padding(top = 16.dp), color = DividerColor)
    }
}

@Composable
fun ProductTabsSection(
    selectedTabIndex: Int, 
    onTabClick: (Int) -> Unit, 
    product: Product, 
    selectedVariant: Variant?,
    reviews: List<Review> = emptyList(),
    isReviewsLoading: Boolean = false
) {
    val dateFormat = remember { SimpleDateFormat("dd MMM yyyy", Locale.getDefault()) }
    
    Column {
        TabRow(
            selectedTabIndex = selectedTabIndex,
            containerColor = Color.White,
            contentColor = PrimaryGreen,
            indicator = { tabPositions ->
                TabRowDefaults.Indicator(
                    Modifier.tabIndicatorOffset(tabPositions[selectedTabIndex]),
                    color = PrimaryGreen
                )
            },
            divider = {}
        ) {
            Tab(selected = selectedTabIndex == 0, onClick = { onTabClick(0) }) {
                Text(stringResource(R.string.overview), modifier = Modifier.padding(12.dp), fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
            }
            Tab(selected = selectedTabIndex == 1, onClick = { onTabClick(1) }) {
                Text(stringResource(R.string.description), modifier = Modifier.padding(12.dp), fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
            }
            Tab(selected = selectedTabIndex == 2, onClick = { onTabClick(2) }) {
                Text(stringResource(R.string.technical_info), modifier = Modifier.padding(12.dp), fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
            }
            Tab(selected = selectedTabIndex == 3, onClick = { onTabClick(3) }) {
                Text("Reviews", modifier = Modifier.padding(12.dp), fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
            }
        }

        Box(modifier = Modifier.padding(16.dp)) {
            when (selectedTabIndex) {
                0 -> {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        val mfg = selectedVariant?.mfgDate ?: product.mfgDate
                        val exp = selectedVariant?.expiryDate ?: product.expiryDate
                        
                        OverviewRow(stringResource(R.string.product_name), product.name)
                        OverviewRow(stringResource(R.string.product_brand), product.brand)
                        OverviewRow(stringResource(R.string.category), product.category)
                        if (product.cropName.isNotBlank()) {
                            OverviewRow(stringResource(R.string.crop), product.cropName)
                        }
                        OverviewRow(stringResource(R.string.technical_content), product.composition.ifBlank { "N/A" })
                        OverviewRow(stringResource(R.string.classification), product.classification.ifBlank { "N/A" })
                        OverviewRow(stringResource(R.string.mfg_date), mfg?.let { dateFormat.format(it.toDate()) } ?: "N/A")
                        OverviewRow(stringResource(R.string.expiry_date), exp?.let { dateFormat.format(it.toDate()) } ?: "N/A")
                    }
                }
                1 -> {
                    Text(product.description, fontSize = 14.sp, color = Color.DarkGray, lineHeight = 20.sp, fontFamily = PoppinsFamily)
                }
                2 -> {
                    TechnicalInfoTab(product)
                }
                3 -> {
                    ReviewsTab(reviews, isReviewsLoading)
                }
            }
        }
        HorizontalDivider(color = DividerColor)
    }
}

@Composable
fun TechnicalInfoTab(product: Product) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        when (product.category) {
            "Seeds" -> {
                val seed = product.seedMetadata
                if (seed != null) {
                    TechnicalInfoCard(
                        title = stringResource(R.string.seed_info),
                        icon = Icons.Default.Eco,
                        content = {
                            OverviewRow(stringResource(R.string.variety), seed["variety"]?.toString() ?: "N/A")
                            OverviewRow(stringResource(R.string.seed_class), seed["seedClass"]?.toString() ?: "N/A")
                            OverviewRow(stringResource(R.string.germination_percent), "${seed["germination"] ?: "N/A"}%")
                            OverviewRow(stringResource(R.string.purity_percent), "${seed["purity"] ?: "N/A"}%")
                            OverviewRow(stringResource(R.string.moisture_percent), "${seed["moisture"] ?: "N/A"}%")
                            OverviewRow(stringResource(R.string.lot_number), seed["lotNumber"]?.toString() ?: "N/A")
                            OverviewRow(stringResource(R.string.treated), if (seed["isTreated"] == true) stringResource(R.string.yes) else stringResource(R.string.no))
                        }
                    )
                } else {
                    EmptyState(message = "No seed information available", icon = Icons.Default.Info)
                }
            }
            "Fungicide", "Insecticide", "Crop Nutrition", "Herbicide" -> {
                val agro = product.agroMetadata ?: product.herbicideMetadata
                if (agro != null) {
                    TechnicalInfoCard(
                        title = "Agrochemical Details",
                        icon = Icons.Default.Science,
                        content = {
                            OverviewRow(stringResource(R.string.technical_name), agro["technicalName"]?.toString() ?: "N/A")
                            OverviewRow(stringResource(R.string.formulation), agro["formulation"]?.toString() ?: "N/A")
                            OverviewRow(stringResource(R.string.dose_per_acre), agro["dosePerAcre"]?.toString() ?: "N/A")
                            
                            val pests = (agro["targetPests"] ?: agro["targetWeeds"]) as? List<*>
                            if (pests != null) {
                                OverviewRow("Target", pests.joinToString(", "))
                            }
                            
                            // Toxicity
                            val toxLabel = agro["toxicityLabel"]?.toString() ?: "green"
                            val (toxColor, toxText) = when (toxLabel) {
                                "red" -> Color.Red to "Extremely Toxic"
                                "yellow" -> Color.Yellow to "Highly Toxic"
                                "blue" -> Color.Blue to "Moderately Toxic"
                                else -> Color.Green to "Slightly Toxic"
                            }
                            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
                                Text("Toxicity", modifier = Modifier.weight(0.4f), color = GrayText, fontSize = 13.sp)
                                Row(modifier = Modifier.weight(0.6f), verticalAlignment = Alignment.CenterVertically) {
                                    Box(modifier = Modifier.size(12.dp).background(toxColor, CircleShape))
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text(toxText, fontWeight = FontWeight.Medium, fontSize = 13.sp)
                                }
                            }
                        }
                    )
                } else {
                    EmptyState(message = "No technical details available", icon = Icons.Default.Info)
                }
            }
            else -> {
                EmptyState(message = "No technical information available for this category", icon = Icons.Default.Info)
            }
        }
    }
}

@Composable
fun TechnicalInfoCard(title: String, icon: androidx.compose.ui.graphics.vector.ImageVector, content: @Composable ColumnScope.() -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color(0xFFF8F9FA)),
        shape = RoundedCornerShape(12.dp),
        border = BorderStroke(1.dp, Color(0xFFE9ECEF))
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(icon, null, tint = PrimaryGreen, modifier = Modifier.size(20.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text(title, fontWeight = FontWeight.Bold, fontSize = 16.sp, fontFamily = PoppinsFamily)
            }
            Spacer(modifier = Modifier.height(12.dp))
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                content()
            }
        }
    }
}

@Composable
fun ReviewsTab(reviews: List<Review>, isLoading: Boolean) {
    if (isLoading) {
        Column {
            repeat(3) {
                Box(modifier = Modifier.fillMaxWidth().height(80.dp).padding(vertical = 8.dp).clip(RoundedCornerShape(8.dp)).shimmerEffect())
            }
        }
    } else if (reviews.isEmpty()) {
        EmptyState(message = "No reviews yet. Be the first to review!", icon = Icons.Default.RateReview)
    } else {
        Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
            for (review in reviews) {
                ReviewCard(review)
            }
        }
    }
}

@Composable
fun ReviewCard(review: Review) {
    val dateFormatter = remember { SimpleDateFormat("dd MMM yyyy", Locale.getDefault()) }
    Column(modifier = Modifier.fillMaxWidth()) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(modifier = Modifier.size(32.dp).background(Color.LightGray, CircleShape), contentAlignment = Alignment.Center) {
                Text(review.userName.take(1).uppercase(), fontWeight = FontWeight.Bold, color = Color.White)
            }
            Spacer(modifier = Modifier.width(12.dp))
            Column {
                Text(review.userName, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                Row(verticalAlignment = Alignment.CenterVertically) {
                    repeat(5) { index ->
                        Icon(
                            Icons.Default.Star, 
                            null, 
                            tint = if (index < review.rating) Color(0xFFFFB300) else Color.LightGray,
                            modifier = Modifier.size(12.dp)
                        )
                    }
                }
            }
        }
        Spacer(modifier = Modifier.height(8.dp))
        Text(review.comment, fontSize = 13.sp, color = Color.DarkGray, fontFamily = PoppinsFamily)
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            text = dateFormatter.format(review.createdAt?.toDate() ?: Date()),
            fontSize = 11.sp,
            color = GrayText
        )
        HorizontalDivider(modifier = Modifier.padding(top = 12.dp), color = DividerColor)
    }
}

@Composable
fun OverviewRow(label: String, value: String) {
    Row(modifier = Modifier.fillMaxWidth()) {
        Text(label, modifier = Modifier.weight(0.4f), color = GrayText, fontSize = 13.sp)
        Text(value, modifier = Modifier.weight(0.6f), fontWeight = FontWeight.Medium, fontSize = 13.sp)
    }
}

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
    val backgroundColor = if (variant.isBestSeller) Color(0xFFF1F8E9) else Color.White

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
                        color = Color.Black, 
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

@Composable
fun BottomActions(
    quantity: Int,
    maxStock: Int,
    onQuantityChange: (Int) -> Unit,
    onAddToCart: () -> Unit,
    onBuyNow: () -> Unit
) {
    Surface(
        color = Color.White,
        shadowElevation = 8.dp,
        border = BorderStroke(0.5.dp, DividerColor)
    ) {
        Column(modifier = Modifier.navigationBarsPadding().padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.End,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(stringResource(R.string.quantity), fontWeight = FontWeight.Medium, fontSize = 14.sp)
                Spacer(modifier = Modifier.width(8.dp))
                Row(
                    modifier = Modifier
                        .border(1.dp, DividerColor, RoundedCornerShape(4.dp))
                        .padding(horizontal = 4.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    IconButton(
                        onClick = { onQuantityChange(quantity - 1) }, 
                        modifier = Modifier.size(24.dp),
                        enabled = quantity > 1
                    ) {
                        Icon(
                            Icons.Default.Remove, 
                            null, 
                            modifier = Modifier.size(16.dp),
                            tint = if (quantity > 1) Color.Black else Color.LightGray
                        )
                    }
                    Text(
                        "$quantity", 
                        modifier = Modifier.padding(horizontal = 12.dp), 
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp
                    )
                    IconButton(
                        onClick = { onQuantityChange(quantity + 1) }, 
                        modifier = Modifier.size(24.dp),
                        enabled = quantity < maxStock
                    ) {
                        Icon(Icons.Default.Add, null, modifier = Modifier.size(16.dp), tint = if (quantity < maxStock) Color.Black else Color.LightGray)
                    }
                }
            }
            
            Spacer(modifier = Modifier.height(12.dp))
            
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Button(
                    onClick = onAddToCart,
                    modifier = Modifier.weight(1f).height(48.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = SecondaryOrange),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text(stringResource(R.string.add_to_cart), fontWeight = FontWeight.Bold, fontSize = 14.sp)
                }
                Button(
                    onClick = onBuyNow,
                    modifier = Modifier.weight(1f).height(48.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text(stringResource(R.string.buy_now), fontWeight = FontWeight.Bold, fontSize = 14.sp)
                }
            }
        }
    }
}
