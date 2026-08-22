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
import com.company.krishivishal.performance.MapsResilienceManager
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
    mapsResilienceManager: MapsResilienceManager,
    onBack: () -> Unit
) {
    val uiState by viewModel.trackingState.collectAsState()

    LaunchedEffect(orderId) {
        viewModel.setOrderId(orderId)
    }

    var showTimeline by remember { mutableStateOf(!mapsResilienceManager.isMapsHealthy()) }

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
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { showTimeline = !showTimeline }) {
                        Icon(if (showTimeline) Icons.Default.Map else Icons.Default.List, contentDescription = null)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
            )
        }
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding).background(MaterialTheme.colorScheme.background)) {
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
                        estimatedTime = uiState.estimatedDeliveryTime?.toDate(),
                        mapsHealthy = mapsResilienceManager.isMapsHealthy()
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
            .background(MaterialTheme.colorScheme.surface)
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
                        color = if (isCompleted) PrimaryGreen else MaterialTheme.colorScheme.surfaceVariant
                    ) {
                        if (isCompleted && !isCurrent) {
                            Icon(Icons.Default.Check, null, modifier = Modifier.padding(6.dp), tint = Color.White)
                        } else if (isCurrent) {
                            Box(modifier = Modifier.padding(8.dp).background(MaterialTheme.colorScheme.onPrimary, CircleShape))
                        }
                    }
                    if (index < statuses.size - 1) {
                        Box(
                            modifier = Modifier
                                .width(2.dp)
                                .weight(1f)
                                .background(if (isCompleted) PrimaryGreen else MaterialTheme.colorScheme.surfaceVariant)
                        )
                    }
                }
                Spacer(modifier = Modifier.width(16.dp))
                Column(modifier = Modifier.padding(bottom = 32.dp)) {
                    Text(
                        status.replace("_", " "),
                        fontWeight = if (isCurrent) FontWeight.Bold else FontWeight.Medium,
                        color = if (isCompleted) MaterialTheme.colorScheme.onSurface else Color.Gray,
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
fun OrderInfoCard(modifier: Modifier, status: String, estimatedTime: Date?, mapsHealthy: Boolean = true) {
    Card(
        modifier = modifier.fillMaxWidth().padding(16.dp),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 6.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            if (!mapsHealthy) {
                Surface(
                    color = MaterialTheme.colorScheme.errorContainer,
                    shape = RoundedCornerShape(8.dp),
                    modifier = Modifier.fillMaxWidth().padding(bottom = 12.dp)
                ) {
                    Text(
                        "Live tracking is temporarily unavailable. Using timeline view.",
                        modifier = Modifier.padding(8.dp),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onErrorContainer
                    )
                }
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Surface(
                    modifier = Modifier.size(48.dp),
                    shape = RoundedCornerShape(12.dp),
                    color = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.5f)
                ) {
                    Icon(
                        Icons.Default.DirectionsBike,
                        contentDescription = null,
                        tint = PrimaryGreen,
                        modifier = Modifier.padding(10.dp)
                    )
                }
                Spacer(modifier = Modifier.width(16.dp))
                Column(modifier = Modifier.weight(1f)) {
                    Text(status.replace("_", " "), fontWeight = FontWeight.ExtraBold, fontSize = 17.sp, color = MaterialTheme.colorScheme.onSurface)
                    estimatedTime?.let {
                        val sdf = SimpleDateFormat("hh:mm a", Locale.getDefault())
                        Text("Expected by ${sdf.format(it)}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
                    } ?: Text("Updating location...", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 13.sp)
                }
                val context = androidx.compose.ui.platform.LocalContext.current
                IconButton(onClick = { 
                    val intent = android.content.Intent(android.content.Intent.ACTION_DIAL, android.net.Uri.parse("tel:9876543210"))
                    context.startActivity(intent)
                }) {
                    Icon(Icons.Default.Call, null, tint = PrimaryGreen)
                }
            }
        }
    }
}
