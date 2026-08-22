package com.company.krishivishal.ui.admin

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AssignmentInd
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Map
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.company.krishivishal.core.model.Order

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DeliveryManagementScreen(
    orders: List<Order>,
    onAssignRider: (String, String) -> Unit, // orderId, riderId
    onSettleCOD: (String) -> Unit, // orderId
    onViewOnMap: (String) -> Unit // riderId
) {
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Delivery Management", color = Color.White, fontWeight = FontWeight.Bold) },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color(0xFF2E7D32))
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            items(orders.size) { index ->
                val order = orders[index]
                AdminDeliveryOrderCard(
                    order = order,
                    onAssignRider = onAssignRider,
                    onSettleCOD = onSettleCOD,
                    onViewOnMap = onViewOnMap
                )
            }
        }
    }
}

@Composable
fun AdminDeliveryOrderCard(
    order: Order,
    onAssignRider: (String, String) -> Unit,
    onSettleCOD: (String) -> Unit,
    onViewOnMap: (String) -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        elevation = CardDefaults.cardElevation(4.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text("Order #${order.id.takeLast(6).uppercase()}", fontWeight = FontWeight.Bold, fontSize = 18.sp)
            Text("Status: ${order.status}", color = Color.Gray)

            Spacer(modifier = Modifier.height(8.dp))

            if (order.riderId.isEmpty()) {
                Button(
                    onClick = { onAssignRider(order.id, "RIDER_123") }, // Placeholder Rider ID
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Icon(Icons.Default.AssignmentInd, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Assign to Rider")
                }
            } else {
                Text("Assigned to: ${order.riderId}", color = Color(0xFF1976D2), fontWeight = FontWeight.Medium)
                
                Row(modifier = Modifier.fillMaxWidth().padding(top = 8.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                    OutlinedButton(onClick = { onViewOnMap(order.riderId) }) {
                        Icon(Icons.Default.Map, contentDescription = null)
                        Spacer(modifier = Modifier.width(4.dp))
                        Text("Live Track")
                    }

                    if (order.isCOD && order.status == "DELIVERED" && !order.isSettledByAdmin) {
                        Button(
                            onClick = { onSettleCOD(order.id) },
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFE65100))
                        ) {
                            Icon(Icons.Default.CheckCircle, contentDescription = null)
                            Spacer(modifier = Modifier.width(4.dp))
                            Text("Settle COD (₹${order.codAmount})")
                        }
                    }
                }
            }
        }
    }
}
