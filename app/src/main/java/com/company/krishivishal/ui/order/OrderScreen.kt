package com.company.krishivishal.ui.order

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.widget.Toast
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.Star
import androidx.compose.material.icons.outlined.StarOutline
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import com.company.krishivishal.R
import com.company.krishivishal.core.model.AppConfig
import com.company.krishivishal.core.model.Order
import com.company.krishivishal.core.model.OrderItem
import com.company.krishivishal.core.model.OrderStatus
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.ui.components.EmptyState
import com.company.krishivishal.ui.theme.PrimaryGreen
import com.company.krishivishal.utils.PrintHelper
import java.text.SimpleDateFormat
import java.util.*

enum class OrderFilterTab(val label: String) {
    ALL("All"),
    ACTIVE("Active"),
    DELIVERED("Delivered"),
    CANCELLED("Cancelled/Returned")
}

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
    var itemToReview by remember { mutableStateOf<Pair<Order, OrderItem>?>(null) }
    var selectedTab by remember { mutableStateOf(OrderFilterTab.ALL) }

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

    val filteredOrders = remember(uiState.orders, selectedTab) {
        when (selectedTab) {
            OrderFilterTab.ALL -> uiState.orders
            OrderFilterTab.ACTIVE -> uiState.orders.filter {
                it.orderStatus in listOf(
                    OrderStatus.PLACED,
                    OrderStatus.CONFIRMED,
                    OrderStatus.PROCUREMENT_PENDING,
                    OrderStatus.ASSIGNED,
                    OrderStatus.PICKED_UP,
                    OrderStatus.SHIPPED,
                    OrderStatus.OUT_FOR_DELIVERY
                )
            }
            OrderFilterTab.DELIVERED -> uiState.orders.filter { it.orderStatus == OrderStatus.DELIVERED }
            OrderFilterTab.CANCELLED -> uiState.orders.filter {
                it.orderStatus in listOf(OrderStatus.CANCELLED, OrderStatus.RETURNED)
            }
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = if (selectedOrderId == null) "My Orders" else "Order Details",
                            fontWeight = FontWeight.Bold,
                            fontSize = 18.sp
                        )
                        if (uiState.orders.isNotEmpty()) {
                            Text(
                                text = "${uiState.orders.size} Total Orders",
                                fontSize = 12.sp,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                    }
                },
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
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(Color(0xFFF5F5F5))
        ) {
            // Status Filter Tabs
            if (uiState.orders.isNotEmpty()) {
                ScrollableTabRow(
                    selectedTabIndex = selectedTab.ordinal,
                    edgePadding = 16.dp,
                    containerColor = Color.White,
                    contentColor = PrimaryGreen,
                    divider = { HorizontalDivider(thickness = 0.5.dp, color = Color(0xFFE0E0E0)) }
                ) {
                    OrderFilterTab.values().forEach { tab ->
                        val count = remember(uiState.orders, tab) {
                            when (tab) {
                                OrderFilterTab.ALL -> uiState.orders.size
                                OrderFilterTab.ACTIVE -> uiState.orders.count {
                                    it.orderStatus in listOf(
                                        OrderStatus.PLACED, OrderStatus.CONFIRMED,
                                        OrderStatus.PROCUREMENT_PENDING, OrderStatus.ASSIGNED,
                                        OrderStatus.PICKED_UP, OrderStatus.SHIPPED, OrderStatus.OUT_FOR_DELIVERY
                                    )
                                }
                                OrderFilterTab.DELIVERED -> uiState.orders.count { it.orderStatus == OrderStatus.DELIVERED }
                                OrderFilterTab.CANCELLED -> uiState.orders.count {
                                    it.orderStatus in listOf(OrderStatus.CANCELLED, OrderStatus.RETURNED)
                                }
                            }
                        }
                        Tab(
                            selected = selectedTab == tab,
                            onClick = { selectedTab = tab },
                            text = {
                                Text(
                                    text = "${tab.label} ($count)",
                                    fontWeight = if (selectedTab == tab) FontWeight.Bold else FontWeight.Medium,
                                    fontSize = 13.sp
                                )
                            }
                        )
                    }
                }
            }

            Box(modifier = Modifier.fillMaxSize()) {
                if (uiState.isLoading && uiState.orders.isEmpty()) {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.Center), color = PrimaryGreen)
                } else if (uiState.error != null && uiState.orders.isEmpty()) {
                    Text(
                        text = "Error: ${uiState.error}",
                        modifier = Modifier.align(Alignment.Center),
                        color = MaterialTheme.colorScheme.error
                    )
                } else if (filteredOrders.isEmpty()) {
                    EmptyState(
                        icon = Icons.Default.ShoppingBag,
                        title = if (uiState.orders.isEmpty()) "No orders placed yet" else "No orders in this filter",
                        description = if (uiState.orders.isEmpty()) "Start exploring our fresh agricultural products!" else "Try selecting another tab.",
                        actionText = "Start Shopping",
                        onActionClick = onBack
                    )
                } else {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(12.dp),
                        verticalArrangement = Arrangement.spacedBy(14.dp)
                    ) {
                        items(filteredOrders, key = { it.id }) { order ->
                            ReferenceOrderItemCard(
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
                                onViewBillClick = { onViewBillClick(order) },
                                onWriteReviewClick = { item -> itemToReview = Pair(order, item) }
                            )
                        }
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
                    onConfirm = { item, quantity, reason, comment ->
                        viewModel.requestReturn(
                            order = returnOrder,
                            item = item,
                            quantity = quantity,
                            reason = reason,
                            comment = comment
                        )
                        orderToReturn = null
                    }
                )
            }
        }

        if (itemToReview != null) {
            val (order, item) = itemToReview!!
            val context = LocalContext.current
            WriteReviewDialog(
                productName = item.productName,
                onDismiss = { itemToReview = null },
                onSubmit = { rating, reviewText ->
                    Toast.makeText(context, "Thank you for reviewing ${item.productName}!", Toast.LENGTH_SHORT).show()
                    itemToReview = null
                }
            )
        }
    }
}

/**
 * Order Card redesigned to match the Reference Image provided by the user.
 * - Light green banner top header (#DCEDC8 / #C5E1A5) with Order ID & Total
 * - Individual product items with square image, title, seller, quantity unit, and status pill badge
 * - Rating stars & "Write a Review" footer bar under each item
 * - Expandable section for delivery OTP, timeline, address, & invoice/actions
 */
@Composable
fun ReferenceOrderItemCard(
    order: Order,
    isExpanded: Boolean,
    appConfig: AppConfig,
    viewModel: OrderViewModel,
    onExpandClick: () -> Unit,
    onCancelClick: (Order) -> Unit,
    onReturnClick: (Order) -> Unit,
    onTrackClick: () -> Unit,
    onViewBillClick: () -> Unit,
    onWriteReviewClick: (OrderItem) -> Unit
) {
    val context = LocalContext.current

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onExpandClick() },
        shape = RoundedCornerShape(8.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
        border = BorderStroke(1.dp, Color(0xFFE0E0E0))
    ) {
        Column {
            // 1. Reference Image Top Header Banner (Pistachio Light Green)
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFFDCEDC8))
                    .padding(horizontal = 16.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Text(
                        text = "#${order.id.takeLast(8).uppercase()}",
                        fontWeight = FontWeight.Bold,
                        fontSize = 15.sp,
                        color = Color.Black
                    )
                    Icon(
                        imageVector = Icons.Default.ContentCopy,
                        contentDescription = "Copy Order ID",
                        modifier = Modifier
                            .size(14.dp)
                            .clickable {
                                val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
                                clipboard.setPrimaryClip(ClipData.newPlainText("Order ID", order.id))
                                Toast.makeText(context, "Order ID copied to clipboard", Toast.LENGTH_SHORT).show()
                            },
                        tint = Color(0xFF558B2F)
                    )
                }

                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "Total ",
                        fontSize = 14.sp,
                        color = Color.Black
                    )
                    Text(
                        text = "₹${order.totalAmount.toInt()}.00",
                        fontWeight = FontWeight.Bold,
                        fontSize = 15.sp,
                        color = Color(0xFF2E7D32)
                    )
                }
            }

            // 2. Product Items List matching Reference Layout
            order.items.forEachIndexed { index, item ->
                if (index > 0) {
                    HorizontalDivider(thickness = 0.5.dp, color = Color(0xFFE0E0E0))
                }

                Column {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(14.dp),
                        verticalAlignment = Alignment.Top
                    ) {
                        // Product Image Container
                        Box(
                            modifier = Modifier
                                .size(82.dp)
                                .clip(RoundedCornerShape(10.dp))
                                .background(Color.White)
                                .border(1.dp, Color(0xFFE0E0E0), RoundedCornerShape(10.dp))
                                .padding(4.dp),
                            contentAlignment = Alignment.Center
                        ) {
                            if (item.imageUrl.isNotBlank()) {
                                AsyncImage(
                                    model = item.imageUrl,
                                    contentDescription = item.productName,
                                    modifier = Modifier.fillMaxSize(),
                                    contentScale = ContentScale.Fit
                                )
                            } else {
                                Surface(
                                    color = PrimaryGreen.copy(alpha = 0.08f),
                                    shape = RoundedCornerShape(8.dp),
                                    modifier = Modifier.fillMaxSize()
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Icon(
                                            imageVector = Icons.Default.ShoppingBag,
                                            contentDescription = item.productName,
                                            tint = PrimaryGreen,
                                            modifier = Modifier.size(36.dp)
                                        )
                                    }
                                }
                            }
                        }

                        Spacer(modifier = Modifier.width(14.dp))

                        // Product Details Column
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = item.productName,
                                fontWeight = FontWeight.Bold,
                                fontSize = 14.sp,
                                color = Color.Black,
                                maxLines = 2,
                                lineHeight = 18.sp
                            )
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(
                                text = "KrishiVishal",
                                fontSize = 13.sp,
                                color = Color(0xFF888888)
                            )
                            Spacer(modifier = Modifier.height(4.dp))
                            
                            val variantText = item.variantLabel?.ifBlank { "unit" } ?: "unit"
                            val unitRate = if (item.price > 0.0) item.price.toInt() else (order.totalAmount / (order.items.sumOf { it.quantity }.coerceAtLeast(1))).toInt()
                            val itemTotal = if (item.price > 0.0) (item.price * item.quantity).toInt() else order.totalAmount.toInt()

                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "${item.quantity} x $variantText",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 13.sp,
                                    color = Color.Black
                                )
                                Surface(
                                    color = Color(0xFFE8F5E9),
                                    shape = RoundedCornerShape(4.dp)
                                ) {
                                    Text(
                                        text = "Rate: ₹$unitRate",
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 12.sp,
                                        color = Color(0xFF2E7D32),
                                        modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                                    )
                                }
                            }
                            Spacer(modifier = Modifier.height(3.dp))
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween,
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Text(
                                    text = "Shipping fee: Free",
                                    fontSize = 12.sp,
                                    color = Color(0xFF757575)
                                )
                                Text(
                                    text = "Item Total: ₹$itemTotal",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 12.sp,
                                    color = Color.Black
                                )
                            }

                            // Status Pill Badge aligned to bottom-right of item details
                            Box(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(top = 4.dp),
                                contentAlignment = Alignment.CenterEnd
                            ) {
                                ReferenceStatusBadge(order = order)
                            }
                        }
                    }

                    // Review & Rating Bar (as shown in reference image)
                    HorizontalDivider(thickness = 0.5.dp, color = Color(0xFFEEEEEE))
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 14.dp, vertical = 8.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        // 5 Rating Stars
                        Row(horizontalArrangement = Arrangement.spacedBy(2.dp)) {
                            repeat(5) {
                                Icon(
                                    imageVector = Icons.Outlined.StarOutline,
                                    contentDescription = "Star Rating",
                                    tint = Color(0xFFCCCCCC),
                                    modifier = Modifier
                                        .size(18.dp)
                                        .clickable { onWriteReviewClick(item) }
                                )
                            }
                        }

                        Text(
                            text = "Write a Review",
                            fontSize = 13.sp,
                            fontWeight = FontWeight.Medium,
                            color = Color.Black,
                            modifier = Modifier.clickable { onWriteReviewClick(item) }
                        )
                    }
                }
            }

            // Expand/Collapse Details Bar
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFFFAFAFA))
                    .clickable { onExpandClick() }
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = if (isExpanded) "Hide Order Details" else "View Full Order Details & Invoice",
                    fontSize = 12.sp,
                    color = PrimaryGreen,
                    fontWeight = FontWeight.Bold
                )
                Icon(
                    imageVector = if (isExpanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                    contentDescription = null,
                    tint = PrimaryGreen,
                    modifier = Modifier.size(20.dp)
                )
            }

            // 3. Expandable Section for OTP, Timeline, Address & Actions
            AnimatedVisibility(
                visible = isExpanded,
                enter = fadeIn(),
                exit = fadeOut()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    HorizontalDivider(thickness = 0.5.dp, color = Color(0xFFE0E0E0))
                    Spacer(modifier = Modifier.height(10.dp))

                    // Delivery Verification Code Card
                    if (order.status != "DELIVERED" && order.status != "CANCELLED") {
                        Card(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 6.dp),
                            colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF8E1)),
                            border = BorderStroke(1.dp, Color(0xFFFFB300)),
                            shape = RoundedCornerShape(10.dp)
                        ) {
                            Row(
                                modifier = Modifier.padding(14.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Surface(
                                    shape = CircleShape,
                                    color = Color(0xFFFF8F00).copy(alpha = 0.15f),
                                    modifier = Modifier.size(40.dp)
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Icon(
                                            Icons.Default.Lock,
                                            contentDescription = null,
                                            tint = Color(0xFFE65100),
                                            modifier = Modifier.size(20.dp)
                                        )
                                    }
                                }
                                Spacer(modifier = Modifier.width(12.dp))
                                Column {
                                    Text(
                                        "Delivery Verification OTP",
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 11.sp,
                                        color = Color(0xFFE65100)
                                    )
                                    Text(
                                        text = order.customerOTP.ifEmpty { "----" },
                                        fontWeight = FontWeight.Black,
                                        fontSize = 22.sp,
                                        letterSpacing = 4.sp,
                                        color = Color.Black
                                    )
                                    Text(
                                        "Share this code with the delivery partner upon arrival",
                                        fontSize = 10.sp,
                                        color = Color.DarkGray
                                    )
                                }
                            }
                        }
                        Spacer(modifier = Modifier.height(12.dp))
                    }

                    // Order Progress Timeline
                    Text(text = "Order Progress", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                    Spacer(modifier = Modifier.height(10.dp))
                    OrderTimeline(currentStatus = order.orderStatus)

                    Spacer(modifier = Modifier.height(12.dp))
                    HorizontalDivider(thickness = 0.5.dp, color = Color(0xFFE0E0E0))
                    Spacer(modifier = Modifier.height(12.dp))

                    // Delivery Address
                    Row(verticalAlignment = Alignment.Top) {
                        Icon(
                            Icons.Default.LocationOn,
                            contentDescription = null,
                            tint = PrimaryGreen,
                            modifier = Modifier.size(18.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Column {
                            Text(text = "Delivery Address", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(text = order.address, fontSize = 12.sp, color = Color.DarkGray, lineHeight = 18.sp)
                        }
                    }

                    // Action Buttons Row
                    Spacer(modifier = Modifier.height(16.dp))
                    Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = onViewBillClick,
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.surfaceVariant),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Icon(Icons.Default.Print, contentDescription = null, modifier = Modifier.size(16.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(stringResource(R.string.view_print_invoice), fontSize = 11.sp, fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }

                        Button(
                            onClick = { PrintHelper.printOrderInvoice(context, order, appConfig) },
                            modifier = Modifier.weight(1f),
                            colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Icon(Icons.Default.FileDownload, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(stringResource(R.string.download_invoice), fontSize = 11.sp, fontWeight = FontWeight.Bold)
                        }
                    }

                    // Track Button
                    if (order.orderStatus in listOf(OrderStatus.OUT_FOR_DELIVERY, OrderStatus.SHIPPED, OrderStatus.PICKED_UP)) {
                        Spacer(modifier = Modifier.height(10.dp))
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
                        Spacer(modifier = Modifier.height(10.dp))
                        OutlinedButton(
                            onClick = { onCancelClick(order) },
                            modifier = Modifier.fillMaxWidth(),
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = Color.Red),
                            border = BorderStroke(1.dp, Color.Red),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Icon(Icons.Default.Close, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Cancel Order", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                        }
                    }

                    // Return & Refund Status Section
                    val isRefunded = order.status == "RETURNED" || order.status == "REFUNDED" || order.refundStatus == "REFUNDED" || order.returnStatus == "RETURN_COMPLETED"
                    val isReturnPending = order.returnStatus.isNotBlank() && !isRefunded

                    if (isRefunded) {
                        Spacer(modifier = Modifier.height(10.dp))
                        Surface(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(8.dp),
                            color = Color(0xFFE8F5E9),
                            border = BorderStroke(1.dp, Color(0xFFA5D6A7))
                        ) {
                            Row(
                                modifier = Modifier.padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Color(0xFF2E7D32), modifier = Modifier.size(20.dp))
                                Spacer(modifier = Modifier.width(10.dp))
                                Column {
                                    Text("Return & Refund Completed", fontWeight = FontWeight.Bold, fontSize = 13.sp, color = Color(0xFF1B5E20))
                                    val amt = if (order.refundAmount > 0) "₹${order.refundAmount.toInt()}" else "₹${order.totalAmount.toInt()}"
                                    Text("$amt has been credited to your Wallet.", fontSize = 12.sp, color = Color(0xFF2E7D32))
                                }
                            }
                        }
                    } else if (isReturnPending) {
                        Spacer(modifier = Modifier.height(10.dp))
                        Surface(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(8.dp),
                            color = Color(0xFFFFF8E1),
                            border = BorderStroke(1.dp, Color(0xFFFFD54F))
                        ) {
                            Row(
                                modifier = Modifier.padding(12.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Icon(Icons.Default.HourglassTop, contentDescription = null, tint = Color(0xFFE65100), modifier = Modifier.size(20.dp))
                                Spacer(modifier = Modifier.width(10.dp))
                                Column {
                                    Text("Return Request Under Review", fontWeight = FontWeight.Bold, fontSize = 13.sp, color = Color(0xFFE65100))
                                    Text("Our rider/support team is processing your request.", fontSize = 12.sp, color = Color(0xFFBF360C))
                                }
                            }
                        }
                    } else if (order.orderStatus == OrderStatus.DELIVERED) {
                        val returnState by viewModel.uiState.collectAsState()

                        LaunchedEffect(returnState.returnRequestResource) {
                            if (returnState.returnRequestResource is Resource.Success) {
                                Toast.makeText(context, "Return request submitted successfully!", Toast.LENGTH_LONG).show()
                                viewModel.clearReturnState()
                                viewModel.loadOrders()
                            } else if (returnState.returnRequestResource is Resource.Error) {
                                Toast.makeText(context, "Error: ${returnState.returnRequestResource?.message}", Toast.LENGTH_LONG).show()
                                viewModel.clearReturnState()
                            }
                        }

                        Spacer(modifier = Modifier.height(10.dp))
                        OutlinedButton(
                            onClick = { onReturnClick(order) },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(44.dp),
                            enabled = returnState.returnRequestResource !is Resource.Loading,
                            colors = ButtonDefaults.outlinedButtonColors(contentColor = PrimaryGreen),
                            border = BorderStroke(1.2.dp, PrimaryGreen),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            if (returnState.returnRequestResource is Resource.Loading) {
                                CircularProgressIndicator(modifier = Modifier.size(18.dp), strokeWidth = 2.dp, color = PrimaryGreen)
                            } else {
                                Icon(Icons.Default.Refresh, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(6.dp))
                                Text("Return Items", fontWeight = FontWeight.Bold, fontSize = 12.sp)
                            }
                        }
                    }
                }
            }
        }
    }
}

/**
 * Status Badge matching the Reference Image:
 * Pill shape with contextual color for Delivered, Refunded, Return In Progress, Cancelled, etc.
 */
@Composable
fun ReferenceStatusBadge(order: Order) {
    val isRefunded = order.status == "RETURNED" || order.status == "REFUNDED" || order.refundStatus == "REFUNDED" || order.returnStatus == "RETURN_COMPLETED"
    val isReturnRequested = order.returnStatus.isNotBlank() && !isRefunded

    val label = when {
        isRefunded -> "Refunded"
        isReturnRequested -> "Return In Progress"
        order.orderStatus == OrderStatus.DELIVERED -> "Delivered"
        order.orderStatus == OrderStatus.CANCELLED -> "Cancelled"
        order.orderStatus == OrderStatus.OUT_FOR_DELIVERY -> "Out for Delivery"
        else -> order.orderStatus.displayName
    }

    val (bgColor, borderColor, textColor) = when {
        isRefunded -> Triple(Color(0xFFFFF8E1), Color(0xFFFFD54F), Color(0xFFF57F17))
        isReturnRequested -> Triple(Color(0xFFFFF8E1), Color(0xFFFFD54F), Color(0xFFF57F17))
        order.orderStatus == OrderStatus.DELIVERED -> Triple(Color(0xFFE8F5E9), Color(0xFFA5D6A7), Color(0xFF388E3C))
        order.orderStatus == OrderStatus.CANCELLED -> Triple(Color(0xFFFFEBEE), Color(0xFFEF9A9A), Color(0xFFD32F2F))
        order.orderStatus == OrderStatus.OUT_FOR_DELIVERY -> Triple(Color(0xFFF3E5F5), Color(0xFFCE93D8), Color(0xFF7B1FA2))
        else -> Triple(Color(0xFFE3F2FD), Color(0xFF90CAF9), Color(0xFF1976D2))
    }

    Surface(
        color = bgColor,
        shape = RoundedCornerShape(16.dp),
        border = BorderStroke(1.dp, borderColor)
    ) {
        Text(
            text = label,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
            fontSize = 12.sp,
            fontWeight = FontWeight.Bold,
            color = textColor
        )
    }
}

@Composable
fun WriteReviewDialog(
    productName: String,
    onDismiss: () -> Unit,
    onSubmit: (Int, String) -> Unit
) {
    var rating by remember { mutableStateOf(5) }
    var reviewText by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Write a Review", fontWeight = FontWeight.Bold) },
        text = {
            Column(modifier = Modifier.fillMaxWidth()) {
                Text(text = productName, fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                Spacer(modifier = Modifier.height(12.dp))
                Text("Tap stars to rate:", fontSize = 12.sp, color = Color.Gray)
                Spacer(modifier = Modifier.height(6.dp))
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    repeat(5) { index ->
                        val starNumber = index + 1
                        Icon(
                            imageVector = if (starNumber <= rating) Icons.Outlined.Star else Icons.Outlined.StarOutline,
                            contentDescription = "Star $starNumber",
                            tint = if (starNumber <= rating) Color(0xFFFFB300) else Color(0xFFCCCCCC),
                            modifier = Modifier
                                .size(28.dp)
                                .clickable { rating = starNumber }
                        )
                    }
                }
                Spacer(modifier = Modifier.height(14.dp))
                OutlinedTextField(
                    value = reviewText,
                    onValueChange = { reviewText = it },
                    placeholder = { Text("Share details of your experience with this product...") },
                    modifier = Modifier.fillMaxWidth(),
                    maxLines = 3
                )
            }
        },
        confirmButton = {
            Button(
                onClick = { onSubmit(rating, reviewText) },
                colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen)
            ) {
                Text("Submit Review")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        }
    )
}

@Composable
fun ReturnRequestDialog(
    order: Order,
    onDismiss: () -> Unit,
    onConfirm: (item: OrderItem, quantity: Int, reason: String, comment: String) -> Unit
) {
    val items = order.items
    var selectedItemIndex by remember { mutableIntStateOf(0) }
    val currentItem = items.getOrNull(selectedItemIndex) ?: items.firstOrNull() ?: OrderItem()

    val maxQty = if (currentItem.quantity > 0) currentItem.quantity else 1
    var returnQty by remember(selectedItemIndex) { mutableIntStateOf(1) }
    var selectedReason by remember { mutableStateOf("") }
    var customerComment by remember { mutableStateOf("") }

    val reasons = listOf(
        "Defective/Damaged",
        "Wrong Item Received",
        "Quality not as expected",
        "Expired Product",
        "Changed my mind"
    )

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.Default.Refresh, contentDescription = null, tint = PrimaryGreen, modifier = Modifier.size(22.dp))
                Spacer(modifier = Modifier.width(8.dp))
                Text("Request Return", fontWeight = FontWeight.Bold, fontSize = 18.sp)
            }
        },
        text = {
            LazyColumn(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                // Item Selector (if multiple items in order)
                if (items.size > 1) {
                    item {
                        Text("Select Item to Return:", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color(0xFF1F2937))
                        Spacer(modifier = Modifier.height(6.dp))
                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            items.forEachIndexed { index, item ->
                                val isSelected = (index == selectedItemIndex)
                                Surface(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable {
                                            selectedItemIndex = index
                                            returnQty = 1
                                        },
                                    shape = RoundedCornerShape(8.dp),
                                    border = BorderStroke(if (isSelected) 1.5.dp else 0.5.dp, if (isSelected) PrimaryGreen else Color.LightGray),
                                    color = if (isSelected) PrimaryGreen.copy(alpha = 0.05f) else Color.White
                                ) {
                                    Row(
                                        modifier = Modifier.padding(8.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        RadioButton(
                                            selected = isSelected,
                                            onClick = {
                                                selectedItemIndex = index
                                                returnQty = 1
                                            },
                                            colors = RadioButtonDefaults.colors(selectedColor = PrimaryGreen)
                                        )
                                        Spacer(modifier = Modifier.width(6.dp))
                                        Column(modifier = Modifier.weight(1f)) {
                                            Text(item.productName, fontWeight = FontWeight.SemiBold, fontSize = 13.sp, maxLines = 1)
                                            Text("Ordered: ${item.quantity} | ₹${item.price.toInt()}", fontSize = 11.sp, color = Color.Gray)
                                        }
                                    }
                                }
                            }
                        }
                    }
                } else if (currentItem.productName.isNotBlank()) {
                    item {
                        Surface(
                            modifier = Modifier.fillMaxWidth(),
                            shape = RoundedCornerShape(8.dp),
                            color = Color(0xFFF9FAFB),
                            border = BorderStroke(0.5.dp, Color.LightGray)
                        ) {
                            Row(modifier = Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.ShoppingBag, contentDescription = null, tint = PrimaryGreen, modifier = Modifier.size(20.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Column {
                                    Text(currentItem.productName, fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                    Text("Ordered Qty: ${currentItem.quantity} | ₹${currentItem.price.toInt()}", fontSize = 11.sp, color = Color.Gray)
                                }
                            }
                        }
                    }
                }

                // Quantity Selector
                item {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text("Return Quantity:", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color(0xFF1F2937))
                            Text("Max: $maxQty", fontSize = 11.sp, color = Color.Gray)
                        }
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            FilledTonalIconButton(
                                onClick = { if (returnQty > 1) returnQty-- },
                                enabled = returnQty > 1,
                                modifier = Modifier.size(32.dp)
                            ) {
                                Icon(Icons.Default.Remove, contentDescription = "Decrease", modifier = Modifier.size(16.dp))
                            }
                            Text(
                                text = "$returnQty",
                                fontWeight = FontWeight.ExtraBold,
                                fontSize = 15.sp,
                                modifier = Modifier.padding(horizontal = 12.dp)
                            )
                            FilledTonalIconButton(
                                onClick = { if (returnQty < maxQty) returnQty++ },
                                enabled = returnQty < maxQty,
                                modifier = Modifier.size(32.dp)
                            ) {
                                Icon(Icons.Default.Add, contentDescription = "Increase", modifier = Modifier.size(16.dp))
                            }
                        }
                    }
                }

                // Return Reason
                item {
                    Text("Reason for Return:", fontSize = 13.sp, fontWeight = FontWeight.Bold, color = Color(0xFF1F2937))
                    Spacer(modifier = Modifier.height(4.dp))
                    Column(modifier = Modifier.fillMaxWidth().selectableGroup()) {
                        reasons.forEach { reason ->
                            val isSelected = (selectedReason == reason)
                            Row(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .selectable(
                                        selected = isSelected,
                                        onClick = { selectedReason = reason },
                                        role = Role.RadioButton
                                    )
                                    .padding(vertical = 4.dp),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                RadioButton(
                                    selected = isSelected,
                                    onClick = null,
                                    colors = RadioButtonDefaults.colors(selectedColor = PrimaryGreen)
                                )
                                Text(text = reason, modifier = Modifier.padding(start = 8.dp), fontSize = 13.sp)
                            }
                        }
                    }
                }

                // Customer Notes / Comment
                item {
                    OutlinedTextField(
                        value = customerComment,
                        onValueChange = { customerComment = it },
                        label = { Text("Additional Comment / Issue (Optional)") },
                        placeholder = { Text("e.g. Seal was broken or expired") },
                        modifier = Modifier.fillMaxWidth(),
                        maxLines = 2,
                        shape = RoundedCornerShape(8.dp)
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = { onConfirm(currentItem, returnQty, selectedReason, customerComment.trim()) },
                enabled = selectedReason.isNotBlank() && currentItem.productId.isNotBlank(),
                colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen)
            ) {
                Text("Submit Request", fontWeight = FontWeight.Bold)
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
                Text("Please select a reason for cancellation:", fontSize = 13.sp)
                Spacer(modifier = Modifier.height(10.dp))

                reasons.forEach { reason ->
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .height(44.dp)
                            .selectable(
                                selected = (reason == selectedReason),
                                onClick = { selectedReason = reason },
                                role = Role.RadioButton
                            ),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        RadioButton(
                            selected = (reason == selectedReason),
                            onClick = null
                        )
                        Text(
                            text = reason,
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.padding(start = 10.dp),
                            fontSize = 13.sp
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
        OrderStatus.PLACED -> Color(0xFF1E88E5)
        OrderStatus.CONFIRMED -> Color(0xFF43A047)
        OrderStatus.ASSIGNED -> Color(0xFF43A047)
        OrderStatus.PROCUREMENT_PENDING -> Color(0xFFFB8C00)
        OrderStatus.PICKED_UP -> Color(0xFFFB8C00)
        OrderStatus.SHIPPED -> Color(0xFFFB8C00)
        OrderStatus.OUT_FOR_DELIVERY -> Color(0xFF8E24AA)
        OrderStatus.DELIVERED -> PrimaryGreen
        OrderStatus.CANCELLED -> Color(0xFFE53935)
        OrderStatus.RETURNED -> Color(0xFF757575)
    }

@Composable
fun OrderTimeline(currentStatus: OrderStatus) {
    val statuses = listOf(
        Pair(OrderStatus.PLACED, "Order has been placed"),
        Pair(OrderStatus.CONFIRMED, "Items are being packed"),
        Pair(OrderStatus.SHIPPED, "Order is on the way"),
        Pair(OrderStatus.OUT_FOR_DELIVERY, "Out for delivery"),
        Pair(OrderStatus.DELIVERED, "Delivered successfully")
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
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier
                .fillMaxWidth()
                .background(Color(0xFFFFEBEE), RoundedCornerShape(8.dp))
                .padding(10.dp)
        ) {
            Icon(Icons.Default.Cancel, contentDescription = null, tint = Color.Red, modifier = Modifier.size(18.dp))
            Spacer(modifier = Modifier.width(8.dp))
            Text("Order Cancelled", color = Color.Red, fontWeight = FontWeight.Bold, fontSize = 13.sp)
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
                    .size(18.dp)
                    .background(
                        color = if (isCompleted) PrimaryGreen else MaterialTheme.colorScheme.outlineVariant,
                        shape = CircleShape
                    ),
                contentAlignment = Alignment.Center
            ) {
                if (isCompleted) {
                    Icon(
                        Icons.Default.Check,
                        contentDescription = null,
                        modifier = Modifier.size(11.dp),
                        tint = Color.White
                    )
                }
            }
            if (!isLast) {
                Box(
                    modifier = Modifier
                        .width(2.dp)
                        .height(28.dp)
                        .background(if (isCompleted && !isActive) PrimaryGreen else MaterialTheme.colorScheme.outlineVariant)
                )
            }
        }
        Spacer(modifier = Modifier.width(12.dp))
        Column(modifier = Modifier.padding(bottom = if (isLast) 0.dp else 12.dp)) {
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
