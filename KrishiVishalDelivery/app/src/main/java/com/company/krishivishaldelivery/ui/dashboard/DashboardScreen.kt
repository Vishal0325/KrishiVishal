package com.company.krishivishaldelivery.ui.dashboard

import android.Manifest
import android.annotation.SuppressLint
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.*
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import com.google.android.gms.location.LocationServices
import com.company.krishivishal.core.model.Order
import com.company.krishivishal.core.model.OrderStatus
import com.company.krishivishal.core.model.ReturnRequest
import com.company.krishivishal.core.model.ReturnStatus
import com.company.krishivishaldelivery.data.model.IncentiveProgress
import com.company.krishivishaldelivery.data.model.OptimizedStop
import com.company.krishivishaldelivery.data.model.OptimizedTrip
import com.company.krishivishaldelivery.service.RiderLocationService
import com.company.krishivishal.core.util.Resource
import com.company.krishivishaldelivery.ui.components.RuralOfflineBanner
import com.company.krishivishaldelivery.ui.components.StatusBadge
import com.company.krishivishaldelivery.ui.theme.PrimaryGreen

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(
    onOrderClick: (String) -> Unit,
    onReturnClick: (String) -> Unit,
    onScanClick: () -> Unit,
    onReconciliationClick: () -> Unit = {},
    onServiceJobClick: (String, String) -> Unit,
    onWalletClick: () -> Unit = {},
    onSkillsClick: () -> Unit = {},
    viewModel: DashboardViewModel = hiltViewModel()
) {
    val ordersResource by viewModel.orders.collectAsState()
    val returnsResource by viewModel.returns.collectAsState()
    val activeServiceBooking by viewModel.activeServiceBooking.collectAsState()
    val optimizedTrip by viewModel.optimizedTrip.collectAsState()
    val isConnected by viewModel.isConnected.collectAsState()
    val pendingSyncCount by viewModel.pendingSyncCount.collectAsState()
    val isSyncing by viewModel.isSyncing.collectAsState()
    val incentiveProgress by viewModel.incentiveProgress.collectAsState()
    val codCashInHand by viewModel.codCashInHand.collectAsState()
    val isCodVaultLimitExceeded by viewModel.isCodVaultLimitExceeded.collectAsState()
    
    val partnerRole by viewModel.partnerRole.collectAsState()
    val partnerWallet by viewModel.partnerWallet.collectAsState()
    val riderProfileResource by viewModel.riderProfile.collectAsState()
    val rider = (riderProfileResource as? Resource.Success)?.data

    val isServiceMan = partnerRole == "service_man"
    val isBoth = partnerRole == "both"

    val tabs = remember(partnerRole) {
        when {
            isServiceMan -> listOf("Services")
            isBoth -> listOf("Deliveries", "Returns", "Services")
            else -> listOf("Deliveries", "Returns")
        }
    }

    val context = LocalContext.current
    var isOnline by remember { mutableStateOf(false) }
    var showSOSDialog by remember { mutableStateOf(false) }
    var selectedTab by remember { mutableIntStateOf(0) }

    LaunchedEffect(tabs) {
        if (selectedTab >= tabs.size) {
            selectedTab = 0
        }
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        if (permissions.entries.all { it.value }) {
            isOnline = startLocationService(context)
        } else {
            isOnline = false
        }
    }

    Scaffold(
        topBar = {
            Column {
                TopAppBar(
                    title = {
                        Text(
                            when {
                                isServiceMan -> "Service Partner Dashboard"
                                isBoth -> "Partner & Delivery Dashboard"
                                else -> "Assigned Orders"
                            },
                            fontWeight = FontWeight.Bold
                        )
                    },
                    actions = {
                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(end = 8.dp)) {
                            Text(if (isOnline) "Online" else "Offline", color = Color.White, fontSize = 14.sp)
                            Switch(
                                checked = isOnline,
                                onCheckedChange = { checked ->
                                    if (checked) {
                                        val permissions = mutableListOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
                                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) permissions.add(Manifest.permission.POST_NOTIFICATIONS)
                                        permissionLauncher.launch(permissions.toTypedArray())
                                    } else {
                                        isOnline = false
                                        stopLocationService(context)
                                    }
                                },
                                colors = SwitchDefaults.colors(
                                    checkedThumbColor = MaterialTheme.colorScheme.onPrimary,
                                    checkedTrackColor = MaterialTheme.colorScheme.primaryContainer
                                )
                            )
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = MaterialTheme.colorScheme.primary, 
                        titleContentColor = MaterialTheme.colorScheme.onPrimary
                    )
                )
                
                if (tabs.size > 1) {
                    TabRow(
                        selectedTabIndex = selectedTab, 
                        containerColor = MaterialTheme.colorScheme.primary, 
                        contentColor = MaterialTheme.colorScheme.onPrimary
                    ) {
                        tabs.forEachIndexed { index, title ->
                            Tab(
                                selected = selectedTab == index,
                                onClick = { selectedTab = index },
                                text = { Text(title, fontWeight = if (selectedTab == index) FontWeight.Bold else FontWeight.Normal) }
                            )
                        }
                    }
                }
                
                RuralOfflineBanner(
                    isConnected = isConnected,
                    pendingSyncCount = pendingSyncCount,
                    isSyncing = isSyncing,
                    onSyncNow = { viewModel.triggerManualSync() }
                )
            }
        },
        floatingActionButton = {
            Column(horizontalAlignment = Alignment.End) {
                FloatingActionButton(
                    onClick = { showSOSDialog = true },
                    containerColor = MaterialTheme.colorScheme.error,
                    contentColor = MaterialTheme.colorScheme.onError,
                    shape = CircleShape,
                    modifier = Modifier.size(64.dp)
                ) {
                    Text("SOS", fontWeight = FontWeight.Bold)
                }
                val showScanFab = !isServiceMan && (selectedTab == 0 || (isBoth && selectedTab != 2))
                if (showScanFab) {
                    Spacer(modifier = Modifier.height(16.dp))
                    FloatingActionButton(
                        onClick = onScanClick,
                        containerColor = MaterialTheme.colorScheme.primary,
                        contentColor = MaterialTheme.colorScheme.onPrimary,
                        modifier = Modifier.height(64.dp).widthIn(min = 160.dp)
                    ) {
                        Row(modifier = Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.QrCodeScanner, contentDescription = null)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Scan to Pick", fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding).background(MaterialTheme.colorScheme.background)) {
            val currentTabTitle = tabs.getOrNull(selectedTab) ?: "Deliveries"

            if (isServiceMan || (isBoth && currentTabTitle == "Services")) {
                // Dedicated Service Partner View
                ServicePartnerDashboardContent(
                    activeBooking = activeServiceBooking,
                    wallet = partnerWallet,
                    skills = rider?.serviceSkills ?: emptyList(),
                    equipment = rider?.serviceEquipment ?: emptyList(),
                    kycStatus = rider?.kycStatus ?: "NOT_SUBMITTED",
                    onServiceJobClick = onServiceJobClick,
                    onWalletClick = onWalletClick,
                    onSkillsClick = onSkillsClick,
                    onSyncCloud = {
                        com.google.firebase.auth.FirebaseAuth.getInstance().currentUser?.uid?.let {
                            viewModel.syncData(it)
                        }
                    }
                )
            } else if (currentTabTitle == "Deliveries") {
                // Deliveries Tab
                when (val res = ordersResource) {
                    is Resource.Loading<*> -> CircularProgressIndicator(modifier = Modifier.align(Alignment.Center), color = MaterialTheme.colorScheme.primary)
                    is Resource.Success<List<Order>> -> {
                        val orders = res.data ?: emptyList()
                        val trip = optimizedTrip
                        
                        LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            // 0. Active Service Booking Card (Only shown if partner has delivery + service role)
                            if (isBoth && activeServiceBooking != null) {
                                item {
                                    Card(
                                        onClick = { onServiceJobClick(activeServiceBooking!!.id, activeServiceBooking!!.status) },
                                        shape = RoundedCornerShape(12.dp),
                                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.tertiaryContainer),
                                        elevation = CardDefaults.cardElevation(4.dp),
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        Row(
                                            modifier = Modifier.padding(16.dp).fillMaxWidth(),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Column {
                                                Text(
                                                    "Active Job: ${activeServiceBooking!!.serviceName}",
                                                    fontWeight = FontWeight.Bold,
                                                    fontSize = 16.sp,
                                                    color = MaterialTheme.colorScheme.onTertiaryContainer
                                                )
                                                Text(
                                                    "Status: ${activeBookingStatusText(activeServiceBooking!!.status)}",
                                                    color = MaterialTheme.colorScheme.onTertiaryContainer.copy(alpha = 0.8f),
                                                    fontSize = 14.sp
                                                )
                                            }
                                            Icon(
                                                Icons.Default.ArrowForward,
                                                contentDescription = "Execute",
                                                tint = MaterialTheme.colorScheme.onTertiaryContainer
                                            )
                                        }
                                    }
                                }
                            }

                            // 1. Cash Limit Security (COD Vault Limit) Banner
                            if (isCodVaultLimitExceeded || codCashInHand >= 10000.0) {
                                item {
                                    CodVaultSecurityBanner(
                                        cashInHand = codCashInHand,
                                        isExceeded = isCodVaultLimitExceeded,
                                        onDepositClick = onReconciliationClick
                                    )
                                }
                            }

                            // 2. Rider Live Incentive & Earnings Progress Card
                            item {
                                IncentiveProgressCard(incentiveProgress)
                            }

                            
                            item {
                                OutlinedButton(
                                    onClick = { 
                                        com.google.firebase.auth.FirebaseAuth.getInstance().currentUser?.uid?.let { 
                                            viewModel.syncData(it)
                                        } 
                                    },
                                    modifier = Modifier.fillMaxWidth().height(48.dp),
                                    shape = RoundedCornerShape(12.dp),
                                    border = BorderStroke(1.dp, Color.LightGray)
                                ) {
                                    Icon(Icons.Default.Sync, contentDescription = null, modifier = Modifier.size(18.dp))
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text("Sync Cloud Data", color = Color.Gray, fontSize = 12.sp)
                                }
                            }
                            
                            if (orders.isEmpty()) {
                                item {
                                    Box(modifier = Modifier.fillMaxWidth().height(300.dp), contentAlignment = Alignment.Center) {
                                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                            Icon(Icons.Default.LocalShipping, contentDescription = null, modifier = Modifier.size(64.dp), tint = Color.LightGray)
                                            Text("No orders assigned today!", color = Color.Gray)
                                        }
                                    }
                                }
                            } else {
                                if (trip != null && trip.stops.isNotEmpty()) {
                                    item { TripSummaryCard(trip) }
                                    item { 
                                        Row(
                                            modifier = Modifier.fillMaxWidth(), 
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Text("Shortest Route Sequence", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                                            Text("1-2-3-4 क्रम", fontSize = 12.sp, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                                        }
                                    }
                                    items(trip.stops) { stop -> 
                                        OrderCard(
                                            order = stop.order, 
                                            stopNumber = stop.stopNumber,
                                            distanceKm = stop.distanceKmFromPrev,
                                            onStatusClick = { viewModel.updateStatus(stop.order.id, it) }, 
                                            onNavigateClick = {
                                                val navUri = if (stop.order.targetLat != 0.0 && stop.order.targetLng != 0.0)
                                                    "google.navigation:q=${stop.order.targetLat},${stop.order.targetLng}&mode=d"
                                                else {
                                                    val lm = stop.order.getEffectiveLandmark()
                                                    val query = if (lm.isNotBlank()) "${stop.order.address} ($lm)" else stop.order.address
                                                    "google.navigation:q=${Uri.encode(query)}&mode=d"
                                                }
                                                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(navUri)).setPackage("com.google.android.apps.maps"))
                                            }, 
                                            onCallClick = {
                                                val phoneUri = Uri.parse("tel:${stop.order.userPhone}")
                                                context.startActivity(Intent(Intent.ACTION_DIAL, phoneUri))
                                            },
                                            onClick = { onOrderClick(stop.order.id) }
                                        )
                                    }
                                } else {
                                    items(orders) { order -> 
                                        OrderCard(
                                            order = order, 
                                            stopNumber = null,
                                            distanceKm = null,
                                            onStatusClick = { viewModel.updateStatus(order.id, it) }, 
                                            onNavigateClick = {
                                                val navUri = if (order.targetLat != 0.0 && order.targetLng != 0.0)
                                                    "google.navigation:q=${order.targetLat},${order.targetLng}&mode=d"
                                                else {
                                                    val lm = order.getEffectiveLandmark()
                                                    val query = if (lm.isNotBlank()) "${order.address} ($lm)" else order.address
                                                    "google.navigation:q=${Uri.encode(query)}&mode=d"
                                                }
                                                context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(navUri)).setPackage("com.google.android.apps.maps"))
                                            }, 
                                            onCallClick = {
                                                val phoneUri = Uri.parse("tel:${order.userPhone}")
                                                context.startActivity(Intent(Intent.ACTION_DIAL, phoneUri))
                                            },
                                            onClick = { onOrderClick(order.id) }
                                        )
                                    }
                                }
                            }
                        }
                    }
                    is Resource.Error<*> -> Text("Error: ${res.message}", modifier = Modifier.align(Alignment.Center), color = Color.Red)
                    else -> {}
                }
            } else {
                // Returns Tab
                when (val res = returnsResource) {
                    is Resource.Loading<*> -> CircularProgressIndicator(modifier = Modifier.align(Alignment.Center), color = Color(0xFF2E7D32))
                    is Resource.Success<List<ReturnRequest>> -> {
                        val returns = res.data ?: emptyList()
                        if (returns.isEmpty()) {
                            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(64.dp), tint = Color.LightGray)
                                    Text("No return pickups assigned!", color = Color.Gray)
                                }
                            }
                        } else {
                            LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                                items(returns) { request ->
                                    ReturnPickupCard(request, onClick = { onReturnClick(request.id) }) {
                                        viewModel.updateReturnStatus(request.id, ReturnStatus.PICKED_UP.name)
                                    }
                                }
                            }
                        }
                    }
                    is Resource.Error<*> -> Text("Error: ${res.message}", modifier = Modifier.align(Alignment.Center), color = Color.Red)
                    else -> {}
                }
            }
        }
    }

    if (showSOSDialog) {
        AlertDialog(
            onDismissRequest = { showSOSDialog = false },
            title = { Text("Trigger Emergency SOS?") },
            text = { Text("This will alert the dispatch team and share your live location. Use only in real emergencies.") },
            confirmButton = {
                Button(
                    onClick = {
                        triggerSOSWithLocation(context) { lat, lng ->
                            viewModel.triggerSOS(lat, lng, null)
                        }
                        showSOSDialog = false
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)
                ) { Text("CONFIRM SOS") }
            },
            dismissButton = {
                OutlinedButton(onClick = {
                    context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:${context.getString(com.company.krishivishaldelivery.R.string.emergency_phone)}")))
                    showSOSDialog = false
                }) { Text("CALL EMERGENCY") }
            }
        )
    }
}

/**
 * Cash Limit Security (COD Vault Limit) Banner
 * Enforces ₹15,000 threshold to protect riders and warehouse capital
 */
@Composable
fun CodVaultSecurityBanner(
    cashInHand: Double,
    isExceeded: Boolean,
    onDepositClick: () -> Unit
) {
    val containerColor = if (isExceeded) Color(0xFFFFEBEE) else Color(0xFFFFF3E0)
    val contentColor = if (isExceeded) Color(0xFFC62828) else Color(0xFFE65100)
    val borderColor = if (isExceeded) Color(0xFFEF5350) else Color(0xFFFFB74D)

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = containerColor),
        border = BorderStroke(1.5.dp, borderColor)
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(
                    imageVector = if (isExceeded) Icons.Default.Shield else Icons.Default.AccountBalanceWallet,
                    contentDescription = null,
                    tint = contentColor,
                    modifier = Modifier.size(24.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = if (isExceeded) "कैश लिमिट सुरक्षा (COD Vault Limit Exceeded)" else "COD Vault Warning",
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 15.sp,
                    color = contentColor
                )
            }
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = if (isExceeded)
                    "आपके पास ₹${cashInHand.toInt()} नकद जमा है। ₹15,000 की सुरक्षा सीमा पार हो गई है! नया ऑर्डर तब तक नहीं मिलेगा जब तक आप वेयरहाउस में कैश जमा न कर दें।"
                else
                    "आपके पास ₹${cashInHand.toInt()} नकद जमा है। ₹15,000 की सीमा नज़दीक है।",
                fontSize = 13.sp,
                color = contentColor.copy(alpha = 0.9f),
                lineHeight = 18.sp
            )
            Spacer(modifier = Modifier.height(10.dp))
            Button(
                onClick = onDepositClick,
                colors = ButtonDefaults.buttonColors(containerColor = contentColor),
                shape = RoundedCornerShape(8.dp),
                modifier = Modifier.align(Alignment.End).height(38.dp)
            ) {
                Icon(Icons.Default.Warehouse, contentDescription = null, modifier = Modifier.size(16.dp))
                Spacer(modifier = Modifier.width(6.dp))
                Text("वेयरहाउस में जमा करें", fontSize = 12.sp, fontWeight = FontWeight.Bold)
            }
        }
    }
}

/**
 * Rider Live Incentive & Earnings Card
 * Displays the exact live formula: "आज 10 डिलीवरी पूरी की = ₹500 कमाई + ₹100 बोनस"
 */
@Composable
fun IncentiveProgressCard(progress: IncentiveProgress) {
    Card(
        modifier = Modifier.fillMaxWidth(), 
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.6f)),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                horizontalArrangement = Arrangement.SpaceBetween, 
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.EmojiEvents, contentDescription = null, tint = PrimaryGreen)
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("आज की लाइव कमाई (Today's Earnings)", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onPrimaryContainer, fontSize = 14.sp)
                }
                if (progress.slabAchieved) {
                    Surface(
                        color = PrimaryGreen.copy(alpha = 0.15f),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Text("बोनस अनलॉक 🎉", color = PrimaryGreen, fontWeight = FontWeight.Bold, fontSize = 11.sp, modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp))
                    }
                }
            }

            Spacer(modifier = Modifier.height(10.dp))

            // Highlighted live equation
            Surface(
                color = MaterialTheme.colorScheme.surface,
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Text(
                        text = "आज ${progress.currentCount} डिलीवरी पूरी की = ₹${progress.earnedCommission.toInt()} कमाई + ₹${progress.earnedBonus.toInt()} बोनस",
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = 15.sp,
                        color = MaterialTheme.colorScheme.primary
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "कुल लाइव कमाई: ₹${progress.totalEarningsToday.toInt()}",
                        fontWeight = FontWeight.Bold,
                        fontSize = 17.sp,
                        color = Color(0xFF2E7D32)
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))
            LinearProgressIndicator(
                progress = { progress.progress }, 
                modifier = Modifier.fillMaxWidth().height(8.dp), 
                color = MaterialTheme.colorScheme.primary, 
                trackColor = MaterialTheme.colorScheme.surface
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                if (progress.nextSlab != null)
                    "अगले ₹${progress.nextSlab.bonusAmount.toInt()} बोनस के लिए केवल ${progress.ordersRemaining} डिलीवरी और! 🚀"
                else
                    "शानदार! आज के सभी इंसेंटिव लक्ष्य प्राप्त कर लिए गए हैं! 🌟",
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium,
                color = MaterialTheme.colorScheme.onPrimaryContainer
            )
        }
    }
}

/**
 * Route Optimization (Shortest Route 1-2-3-4) Card
 */
@Composable
fun TripSummaryCard(trip: OptimizedTrip) {
    Card(
        modifier = Modifier.fillMaxWidth(), 
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = 0.5f))
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Route, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                Spacer(modifier = Modifier.width(8.dp))
                Column {
                    Text("रूट ऑप्टिमाइज़ेशन (Shortest Route Sorting)", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary, fontSize = 15.sp)
                    Text("सबसे कम पेट्रोल और समय वाला 1-2-3-4 क्रम सक्रिय ⚡", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSecondaryContainer)
                }
            }
            Spacer(modifier = Modifier.height(10.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                TripStatChip("कुल दूरी", "~${trip.totalDistanceKm} km")
                TripStatChip("पेट्रोल बचत", "~${trip.estimatedPetrolSavedLiters} L")
                TripStatChip("अनुमानित समय", "~${trip.estimatedTimeMinutes} min")
            }
        }
    }
}

@Composable
private fun TripStatChip(label: String, value: String) {
    Surface(
        color = MaterialTheme.colorScheme.surface.copy(alpha = 0.8f),
        shape = RoundedCornerShape(8.dp)
    ) {
        Column(modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(label, fontSize = 10.sp, color = Color.Gray)
            Text(value, fontSize = 13.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
        }
    }
}

/**
 * Order Card with Landmark & 1-Tap Call Button & Sequential Stop Badge
 */
@Composable
fun OrderCard(
    order: Order, 
    stopNumber: Int? = null,
    distanceKm: Double? = null,
    onStatusClick: (String) -> Unit, 
    onNavigateClick: () -> Unit,
    onCallClick: () -> Unit,
    onClick: () -> Unit
) {
    val landmark = order.getEffectiveLandmark()

    Card(
        onClick = onClick, 
        shape = RoundedCornerShape(14.dp), 
        elevation = CardDefaults.cardElevation(4.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(modifier = Modifier.padding(16.dp).fillMaxWidth()) {
            Row(horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth()) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (stopNumber != null) {
                        Surface(
                            color = MaterialTheme.colorScheme.primary,
                            shape = RoundedCornerShape(6.dp)
                        ) {
                            Text(
                                text = "क्रम #$stopNumber", 
                                color = MaterialTheme.colorScheme.onPrimary, 
                                fontWeight = FontWeight.ExtraBold, 
                                fontSize = 12.sp,
                                modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp)
                            )
                        }
                        Spacer(modifier = Modifier.width(8.dp))
                    }
                    Text("Order #${order.id.takeLast(8).uppercase()}", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                }
                StatusBadge(order.status)
            }

            Spacer(modifier = Modifier.height(6.dp))
            Text("Customer: ${order.userName}", fontSize = 14.sp, fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.onSurface)
            Text(order.address, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)

            // Rural Landmark Badge (गाँव का लैंडमार्क)
            if (landmark.isNotBlank()) {
                Spacer(modifier = Modifier.height(8.dp))
                Surface(
                    color = Color(0xFFFFF8E1),
                    border = BorderStroke(1.dp, Color(0xFFFFD54F)),
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.Place, contentDescription = null, tint = Color(0xFFE65100), modifier = Modifier.size(16.dp))
                        Spacer(modifier = Modifier.width(6.dp))
                        Text("लैंडमार्क: ", fontWeight = FontWeight.Bold, fontSize = 12.sp, color = Color(0xFFE65100))
                        Text(landmark, fontWeight = FontWeight.SemiBold, fontSize = 12.sp, color = Color(0xFF3E2723))
                    }
                }
            }

            if (distanceKm != null && distanceKm > 0.0) {
                Spacer(modifier = Modifier.height(4.dp))
                Text("अगले स्टॉप से दूरी: ~${(distanceKm * 10).toInt() / 10.0} km", fontSize = 11.sp, color = Color.Gray)
            }

            // Action Buttons: 1-Tap Call, Navigate, Next Status
            Row(modifier = Modifier.fillMaxWidth().padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                // 1-Tap Call Button
                OutlinedButton(
                    onClick = onCallClick,
                    modifier = Modifier.height(46.dp),
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFF2E7D32)),
                    border = BorderStroke(1.2.dp, Color(0xFF2E7D32)),
                    contentPadding = PaddingValues(horizontal = 12.dp)
                ) {
                    Icon(Icons.Default.Phone, contentDescription = "Call", modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Call", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                }

                // Google Maps Navigate Button
                Button(
                    onClick = onNavigateClick,
                    modifier = Modifier.height(46.dp).weight(1f),
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.tertiary)
                ) {
                    Icon(Icons.Default.Navigation, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Navigate", fontSize = 13.sp)
                }

                // Status Progression Button
                Button(
                    onClick = { onStatusClick(getNextStatus(order.status)) },
                    modifier = Modifier.height(46.dp).weight(1.2f),
                    shape = RoundedCornerShape(10.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary)
                ) { 
                    Text(when(order.status) {
                        OrderStatus.ASSIGNED.name -> "Pick Up"
                        OrderStatus.PICKED_UP.name -> "Start Delivery"
                        else -> "Mark Delivered"
                    }, fontSize = 13.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}

@Composable
fun ReturnPickupCard(request: ReturnRequest, onClick: () -> Unit, onPickup: () -> Unit) {
    Card(onClick = onClick, shape = RoundedCornerShape(12.dp), elevation = CardDefaults.cardElevation(4.dp)) {
        Column(modifier = Modifier.padding(16.dp).fillMaxWidth()) {
            Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                Text("Return #${request.id.takeLast(8).uppercase()}", fontWeight = FontWeight.Bold)
                StatusBadge(request.status)
            }
            Text("Product: ${request.productName}", fontSize = 14.sp)
            Text("Reason: ${request.reason}", color = Color.Gray, fontSize = 12.sp)
            Spacer(modifier = Modifier.height(12.dp))
            Button(
                onClick = onPickup,
                modifier = Modifier.fillMaxWidth(),
                colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.tertiary)
            ) {
                Text("Quick Pickup", fontWeight = FontWeight.Bold)
            }
        }
    }
}

private fun getNextStatus(status: String) = when(status) {
    OrderStatus.ASSIGNED.name -> OrderStatus.PICKED_UP.name
    OrderStatus.PICKED_UP.name -> OrderStatus.OUT_FOR_DELIVERY.name
    else -> OrderStatus.DELIVERED.name
}

private fun startLocationService(context: android.content.Context): Boolean {
    val intent = Intent(context, RiderLocationService::class.java).apply { action = RiderLocationService.ACTION_START }
    return try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            ContextCompat.startForegroundService(context, intent)
        } else {
            context.startService(intent)
        }
        true
    } catch (_: SecurityException) {
        false
    } catch (_: IllegalStateException) {
        false
    }
}

private fun stopLocationService(context: android.content.Context) {
    val intent = Intent(context, RiderLocationService::class.java).apply { action = RiderLocationService.ACTION_STOP }
    context.stopService(intent)
}

/**
 * Rider ki last-known GPS location fetch karke SOS trigger karta hai.
 * Agar location unavailable ho, tab bhi SOS 0.0 se bhej deta hai taaki alert miss na ho.
 */
@SuppressLint("MissingPermission")
private fun triggerSOSWithLocation(
    context: android.content.Context,
    onLocation: (lat: Double, lng: Double) -> Unit
) {
    val fusedClient = LocationServices.getFusedLocationProviderClient(context)
    fusedClient.lastLocation
        .addOnSuccessListener { location ->
            val lat = location?.latitude ?: 0.0
            val lng = location?.longitude ?: 0.0
            onLocation(lat, lng)
        }
        .addOnFailureListener {
            // Location fetch fail — phir bhi SOS bhejo
            onLocation(0.0, 0.0)
        }
}

private fun activeBookingStatusText(status: String): String {
    return when (status) {
        "ASSIGNED" -> "कार्य सौंपा गया (Assigned)"
        "ON_THE_WAY" -> "रास्ते में हैं (On the way)"
        "REACHED_FARM" -> "खेत पर पहुंचे (Reached Farm)"
        "IN_PROGRESS" -> "स्प्रे / कार्य जारी (In Progress)"
        "COMPLETED" -> "कार्य पूरा हुआ (Completed)"
        else -> status
    }
}

@Composable
fun ServicePartnerDashboardContent(
    activeBooking: com.company.krishivishaldelivery.data.model.ServiceBooking?,
    wallet: com.company.krishivishaldelivery.data.model.PartnerWallet?,
    skills: List<String>,
    equipment: List<String>,
    kycStatus: String,
    onServiceJobClick: (String, String) -> Unit,
    onWalletClick: () -> Unit,
    onSkillsClick: () -> Unit,
    onSyncCloud: () -> Unit
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        // 1. Active Service Job Card
        item {
            if (activeBooking != null) {
                Card(
                    onClick = { onServiceJobClick(activeBooking.id, activeBooking.status) },
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
                    elevation = CardDefaults.cardElevation(4.dp),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Surface(
                                color = MaterialTheme.colorScheme.primary,
                                shape = RoundedCornerShape(8.dp)
                            ) {
                                Text(
                                    "ACTIVE SERVICE TASK",
                                    color = MaterialTheme.colorScheme.onPrimary,
                                    fontSize = 11.sp,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                )
                            }
                            Text(
                                activeBookingStatusText(activeBooking.status),
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.primary,
                                fontSize = 12.sp
                            )
                        }
                        Spacer(modifier = Modifier.height(10.dp))
                        Text(
                            activeBooking.serviceName,
                            fontWeight = FontWeight.Black,
                            fontSize = 18.sp,
                            color = MaterialTheme.colorScheme.onPrimaryContainer
                        )
                        if ((activeBooking.farmArea ?: 0.0) > 0.0) {
                            Spacer(modifier = Modifier.height(4.dp))
                            Text("Farm Area: ${activeBooking.farmArea} ${activeBooking.areaUnit}", fontSize = 13.sp, fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.onPrimaryContainer.copy(alpha = 0.8f))
                        }

                        Spacer(modifier = Modifier.height(12.dp))
                        Button(
                            onClick = { onServiceJobClick(activeBooking.id, activeBooking.status) },
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(10.dp)
                        ) {
                            Text("Start / Continue Service Job", fontWeight = FontWeight.Bold)
                            Spacer(modifier = Modifier.width(8.dp))
                            Icon(Icons.Default.ArrowForward, contentDescription = null, modifier = Modifier.size(16.dp))
                        }
                    }
                }
            } else {
                Card(
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier.padding(20.dp).fillMaxWidth(),
                        horizontalAlignment = Alignment.CenterHorizontally
                    ) {
                        Icon(
                            Icons.Default.Agriculture,
                            contentDescription = null,
                            modifier = Modifier.size(48.dp),
                            tint = MaterialTheme.colorScheme.primary
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Text(
                            "No Active Service Bookings",
                            fontWeight = FontWeight.Bold,
                            fontSize = 16.sp,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            "You are currently marked Online. When a nearby farmer books Drone Spraying, Soil Testing or Farm Advisory, the job alert will appear on your screen.",
                            fontSize = 12.sp,
                            color = Color.Gray,
                            lineHeight = 18.sp,
                            textAlign = androidx.compose.ui.text.style.TextAlign.Center
                        )
                    }
                }
            }
        }

        // 2. Partner Wallet Quick Card
        item {
            Card(
                onClick = onWalletClick,
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(2.dp),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.padding(16.dp).fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Surface(
                            shape = CircleShape,
                            color = MaterialTheme.colorScheme.primaryContainer,
                            modifier = Modifier.size(44.dp)
                        ) {
                            Box(contentAlignment = Alignment.Center) {
                                Icon(Icons.Default.AccountBalanceWallet, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                            }
                        }
                        Spacer(modifier = Modifier.width(12.dp))
                        Column {
                            Text("Partner Wallet", fontWeight = FontWeight.Bold, fontSize = 15.sp)
                            Text("Commission Balance: ₹${wallet?.balance ?: 0.0}", fontSize = 13.sp, color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                        }
                    }
                    Icon(Icons.Default.ChevronRight, contentDescription = "Open Wallet", tint = Color.Gray)
                }
            }
        }

        // 3. My Skills & Equipment Card
        item {
            Card(
                onClick = onSkillsClick,
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(2.dp),
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant),
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.padding(16.dp).fillMaxWidth()) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Surface(
                                shape = CircleShape,
                                color = MaterialTheme.colorScheme.secondaryContainer,
                                modifier = Modifier.size(44.dp)
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Icon(Icons.Default.Build, contentDescription = null, tint = MaterialTheme.colorScheme.secondary)
                                }
                            }
                            Spacer(modifier = Modifier.width(12.dp))
                            Column {
                                Text("Registered Skills & Tools", fontWeight = FontWeight.Bold, fontSize = 15.sp)
                                Text("${skills.size} skills configured", fontSize = 12.sp, color = Color.Gray)
                            }
                        }
                        Icon(Icons.Default.ChevronRight, contentDescription = "Edit Skills", tint = Color.Gray)
                    }
                    if (skills.isNotEmpty()) {
                        Spacer(modifier = Modifier.height(10.dp))
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            skills.take(3).forEach { skill ->
                                Surface(
                                    shape = RoundedCornerShape(12.dp),
                                    color = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = 0.5f)
                                ) {
                                    Text(
                                        skill,
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Medium,
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }

        // 4. KYC Status Card
        item {
            Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(
                    containerColor = if (kycStatus == "VERIFIED") Color(0xFFE8F5E9) else Color(0xFFFFF3E0)
                ),
                modifier = Modifier.fillMaxWidth()
            ) {
                Row(
                    modifier = Modifier.padding(14.dp).fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        if (kycStatus == "VERIFIED") Icons.Default.Verified else Icons.Default.Info,
                        contentDescription = null,
                        tint = if (kycStatus == "VERIFIED") Color(0xFF2E7D32) else Color(0xFFE65100),
                        modifier = Modifier.size(24.dp)
                    )
                    Spacer(modifier = Modifier.width(10.dp))
                    Column {
                        Text(
                            if (kycStatus == "VERIFIED") "KYC Verified Partner" else "KYC Document Status: $kycStatus",
                            fontWeight = FontWeight.Bold,
                            fontSize = 13.sp,
                            color = if (kycStatus == "VERIFIED") Color(0xFF2E7D32) else Color(0xFFE65100)
                        )
                        Text(
                            if (kycStatus == "VERIFIED") "Eligible for high-value spraying and equipment jobs" else "Upload DL & Aadhaar in profile for instant job matching",
                            fontSize = 11.sp,
                            color = Color.DarkGray
                        )
                    }
                }
            }
        }

        // 5. Cloud Sync Button
        item {
            OutlinedButton(
                onClick = onSyncCloud,
                modifier = Modifier.fillMaxWidth().height(48.dp),
                shape = RoundedCornerShape(12.dp),
                border = BorderStroke(1.dp, Color.LightGray)
            ) {
                Icon(Icons.Default.Sync, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text("Sync Cloud Data", color = Color.Gray, fontSize = 12.sp)
            }
        }
    }
}

