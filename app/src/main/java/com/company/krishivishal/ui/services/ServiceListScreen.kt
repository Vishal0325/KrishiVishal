package com.company.krishivishal.ui.services

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Build
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import com.company.krishivishal.core.model.AgriService
import com.company.krishivishal.ui.theme.PrimaryGreen
import com.company.krishivishal.utils.ShareUtils

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ServiceListScreen(
    viewModel: ServiceViewModel = viewModel(),
    onServiceClick: (String) -> Unit
) {
    val services by viewModel.services.collectAsState()
    val context = LocalContext.current
    var selectedCategoryFilter by remember { mutableStateOf("ALL") }
    var searchQuery by remember { mutableStateOf("") }

    val categories = listOf(
        "ALL" to "सभी सेवाएं (All)",
        "SPRAY" to "स्प्रेयर / ड्रोन (Spraying)",
        "TILLAGE" to "जुताई / कटाई (Machinery)",
        "LABOUR" to "मज़दूर / ठेका (Labour)",
        "TESTING" to "मिट्टी जांच (Soil Test)"
    )

    val filteredServices = remember(services, selectedCategoryFilter, searchQuery) {
        services.filter { service ->
            val matchesCategory = if (selectedCategoryFilter == "ALL") true else {
                val nameLower = service.name.lowercase()
                when (selectedCategoryFilter) {
                    "SPRAY" -> nameLower.contains("spray") || nameLower.contains("drone") || nameLower.contains("स्प्रे")
                    "TILLAGE" -> nameLower.contains("plow") || nameLower.contains("tractor") || nameLower.contains("harvest") || nameLower.contains("जुताई") || nameLower.contains("कटाई")
                    "LABOUR" -> nameLower.contains("labour") || nameLower.contains("worker") || nameLower.contains("ठेका") || nameLower.contains("मजदूर") || service.rateType in listOf("PER_DAY", "PER_WEEK", "PER_MONTH")
                    "TESTING" -> nameLower.contains("soil") || nameLower.contains("test") || nameLower.contains("जांच")
                    else -> true
                }
            }

            val matchesSearch = if (searchQuery.isBlank()) true else {
                service.name.contains(searchQuery, ignoreCase = true) ||
                service.description.contains(searchQuery, ignoreCase = true)
            }

            matchesCategory && matchesSearch
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { 
                    Column {
                        Text(
                            text = "कृषि सेवाएं (Agri-Services)", 
                            fontWeight = FontWeight.Bold,
                            fontSize = 18.sp
                        )
                        Text(
                            text = "घर बैठे ऑनलाइन सर्विस बुक करें",
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(MaterialTheme.colorScheme.background)
        ) {
            // Search Input Box
            OutlinedTextField(
                value = searchQuery,
                onValueChange = { searchQuery = it },
                placeholder = { Text("सर्विस खोजें (e.g. स्प्रे, ट्रैक्टर, मजदूर)...", fontSize = 13.sp) },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = "Search") },
                singleLine = true,
                shape = RoundedCornerShape(12.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = PrimaryGreen,
                    unfocusedBorderColor = Color.LightGray
                ),
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 12.dp, vertical = 6.dp)
            )

            // Category Filter Chips
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .horizontalScroll(rememberScrollState())
                    .padding(horizontal = 12.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                categories.forEach { (key, label) ->
                    val isSelected = selectedCategoryFilter == key
                    FilterChip(
                        selected = isSelected,
                        onClick = { selectedCategoryFilter = key },
                        label = {
                            Text(
                                text = label,
                                fontSize = 12.sp,
                                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal
                            )
                        },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = PrimaryGreen,
                            selectedLabelColor = Color.White
                        )
                    )
                }
            }

            if (filteredServices.isEmpty()) {
                Box(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(24.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("🌾", fontSize = 48.sp)
                        Spacer(modifier = Modifier.height(12.dp))
                        Text(
                            text = "कोई सेवा उपलब्ध नहीं है",
                            fontWeight = FontWeight.Bold,
                            style = MaterialTheme.typography.titleMedium
                        )
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = "कृपया अन्य श्रेणी या खोज शब्द चुनें",
                            fontSize = 12.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            } else {
                LazyVerticalGrid(
                    columns = GridCells.Fixed(2),
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(start = 12.dp, end = 12.dp, top = 6.dp, bottom = 16.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(filteredServices, key = { it.id }) { service ->
                        ServiceGridProductCard(
                            service = service,
                            onClick = { onServiceClick(service.id) },
                            onBookNow = { onServiceClick(service.id) },
                            onShare = {
                                val text = "🌾 *${service.name}*\n${service.description}\n💰 मूल्य: ₹${service.baseRate.toInt()}\nKrishiVishal App पर अभी बुक करें!"
                                ShareUtils.shareText(context, text)
                            }
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun ServiceGridProductCard(
    service: AgriService, 
    onClick: () -> Unit,
    onBookNow: () -> Unit,
    onShare: () -> Unit
) {
    val rateLabel = when (service.rateType) {
        "PER_ACRE" -> "/ एकड़"
        "PER_BIGHA" -> "/ बीघा"
        "PER_KATHA" -> "/ कट्ठा"
        "PER_DAY" -> "/ दिन"
        "PER_WEEK" -> "/ हफ्ता"
        "PER_MONTH" -> "/ महीना"
        "PER_SEASON" -> "/ सीजन"
        "PER_HOUR" -> "/ घंटा"
        "PER_WORKER" -> "/ मजदूर"
        "CUSTOM" -> service.customRateUnit?.let { " / $it" } ?: ""
        "FIXED" -> " (फिक्स)"
        else -> ""
    }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column {
            // Image Box with Badges
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(130.dp)
                    .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.2f))
            ) {
                if (service.imageUrl.isNotBlank()) {
                    AsyncImage(
                        model = service.imageUrl,
                        contentDescription = service.name,
                        modifier = Modifier.fillMaxSize(),
                        contentScale = ContentScale.Crop
                    )
                } else {
                    Box(
                        modifier = Modifier
                            .fillMaxSize()
                            .background(Color(0xFFE8F5E9)),
                        contentAlignment = Alignment.Center
                    ) {
                        Text("🌾", fontSize = 40.sp)
                    }
                }

                // Material / Labour Badge (Top-Left)
                val badgeText = if (service.includesMaterial) "Material Included" else "Labour Only"
                val badgeBg = if (service.includesMaterial) Color(0xFF2E7D32) else Color(0xFFE65100)
                Surface(
                    color = badgeBg,
                    shape = RoundedCornerShape(topStart = 14.dp, bottomEnd = 8.dp),
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

                // Share Button (Top-Right)
                IconButton(
                    onClick = onShare,
                    modifier = Modifier
                        .align(Alignment.TopEnd)
                        .padding(4.dp)
                        .size(28.dp)
                        .background(Color.White.copy(alpha = 0.85f), CircleShape)
                ) {
                    Icon(
                        imageVector = Icons.Default.Share,
                        contentDescription = "Share",
                        tint = Color.DarkGray,
                        modifier = Modifier.size(15.dp)
                    )
                }

                // Variants Badge if any (Bottom-End)
                if (service.hasVariants && service.variants.isNotEmpty()) {
                    Surface(
                        color = Color(0xFF673AB7).copy(alpha = 0.9f),
                        shape = RoundedCornerShape(topStart = 6.dp),
                        modifier = Modifier.align(Alignment.BottomEnd)
                    ) {
                        Text(
                            text = "${service.variants.size} Packages",
                            color = Color.White,
                            fontSize = 9.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 5.dp, vertical = 2.dp)
                        )
                    }
                }
            }

            // Information & Actions
            Column(modifier = Modifier.padding(10.dp)) {
                Text(
                    text = service.name,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )

                // Rating & Verified Badge
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
                            Text("${service.rating}", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 9.sp)
                            Text("★", color = Color.White, fontSize = 9.sp, modifier = Modifier.padding(start = 2.dp))
                        }
                    }
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = "Verified Service",
                        fontSize = 10.sp,
                        color = Color.Gray
                    )
                }

                Spacer(modifier = Modifier.height(4.dp))

                // Short Description
                if (service.description.isNotBlank()) {
                    Text(
                        text = service.description,
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2,
                        overflow = TextOverflow.Ellipsis
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                }

                // Price display
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.Bottom
                ) {
                    Text(
                        text = "₹${service.baseRate.toInt()}",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.Bold,
                        color = PrimaryGreen
                    )
                    Text(
                        text = rateLabel,
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(start = 2.dp, bottom = 1.dp)
                    )
                }

                Spacer(modifier = Modifier.height(8.dp))

                // Prominent "Book Now" Button with Icon
                Button(
                    onClick = onBookNow,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(36.dp),
                    contentPadding = PaddingValues(horizontal = 4.dp, vertical = 0.dp),
                    shape = RoundedCornerShape(8.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = PrimaryGreen
                    )
                ) {
                    Icon(
                        imageVector = Icons.Default.CalendarMonth,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(15.dp)
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Text(
                        text = "अभी बुक करें",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color.White
                    )
                }
            }
        }
    }
}
