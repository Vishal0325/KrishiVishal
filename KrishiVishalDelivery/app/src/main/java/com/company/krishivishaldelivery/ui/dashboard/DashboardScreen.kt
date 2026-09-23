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
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
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
    onViewRouteClick: () -> Unit = {},
    onMorningBatchClick: () -> Unit = {},
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
    val appConfigResource by viewModel.appConfig.collectAsState()
    
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

    LaunchedEffect(rider) {
        if (rider != null) {
            isOnline = rider.isOnline
        }
    }

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
                        Column {
                            Text(
                                when {
                                    isServiceMan -> "सेवाएँ"
                                    isBoth -> "ऑर्डर और सेवाएँ"
                                    else -> "ऑर्डर"
                                },
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                            Text(
                                when {
                                    isServiceMan -> "Assigned Services"
                                    isBoth -> "Assigned Orders & Services"
                                    else -> "Assigned Orders"
                                },
                                fontSize = 12.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    },
                    actions = {
                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(end = 8.dp)) {
                            Text(if (isOnline) "Online" else "Offline", color = MaterialTheme.colorScheme.primary, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                            Spacer(modifier = Modifier.width(8.dp))
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
                                    checkedThumbColor = Color.White,
                                    checkedTrackColor = MaterialTheme.colorScheme.primary,
                                    uncheckedThumbColor = Color.White,
                                    uncheckedTrackColor = Color.LightGray,
                                    uncheckedBorderColor = Color.Transparent
                                )
                            )
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = MaterialTheme.colorScheme.surface, 
                        titleContentColor = MaterialTheme.colorScheme.onSurface
                    )
                )
                
                if (tabs.size > 1) {
                    TabRow(
                        selectedTabIndex = selectedTab, 
                        containerColor = MaterialTheme.colorScheme.surface, 
                        contentColor = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp).clip(RoundedCornerShape(8.dp)),
                        indicator = { } // Remove default indicator
                    ) {
                        tabs.forEachIndexed { index, title ->
                            val isSelected = selectedTab == index
                            Tab(
                                selected = isSelected,
                                onClick = { selectedTab = index },
                                modifier = Modifier.background(if (isSelected) MaterialTheme.colorScheme.surface else Color(0xFFF3F4F6)),
                                text = { 
                                    Text(
                                        title, 
                                        fontWeight = FontWeight.SemiBold,
                                        color = if (isSelected) MaterialTheme.colorScheme.onSurface else Color.Gray,
                                        fontSize = 13.sp
                                    ) 
                                }
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
            if (tabs.getOrNull(selectedTab) == "Deliveries") {
                ExtendedFloatingActionButton(
                    onClick = onViewRouteClick,
                    icon = { Icon(Icons.Default.Map, contentDescription = "View Route") },
                    text = { Text("View Route") },
                    containerColor = MaterialTheme.colorScheme.primary,
                    contentColor = Color.White
                )
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
                        val commissionPerOrder = (appConfigResource as? Resource.Success)?.data?.commissionPerOrder ?: 20.0

                        var searchQuery by remember { mutableStateOf("") }
                        var selectedFilter by remember { mutableStateOf("ALL") }

                        val pendingStatuses = remember { listOf(OrderStatus.PLACED.name, OrderStatus.CONFIRMED.name, OrderStatus.ASSIGNED.name, "RIDER_ASSIGNED", "RIDER_ACCEPTED", "PACKED", "READY_FOR_PICKUP") }
                        val pickedStatuses = remember { listOf(OrderStatus.PICKED_UP.name, OrderStatus.OUT_FOR_DELIVERY.name, "IN_TRANSIT") }
                        val deliveredStatuses = remember { listOf(OrderStatus.DELIVERED.name) }

                        val totalCount = orders.size
                        val pendingCount = orders.count { it.status in pendingStatuses }
                        val pickedCount = orders.count { it.status in pickedStatuses }
                        val deliveredCount = orders.count { it.status in deliveredStatuses }

                        val deliveredOrders = remember(orders) { orders.filter { it.status == OrderStatus.DELIVERED.name } }

                        val filteredOrders = remember(orders, selectedFilter, searchQuery) {
                            orders.filter { order ->
                                val matchesFilter = when (selectedFilter) {
                                    "PENDING" -> order.status in pendingStatuses
                                    "PICKED" -> order.status in pickedStatuses
                                    "DELIVERED" -> order.status in deliveredStatuses
                                    else -> true
                                }
                                val query = searchQuery.trim()
                                val matchesSearch = if (query.isBlank()) true else {
                                    order.id.contains(query, ignoreCase = true) ||
                                    order.userName.contains(query, ignoreCase = true) ||
                                    order.userPhone.contains(query, ignoreCase = true) ||
                                    order.address.contains(query, ignoreCase = true) ||
                                    order.getEffectiveLandmark().contains(query, ignoreCase = true)
                                }
                                matchesFilter && matchesSearch
                            }
                        }

                        LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            item {
                                Card(
                                    onClick = onMorningBatchClick,
                                    shape = RoundedCornerShape(12.dp),
                                    colors = CardDefaults.cardColors(containerColor = Color(0xFFFFFBEB)),
                                    elevation = CardDefaults.cardElevation(2.dp),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Row(
                                        modifier = Modifier.padding(16.dp).fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Column {
                                            Text(
                                                "Morning Order Pack (9:00 AM)",
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 16.sp,
                                                color = Color(0xFFB45309)
                                            )
                                            Text(
                                                "90 Orders • 120 kg • ₹1,800 Est.",
                                                color = Color(0xFFB45309).copy(alpha = 0.8f),
                                                fontSize = 14.sp
                                            )
                                        }
                                        Icon(
                                            Icons.AutoMirrored.Filled.ArrowForward,
                                            contentDescription = "View Batch",
                                            tint = Color(0xFFB45309)
                                        )
                                    }
                                }
                            }

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
                                                Icons.AutoMirrored.Filled.ArrowForward,
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

                            // 3. Search Bar
                            item {
                                OutlinedTextField(
                                    value = searchQuery,
                                    onValueChange = { searchQuery = it },
                                    placeholder = { Text("Search by Order #, Farmer name, phone...", fontSize = 13.sp, color = Color.Gray) },
                                    leadingIcon = { Icon(Icons.Default.Search, contentDescription = "Search", tint = Color.Gray, modifier = Modifier.size(20.dp)) },
                                    trailingIcon = {
                                        if (searchQuery.isNotEmpty()) {
                                            IconButton(onClick = { searchQuery = "" }) {
                                                Icon(Icons.Default.Clear, contentDescription = "Clear", tint = Color.Gray, modifier = Modifier.size(18.dp))
                                            }
                                        }
                                    },
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .height(54.dp),
                                    shape = RoundedCornerShape(14.dp),
                                    colors = OutlinedTextFieldDefaults.colors(
                                        focusedContainerColor = Color.White,
                                        unfocusedContainerColor = Color.White,
                                        focusedBorderColor = MaterialTheme.colorScheme.primary,
                                        unfocusedBorderColor = Color(0xFFE5E7EB)
                                    ),
                                    singleLine = true
                                )
                            }

                            // 4. Quick Status Filter Chips
                            item {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .horizontalScroll(rememberScrollState()),
                                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                                ) {
                                    FilterChip(
                                        selected = selectedFilter == "ALL",
                                        onClick = { selectedFilter = "ALL" },
                                        label = { Text("All ($totalCount)", fontWeight = FontWeight.Bold, fontSize = 12.sp) },
                                        colors = FilterChipDefaults.filterChipColors(
                                            selectedContainerColor = MaterialTheme.colorScheme.primary,
                                            selectedLabelColor = Color.White,
                                            containerColor = Color.White,
                                            labelColor = Color.DarkGray
                                        ),
                                        border = FilterChipDefaults.filterChipBorder(
                                            borderColor = if (selectedFilter == "ALL") MaterialTheme.colorScheme.primary else Color(0xFFE5E7EB),
                                            selectedBorderColor = MaterialTheme.colorScheme.primary,
                                            enabled = true,
                                            selected = selectedFilter == "ALL"
                                        )
                                    )
                                    FilterChip(
                                        selected = selectedFilter == "PENDING",
                                        onClick = { selectedFilter = "PENDING" },
                                        label = { Text("Pending ($pendingCount)", fontWeight = FontWeight.Bold, fontSize = 12.sp) },
                                        colors = FilterChipDefaults.filterChipColors(
                                            selectedContainerColor = Color(0xFFF59E0B),
                                            selectedLabelColor = Color.White,
                                            containerColor = Color.White,
                                            labelColor = Color(0xFFB45309)
                                        ),
                                        border = FilterChipDefaults.filterChipBorder(
                                            borderColor = if (selectedFilter == "PENDING") Color(0xFFF59E0B) else Color(0xFFE5E7EB),
                                            selectedBorderColor = Color(0xFFF59E0B),
                                            enabled = true,
                                            selected = selectedFilter == "PENDING"
                                        )
                                    )
                                    FilterChip(
                                        selected = selectedFilter == "PICKED",
                                        onClick = { selectedFilter = "PICKED" },
                                        label = { Text("Picked ($pickedCount)", fontWeight = FontWeight.Bold, fontSize = 12.sp) },
                                        colors = FilterChipDefaults.filterChipColors(
                                            selectedContainerColor = Color(0xFF2563EB),
                                            selectedLabelColor = Color.White,
                                            containerColor = Color.White,
                                            labelColor = Color(0xFF1D4ED8)
                                        ),
                                        border = FilterChipDefaults.filterChipBorder(
                                            borderColor = if (selectedFilter == "PICKED") Color(0xFF2563EB) else Color(0xFFE5E7EB),
                                            selectedBorderColor = Color(0xFF2563EB),
                                            enabled = true,
                                            selected = selectedFilter == "PICKED"
                                        )
                                    )
                                    FilterChip(
                                        selected = selectedFilter == "DELIVERED",
                                        onClick = { selectedFilter = "DELIVERED" },
                                        label = { Text("Delivered ($deliveredCount)", fontWeight = FontWeight.Bold, fontSize = 12.sp) },
                                        colors = FilterChipDefaults.filterChipColors(
                                            selectedContainerColor = Color(0xFF16A34A),
                                            selectedLabelColor = Color.White,
                                            containerColor = Color.White,
                                            labelColor = Color(0xFF15803D)
                                        ),
                                        border = FilterChipDefaults.filterChipBorder(
                                            borderColor = if (selectedFilter == "DELIVERED") Color(0xFF16A34A) else Color(0xFFE5E7EB),
                                            selectedBorderColor = Color(0xFF16A34A),
                                            enabled = true,
                                            selected = selectedFilter == "DELIVERED"
                                        )
                                    )
                                }
                            }

                            // 5. Cloud Sync Button
                            item {
                                OutlinedButton(
                                    onClick = { 
                                        com.google.firebase.auth.FirebaseAuth.getInstance().currentUser?.uid?.let { 
                                            viewModel.syncData(it)
                                        } 
                                    },
                                    modifier = Modifier.fillMaxWidth().height(44.dp),
                                    shape = RoundedCornerShape(12.dp),
                                    border = BorderStroke(1.dp, Color.LightGray)
                                ) {
                                    Icon(Icons.Default.Sync, contentDescription = null, modifier = Modifier.size(16.dp))
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text("Sync Cloud Data", color = Color.Gray, fontSize = 12.sp)
                                }
                            }
                            
                            if (orders.isEmpty()) {
                                item {
                                    Box(modifier = Modifier.fillMaxWidth().height(260.dp), contentAlignment = Alignment.Center) {
                                        Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                            Icon(Icons.Default.LocalShipping, contentDescription = null, modifier = Modifier.size(64.dp), tint = Color.LightGray)
                                            Text("No orders assigned today!", color = Color.Gray)
                                        }
                                    }
                                }
                            } else if (searchQuery.isNotBlank() || selectedFilter != "ALL") {
                                // Search or Specific Filter Active
                                if (filteredOrders.isEmpty()) {
                                    item {
                                        Card(
                                            modifier = Modifier.fillMaxWidth().padding(vertical = 12.dp),
                                            shape = RoundedCornerShape(16.dp),
                                            colors = CardDefaults.cardColors(containerColor = Color.White),
                                            border = BorderStroke(1.dp, Color(0xFFE5E7EB))
                                        ) {
                                            Column(
                                                modifier = Modifier.padding(24.dp).fillMaxWidth(),
                                                horizontalAlignment = Alignment.CenterHorizontally
                                            ) {
                                                Icon(Icons.Default.SearchOff, contentDescription = null, modifier = Modifier.size(48.dp), tint = Color.Gray)
                                                Spacer(modifier = Modifier.height(8.dp))
                                                Text("No matching orders found", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                                                Text("Try changing search keywords or filter", fontSize = 12.sp, color = Color.Gray)
                                                Spacer(modifier = Modifier.height(12.dp))
                                                OutlinedButton(
                                                    onClick = {
                                                        searchQuery = ""
                                                        selectedFilter = "ALL"
                                                    },
                                                    shape = RoundedCornerShape(8.dp)
                                                ) {
                                                    Text("Reset Filters")
                                                }
                                            }
                                        }
                                    }
                                } else {
                                    items(filteredOrders) { order ->
                                        if (order.status == OrderStatus.DELIVERED.name) {
                                            DeliveredOrderCard(
                                                order = order,
                                                commissionPerOrder = commissionPerOrder,
                                                onClick = { onOrderClick(order.id) }
                                            )
                                        } else {
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
                                                onWhatsAppClick = {
                                                    val cleanPhone = order.userPhone.replace("+91", "").replace(" ", "").trim()
                                                    val waUri = Uri.parse("https://api.whatsapp.com/send?phone=91$cleanPhone&text=" + Uri.encode("नमस्ते ${order.userName} जी, मैं कृषि विशाल से आपका डिलीवरी पार्टनर हूँ।"))
                                                    context.startActivity(Intent(Intent.ACTION_VIEW, waUri))
                                                },
                                                onClick = { onOrderClick(order.id) }
                                            )
                                        }
                                    }
                                }
                            } else {
                                // Default "ALL" Unfiltered View (Shortest Route Sequence + Delivered Orders)
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
                                            onWhatsAppClick = {
                                                val cleanPhone = stop.order.userPhone.replace("+91", "").replace(" ", "").trim()
                                                val waUri = Uri.parse("https://api.whatsapp.com/send?phone=91$cleanPhone&text=" + Uri.encode("नमस्ते ${stop.order.userName} जी, मैं कृषि विशाल से आपका डिलीवरी पार्टनर हूँ।"))
                                                context.startActivity(Intent(Intent.ACTION_VIEW, waUri))
                                            },
                                            onClick = { onOrderClick(stop.order.id) }
                                        )
                                    }
                                } else {
                                    val undelivered = orders.filter { it.status != OrderStatus.DELIVERED.name }
                                    items(undelivered) { order -> 
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
                                            onWhatsAppClick = {
                                                val cleanPhone = order.userPhone.replace("+91", "").replace(" ", "").trim()
                                                val waUri = Uri.parse("https://api.whatsapp.com/send?phone=91$cleanPhone&text=" + Uri.encode("नमस्ते ${order.userName} जी, मैं कृषि विशाल से आपका डिलीवरी पार्टनर हूँ।"))
                                                context.startActivity(Intent(Intent.ACTION_VIEW, waUri))
                                            },
                                            onClick = { onOrderClick(order.id) }
                                        )
                                    }
                                }

                                // ── Delivered Orders Section with Earnings ──
                                if (deliveredOrders.isNotEmpty()) {
                                    item {
                                        Spacer(modifier = Modifier.height(8.dp))
                                        HorizontalDivider(color = Color(0xFFE5E7EB))
                                        Spacer(modifier = Modifier.height(12.dp))
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Row(verticalAlignment = Alignment.CenterVertically) {
                                                Text("✅", fontSize = 18.sp)
                                                Spacer(modifier = Modifier.width(8.dp))
                                                Text("Delivered Orders", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                                            }
                                            Surface(
                                                shape = RoundedCornerShape(20.dp),
                                                color = Color(0xFFDCFCE7)
                                            ) {
                                                Text(
                                                    "₹${(deliveredOrders.size * commissionPerOrder).toInt()} कमाई",
                                                    color = Color(0xFF16A34A),
                                                    fontWeight = FontWeight.Bold,
                                                    fontSize = 13.sp,
                                                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                                                )
                                            }
                                        }
                                    }
                                    items(deliveredOrders) { order ->
                                        DeliveredOrderCard(
                                            order = order,
                                            commissionPerOrder = commissionPerOrder,
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
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.Transparent)
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    brush = androidx.compose.ui.graphics.Brush.linearGradient(
                        colors = listOf(Color(0xFF22C55E), Color(0xFF15803D))
                    )
                )
                .padding(16.dp)
        ) {
            Column {
                Text("TODAY'S EARNINGS", color = Color(0xFFDCFCE7), fontSize = 11.sp, fontWeight = FontWeight.Medium, letterSpacing = 1.sp)
                
                Row(verticalAlignment = Alignment.Bottom) {
                    Text("₹${progress.totalEarningsToday.toInt()}", color = Color.White, fontSize = 28.sp, fontWeight = FontWeight.Bold)
                    if (progress.nextSlab != null) {
                        Spacer(modifier = Modifier.width(8.dp))
                        val goal = progress.totalEarningsToday + progress.nextSlab.bonusAmount
                        Text("/ ₹${goal.toInt()} goal", color = Color(0xFFDCFCE7), fontSize = 14.sp)
                    }
                }
                
                Spacer(modifier = Modifier.height(16.dp))
                
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                        Column {
                            Text("ORDERS", color = Color(0xFFDCFCE7), fontSize = 10.sp, fontWeight = FontWeight.Bold)
                            Text("${progress.currentCount}", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                        }
                        Column {
                            Text("BONUS", color = Color(0xFFDCFCE7), fontSize = 10.sp, fontWeight = FontWeight.Bold)
                            Text("₹${progress.earnedBonus.toInt()}", color = Color.White, fontSize = 14.sp, fontWeight = FontWeight.SemiBold)
                        }
                    }
                    
                    if (progress.slabAchieved) {
                        Surface(
                            color = Color.White.copy(alpha = 0.2f),
                            shape = RoundedCornerShape(8.dp),
                            border = BorderStroke(1.dp, Color.White.copy(alpha = 0.3f))
                        ) {
                            Row(modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.EmojiEvents, contentDescription = null, tint = Color(0xFFFDE047), modifier = Modifier.size(14.dp))
                                Spacer(modifier = Modifier.width(4.dp))
                                Text("Goal Achieved", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    } else if (progress.nextSlab != null) {
                        Text("${progress.ordersRemaining} more", color = Color.White, fontSize = 11.sp, fontWeight = FontWeight.Bold)
                    }
                }
                
                Spacer(modifier = Modifier.height(12.dp))
                LinearProgressIndicator(
                    progress = { progress.progress }, 
                    modifier = Modifier.fillMaxWidth().height(4.dp), 
                    color = Color.White, 
                    trackColor = Color.White.copy(alpha = 0.3f)
                )
            }
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

@Composable
fun OrderCard(
    order: Order, 
    stopNumber: Int? = null,
    distanceKm: Double? = null,
    onStatusClick: (String) -> Unit, 
    onNavigateClick: () -> Unit,
    onCallClick: () -> Unit,
    onWhatsAppClick: (() -> Unit)? = null,
    onClick: () -> Unit
) {
    val landmark = order.getEffectiveLandmark()

    Box(modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp)) {
        Card(
            onClick = onClick, 
            shape = RoundedCornerShape(16.dp), 
            elevation = CardDefaults.cardElevation(2.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            border = BorderStroke(1.dp, Color(0xFFF3F4F6))
        ) {
            Column(modifier = Modifier.padding(16.dp).fillMaxWidth()) {
                Row(horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(end = 40.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        if (stopNumber != null) {
                            Text(
                                text = "Seq #$stopNumber", 
                                color = MaterialTheme.colorScheme.primary, 
                                fontWeight = FontWeight.ExtraBold, 
                                fontSize = 12.sp,
                                modifier = Modifier.padding(end = 8.dp)
                            )
                        }
                        Text("#${order.id.takeLast(8).uppercase()}", fontWeight = FontWeight.Bold, color = Color.Gray, fontSize = 12.sp)
                    }
                    StatusBadge(order.status)
                }

                Spacer(modifier = Modifier.height(12.dp))
                Text(order.userName, fontSize = 18.sp, fontWeight = FontWeight.Bold, color = Color.Black)
                
                Row(modifier = Modifier.fillMaxWidth().padding(top = 4.dp), verticalAlignment = Alignment.Top) {
                    Icon(Icons.Default.Place, contentDescription = null, tint = Color.Gray, modifier = Modifier.size(16.dp).padding(top = 2.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Column {
                        Text(order.address, color = Color.DarkGray, fontSize = 14.sp, lineHeight = 18.sp)
                        if (landmark.isNotBlank()) {
                            Surface(
                                color = Color(0xFFF3F4F6),
                                shape = RoundedCornerShape(4.dp),
                                modifier = Modifier.padding(top = 6.dp)
                            ) {
                                Text("Landmark: $landmark", fontSize = 10.sp, color = Color.DarkGray, fontWeight = FontWeight.Medium, modifier = Modifier.padding(horizontal = 6.dp, vertical = 4.dp))
                            }
                        }
                    }
                }

                if (distanceKm != null && distanceKm > 0.0) {
                    Text("~${(distanceKm * 10).toInt() / 10.0} km away", fontSize = 11.sp, color = Color.Gray, modifier = Modifier.padding(top = 8.dp, start = 20.dp))
                }

                // Action Buttons (Call, WhatsApp, Navigate, Action)
                Row(modifier = Modifier.fillMaxWidth().padding(top = 16.dp), horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    Button(
                        onClick = onCallClick,
                        modifier = Modifier.weight(1f).height(46.dp),
                        shape = RoundedCornerShape(10.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFF9FAFB), contentColor = Color(0xFF374151)),
                        border = BorderStroke(1.dp, Color(0xFFE5E7EB)),
                        contentPadding = PaddingValues(0.dp)
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                            Icon(Icons.Default.Phone, contentDescription = "Call", modifier = Modifier.size(18.dp), tint = MaterialTheme.colorScheme.primary)
                            Text("Call", fontSize = 9.sp, fontWeight = FontWeight.Bold)
                        }
                    }

                    if (onWhatsAppClick != null) {
                        Button(
                            onClick = onWhatsAppClick,
                            modifier = Modifier.weight(1f).height(46.dp),
                            shape = RoundedCornerShape(10.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFDCFCE7), contentColor = Color(0xFF15803D)),
                            border = BorderStroke(1.dp, Color(0xFFBBF7D0)),
                            contentPadding = PaddingValues(0.dp)
                        ) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                                Icon(Icons.Default.Chat, contentDescription = "WhatsApp", modifier = Modifier.size(18.dp), tint = Color(0xFF16A34A))
                                Text("Chat", fontSize = 9.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }

                    Button(
                        onClick = onNavigateClick,
                        modifier = Modifier.weight(1f).height(46.dp),
                        shape = RoundedCornerShape(10.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFF9FAFB), contentColor = Color(0xFF374151)),
                        border = BorderStroke(1.dp, Color(0xFFE5E7EB)),
                        contentPadding = PaddingValues(0.dp)
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                            Icon(Icons.Default.Navigation, contentDescription = "Navigate", modifier = Modifier.size(18.dp), tint = Color(0xFF2563EB))
                            Text("Map", fontSize = 9.sp, fontWeight = FontWeight.Bold)
                        }
                    }

                    Button(
                        onClick = { onStatusClick(getNextStatus(order.status)) },
                        modifier = Modifier.weight(1.2f).height(46.dp),
                        shape = RoundedCornerShape(10.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFDCFCE7), contentColor = MaterialTheme.colorScheme.primary),
                        border = BorderStroke(1.dp, Color(0xFFBBF7D0)),
                        contentPadding = PaddingValues(0.dp)
                    ) {
                        Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                            Icon(Icons.Default.QrCodeScanner, contentDescription = "Action", modifier = Modifier.size(18.dp))
                            val btnText = when(order.status) {
                                OrderStatus.ASSIGNED.name -> "Scan Pick"
                                OrderStatus.PICKED_UP.name -> "Deliver"
                                else -> "Delivered"
                            }
                            Text(btnText, fontSize = 9.sp, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
        
        // Small SOS button overlapping right corner
        Surface(
            onClick = { /* Could expose an onSOSClick lambda if needed, for now just show */ },
            shape = CircleShape,
            color = Color(0xFFFEE2E2),
            modifier = Modifier.align(Alignment.TopEnd).padding(end = 12.dp, top = 12.dp).size(36.dp),
            shadowElevation = 2.dp
        ) {
            Box(contentAlignment = Alignment.Center) {
                Text("SOS", color = Color(0xFFDC2626), fontSize = 10.sp, fontWeight = FontWeight.Black)
            }
        }
    }
}

@Composable
fun DeliveredOrderCard(
    order: Order,
    commissionPerOrder: Double,
    onClick: () -> Unit
) {
    Card(
        onClick = onClick,
        shape = RoundedCornerShape(16.dp),
        elevation = CardDefaults.cardElevation(1.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFFF0FDF4)),
        border = BorderStroke(1.dp, Color(0xFFBBF7D0))
    ) {
        Column(modifier = Modifier.padding(16.dp).fillMaxWidth()) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Default.CheckCircle,
                        contentDescription = "Delivered",
                        tint = Color(0xFF16A34A),
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        "#${order.id.takeLast(8).uppercase()}",
                        fontWeight = FontWeight.Bold,
                        color = Color.Gray,
                        fontSize = 12.sp
                    )
                }
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = Color(0xFFDCFCE7)
                ) {
                    Text(
                        "DELIVERED",
                        color = Color(0xFF16A34A),
                        fontWeight = FontWeight.Bold,
                        fontSize = 10.sp,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(10.dp))
            Text(order.userName, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, color = Color.Black)

            Spacer(modifier = Modifier.height(8.dp))
            Row(modifier = Modifier.fillMaxWidth(), verticalAlignment = Alignment.Top) {
                Icon(Icons.Default.Place, contentDescription = null, tint = Color.Gray, modifier = Modifier.size(14.dp).padding(top = 2.dp))
                Spacer(modifier = Modifier.width(4.dp))
                Text(order.address, color = Color.DarkGray, fontSize = 12.sp, lineHeight = 16.sp, maxLines = 2)
            }

            Spacer(modifier = Modifier.height(12.dp))
            HorizontalDivider(color = Color(0xFFE5E7EB))
            Spacer(modifier = Modifier.height(12.dp))

            // Earnings Breakdown Row
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                // Order Amount
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("ऑर्डर राशि", fontSize = 10.sp, color = Color.Gray, fontWeight = FontWeight.Medium)
                    Spacer(modifier = Modifier.height(2.dp))
                    Text("₹${order.totalAmount.toInt()}", fontSize = 16.sp, fontWeight = FontWeight.Bold, color = Color.Black)
                }
                // Payment Mode
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("भुगतान", fontSize = 10.sp, color = Color.Gray, fontWeight = FontWeight.Medium)
                    Spacer(modifier = Modifier.height(2.dp))
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = if (order.isCOD) Color(0xFFFEF3C7) else Color(0xFFDBEAFE)
                    ) {
                        Text(
                            if (order.isCOD) "💵 COD" else "💳 Online",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (order.isCOD) Color(0xFF92400E) else Color(0xFF1E40AF),
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                        )
                    }
                }
                // Your Earning
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("आपकी कमाई", fontSize = 10.sp, color = Color.Gray, fontWeight = FontWeight.Medium)
                    Spacer(modifier = Modifier.height(2.dp))
                    Text(
                        "+₹${commissionPerOrder.toInt()}",
                        fontSize = 16.sp,
                        fontWeight = FontWeight.ExtraBold,
                        color = Color(0xFF16A34A)
                    )
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
                            Icon(Icons.AutoMirrored.Filled.ArrowForward, contentDescription = null, modifier = Modifier.size(16.dp))
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

