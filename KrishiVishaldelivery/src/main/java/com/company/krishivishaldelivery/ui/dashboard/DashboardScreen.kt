package com.company.krishivishaldelivery.ui.dashboard

import android.Manifest
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.*
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import com.company.krishivishaldelivery.data.model.DeliveryOrder
import com.company.krishivishaldelivery.data.model.IncentiveProgress
import com.company.krishivishaldelivery.service.RiderLocationService
import com.company.krishivishaldelivery.utils.Resource

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DashboardScreen(
    onOrderClick: (String) -> Unit,
    onScanClick: () -> Unit,
    viewModel: DeliveryViewModel = hiltViewModel()
) {
    val ordersResource by viewModel.orders.collectAsState()
    val currentTrip by viewModel.currentTrip.collectAsState()
    val isConnected by viewModel.isConnected.collectAsState()
    val incentiveProgress by viewModel.incentiveProgress.collectAsState()
    
    val context = LocalContext.current
    var isOnline by remember { mutableStateOf(false) }
    var showSOSDialog by remember { mutableStateOf(false) }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        if (permissions.entries.all { it.value }) {
            isOnline = true
            startLocationService(context)
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
                                colors = SwitchDefaults.colors(checkedThumbColor = Color.White, checkedTrackColor = Color(0xFF81C784))
                            )
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(containerColor = Color(0xFF2E7D32), titleContentColor = Color.White)
                )
                
                AnimatedVisibility(visible = !isConnected) {
                    Box(modifier = Modifier.fillMaxWidth().background(Color.Red).padding(4.dp), contentAlignment = Alignment.Center) {
                        Text("Offline - changes will sync automatically", color = Color.White, fontSize = 12.sp)
                    }
                }
            }
        },
        floatingActionButton = {
            Column(horizontalAlignment = Alignment.End) {
                FloatingActionButton(
                    onClick = { showSOSDialog = true },
                    containerColor = Color.Red,
                    contentColor = Color.White,
                    shape = CircleShape
                ) {
                    Text("SOS", fontWeight = FontWeight.Bold)
                }
                Spacer(modifier = Modifier.height(16.dp))
                FloatingActionButton(onClick = onScanClick, containerColor = Color(0xFF2E7D32), contentColor = Color.White) {
                    Row(modifier = Modifier.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(Icons.Default.QrCodeScanner, contentDescription = "Scan QR")
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("Scan to Pick", fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding)) {
            when (val res = ordersResource) {
                is Resource.Loading -> CircularProgressIndicator(modifier = Modifier.align(Alignment.Center), color = Color(0xFF2E7D32))
                is Resource.Success -> {
                    val orders = res.data ?: emptyList()
                    val trip = currentTrip
                    
                    LazyColumn(modifier = Modifier.fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                        item {
                            IncentiveProgressCard(incentiveProgress)
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
                                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("google.navigation:q=${order.address}")).setPackage("com.google.android.apps.maps"))
                                    }, onClick = { onOrderClick(order.id) })
                                }
                            } else {
                                items(orders) { order -> 
                                    OrderCard(order, onStatusClick = { viewModel.updateStatus(order.id, it) }, onNavigateClick = {
                                        context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse("google.navigation:q=${order.address}")).setPackage("com.google.android.apps.maps"))
                                    }, onClick = { onOrderClick(order.id) })
                                }
                            }
                        }
                    }
                }
                is Resource.Error -> Text("Error: ${res.message}", modifier = Modifier.align(Alignment.Center), color = Color.Red)
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
                }, colors = ButtonDefaults.buttonColors(containerColor = Color.Red)) { Text("CONFIRM SOS") }
            },
            dismissButton = {
                OutlinedButton(onClick = {
                    context.startActivity(Intent(Intent.ACTION_DIAL, Uri.parse("tel:+911122334455")))
                    showSOSDialog = false
                }) { Text("CALL EMERGENCY") }
            }
        )
    }
}

@Composable
fun IncentiveProgressCard(progress: IncentiveProgress) {
    Card(modifier = Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = Color(0xFFE3F2FD))) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                Text("Today's Progress", fontWeight = FontWeight.Bold)
                if (progress.slabAchieved) Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Color(0xFF2E7D32))
            }
            Spacer(modifier = Modifier.height(8.dp))
            LinearProgressIndicator(progress = { progress.progress }, modifier = Modifier.fillMaxWidth().height(8.dp), color = Color(0xFF1976D2), trackColor = Color.White)
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
fun TripSummaryCard(trip: List<DeliveryOrder>) {
    Card(modifier = Modifier.fillMaxWidth(), colors = CardDefaults.cardColors(containerColor = Color(0xFFE8F5E9))) {
        Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.Route, contentDescription = null, tint = Color(0xFF2E7D32))
            Spacer(modifier = Modifier.width(12.dp))
            Column {
                Text("Optimized Trip", fontWeight = FontWeight.Bold, color = Color(0xFF2E7D32))
                Text("${trip.size} sequential stops", fontSize = 14.sp)
            }
        }
    }
}

@Composable
fun OrderCard(order: DeliveryOrder, onStatusClick: (String) -> Unit, onNavigateClick: () -> Unit, onClick: () -> Unit) {
    Card(onClick = onClick, shape = RoundedCornerShape(12.dp), elevation = CardDefaults.cardElevation(4.dp)) {
        Column(modifier = Modifier.padding(16.dp).fillMaxWidth()) {
            Row(horizontalArrangement = Arrangement.SpaceBetween, modifier = Modifier.fillMaxWidth()) {
                Text("Order #${order.id.takeLast(6)}", fontWeight = FontWeight.Bold)
                StatusBadge(order.status)
            }
            Text("Customer: ${order.userName}", fontSize = 14.sp)
            Text(order.address, color = Color.Gray, fontSize = 12.sp)
            Row(modifier = Modifier.fillMaxWidth().padding(top = 12.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                Button(onClick = onNavigateClick, colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1976D2))) { Text("Navigate") }
                Button(onClick = { onStatusClick(getNextStatus(order.status)) }, colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2E7D32))) { 
                    Text(when(order.status) { "ASSIGNED" -> "Pick Up"; "PICKED_UP" -> "Start Delivery"; else -> "Mark Delivered" })
                }
            }
        }
    }
}

private fun getNextStatus(status: String) = when(status) { "ASSIGNED" -> "PICKED_UP"; "PICKED_UP" -> "OUT_FOR_DELIVERY"; else -> "DELIVERED" }

@Composable
fun StatusBadge(status: String) {
    val color = when(status) { "ASSIGNED" -> Color(0xFFFFA000); "PICKED_UP" -> Color(0xFF1976D2); "OUT_FOR_DELIVERY" -> Color(0xFF7B1FA2); else -> Color(0xFF2E7D32) }
    Surface(color = color.copy(alpha = 0.1f), shape = RoundedCornerShape(8.dp)) {
        Text(status, color = color, modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp), fontSize = 10.sp, fontWeight = FontWeight.Bold)
    }
}

private fun startLocationService(context: android.content.Context) {
    val intent = Intent(context, RiderLocationService::class.java).apply { action = RiderLocationService.ACTION_START }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        ContextCompat.startForegroundService(context, intent)
    } else {
        context.startService(intent)
    }
}

private fun stopLocationService(context: android.content.Context) {
    val intent = Intent(context, RiderLocationService::class.java).apply { action = RiderLocationService.ACTION_STOP }
    context.stopService(intent)
}
