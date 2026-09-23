package com.company.krishivishaldelivery.ui.order_detail

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
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
import androidx.compose.ui.res.stringResource
import com.company.krishivishaldelivery.R
import com.company.krishivishal.core.model.Order
import com.company.krishivishal.core.model.OrderStatus
import com.company.krishivishal.core.util.Resource
import com.company.krishivishaldelivery.ui.dashboard.DashboardViewModel
import com.company.krishivishaldelivery.ui.components.StatusBadge
import com.company.krishivishaldelivery.ui.order_detail.components.DynamicUpiQrDialog
import com.company.krishivishaldelivery.ui.order_detail.components.ReattemptDialog
import com.company.krishivishaldelivery.utils.VoicePromptHelper

import com.company.krishivishaldelivery.ui.components.RuralOfflineBanner

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrderDetailScreen(
    orderId: String,
    onNavigateBack: () -> Unit,
    onDeliverClick: () -> Unit,
    viewModel: DashboardViewModel = hiltViewModel()
) {
    val ordersResource by viewModel.orders.collectAsState()
    val isConnected by viewModel.isConnected.collectAsState()
    val pendingSyncCount by viewModel.pendingSyncCount.collectAsState()
    val isSyncing by viewModel.isSyncing.collectAsState()
    val context = LocalContext.current
    var showConfirmDialog by remember { mutableStateOf<String?>(null) }
    var showUpiQrDialog by remember { mutableStateOf(false) }
    var showReattemptDialog by remember { mutableStateOf(false) }
    val voiceHelper = remember { VoicePromptHelper(context) }

    DisposableEffect(Unit) {
        onDispose { voiceHelper.shutdown() }
    }

    val order = (ordersResource as? Resource.Success<List<Order>>)?.data?.find { it.id == orderId }

    if (showConfirmDialog != null) {
        AlertDialog(
            onDismissRequest = { showConfirmDialog = null },
            title = { Text(stringResource(R.string.confirm_action)) },
            text = { Text(stringResource(R.string.confirm_status_change, showConfirmDialog!!)) },
            confirmButton = {
                Button(
                    onClick = {
                        val nextStatus = showConfirmDialog!!
                        if (nextStatus == OrderStatus.DELIVERED.name) {
                            onDeliverClick()
                        } else {
                            viewModel.updateStatus(orderId, nextStatus)
                        }
                        showConfirmDialog = null
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2E7D32))
                ) {
                    Text(stringResource(R.string.confirm))
                }
            },
            dismissButton = {
                TextButton(onClick = { showConfirmDialog = null }) {
                    Text(stringResource(R.string.cancel))
                }
            }
        )
    }

    Scaffold(
        topBar = {
            Column {
                TopAppBar(
                    title = { Text(stringResource(R.string.order_details), fontWeight = FontWeight.Bold) },
                    navigationIcon = {
                        IconButton(onClick = onNavigateBack) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                        }
                    },
                    colors = TopAppBarDefaults.topAppBarColors(
                        containerColor = MaterialTheme.colorScheme.primary,
                        titleContentColor = MaterialTheme.colorScheme.onPrimary,
                        navigationIconContentColor = MaterialTheme.colorScheme.onPrimary
                    )
                )
                RuralOfflineBanner(
                    isConnected = isConnected,
                    pendingSyncCount = pendingSyncCount,
                    isSyncing = isSyncing,
                    onSyncNow = { viewModel.triggerManualSync() }
                )
            }
        }
    ) { padding ->
        if (order == null) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text(stringResource(R.string.order_not_found))
            }
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .background(MaterialTheme.colorScheme.background)
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
                                colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF3E0)),
                                shape = RoundedCornerShape(14.dp)
                            ) {
                                Column(
                                    modifier = Modifier.padding(16.dp).fillMaxWidth(),
                                    horizontalAlignment = Alignment.CenterHorizontally
                                ) {
                                    Text(
                                        stringResource(R.string.cash_to_collect, order.codAmount),
                                        fontWeight = FontWeight.ExtraBold,
                                        fontSize = 20.sp,
                                        color = Color(0xFFE65100)
                                    )
                                    Spacer(modifier = Modifier.height(10.dp))
                                    Button(
                                        onClick = { showUpiQrDialog = true },
                                        modifier = Modifier.fillMaxWidth().height(44.dp),
                                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2E7D32)),
                                        shape = RoundedCornerShape(10.dp)
                                    ) {
                                        Icon(Icons.Default.QrCode, contentDescription = null, modifier = Modifier.size(18.dp))
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Text("किसान हेतु UPI QR कोड दिखाएं (Scan to Pay)", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                    }
                                }
                            }
                        }
                    }

                    item {
                        val landmark = order.getEffectiveLandmark()
                        if (landmark.isNotBlank()) {
                            Card(
                                modifier = Modifier.fillMaxWidth(),
                                colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF8E1)),
                                border = androidx.compose.foundation.BorderStroke(1.5.dp, Color(0xFFFFB300)),
                                shape = RoundedCornerShape(14.dp)
                            ) {
                                Column(modifier = Modifier.padding(16.dp)) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Icon(Icons.Default.Place, contentDescription = null, tint = Color(0xFFE65100), modifier = Modifier.size(24.dp))
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Text("गाँव का पहचान स्थल (Rural Landmark)", fontWeight = FontWeight.ExtraBold, fontSize = 16.sp, color = Color(0xFFE65100))
                                    }
                                    Spacer(modifier = Modifier.height(8.dp))
                                    Surface(
                                        color = Color.White,
                                        shape = RoundedCornerShape(8.dp),
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        Text(
                                            text = "📍 $landmark",
                                            fontWeight = FontWeight.Bold,
                                            fontSize = 17.sp,
                                            color = Color(0xFF3E2723),
                                            modifier = Modifier.padding(12.dp)
                                        )
                                    }
                                    Spacer(modifier = Modifier.height(6.dp))
                                    Text(
                                        "गाँवों में मकान नंबर नहीं होते। इस लैंडमार्क के आधार पर किसान का घर ढूंढें या नीचे दिए गए 1-टैप कॉल बटन से संपर्क करें।",
                                        fontSize = 12.sp,
                                        color = Color(0xFF5D4037)
                                    )
                                }
                            }
                        }
                    }

                    item {
                        InfoCard(
                            title = stringResource(R.string.customer_details),
                            icon = Icons.Default.Person,
                            content = {
                                Column {
                                    Text(order.userName, fontWeight = FontWeight.Bold, fontSize = 16.sp, color = MaterialTheme.colorScheme.onSurface)
                                    Text("फोन: ${order.userPhone}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp)
                                    Spacer(modifier = Modifier.height(10.dp))
                                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                        Button(
                                            onClick = {
                                                val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:${order.userPhone}"))
                                                context.startActivity(intent)
                                            },
                                            modifier = Modifier.weight(1f).height(48.dp),
                                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2E7D32)),
                                            shape = RoundedCornerShape(10.dp)
                                        ) {
                                            Icon(Icons.Default.Phone, contentDescription = null, modifier = Modifier.size(18.dp))
                                            Spacer(modifier = Modifier.width(6.dp))
                                            Text("कॉल करें", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                        }

                                        Button(
                                            onClick = {
                                                val cleanPhone = order.userPhone.replace("+91", "").replace(" ", "").trim()
                                                val waUri = Uri.parse("https://api.whatsapp.com/send?phone=91$cleanPhone&text=" + Uri.encode("नमस्ते ${order.userName} जी, मैं कृषि विशाल से आपका डिलीवरी पार्टनर हूँ।"))
                                                context.startActivity(Intent(Intent.ACTION_VIEW, waUri))
                                            },
                                            modifier = Modifier.weight(1f).height(48.dp),
                                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF25D366)),
                                            shape = RoundedCornerShape(10.dp)
                                        ) {
                                            Icon(Icons.Default.Chat, contentDescription = null, modifier = Modifier.size(18.dp))
                                            Spacer(modifier = Modifier.width(6.dp))
                                            Text("WhatsApp", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                        }
                                    }
                                }
                            }
                        )
                    }

                    item {
                        InfoCard(
                            title = stringResource(R.string.delivery_location),
                            icon = Icons.Default.LocationOn,
                            content = {
                                Column {
                                    Text(order.address, color = MaterialTheme.colorScheme.onSurface)
                                    val landmark = order.getEffectiveLandmark()
                                    if (landmark.isNotBlank()) {
                                        Text("लैंडमार्क: $landmark", fontWeight = FontWeight.SemiBold, color = Color(0xFFE65100), fontSize = 13.sp)
                                    }
                                    Spacer(modifier = Modifier.height(10.dp))
                                    Button(
                                        onClick = {
                                            val intentUri = if (order.targetLat != 0.0 && order.targetLng != 0.0) {
                                                Uri.parse("google.navigation:q=${order.targetLat},${order.targetLng}&mode=d")
                                            } else {
                                                val query = if (landmark.isNotBlank()) "${order.address} ($landmark)" else order.address
                                                Uri.parse("google.navigation:q=${Uri.encode(query)}&mode=d")
                                            }
                                            val mapIntent = Intent(Intent.ACTION_VIEW, intentUri).apply {
                                                setPackage("com.google.android.apps.maps")
                                            }
                                            context.startActivity(mapIntent)
                                        },
                                        modifier = Modifier.fillMaxWidth().height(48.dp),
                                        shape = RoundedCornerShape(10.dp),
                                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1976D2))
                                    ) {
                                        Icon(Icons.Default.Navigation, contentDescription = null)
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Text(stringResource(R.string.open_in_maps), fontWeight = FontWeight.Bold)
                                    }
                                }
                            }
                        )
                    }

                    item {
                        Text(stringResource(R.string.order_items), fontWeight = FontWeight.Bold, fontSize = 18.sp)
                    }

                    items(order.items) { item ->
                        Card(
                            modifier = Modifier.fillMaxWidth(),
                            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
                        ) {
                            Row(
                                modifier = Modifier.padding(16.dp).fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Column(modifier = Modifier.weight(1f)) {
                                    Text(item.productName, fontWeight = FontWeight.Medium, color = MaterialTheme.colorScheme.onSurface)
                                    Text("Qty: ${item.quantity}", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp)
                                }
                                Text("₹${item.price * item.quantity}", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                            }
                        }
                    }

                    item {
                        InfoCard(
                            title = stringResource(R.string.order_summary),
                            icon = Icons.Default.Receipt,
                            content = {
                                Column {
                                    SummaryRow("Subtotal", "₹${order.totalAmount}")
                                    SummaryRow("Delivery Fee", "Free")
                                    HorizontalDivider(modifier = Modifier.padding(vertical = 8.dp))
                                    SummaryRow("Total", "₹${order.totalAmount}", isBold = true)
                                    Text(
                                        text = "Payment: ${if (order.isCOD) "Cash on Delivery" else "Online (Prepaid)"}",
                                        color = if (order.isCOD) Color(0xFFE65100) else Color(0xFF2E7D32),
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
                    onDeliverClick = { showConfirmDialog = "DELIVERED" },
                    onStatusChange = { newStatus -> showConfirmDialog = newStatus },
                    onReattemptClick = { showReattemptDialog = true }
                )
            }
        }
    }

    if (showUpiQrDialog && order != null) {
        DynamicUpiQrDialog(
            orderId = order.id,
            farmerName = order.userName.ifBlank { "किसान ग्राहक" },
            amount = if (order.isCOD && order.codAmount > 0) order.codAmount else order.totalAmount,
            onDismiss = { showUpiQrDialog = false }
        )
    }

    if (showReattemptDialog && order != null) {
        ReattemptDialog(
            orderId = order.id,
            onDismiss = { showReattemptDialog = false },
            onSubmit = { reason, notes, isRTO, photo ->
                viewModel.reportDeliveryFailure(order.id, reason, notes, isRTO, photo) { success ->
                    showReattemptDialog = false
                    if (success) {
                        onNavigateBack()
                    }
                }
            }
        )
    }
}

@Composable
fun OrderHeaderSection(order: Order) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column {
            Text("Order #${order.id.takeLast(8).uppercase()}", fontWeight = FontWeight.ExtraBold, fontSize = 22.sp, color = MaterialTheme.colorScheme.onSurface)
            Text("Assigned Today", color = MaterialTheme.colorScheme.onSurfaceVariant, fontSize = 14.sp)
        }
        StatusBadge(order.status)
    }
}

@Composable
fun InfoCard(title: String, icon: ImageVector, content: @Composable () -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(icon, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(20.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text(title, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
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
fun ActionBottomBar(
    order: Order,
    onDeliverClick: () -> Unit,
    onStatusChange: (String) -> Unit,
    onReattemptClick: () -> Unit
) {
    Surface(
        shadowElevation = 8.dp,
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier
                .padding(16.dp)
                .fillMaxWidth(),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            val (buttonText, nextStatus) = when (order.status) {
                OrderStatus.ASSIGNED.name, "RIDER_ASSIGNED", "RIDER_ACCEPTED", "READY_FOR_PICKUP" -> "START PICKUP" to OrderStatus.PICKED_UP.name
                OrderStatus.PICKED_UP.name, "IN_TRANSIT" -> "OUT FOR DELIVERY" to OrderStatus.OUT_FOR_DELIVERY.name
                OrderStatus.OUT_FOR_DELIVERY.name -> "MARK DELIVERED" to OrderStatus.DELIVERED.name
                else -> "COMPLETED" to ""
            }

            if (nextStatus.isNotEmpty()) {
                Button(
                    onClick = { 
                        if (nextStatus == OrderStatus.DELIVERED.name) {
                            onDeliverClick()
                        } else {
                            onStatusChange(nextStatus)
                        }
                    },
                    modifier = Modifier.fillMaxWidth().height(52.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2E7D32))
                ) {
                    Text(buttonText, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                }
            }

            // Reattempt / Failure button when out for delivery or picked up
            if (order.status == OrderStatus.OUT_FOR_DELIVERY.name || order.status == OrderStatus.PICKED_UP.name) {
                OutlinedButton(
                    onClick = onReattemptClick,
                    modifier = Modifier.fillMaxWidth().height(46.dp),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFD32F2F)),
                    border = androidx.compose.foundation.BorderStroke(1.5.dp, Color(0xFFD32F2F))
                ) {
                    Icon(Icons.Default.WarningAmber, contentDescription = null, modifier = Modifier.size(18.dp))
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("डिलीवरी समस्या / पुनः प्रयास (Report Issue / Reattempt)", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                }
            }
        }
    }
}
