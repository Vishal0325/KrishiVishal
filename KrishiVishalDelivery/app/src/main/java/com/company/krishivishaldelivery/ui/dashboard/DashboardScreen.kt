package com.company.krishivishaldelivery.ui.dashboard

import android.Manifest
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
import com.company.krishivishal.core.model.Order
import com.company.krishivishal.core.model.OrderStatus
import com.company.krishivishal.core.model.ReturnRequest
import com.company.krishivishal.core.model.ReturnStatus
import com.company.krishivishaldelivery.data.model.IncentiveProgress
import com.company.krishivishaldelivery.service.RiderLocationService
import com.company.krishivishal.core.util.Resource
import com.company.krishivishaldelivery.ui.components.StatusBadge
import com.company.krishivishaldelivery.ui.theme.PrimaryGreen

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(
    onOrderClick: (String) -> Unit,
    onReturnClick: (String) -> Unit,
    onScanClick: () -> Unit,
    viewModel: DashboardViewModel = hiltViewModel()
) {
    val ordersResource by viewModel.orders.collectAsState()
    val returnsResource by viewModel.returns.collectAsState()
    val currentTrip by viewModel.currentTrip.collectAsState()
    val isConnected by viewModel.isConnected.collectAsState()
    val incentiveProgress by viewModel.incentiveProgress.collectAsState()
    
    val context = LocalContext.current
    var isOnline by remember { mutableStateOf(false) }
    var showSOSDialog by remember { mutableStateOf(false) }
    var selectedTab by remember { mutableIntStateOf(0) }
    val tabs = listOf("Deliveries", "Returns")

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
                    title = { Text("Assigned Orders", fontWeight = FontWeight.Bold) },
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
                
                AnimatedVisibility(visible = !isConnected) {
                    Box(modifier = Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.error).padding(4.dp), contentAlignment = Alignment.Center) {
                        Text("Offline - changes will sync automatically", color = MaterialTheme.colorScheme.onError, fontSize = 12.sp)
                    }
                }
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
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding).background(MaterialTheme.colorScheme.background)) {
            if (selectedTab == 0) {
                // Deliveries Tab
                when (val res = ordersResource) {
                    is Resource.Loading<*> -> CircularProgressIndicator(modifier = Modifier.align(Alignment.Center), color = MaterialTheme.colorScheme.primary)
                    is Resource.Success<List<Order>> -> {
                        val orders = res.data ?: emptyList()
                        val trip = currentTrip
                        
                        LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
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
                                if (trip != null && trip.isNotEmpty()) {
                                    item { TripSummaryCard(trip) }
                                    item { Text("Sequential Stops", fontWeight = FontWeight.Bold, fontSize = 18.sp) }
                                    items(trip) { order -> 
                                        OrderCard(order, onStatusClick = { viewModel.updateStatus(order.id, it) }, onNavigateClick = {
                                            val navUri = if (order.targetLat != 0.0 && order.targetLng != 0.0)
                                                "google.navigation:q=${order.targetLat},${order.targetLng}"
                                            else
                                                "google.navigation:q=${Uri.encode(order.address)}"
                                            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(navUri)).setPackage("com.google.android.apps.maps"))
                                        }, onClick = { onOrderClick(order.id) })
                                    }
                                } else {
                                    items(orders) { order -> 
                                        OrderCard(order, onStatusClick = { viewModel.updateStatus(order.id, it) }, onNavigateClick = {
                                            val navUri = if (order.targetLat != 0.0 && order.targetLng != 0.0)
                                                "google.navigation:q=${order.targetLat},${order.targetLng}"
                                            else
                                                "google.navigation:q=${Uri.encode(order.address)}"
                                            context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(navUri)).setPackage("com.google.android.apps.maps"))
                                        }, onClick = { onOrderClick(order.id) })
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
                Button(onClick = {
                    viewModel.triggerSOS(0.0, 0.0, null)
                    showSOSDialog = false
                }, colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error)) { Text("CONFIRM SOS") }
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

@Composable
fun IncentiveProgressCard(progress: IncentiveProgress) {
    Card(
        modifier = Modifier.fillMaxWidth(), 
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f))
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                Text("Today's Progress", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onPrimaryContainer)
                if (progress.slabAchieved) Icon(Icons.Default.CheckCircle, contentDescription = null, tint = PrimaryGreen)
            }
            Spacer(modifier = Modifier.height(8.dp))
            LinearProgressIndicator(
                progress = { progress.progress }, 
                modifier = Modifier.fillMaxWidth().height(8.dp), 
                color = MaterialTheme.colorScheme.primary, 
                trackColor = MaterialTheme.colorScheme.surface
            )
            Spacer(modifier = Modifier.height(8.dp))
            Text(
                if (progress.nextSlab != null) "${progress.currentCount}/${progress.nextSlab.ordersRequired} orders - ${progress.ordersRemaining} more for ₹${progress.nextSlab.bonusAmount} bonus"
                else "All targets achieved! Great job!",
                fontSize = 14.sp
            )
        }
    }
}

@Composable
fun TripSummaryCard(trip: List<Order>) {
    Card(
        modifier = Modifier.fillMaxWidth(), 
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = 0.5f))
    ) {
        Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.Route, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
            Spacer(modifier = Modifier.width(12.dp))
            Column {
                Text("Optimized Trip", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                Text("${trip.size} sequential stops", fontSize = 14.sp, color = MaterialTheme.colorScheme.onSecondaryContainer)
            }
        }
    }
}

@Composable
fun OrderCard(order: Order, onStatusClick: (String) -> Unit, onNavigateClick: () -> Unit, onClick: () -> Unit) {
    Card(
        onClick = onClick, 
        shape = RoundedCornerShape(12.dp), 
        elevation = CardDefaults.cardElevation(4.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(modifier = Modifier.padding(16.dp).fillMaxWidth()) {
            Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                Text("Order #${order.id.takeLast(8).uppercase()}", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                StatusBadge(order.status)
            }
            Text("Customer: ${order.userName}", fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurface)
            Text(order.address, color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 12.sp)
            Row(modifier = Modifier.fillMaxWidth().padding(top = 12.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                Button(
                    onClick = onNavigateClick,
                    modifier = Modifier.height(48.dp).weight(1f),
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.tertiary)
                ) {
                    Icon(Icons.Default.Navigation, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(4.dp))
                    Text("Navigate")
                }
                Spacer(modifier = Modifier.width(8.dp))
                Button(
                    onClick = { onStatusClick(getNextStatus(order.status)) },
                    modifier = Modifier.height(48.dp).weight(1.2f),
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary)
                ) { 
                    Text(when(order.status) {
                        OrderStatus.ASSIGNED.name -> "Pick Up"
                        OrderStatus.PICKED_UP.name -> "Start Delivery"
                        else -> "Mark Delivered"
                    })
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
                onClick = { 
                    onPickup()
                },
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
