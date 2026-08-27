package com.company.krishivishal.ui.product.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
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
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.res.stringResource
import com.company.krishivishal.R
import com.company.krishivishal.core.model.Product
import com.company.krishivishal.core.model.Variant
import com.company.krishivishal.core.model.Review
import com.company.krishivishal.ui.theme.*
import com.company.krishivishal.ui.components.*
import java.text.SimpleDateFormat
import java.util.*

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
            containerColor = MaterialTheme.colorScheme.surface,
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
                Text("Usage Guide", modifier = Modifier.padding(12.dp), fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
            }
            Tab(selected = selectedTabIndex == 4, onClick = { onTabClick(4) }) {
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
                    UsageGuideTab(product)
                }
                4 -> {
                    ReviewsTab(reviews, isReviewsLoading)
                }
            }
        }
        HorizontalDivider(color = DividerColor)
    }
}

@Composable
fun UsageGuideTab(product: Product) {
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        // Product Information Section
        TechnicalInfoCard(
            title = "Product Information",
            icon = Icons.Default.Assignment,
            content = {
                if (product.targetCrops.isNotEmpty()) {
                    OverviewRow("🌾 Suitable Crops", product.targetCrops.joinToString(", "))
                }
                if (product.targetPests.isNotEmpty()) {
                    OverviewRow("🐛 Target Pest", product.targetPests.joinToString(", "))
                }
                if (product.targetDiseases.isNotEmpty()) {
                    OverviewRow("🦠 Target Disease", product.targetDiseases.joinToString(", "))
                }
                OverviewRow("🧪 Technical Name", product.technicalName.ifBlank { "N/A" })
                OverviewRow("📦 Pack Size", product.weight.ifBlank { "N/A" })
                OverviewRow("🏷️ Product Type", product.category)
                OverviewRow("📋 HSN", product.hsnCode.ifBlank { "N/A" })
                OverviewRow("🏭 Brand", product.brand)
            }
        )

        // How to Use Section
        TechnicalInfoCard(
            title = "How to Use",
            icon = Icons.Default.PlayCircle,
            content = {
                if (product.usageInstructionsField.isNotBlank()) {
                    Text(product.usageInstructionsField, fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                } else {
                    Text("Usage information is not available yet.", fontStyle = androidx.compose.ui.text.font.FontStyle.Italic, fontSize = 13.sp, color = GrayText)
                }

                if (product.applicationMethod.isNotBlank()) {
                    Spacer(modifier = Modifier.height(8.dp))
                    Text("Method: ${product.applicationMethod}", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                }

                if (product.mixingCompatibility.isNotBlank()) {
                    Spacer(modifier = Modifier.height(12.dp))
                    Surface(
                        color = Color.Yellow.copy(alpha = 0.1f),
                        shape = RoundedCornerShape(8.dp),
                        border = BorderStroke(0.5.dp, Color.Yellow.copy(alpha = 0.5f))
                    ) {
                        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.Warning, null, tint = Color(0xFF856404), modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Compatibility: ${product.mixingCompatibility}", fontSize = 12.sp, color = Color(0xFF856404))
                        }
                    }
                }
            }
        )

        if (product.safetyNotes.isNotBlank()) {
            TechnicalInfoCard(
                title = "Safety Instructions",
                icon = Icons.Default.Security,
                content = {
                    Text(product.safetyNotes, fontSize = 13.sp, color = Color.Red.copy(alpha = 0.8f))
                }
            )
        }
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
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f)),
        shape = RoundedCornerShape(12.dp),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
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
