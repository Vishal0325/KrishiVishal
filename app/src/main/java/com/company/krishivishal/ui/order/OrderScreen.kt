package com.company.krishivishal.ui.order

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.ShoppingBag
import androidx.compose.material.icons.filled.Print
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.FileDownload
import androidx.compose.material.icons.filled.Lock
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import androidx.compose.ui.res.stringResource
import com.company.krishivishal.R
import com.company.krishivishal.core.model.Order
import com.company.krishivishal.core.model.OrderStatus
import com.company.krishivishal.ui.theme.PrimaryGreen
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.ui.components.EmptyState
import java.text.SimpleDateFormat
import java.util.Locale
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.ui.semantics.Role
import androidx.compose.foundation.BorderStroke
import androidx.compose.ui.semantics.semantics

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrderScreen(
    onBack: () -> Unit,
    onTrackClick: (String) -> Unit,
    onViewBillClick: (Order) -> Unit,
    viewModel: OrderViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val appConfig by viewModel.appConfig.collectAsState()
    val cancelState = uiState.cancelOrderResource
    var selectedOrderId by remember { mutableStateOf<String?>(null) }
    var orderToCancel by remember { mutableStateOf<Order?>(null) }
    var orderToReturn by remember { mutableStateOf<Order?>(null) }

    val snackbarHostState = remember { SnackbarHostState() }

    LaunchedEffect(cancelState) {
        when (cancelState) {
            is Resource.Success -> {
                snackbarHostState.showSnackbar("Order cancelled successfully")
                viewModel.clearCancelState()
                viewModel.loadOrders()
            }
            is Resource.Error -> {
                snackbarHostState.showSnackbar("Error: ${cancelState.message}")
                viewModel.clearCancelState()
            }
            else -> {}
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = { Text(if (selectedOrderId == null) "My Orders" else "Order Details", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = {
                        if (selectedOrderId != null) selectedOrderId = null
                        else onBack()
                    }) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
            )
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(MaterialTheme.colorScheme.background)
        ) {
            if (uiState.isLoading && uiState.orders.isEmpty()) {
                CircularProgressIndicator(modifier = Modifier.align(Alignment.Center), color = PrimaryGreen)
            } else if (uiState.error != null && uiState.orders.isEmpty()) {
                Text(text = "Error: ${uiState.error}", modifier = Modifier.align(Alignment.Center), color = Color.Red)
            } else if (uiState.orders.isEmpty()) {
                EmptyState(
                    icon = Icons.Default.ShoppingBag,
                    title = "No orders placed yet",
                    description = "Looks like you haven't ordered anything. Start exploring our fresh products!",
                    actionText = "Start Shopping",
                    onActionClick = onBack
                )
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(uiState.orders, key = { it.id }) { order ->
                        OrderItemCard(
                            order = order,
                            isExpanded = selectedOrderId == order.id,
                            appConfig = appConfig,
                            viewModel = viewModel,
                            onExpandClick = {
                                selectedOrderId = if (selectedOrderId == order.id) null else order.id
                            },
                            onCancelClick = { orderToCancel = it },
                            onReturnClick = { orderToReturn = it },
                            onTrackClick = { onTrackClick(order.id) },
                            onViewBillClick = { onViewBillClick(order) }
                        )
                    }
                }
            }
        }

        if (orderToCancel != null) {
            val cancelOrder = orderToCancel
            if (cancelOrder != null) {
                OrderCancellationDialog(
                    onDismiss = { orderToCancel = null },
                    onConfirm = { reason ->
                        viewModel.cancelOrder(cancelOrder.id, reason)
                        orderToCancel = null
                    }
                )
            }
        }

        if (orderToReturn != null) {
            val returnOrder = orderToReturn
            if (returnOrder != null) {
                ReturnRequestDialog(
                    order = returnOrder,
                    onDismiss = { orderToReturn = null },
                    onConfirm = { reason ->
                        viewModel.requestReturn(returnOrder, reason)
                        orderToReturn = null
                    }
                )
            }
        }
    }
}

@Composable
fun OrderItemCard(
    order: Order, 
    isExpanded: Boolean, 
    appConfig: com.company.krishivishal.core.model.AppConfig,
    viewModel: OrderViewModel,
    onExpandClick: () -> Unit, 
    onCancelClick: (Order) -> Unit,
    onReturnClick: (Order) -> Unit,
    onTrackClick: () -> Unit,
    onViewBillClick: () -> Unit
) {
    val dateFormat = remember { SimpleDateFormat("dd MMM yyyy, hh:mm a", Locale.getDefault()) }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onExpandClick() },
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "Order #${order.id.takeLast(8).uppercase()}",
                        fontWeight = FontWeight.Bold,
                        fontSize = 15.sp
                    )
                    Text(
                        text = dateFormat.format(order.createdAt),
                        fontSize = 12.sp,
                        color = Color.Gray
                    )
                }
                StatusBadge(status = order.orderStatus)
            }
            
            HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp), thickness = 0.5.dp)
            
            // Items Preview
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(modifier = Modifier.size(50.dp)) {
                    AsyncImage(
                        model = order.items.firstOrNull()?.imageUrl,
                        contentDescription = null,
                        modifier = Modifier.fillMaxSize().background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(8.dp)),
                        contentScale = ContentScale.Fit
                    )
                }
                Spacer(modifier = Modifier.width(12.dp))
                Column(modifier = Modifier.weight(1f)) {
                    val firstItem = order.items.firstOrNull()
                    val itemName = firstItem?.productName ?: "Multiple Items"
                    val variantLabel = firstItem?.variantLabel
                    
                    // Group name and variant for accessibility
                    Column(modifier = Modifier.semantics(mergeDescendants = true) {}) {
                        Text(
                            text = itemName,
                            fontWeight = FontWeight.Medium,
                            fontSize = 14.sp,
                            maxLines = 1
                        )
                        if (!variantLabel.isNullOrBlank() && order.items.size == 1) {
                            Text(
                                text = variantLabel,
                                fontSize = 11.sp,
                                color = Color.Gray
                            )
                        }
                    }
                    
                    Text(
                        text = if (order.items.size > 1) "and ${order.items.size - 1} other items" else "Qty: ${firstItem?.quantity ?: 0}",
                        fontSize = 12.sp,
                        color = Color.Gray
                    )
                }
                Text(
                    text = "₹${order.totalAmount.toInt()}",
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 16.sp,
                    color = PrimaryGreen
                )
            }

            AnimatedVisibility(visible = isExpanded) {
                Column {
                    HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp), thickness = 0.5.dp)
                    
                    // NEW: Delivery Verification Section
                    if (order.status != "DELIVERED" && order.status != "CANCELLED") {
                        Card(
                            modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                            colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF9C4)), // Light Yellow
                            border = BorderStroke(1.dp, Color(0xFFFBC02D))
                        ) {
                            Row(
                                modifier = Modifier.padding(16.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(Icons.Default.Lock, contentDescription = null, tint = Color(0xFFF57F17), modifier = Modifier.size(24.dp))
                                Spacer(modifier = Modifier.width(16.dp))
                                Column {
                                    Text("Delivery Verification Code", fontWeight = FontWeight.Bold, fontSize = 12.sp, color = Color(0xFFF57F17))
                                    Text(
                                        text = order.customerOTP.ifEmpty { "----" },
                                        fontWeight = FontWeight.Black,
                                        fontSize = 24.sp,
                                        letterSpacing = 4.sp,
                                        color = Color.Black
                                    )
                                    Text("Share this OTP only with the delivery rider.", fontSize = 10.sp, color = Color.DarkGray)
                                }
                            }
                        }
                        HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp), thickness = 0.5.dp)
                    }

                    // Full Items List
                    Text(text = "Items Ordered", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                    Spacer(modifier = Modifier.height(8.dp))
                    order.items.forEach { item ->
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f).semantics(mergeDescendants = true) {}) {
                                Text(item.productName, fontSize = 13.sp, fontWeight = FontWeight.Medium)
                                val label = item.variantLabel
                                if (!label.isNullOrBlank()) {
                                    Text(label, fontSize = 11.sp, color = Color.Gray)
                                }
                            }
                            Text("x${item.quantity}", fontSize = 13.sp, color = Color.DarkGray)
                            Spacer(modifier = Modifier.width(16.dp))
                            Text("₹${(item.price * item.quantity).toInt()}", fontSize = 13.sp, fontWeight = FontWeight.Bold)
                        }
                    }

                    HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp), thickness = 0.5.dp)
                    Text(text = "Order Tracking", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                    Spacer(modifier = Modifier.height(16.dp))
                    OrderTimeline(currentStatus = order.orderStatus)
                    
                    HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp), thickness = 0.5.dp)
                    Text(text = "Delivery Address", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(text = order.address, fontSize = 12.sp, color = Color.DarkGray, lineHeight = 18.sp)

                    // View Bill Button
                    Spacer(modifier = Modifier.height(16.dp))
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = onViewBillClick,
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.buttonColors(containerColor = Color.DarkGray),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Icon(Icons.Default.Print, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(stringResource(R.string.view_print_invoice), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }

                        val context = androidx.compose.ui.platform.LocalContext.current
                        Button(
                            onClick = { com.company.krishivishal.utils.PrintHelper.printOrderInvoice(context, order, appConfig) },
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Icon(Icons.Default.FileDownload, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(stringResource(R.string.download_invoice), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                        }
                    }

                    // Track Button
                    if (order.orderStatus == OrderStatus.OUT_FOR_DELIVERY || order.orderStatus == OrderStatus.SHIPPED) {
                        Spacer(modifier = Modifier.height(16.dp))
                        Button(
                            onClick = onTrackClick,
                            modifier = Modifier.fillMaxWidth(),
                            colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Icon(Icons.Default.LocationOn, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Track Order Live", fontWeight = FontWeight.Bold)
                        }
                    }

                    // Cancel Order Button
                    val canCancel = order.orderStatus in listOf(OrderStatus.PLACED, OrderStatus.CONFIRMED)
                    if (canCancel) {
                        Spacer(modifier = Modifier.height(16.dp))
                        OutlinedButton(
                            onClick = { onCancelClick(order) },
                            modifier = Modifier.fillMaxWidth(),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.Red),
                            border = BorderStroke(1.dp, Color.Red),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Icon(Icons.Default.Close, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Cancel Order", fontWeight = FontWeight.Bold)
                        }
                    }

                    // Return System Section
                    if (order.orderStatus == OrderStatus.DELIVERED) {
                        val returnState by viewModel.uiState.collectAsState()
                        val context = androidx.compose.ui.platform.LocalContext.current

                        LaunchedEffect(returnState.returnRequestResource) {
                            if (returnState.returnRequestResource is Resource.Success) {
                                android.widget.Toast.makeText(context, "Return request submitted successfully!", android.widget.Toast.LENGTH_LONG).show()
                                viewModel.clearReturnState()
                                viewModel.loadOrders()
                            } else if (returnState.returnRequestResource is Resource.Error) {
                                android.widget.Toast.makeText(context, "Error: ${returnState.returnRequestResource?.message}", android.widget.Toast.LENGTH_LONG).show()
                                viewModel.clearReturnState()
                            }
                        }

                        Spacer(modifier = Modifier.height(16.dp))
                        OutlinedButton(
                            onClick = { 
                                onReturnClick(order) 
                            },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(48.dp),
                            enabled = returnState.returnRequestResource !is Resource.Loading,
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = PrimaryGreen),
                            border = BorderStroke(1.5.dp, PrimaryGreen),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            if (returnState.returnRequestResource is Resource.Loading) {
                                CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = PrimaryGreen)
                            } else {
                                Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(18.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Return Items", fontWeight = FontWeight.ExtraBold)
                            }
                        }
                    }
                }
            }
            
            if (!isExpanded) {
                Text(
                    text = "View Details",
                    fontSize = 12.sp,
                    color = PrimaryGreen,
                    modifier = Modifier.align(Alignment.End).padding(top = 8.dp),
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}

@Composable
fun ReturnRequestDialog(
    order: Order,
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit
) {
    var selectedReason by remember { mutableStateOf("") }
    val reasons = listOf("Defective/Damaged", "Wrong Item Received", "Quality not as expected", "Expired Product", "Changed my mind")

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Request Return", fontWeight = FontWeight.Bold) },
        text = {
            Column(modifier = Modifier.fillMaxWidth().selectableGroup()) {
                Text("Why are you returning this?", fontSize = 14.sp, color = Color.Gray)
                Spacer(modifier = Modifier.height(12.dp))
                reasons.forEach { reason ->
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .selectable(
                                selected = (selectedReason == reason),
                                onClick = { selectedReason = reason },
                                role = Role.RadioButton
                            )
                            .padding(vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        RadioButton(
                            selected = (selectedReason == reason),
                            onClick = null
                        )
                        Text(text = reason, modifier = Modifier.padding(start = 12.dp))
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = { onConfirm(selectedReason) },
                enabled = selectedReason.isNotEmpty(),
                colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen)
            ) {
                Text("Submit Request")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        }
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OrderCancellationDialog(
    onDismiss: () -> Unit,
    onConfirm: (String) -> Unit
) {
    val reasons = listOf(
        "Changed my mind",
        "Found a better price",
        "Incorrect delivery address",
        "Order delayed",
        "Other"
    )
    var selectedReason by remember { mutableStateOf(reasons[0]) }
    var otherReason by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Cancel Order", fontWeight = FontWeight.Bold) },
        text = {
            Column(modifier = Modifier.selectableGroup()) {
                Text("Please select a reason for cancellation:", fontSize = 14.sp)
                Spacer(modifier = Modifier.height(12.dp))
                
                reasons.forEach { reason ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .height(48.dp)
                            .selectable(
                                selected = (reason == selectedReason),
                                onClick = { selectedReason = reason },
                                role = Role.RadioButton
                            )
                            .padding(horizontal = 0.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        RadioButton(
                            selected = (reason == selectedReason),
                            onClick = null
                        )
                        Text(
                            text = reason,
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.padding(start = 12.dp)
                        )
                    }
                }
                
                if (selectedReason == "Other") {
                    Spacer(modifier = Modifier.height(8.dp))
                    OutlinedTextField(
                        value = otherReason,
                        onValueChange = { otherReason = it },
                        label = { Text("Describe reason") },
                        modifier = Modifier.fillMaxWidth(),
                        maxLines = 2
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = { 
                    val finalReason = if (selectedReason == "Other") otherReason else selectedReason
                    if (selectedReason == "Other" && otherReason.isBlank()) {
                        // No-op
                    } else {
                        onConfirm(finalReason)
                    }
                },
                enabled = selectedReason != "Other" || otherReason.isNotBlank(),
                colors = ButtonDefaults.buttonColors(containerColor = Color.Red)
            ) {
                Text("Confirm Cancellation")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Go Back")
            }
        }
    )
}

val OrderStatus.color: Color
    get() = when (this) {
        OrderStatus.PLACED -> Color(0xFF2196F3)
        OrderStatus.CONFIRMED -> Color(0xFF4CAF50)
        OrderStatus.SHIPPED -> Color(0xFFFF9800)
        OrderStatus.OUT_FOR_DELIVERY -> Color(0xFF9C27B0)
        OrderStatus.DELIVERED -> PrimaryGreen
        OrderStatus.CANCELLED -> Color.Red
        OrderStatus.RETURNED -> Color.Gray
    }

@Composable
fun StatusBadge(status: OrderStatus) {
    Surface(
        color = status.color.copy(alpha = 0.1f),
        shape = RoundedCornerShape(6.dp)
    ) {
        Text(
            text = status.displayName,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            color = status.color
        )
    }
}

@Composable
fun OrderTimeline(currentStatus: OrderStatus) {
    val statuses = listOf(
        Pair(OrderStatus.PLACED, "Order has been placed"),
        Pair(OrderStatus.CONFIRMED, "Items are being packed"),
        Pair(OrderStatus.SHIPPED, "Order is on the way"),
        Pair(OrderStatus.OUT_FOR_DELIVERY, "Order is out for delivery"),
        Pair(OrderStatus.DELIVERED, "Order has been delivered")
    )
    
    val currentIndex = when (currentStatus) {
        OrderStatus.PLACED -> 0
        OrderStatus.CONFIRMED -> 1
        OrderStatus.SHIPPED -> 2
        OrderStatus.OUT_FOR_DELIVERY -> 3
        OrderStatus.DELIVERED -> 4
        OrderStatus.CANCELLED -> -1
        else -> 0
    }

    if (currentStatus == OrderStatus.CANCELLED) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Box(
                modifier = Modifier.size(12.dp).background(Color.Red, CircleShape)
            )
            Spacer(modifier = Modifier.width(12.dp))
            Text("Order Cancelled", color = Color.Red, fontWeight = FontWeight.Bold)
        }
        return
    }

    Column {
        statuses.forEachIndexed { index, pair ->
            val status = pair.first
            val desc = pair.second
            TimelineItem(
                title = status.displayName,
                description = desc,
                isCompleted = index <= currentIndex,
                isLast = index == statuses.size - 1,
                isActive = index == currentIndex
            )
        }
    }
}

@Composable
fun TimelineItem(
    title: String,
    description: String,
    isCompleted: Boolean,
    isLast: Boolean,
    isActive: Boolean
) {
    Row(modifier = Modifier.fillMaxWidth()) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.width(24.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(16.dp)
                    .background(
                        color = if (isCompleted) PrimaryGreen else MaterialTheme.colorScheme.outline,
                        shape = CircleShape
                    ),
                contentAlignment = Alignment.Center
            ) {
                if (isCompleted) {
                    Icon(
                        Icons.Default.Check,
                        contentDescription = null,
                        modifier = Modifier.size(10.dp),
                        tint = Color.White
                    )
                }
            }
            if (!isLast) {
                Box(
                    modifier = Modifier
                        .width(2.dp)
                        .height(30.dp)
                        .background(if (isCompleted && !isActive) PrimaryGreen else MaterialTheme.colorScheme.outline)
                )
            }
        }
        Spacer(modifier = Modifier.width(16.dp))
        Column(modifier = Modifier.padding(bottom = if (isLast) 0.dp else 16.dp)) {
            Text(
                text = title,
                fontWeight = if (isCompleted) FontWeight.Bold else FontWeight.Normal,
                fontSize = 13.sp,
                color = if (isCompleted) MaterialTheme.colorScheme.onSurface else Color.Gray
            )
            Text(
                text = description,
                fontSize = 11.sp,
                color = Color.Gray
            )
        }
    }
}
