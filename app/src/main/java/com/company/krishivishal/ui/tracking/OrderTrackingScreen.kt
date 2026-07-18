package com.company.krishivishal.ui.tracking

import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.company.krishivishal.ui.theme.PrimaryGreen
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.compose.*
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrderTrackingScreen(
    orderId: String,
    viewModel: OrderTrackingViewModel,
    onBack: () -> Unit
) {
    val uiState by viewModel.trackingState.collectAsState()

    LaunchedEffect(orderId) {
        viewModel.setOrderId(orderId)
    }

    var showTimeline by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Track Delivery", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                        Text("Order #$orderId", fontSize = 12.sp, color = Color.Gray)
                    }
                },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { showTimeline = !showTimeline }) {
                        Icon(if (showTimeline) Icons.Default.Map else Icons.Default.List, contentDescription = null)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White)
            )
        }
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding).background(Color(0xFFF8F9FA))) {
            when {
                uiState.isLoading -> {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.Center), color = PrimaryGreen)
                }
                uiState.error != null -> {
                    Text(text = "Error: ${uiState.error}", color = Color.Red, modifier = Modifier.align(Alignment.Center))
                }
                else -> {
                    AnimatedContent(
                        targetState = showTimeline,
                        transitionSpec = {
                            fadeIn() togetherWith fadeOut()
                        },
                        label = "tracking_switch"
                    ) { isTimeline ->
                        if (!isTimeline) {
                            MapTrackingView(uiState)
                        } else {
                            OrderTimelineView(uiState.status, uiState.statusHistory)
                        }
                    }

                    // Bottom Info Card
                    OrderInfoCard(
                        modifier = Modifier.align(Alignment.BottomCenter),
                        status = uiState.status,
                        estimatedTime = uiState.estimatedDeliveryTime?.toDate()
                    )
                }
            }
        }
    }
}

@Composable
fun MapTrackingView(uiState: com.company.krishivishal.model.OrderTrackingState) {
    val riderPos = uiState.riderLocation?.let { LatLng(it.latitude, it.longitude) } ?: LatLng(0.0, 0.0)
    val cameraPositionState = rememberCameraPositionState {
        position = CameraPosition.fromLatLngZoom(riderPos, 15f)
    }

    LaunchedEffect(riderPos) {
        if (riderPos.latitude != 0.0) {
            cameraPositionState.animate(
                com.google.android.gms.maps.CameraUpdateFactory.newLatLngZoom(riderPos, 15f)
            )
        }
    }

    GoogleMap(
        modifier = Modifier.fillMaxSize(),
        cameraPositionState = cameraPositionState,
        uiSettings = MapUiSettings(zoomControlsEnabled = false)
    ) {
        if (uiState.status == "OUT_FOR_DELIVERY" && uiState.riderLocation != null) {
            Marker(
                state = MarkerState(position = riderPos),
                title = "Your Rider",
                icon = com.google.android.gms.maps.model.BitmapDescriptorFactory.defaultMarker(com.google.android.gms.maps.model.BitmapDescriptorFactory.HUE_GREEN)
            )
        }
    }
}

@Composable
fun OrderTimelineView(currentStatus: String, history: List<com.company.krishivishal.model.StatusStep>) {
    val statuses = listOf("PLACED", "CONFIRMED", "PACKED", "OUT_FOR_DELIVERY", "DELIVERED")
    
    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.White)
            .padding(24.dp)
            .verticalScroll(rememberScrollState())
    ) {
        Text("Detailed Status History", fontWeight = FontWeight.Bold, fontSize = 18.sp)
        Spacer(modifier = Modifier.height(24.dp))

        statuses.forEachIndexed { index, status ->
            val stepHistory = history.find { it.status == status }
            val isCompleted = stepHistory != null || status == currentStatus
            val isCurrent = status == currentStatus

            Row(modifier = Modifier.height(IntrinsicSize.Min)) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Surface(
                        modifier = Modifier.size(28.dp),
                        shape = CircleShape,
                        color = if (isCompleted) PrimaryGreen else Color(0xFFEEEEEE)
                    ) {
                        if (isCompleted && !isCurrent) {
                            Icon(Icons.Default.Check, null, modifier = Modifier.padding(6.dp), tint = Color.White)
                        } else if (isCurrent) {
                            Box(modifier = Modifier.padding(8.dp).background(Color.White, CircleShape))
                        }
                    }
                    if (index < statuses.size - 1) {
                        Box(
                            modifier = Modifier
                                .width(2.dp)
                                .weight(1f)
                                .background(if (isCompleted) PrimaryGreen else Color(0xFFEEEEEE))
                        )
                    }
                }
                Spacer(modifier = Modifier.width(16.dp))
                Column(modifier = Modifier.padding(bottom = 32.dp)) {
                    Text(
                        status.replace("_", " "),
                        fontWeight = if (isCurrent) FontWeight.Bold else FontWeight.Medium,
                        color = if (isCompleted) Color.Black else Color.Gray,
                        fontSize = 16.sp
                    )
                    stepHistory?.let {
                        val sdf = SimpleDateFormat("dd MMM, hh:mm a", Locale.getDefault())
                        Text(
                            sdf.format(it.timestamp.toDate()),
                            fontSize = 12.sp,
                            color = Color.Gray
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun OrderInfoCard(modifier: Modifier, status: String, estimatedTime: Date?) {
    Card(
        modifier = modifier.fillMaxWidth().padding(16.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 6.dp)
    ) {
        Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Surface(
                modifier = Modifier.size(48.dp),
                shape = RoundedCornerShape(12.dp),
                color = Color(0xFFE8F5E9)
            ) {
                Icon(
                    Icons.Default.DirectionsBike,
                    contentDescription = null,
                    tint = PrimaryGreen,
                    modifier = Modifier.padding(10.dp)
                )
            }
            Spacer(modifier = Modifier.width(16.dp))
            Column {
                Text(status.replace("_", " "), fontWeight = FontWeight.ExtraBold, fontSize = 17.sp, color = Color.Black)
                estimatedTime?.let {
                    val sdf = SimpleDateFormat("hh:mm a", Locale.getDefault())
                    Text("Expected by ${sdf.format(it)}", color = Color.Gray, fontSize = 13.sp)
                } ?: Text("Updating location...", color = Color.Gray, fontSize = 13.sp)
            }
            Spacer(modifier = Modifier.weight(1f))
            IconButton(onClick = { /* Call Rider */ }) {
                Icon(Icons.Default.Call, null, tint = PrimaryGreen)
            }
        }
    }
}
