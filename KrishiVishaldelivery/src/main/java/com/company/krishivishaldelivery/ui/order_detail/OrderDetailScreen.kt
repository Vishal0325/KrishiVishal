package com.company.krishivishaldelivery.ui.order_detail

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.company.krishivishaldelivery.data.model.DeliveryOrder
import com.company.krishivishaldelivery.ui.dashboard.DeliveryViewModel
import com.company.krishivishaldelivery.ui.dashboard.StatusBadge
import com.company.krishivishaldelivery.utils.Resource

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrderDetailScreen(
    orderId: String,
    onBack: () -> Unit,
    onDeliverClick: () -> Unit,
    viewModel: DeliveryViewModel = hiltViewModel()
) {
    val ordersResource by viewModel.orders.collectAsState()
    val context = LocalContext.current

    val order = (ordersResource as? Resource.Success)?.data?.find { it.id == orderId }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Order Details", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color(0xFF2E7D32),
                    titleContentColor = Color.White,
                    navigationIconContentColor = Color.White
                )
            )
        }
    ) { padding ->
        if (order == null) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("Order not found or loading...")
            }
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
            ) {
                LazyColumn(
                    modifier = Modifier
                        .weight(1f)
                        .padding(horizontal = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                    contentPadding = PaddingValues(vertical = 16.dp)
                ) {
                    item {
                        OrderHeaderSection(order)
                    }

                    if (order.isCOD) {
                        item {
                            Card(
                                modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                                colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF3E0))
                            ) {
                                Row(
                                    modifier = Modifier.padding(16.dp).fillMaxWidth(),
                                    horizontalArrangement = Arrangement.Center,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text("Cash to Collect: ₹${order.codAmount}", fontWeight = FontWeight.ExtraBold, fontSize = 20.sp, color = Color(0xFFE65100))
                                }
                            }
                        }
                    }

                    item {
                        InfoCard(
                            title = "Customer Details",
                            icon = Icons.Default.Person,
                            content = {
                                Column {
                                    Text(order.userName, fontWeight = FontWeight.Bold)
                                    Text(order.address, color = Color.Gray)
                                    Spacer(modifier = Modifier.height(8.dp))
                                    OutlinedButton(
                                        onClick = {
                                            val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:${order.userPhone}"))
                                            context.startActivity(intent)
                                        },
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        Icon(Icons.Default.Phone, contentDescription = null)
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Text("Call Customer")
                                    }
                                }
                            }
                        )
                    }

                    item {
                        InfoCard(
                            title = "Delivery Location",
                            icon = Icons.Default.LocationOn,
                            content = {
                                Column {
                                    Text(order.address)
                                    Spacer(modifier = Modifier.height(8.dp))
                                    Button(
                                        onClick = {
                                            val intentUri = Uri.parse("google.navigation:q=${order.targetLat},${order.targetLng}")
                                            val mapIntent = Intent(Intent.ACTION_VIEW, intentUri).apply {
                                                setPackage("com.google.android.apps.maps")
                                            }
                                            context.startActivity(mapIntent)
                                        },
                                        modifier = Modifier.fillMaxWidth(),
                                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1976D2))
                                    ) {
                                        Icon(Icons.Default.Navigation, contentDescription = null)
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Text("Open in Maps")
                                    }
                                }
                            }
                        )
                    }

                    item {
                        Text("Order Items", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                    }

                    items(order.items) { item ->
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            colors = CardDefaults.cardColors(containerColor = Color.White),
                            elevation = CardDefaults.cardElevation(2.dp)
                        ) {
                            Row(
                                modifier = Modifier.padding(16.dp).fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(item.productName, fontWeight = FontWeight.Medium)
                                    Text("Qty: ${item.quantity}", color = Color.Gray, fontSize = 14.sp)
                                }
                                Text("₹${item.price * item.quantity}", fontWeight = FontWeight.Bold)
                            }
                        }
                    }

                    item {
                        InfoCard(
                            title = "Order Summary",
                            icon = Icons.Default.Receipt,
                            content = {
                                Column {
                                    SummaryRow("Subtotal", "₹${order.totalAmount}")
                                    SummaryRow("Delivery Fee", "Free")
                                    HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
                                    SummaryRow("Total", "₹${order.totalAmount}", isBold = true)
                                    Text(
                                        text = "Payment: COD", 
                                        color = Color(0xFFE65100), 
                                        fontWeight = FontWeight.Bold,
                                        modifier = Modifier.padding(top = 8.dp)
                                    )
                                }
                            }
                        )
                    }
                }

                ActionBottomBar(
                    order = order,
                    onDeliverClick = onDeliverClick,
                    onStatusChange = { newStatus ->
                        viewModel.updateStatus(order.id, newStatus)
                    }
                )
            }
        }
    }
}

@Composable
fun OrderHeaderSection(order: DeliveryOrder) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column {
            Text("Order #${order.id.takeLast(6)}", fontWeight = FontWeight.ExtraBold, fontSize = 22.sp)
            Text("Assigned Today", color = Color.Gray, fontSize = 14.sp)
        }
        StatusBadge(order.status)
    }
}

@Composable
fun InfoCard(title: String, icon: ImageVector, content: @Composable () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(2.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(icon, contentDescription = null, tint = Color(0xFF2E7D32), modifier = Modifier.size(20.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text(title, fontWeight = FontWeight.Bold, color = Color(0xFF2E7D32))
            }
            Spacer(modifier = Modifier.height(12.dp))
            content()
        }
    }
}

@Composable
fun SummaryRow(label: String, value: String, isBold: Boolean = false) {
    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(label, fontWeight = if (isBold) FontWeight.Bold else FontWeight.Normal)
        Text(value, fontWeight = if (isBold) FontWeight.Bold else FontWeight.Normal)
    }
}

@Composable
fun ActionBottomBar(order: DeliveryOrder, onDeliverClick: () -> Unit, onStatusChange: (String) -> Unit) {
    Surface(
        shadowElevation = 8.dp,
        modifier = Modifier.fillMaxWidth()
    ) {
        Box(modifier = Modifier.padding(16.dp)) {
            val (buttonText, nextStatus) = when (order.status) {
                "ASSIGNED" -> "START PICKUP" to "PICKED_UP"
                "PICKED_UP" -> "OUT FOR DELIVERY" to "OUT_FOR_DELIVERY"
                "OUT_FOR_DELIVERY" -> "MARK DELIVERED" to "DELIVERED"
                else -> "COMPLETED" to ""
            }

            if (nextStatus.isNotEmpty()) {
                Button(
                    onClick = { 
                        if (nextStatus == "DELIVERED") {
                            onDeliverClick()
                        } else {
                            onStatusChange(nextStatus)
                        }
                    },
                    modifier = Modifier.fillMaxWidth().height(56.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2E7D32))
                ) {
                    Text(buttonText, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                }
            }
        }
    }
}
