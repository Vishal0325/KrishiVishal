package com.company.krishivishal.ui.services

import android.content.Intent
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.Chat
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Call
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Share
import androidx.compose.material.icons.filled.Star
import androidx.compose.material.icons.filled.Verified
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel
import coil.compose.AsyncImage
import com.company.krishivishal.ui.theme.PrimaryGreen
import com.company.krishivishal.utils.ShareUtils
import com.company.krishivishal.utils.SupportUtils

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ServiceBookingScreen(
    serviceId: String,
    onBack: () -> Unit,
    onBookingSuccess: (String) -> Unit,
    viewModel: ServiceViewModel = viewModel()
) {
    val selectedService by viewModel.selectedService.collectAsState()
    val context = LocalContext.current
    
    var selectedVariant by remember { mutableStateOf<com.company.krishivishal.core.model.ServiceVariant?>(null) }
    var farmArea by remember { mutableStateOf("1") }
    var areaUnit by remember { mutableStateOf("ACRE") }
    var isBooking by remember { mutableStateOf(false) }

    LaunchedEffect(serviceId) {
        viewModel.loadServiceById(serviceId)
    }

    LaunchedEffect(selectedService) {
        val s = selectedService
        if (s != null && s.hasVariants && s.variants.isNotEmpty() && selectedVariant == null) {
            selectedVariant = s.variants.firstOrNull()
        }
    }

    val service = selectedService

    val quantityVal = farmArea.toDoubleOrNull() ?: 0.0
    val totalAmount = if (service != null) {
        if (service.hasVariants && selectedVariant != null) {
            selectedVariant!!.price
        } else if (service.rateType in listOf("PER_ACRE", "PER_BIGHA", "PER_KATHA", "PER_DAY", "PER_WEEK", "PER_MONTH", "PER_SEASON", "PER_HOUR", "PER_WORKER", "CUSTOM")) {
            quantityVal * service.baseRate
        } else {
            service.baseRate
        }
    } else 0.0

    Scaffold(
        topBar = {
            TopAppBar(
                title = { 
                    Column {
                        Text(
                            text = service?.name ?: "सर्विस विवरण (Service Details)", 
                            fontWeight = FontWeight.Bold,
                            fontSize = 17.sp,
                            maxLines = 1
                        )
                        Text(
                            text = "ऑनलाइन सर्विस बुकिंग",
                            fontSize = 11.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    if (service != null) {
                        IconButton(onClick = {
                            val shareText = "🌾 *${service.name}*\n${service.description}\n💰 दर: ₹${service.baseRate.toInt()}\nKrishiVishal App पर अभी बुक करें!"
                            ShareUtils.shareText(context, shareText)
                        }) {
                            Icon(Icons.Default.Share, contentDescription = "Share", tint = MaterialTheme.colorScheme.onSurface)
                        }
                        IconButton(onClick = {
                            SupportUtils.openWhatsApp(context, "+919801234567", "नमस्ते! मुझे कृषि सेवा ${service.name} के बारे में जानकारी चाहिए।")
                        }) {
                            Icon(Icons.AutoMirrored.Filled.Chat, contentDescription = "WhatsApp", tint = Color(0xFF25D366))
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
            )
        },
        bottomBar = {
            if (service != null) {
                Surface(
                    tonalElevation = 8.dp,
                    shadowElevation = 8.dp,
                    color = MaterialTheme.colorScheme.surface,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 12.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "अनुमानित कुल मूल्य",
                                fontSize = 11.sp,
                                color = Color.Gray,
                                fontWeight = FontWeight.Medium
                            )
                            Row(verticalAlignment = Alignment.Bottom) {
                                Text(
                                    text = "₹${totalAmount.toInt()}",
                                    fontSize = 22.sp,
                                    fontWeight = FontWeight.ExtraBold,
                                    color = PrimaryGreen
                                )
                                val unitText = when (service.rateType) {
                                    "PER_ACRE" -> " / ${farmArea.ifEmpty { "1" }} एकड़"
                                    "PER_BIGHA" -> " / ${farmArea.ifEmpty { "1" }} बीघा"
                                    "PER_KATHA" -> " / ${farmArea.ifEmpty { "1" }} कट्ठा"
                                    "PER_DAY" -> " / ${farmArea.ifEmpty { "1" }} दिन"
                                    "PER_WEEK" -> " / ${farmArea.ifEmpty { "1" }} हफ्ता"
                                    "PER_MONTH" -> " / ${farmArea.ifEmpty { "1" }} महीना"
                                    "PER_HOUR" -> " / ${farmArea.ifEmpty { "1" }} घंटा"
                                    "PER_WORKER" -> " / ${farmArea.ifEmpty { "1" }} मजदूर"
                                    else -> ""
                                }
                                if (unitText.isNotEmpty()) {
                                    Text(
                                        text = unitText,
                                        fontSize = 11.sp,
                                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                                        modifier = Modifier.padding(start = 2.dp, bottom = 2.dp)
                                    )
                                }
                            }
                        }

                        // Prominent "Book Now" Button (अभी बुक करें)
                        Button(
                            onClick = {
                                isBooking = true
                                val isLongTerm = service.rateType in listOf("PER_DAY", "PER_WEEK", "PER_MONTH", "PER_SEASON")
                                viewModel.bookService(
                                    farmArea = farmArea.toDoubleOrNull() ?: 1.0,
                                    areaUnit = areaUnit,
                                    amount = totalAmount,
                                    selectedVariantName = selectedVariant?.name,
                                    capacityInfo = selectedVariant?.capacityInfo,
                                    isLongTermJob = isLongTerm,
                                    onSuccess = { bookingId ->
                                        isBooking = false
                                        onBookingSuccess(bookingId)
                                    }
                                )
                            },
                            enabled = !isBooking && ((service.hasVariants && selectedVariant != null) || (!service.hasVariants && (farmArea.isNotEmpty() || service.rateType == "FIXED"))),
                            shape = RoundedCornerShape(10.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen),
                            modifier = Modifier
                                .height(48.dp)
                                .padding(start = 12.dp)
                        ) {
                            if (isBooking) {
                                CircularProgressIndicator(modifier = Modifier.size(22.dp), color = Color.White, strokeWidth = 2.dp)
                            } else {
                                Icon(
                                    imageVector = Icons.Default.CalendarMonth,
                                    contentDescription = null,
                                    tint = Color.White,
                                    modifier = Modifier.size(18.dp)
                                )
                                Spacer(modifier = Modifier.width(6.dp))
                                Text(
                                    text = "अभी बुक करें (Book Now)",
                                    fontSize = 14.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = Color.White
                                )
                            }
                        }
                    }
                }
            }
        }
    ) { padding ->
        if (service == null) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator(color = PrimaryGreen)
            }
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Hero Card Image Header
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    elevation = CardDefaults.cardElevation(defaultElevation = 3.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
                ) {
                    Column {
                        Box(
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(190.dp)
                                .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.3f))
                        ) {
                            if (service.imageUrl.isNotEmpty()) {
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
                                    Text("🌾", fontSize = 56.sp)
                                }
                            }

                            // Badges on Image
                            val badgeText = if (service.includesMaterial) "Material Included" else "Labour Only"
                            val badgeBg = if (service.includesMaterial) Color(0xFF2E7D32) else Color(0xFFE65100)
                            Surface(
                                color = badgeBg,
                                shape = RoundedCornerShape(bottomEnd = 10.dp),
                                modifier = Modifier.align(Alignment.TopStart)
                            ) {
                                Text(
                                    text = badgeText,
                                    color = Color.White,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp)
                                )
                            }

                            Surface(
                                color = Color.Black.copy(alpha = 0.7f),
                                shape = RoundedCornerShape(20.dp),
                                modifier = Modifier
                                    .align(Alignment.BottomEnd)
                                    .padding(10.dp)
                            ) {
                                Row(
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Icon(Icons.Default.Star, contentDescription = null, tint = Color(0xFFFFB300), modifier = Modifier.size(14.dp))
                                    Spacer(modifier = Modifier.width(3.dp))
                                    Text(
                                        text = "${service.rating} Rating",
                                        color = Color.White,
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                            }
                        }

                        Column(modifier = Modifier.padding(16.dp)) {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = service.name, 
                                    fontSize = 20.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = MaterialTheme.colorScheme.onSurface
                                )
                            }

                            Spacer(modifier = Modifier.height(4.dp))

                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    imageVector = Icons.Default.Verified,
                                    contentDescription = null,
                                    tint = PrimaryGreen,
                                    modifier = Modifier.size(16.dp)
                                )
                                Spacer(modifier = Modifier.width(4.dp))
                                Text(
                                    text = "प्रमाणित पार्टनर द्वारा सेवा (Verified Agriculture Service)",
                                    fontSize = 12.sp,
                                    color = PrimaryGreen,
                                    fontWeight = FontWeight.Medium
                                )
                            }

                            if (service.description.isNotBlank()) {
                                Spacer(modifier = Modifier.height(8.dp))
                                Text(
                                    text = service.description,
                                    fontSize = 13.sp,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    lineHeight = 18.sp
                                )
                            }
                        }
                    }
                }

                // Service Highlights Grid
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFF1F8E9))
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Text(
                            text = "सेवा की मुख्य विशेषताएं (Service Highlights)",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFF2E7D32)
                        )
                        Spacer(modifier = Modifier.height(8.dp))

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            ServiceFeatureBadge(icon = "🚜", title = "कुशल ऑपरेटर")
                            ServiceFeatureBadge(icon = "⚡", title = "तुरंत बुकिंग")
                            ServiceFeatureBadge(icon = "🛡️", title = "100% गारंटी")
                            ServiceFeatureBadge(icon = "📞", title = "डायरेक्ट सपोर्ट")
                        }
                    }
                }

                // Booking Package / Unit Options
                if (service.hasVariants && service.variants.isNotEmpty()) {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(14.dp),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
                    ) {
                        Column(modifier = Modifier.padding(16.dp)) {
                            Text(
                                text = "पैकेज/वैरिएंट चुनें (Select Package)",
                                fontSize = 15.sp,
                                fontWeight = FontWeight.Bold
                            )
                            Spacer(modifier = Modifier.height(10.dp))

                            service.variants.forEach { variant ->
                                val isSelected = selectedVariant?.id == variant.id
                                Card(
                                    onClick = { selectedVariant = variant },
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(vertical = 4.dp),
                                    shape = RoundedCornerShape(10.dp),
                                    colors = CardDefaults.cardColors(
                                        containerColor = if (isSelected) Color(0xFFE8F5E9) else Color(0xFFFAFAFA)
                                    ),
                                    border = androidx.compose.foundation.BorderStroke(
                                        width = if (isSelected) 2.dp else 1.dp,
                                        color = if (isSelected) PrimaryGreen else Color(0xFFE0E0E0)
                                    )
                                ) {
                                    Row(
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .padding(14.dp),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Column {
                                            Row(verticalAlignment = Alignment.CenterVertically) {
                                                RadioButton(
                                                    selected = isSelected,
                                                    onClick = { selectedVariant = variant },
                                                    colors = RadioButtonDefaults.colors(selectedColor = PrimaryGreen)
                                                )
                                                Spacer(modifier = Modifier.width(4.dp))
                                                Text(
                                                    text = variant.name,
                                                    fontWeight = FontWeight.Bold,
                                                    fontSize = 14.sp,
                                                    color = if (isSelected) Color(0xFF1B5E20) else Color.Black
                                                )
                                            }
                                            if (variant.capacityInfo.isNotEmpty()) {
                                                Text(
                                                    text = variant.capacityInfo,
                                                    fontSize = 12.sp,
                                                    color = Color.Gray,
                                                    modifier = Modifier.padding(start = 36.dp)
                                                )
                                            }
                                        }

                                        Text(
                                            text = "₹${variant.price.toInt()}",
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 16.sp,
                                            color = PrimaryGreen
                                        )
                                    }
                                }
                            }
                        }
                    }
                } else {
                    val isAreaRate = service.rateType in listOf("PER_ACRE", "PER_BIGHA", "PER_KATHA")
                    val isQuantityRate = service.rateType in listOf("PER_DAY", "PER_WEEK", "PER_MONTH", "PER_SEASON", "PER_HOUR", "PER_WORKER", "CUSTOM")

                    if (isAreaRate || isQuantityRate) {
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(14.dp),
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                            elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
                        ) {
                            Column(modifier = Modifier.padding(16.dp)) {
                                val title = when (service.rateType) {
                                    "PER_ACRE", "PER_BIGHA", "PER_KATHA" -> "खेत की माप डालें (Select Farm Area)"
                                    "PER_DAY" -> "कितने दिन का काम? (Number of Days)"
                                    "PER_WEEK" -> "कितने हफ्ते का ठेका? (Number of Weeks)"
                                    "PER_MONTH" -> "कितने महीने का काम? (Number of Months)"
                                    "PER_SEASON" -> "कितने सीजन का काम? (Number of Seasons)"
                                    "PER_HOUR" -> "कितने घंटे की आवश्यकता है? (Number of Hours)"
                                    "PER_WORKER" -> "कितने मज़दूर चाहिए? (Number of Workers)"
                                    "CUSTOM" -> service.customRateUnit ?: "मात्रा (Quantity)"
                                    else -> "मात्रा (Quantity)"
                                }
                                
                                Text(
                                    text = title,
                                    fontSize = 15.sp,
                                    fontWeight = FontWeight.Bold
                                )
                                Spacer(modifier = Modifier.height(10.dp))

                                OutlinedTextField(
                                    value = farmArea,
                                    onValueChange = { farmArea = it },
                                    label = { Text(if (isAreaRate) "क्षेत्रफल (Area)" else "संख्या (Count)") },
                                    placeholder = { Text(if (isAreaRate) "उदा. 1 या 2.5" else "उदा. 2") },
                                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                                    modifier = Modifier.fillMaxWidth(),
                                    singleLine = true,
                                    shape = RoundedCornerShape(8.dp)
                                )

                                if (isAreaRate) {
                                    Spacer(modifier = Modifier.height(12.dp))
                                    Text("इकाई चुनें (Select Unit):", fontSize = 12.sp, color = Color.Gray)
                                    Spacer(modifier = Modifier.height(6.dp))
                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                                    ) {
                                        listOf("ACRE" to "एकड़", "BIGHA" to "बीघा", "KATHA" to "कट्ठा").forEach { (unit, label) ->
                                            val isSelected = areaUnit == unit
                                            FilterChip(
                                                selected = isSelected,
                                                onClick = { areaUnit = unit },
                                                label = { Text(label, fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal) },
                                                colors = FilterChipDefaults.filterChipColors(
                                                    selectedContainerColor = PrimaryGreen,
                                                    selectedLabelColor = Color.White
                                                )
                                            )
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // Transparent Price Calculation Card
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f))
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            text = "मूल्य विवरणी (Price Details)",
                            fontSize = 14.sp,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(modifier = Modifier.height(10.dp))

                        val rateUnitStr = when (service.rateType) {
                            "PER_ACRE" -> "प्रति एकड़"
                            "PER_BIGHA" -> "प्रति बीघा"
                            "PER_KATHA" -> "प्रति कट्ठा"
                            "PER_DAY" -> "प्रति दिन"
                            "PER_WEEK" -> "प्रति हफ्ता"
                            "PER_MONTH" -> "प्रति महीना"
                            "PER_HOUR" -> "प्रति घंटा"
                            "PER_WORKER" -> "प्रति मजदूर"
                            "FIXED" -> "फिक्स दर"
                            else -> ""
                        }

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text("बेस रेट ($rateUnitStr)", fontSize = 13.sp, color = Color.DarkGray)
                            Text("₹${service.baseRate.toInt()}", fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                        }

                        if (!service.hasVariants && quantityVal > 0 && service.rateType != "FIXED") {
                            Spacer(modifier = Modifier.height(6.dp))
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text("मात्रा / क्षेत्रफल", fontSize = 13.sp, color = Color.DarkGray)
                                Text("$quantityVal", fontSize = 13.sp, fontWeight = FontWeight.SemiBold)
                            }
                        }

                        HorizontalDivider(modifier = Modifier.padding(vertical = 10.dp), color = Color.LightGray.copy(alpha = 0.5f))

                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text("कुल देय राशि (Estimated Total)", fontSize = 14.sp, fontWeight = FontWeight.Bold)
                            Text("₹${totalAmount.toInt()}", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = PrimaryGreen)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun ServiceFeatureBadge(icon: String, title: String) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier.padding(4.dp)
    ) {
        Text(text = icon, fontSize = 20.sp)
        Spacer(modifier = Modifier.height(4.dp))
        Text(text = title, fontSize = 10.sp, fontWeight = FontWeight.Medium, color = Color(0xFF33691E))
    }
}
