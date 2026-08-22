package com.company.krishivishal.ui.tracking

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.*
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.company.krishivishal.ui.theme.PrimaryGreen
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.compose.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RiderTrackingScreen(
    orderId: String,
    riderId: String,
    onBack: () -> Unit,
    viewModel: OrderTrackingViewModel = androidx.hilt.navigation.compose.hiltViewModel()
) {
    LaunchedEffect(orderId) {
        viewModel.setOrderId(orderId)
    }

    val trackingState by viewModel.trackingState.collectAsState()

    val riderLocation = trackingState.riderLocation?.let { LatLng(it.latitude, it.longitude) } ?: LatLng(25.7711, 87.4753) // Fallback if null
    val targetLocation = LatLng(25.7750, 87.4850)
    
    val cameraPositionState = rememberCameraPositionState {
        position = CameraPosition.fromLatLngZoom(riderLocation, 14f)
    }

    LaunchedEffect(riderLocation) {
        cameraPositionState.position = CameraPosition.fromLatLngZoom(riderLocation, 14f)
    }

    var showTimeline by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { 
                    Column {
                        Text("Track Delivery", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                        Text("Order #$orderId", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { showTimeline = !showTimeline }) {
                        Icon(if (showTimeline) Icons.Default.Map else Icons.AutoMirrored.Filled.List, contentDescription = null)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
            )
        }
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding).background(MaterialTheme.colorScheme.background)) {
            if (!showTimeline) {
                GoogleMap(
                    modifier = Modifier.fillMaxSize(),
                    cameraPositionState = cameraPositionState,
                    uiSettings = MapUiSettings(zoomControlsEnabled = false)
                ) {
                    Marker(
                        state = rememberMarkerState(position = riderLocation),
                        title = "Your Rider",
                        snippet = "En-route to your farm",
                        icon = com.google.android.gms.maps.model.BitmapDescriptorFactory.defaultMarker(com.google.android.gms.maps.model.BitmapDescriptorFactory.HUE_GREEN)
                    )
                    Marker(
                        state = rememberMarkerState(position = targetLocation),
                        title = "Your Farm",
                        snippet = "Delivery Location"
                    )
                    
                    Polyline(
                        points = listOf(riderLocation, targetLocation),
                        color = PrimaryGreen,
                        width = 10f
                    )
                }
            } else {
                OrderTimelineView()
            }

            // Bottom Info Card
            Column(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(16.dp)
            ) {
                // OTP Card
                Surface(
                    color = Color(0xFFFFF9C4),
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.padding(bottom = 8.dp).align(Alignment.CenterHorizontally)
                ) {
                    Text(
                        text = "Share OTP 4821 with rider only after delivery",
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                        color = Color(0xFFF57F17)
                    )
                }

                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    elevation = CardDefaults.cardElevation(8.dp)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Surface(
                                modifier = Modifier.size(50.dp),
                                shape = CircleShape,
                                color = PrimaryGreen.copy(alpha = 0.1f)
                            ) {
                                Icon(
                                    Icons.AutoMirrored.Filled.DirectionsBike,
                                    contentDescription = null,
                                    modifier = Modifier.padding(12.dp),
                                    tint = PrimaryGreen
                                )
                            }
                            Spacer(modifier = Modifier.width(16.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text("Rider: Suresh Kumar", fontWeight = FontWeight.Bold, fontSize = 16.sp, color = MaterialTheme.colorScheme.onSurface)
                                Text("On the way - Arriving in 12 mins", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
                            }
                            val context = androidx.compose.ui.platform.LocalContext.current
                            IconButton(
                                onClick = { 
                                    val intent = android.content.Intent(android.content.Intent.ACTION_DIAL, android.net.Uri.parse("tel:9876543210"))
                                    context.startActivity(intent)
                                },
                                colors = IconButtonDefaults.iconButtonColors(containerColor = PrimaryGreen.copy(alpha = 0.1f))
                            ) {
                                Icon(Icons.Default.Call, contentDescription = "Call Rider", tint = PrimaryGreen)
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun OrderTimelineView() {
    val statuses = listOf(
        "Order Placed" to "Your order has been received",
        "Confirmed" to "Seller has confirmed your order",
        "Shipped" to "Order has left the warehouse",
        "Out for Delivery" to "Rider is heading to your location",
        "Delivered" to "Expected by 6:00 PM today"
    )
    val currentStep = 3

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.surface)
            .padding(24.dp)
            .verticalScroll(rememberScrollState())
    ) {
        Text("Order Status", fontWeight = FontWeight.Bold, fontSize = 20.sp, color = MaterialTheme.colorScheme.onSurface)
        Spacer(modifier = Modifier.height(24.dp))

        statuses.forEachIndexed { index, (title, subtitle) ->
            Row(modifier = Modifier.height(IntrinsicSize.Min)) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Surface(
                        modifier = Modifier.size(24.dp),
                        shape = CircleShape,
                        color = if (index <= currentStep) PrimaryGreen else MaterialTheme.colorScheme.surfaceVariant
                    ) {
                        if (index < currentStep) {
                            Icon(Icons.Default.Check, null, modifier = Modifier.padding(4.dp), tint = Color.White)
                        } else if (index == currentStep) {
                            Box(modifier = Modifier.padding(6.dp).background(MaterialTheme.colorScheme.onPrimary, CircleShape))
                        }
                    }
                    if (index < statuses.size - 1) {
                        Box(
                            modifier = Modifier
                                .width(2.dp)
                                .weight(1f)
                                .background(if (index < currentStep) PrimaryGreen else MaterialTheme.colorScheme.surfaceVariant)
                        )
                    }
                }
                Spacer(modifier = Modifier.width(16.dp))
                Column(modifier = Modifier.padding(bottom = 32.dp)) {
                    Text(
                        title, 
                        fontWeight = if (index == currentStep) FontWeight.Bold else FontWeight.Medium,
                        color = if (index <= currentStep) MaterialTheme.colorScheme.onSurface else Color.Gray,
                        fontSize = 16.sp
                    )
                    Text(
                        subtitle,
                        fontSize = 13.sp,
                        color = Color.Gray
                    )
                }
            }
        }
    }
}
