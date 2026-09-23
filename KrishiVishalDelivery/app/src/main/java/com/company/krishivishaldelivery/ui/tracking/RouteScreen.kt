package com.company.krishivishaldelivery.ui.tracking

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.android.gms.maps.model.CameraPosition
import com.google.android.gms.maps.model.LatLng
import com.google.maps.android.compose.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RouteScreen(
    onNavigateBack: () -> Unit,
    onStartDelivery: () -> Unit
) {
    // Mock data for route and markers
    val currentPosition = LatLng(28.6139, 77.2090) // New Delhi
    val order1 = LatLng(28.6150, 77.2100)
    val order2 = LatLng(28.6200, 77.2150)
    val order3 = LatLng(28.6250, 77.2200)

    val cameraPositionState = rememberCameraPositionState {
        position = CameraPosition.fromLatLngZoom(currentPosition, 14f)
    }

    val mapProperties by remember {
        mutableStateOf(MapProperties(isMyLocationEnabled = false))
    }
    
    val mapUiSettings by remember {
        mutableStateOf(MapUiSettings(zoomControlsEnabled = false))
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Start Delivery / Route") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Text("←", fontSize = 24.sp)
                    }
                }
            )
        }
    ) { paddingValues ->
        Box(modifier = Modifier.fillMaxSize().padding(paddingValues)) {
            GoogleMap(
                modifier = Modifier.fillMaxSize(),
                cameraPositionState = cameraPositionState,
                properties = mapProperties,
                uiSettings = mapUiSettings
            ) {
                // Rider's current position
                Marker(
                    state = MarkerState(position = currentPosition),
                    title = "You are here",
                    snippet = "Current Location"
                )

                // Next Customer
                Marker(
                    state = MarkerState(position = order1),
                    title = "Next Customer",
                    snippet = "Order #1",
                    icon = com.google.android.gms.maps.model.BitmapDescriptorFactory.defaultMarker(
                        com.google.android.gms.maps.model.BitmapDescriptorFactory.HUE_GREEN
                    )
                )

                // Other orders
                Marker(
                    state = MarkerState(position = order2),
                    title = "Order #2",
                    icon = com.google.android.gms.maps.model.BitmapDescriptorFactory.defaultMarker(
                        com.google.android.gms.maps.model.BitmapDescriptorFactory.HUE_ORANGE
                    )
                )
                Marker(
                    state = MarkerState(position = order3),
                    title = "Order #3",
                    icon = com.google.android.gms.maps.model.BitmapDescriptorFactory.defaultMarker(
                        com.google.android.gms.maps.model.BitmapDescriptorFactory.HUE_ORANGE
                    )
                )
            }

            // Bottom Overlay
            Card(
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .padding(16.dp),
                shape = RoundedCornerShape(16.dp),
                elevation = CardDefaults.cardElevation(defaultElevation = 8.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
            ) {
                Column(
                    modifier = Modifier
                        .padding(16.dp)
                        .fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Column {
                            Text(
                                text = "Remaining Orders",
                                fontSize = 14.sp,
                                color = Color.Gray
                            )
                            Text(
                                text = "3 Orders",
                                fontSize = 18.sp,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text(
                                text = "Total Distance",
                                fontSize = 14.sp,
                                color = Color.Gray
                            )
                            Text(
                                text = "4.2 km left",
                                fontSize = 18.sp,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onSurface
                            )
                        }
                    }

                    Spacer(modifier = Modifier.height(16.dp))

                    Button(
                        onClick = onStartDelivery,
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(8.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary)
                    ) {
                        Text(
                            text = "Start Delivery",
                            fontSize = 16.sp,
                            fontWeight = FontWeight.Bold,
                            color = Color.White,
                            modifier = Modifier.padding(vertical = 8.dp)
                        )
                    }
                }
            }
        }
    }
}
