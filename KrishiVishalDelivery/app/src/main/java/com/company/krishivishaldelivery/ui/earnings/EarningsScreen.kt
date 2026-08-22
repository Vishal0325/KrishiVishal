package com.company.krishivishaldelivery.ui.earnings

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

import androidx.hilt.navigation.compose.hiltViewModel
import com.company.krishivishal.core.model.Order
import com.company.krishivishaldelivery.ui.dashboard.DeliveryViewModel
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.core.model.AppConfig

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EarningsScreen(viewModel: DeliveryViewModel = hiltViewModel()) {
    val ordersResource by viewModel.orders.collectAsState()
    val appConfigResource by viewModel.appConfig.collectAsState()
    val payoutsResource by viewModel.payouts.collectAsState()
    
    val orders = (ordersResource as? Resource.Success)?.data ?: emptyList()
    val config = (appConfigResource as? Resource.Success)?.data ?: AppConfig()
    val payoutLogs = (payoutsResource as? Resource.Success)?.data ?: emptyList()
    
    var selectedFilter by remember { mutableStateOf("All Time") }

    val filteredOrders = when(selectedFilter) {
        "Last 7 Days" -> {
            val sevenDaysAgo = System.currentTimeMillis() - (7 * 24 * 60 * 60 * 1000)
            orders.filter { it.createdAt.time >= sevenDaysAgo }
        }
        "This Month" -> {
            val oneMonthAgo = System.currentTimeMillis() - (30L * 24 * 60 * 60 * 1000)
            orders.filter { it.createdAt.time >= oneMonthAgo }
        }
        else -> orders
    }

    // Logic for Cash to Deposit
    val cashToDeposit = orders
        .filter { it.isCOD && it.status == "DELIVERED" && !it.isCashDeposited } 
        .sumOf { it.codAmount }
    
    val totalEarningsPotential = filteredOrders
        .filter { it.status == "DELIVERED" }
        .sumOf { config.commissionPerOrder }

    val settledAmount = payoutLogs.sumOf { (it["amount"] as? Number)?.toDouble() ?: 0.0 }
    val pendingSettlement = (totalEarningsPotential - settledAmount).coerceAtLeast(0.0)

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Earnings & History", fontWeight = FontWeight.Bold) },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color(0xFF2E7D32),
                    titleContentColor = Color.White
                )
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
            item {
                EarningSummaryCard(totalEarningsPotential, pendingSettlement, selectedFilter)
            }

            item {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(
                        selected = selectedFilter == "All Time",
                        onClick = { selectedFilter = "All Time" },
                        label = { Text("All Time") }
                    )
                    FilterChip(
                        selected = selectedFilter == "Last 7 Days",
                        onClick = { selectedFilter = "Last 7 Days" },
                        label = { Text("Last 7 Days") }
                    )
                    FilterChip(
                        selected = selectedFilter == "This Month",
                        onClick = { selectedFilter = "This Month" },
                        label = { Text("This Month") }
                    )
                }
            }

            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF3E0)),
                    shape = RoundedCornerShape(16.dp)
                ) {
                    Column(modifier = Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Text("Cash to Deposit (Admin)", color = Color(0xFFE65100), fontWeight = FontWeight.Medium)
                        Text("₹$cashToDeposit", color = Color(0xFFE65100), fontSize = 32.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }

            item {
                Text("Performance Stats", fontWeight = FontWeight.Bold, fontSize = 18.sp)
            }

            item {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    StatCard("Orders", "125", Icons.Default.History, Modifier.weight(1f))
                    StatCard("Avg Pay", "₹240", Icons.Default.Payments, Modifier.weight(1f))
                }
            }

            item {
                Text("Recent Deliveries", fontWeight = FontWeight.Bold, fontSize = 18.sp)
            }

            val deliveredOrders = filteredOrders.filter { it.status == "DELIVERED" }
            if (deliveredOrders.isEmpty()) {
                item {
                    Text("No delivered orders in this period.", color = Color.Gray, fontSize = 14.sp)
                }
            } else {
                items(deliveredOrders.size) { index ->
                    HistoryItem(deliveredOrders[index], config.commissionPerOrder)
                }
            }

            if (payoutLogs.isNotEmpty()) {
                item {
                    Spacer(modifier = Modifier.height(16.dp))
                    Text("Payout History", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                }
                
                items(payoutLogs.size) { index ->
                    val log = payoutLogs[index]
                    PayoutLogItem(log)
                }
            }
        }
    }
}

@Composable
fun PayoutLogItem(log: Map<String, Any>) {
    val amount = (log["amount"] as? Number)?.toDouble() ?: 0.0
    val paidAt = log["paidAt"] as? com.google.firebase.Timestamp
    val dateStr = paidAt?.toDate()?.toLocaleString() ?: "Recent"

    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color(0xFFF1F8E9)),
        elevation = CardDefaults.cardElevation(1.dp)
    ) {
        Row(
            modifier = Modifier.padding(16.dp).fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text("Payment Received", fontWeight = FontWeight.Bold, color = Color(0xFF1B5E20))
                Text(dateStr, color = Color.Gray, fontSize = 12.sp)
            }
            Text("₹$amount", fontWeight = FontWeight.Black, fontSize = 18.sp, color = Color(0xFF1B5E20))
        }
    }
}

@Composable
fun EarningSummaryCard(total: Double, pending: Double, filter: String) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color(0xFF2E7D32)),
        shape = RoundedCornerShape(16.dp)
    ) {
        Column(modifier = Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text("Total Potential Earnings", color = Color.White.copy(alpha = 0.8f))
            Text("₹$total", color = Color.White, fontSize = 36.sp, fontWeight = FontWeight.Bold)
            
            if (pending > 0) {
                Spacer(modifier = Modifier.height(8.dp))
                Surface(
                    color = Color.White.copy(alpha = 0.1f),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text(
                        "Pending Settle: ₹$pending", 
                        color = Color.Yellow, 
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
            
            Spacer(modifier = Modifier.height(12.dp))
            Surface(
                color = Color.White.copy(alpha = 0.2f),
                shape = RoundedCornerShape(20.dp)
            ) {
                Text(
                    filter, 
                    color = Color.White, 
                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 4.dp),
                    fontSize = 12.sp
                )
            }
        }
    }
}

@Composable
fun StatCard(title: String, value: String, icon: ImageVector, modifier: Modifier) {
    Card(
        modifier = modifier,
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(2.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Icon(icon, contentDescription = null, tint = Color(0xFF2E7D32))
            Spacer(modifier = Modifier.height(8.dp))
            Text(title, color = Color.Gray, fontSize = 14.sp)
            Text(value, fontWeight = FontWeight.Bold, fontSize = 20.sp)
        }
    }
}

@Composable
fun HistoryItem(order: Order, commission: Double) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(1.dp)
    ) {
        Row(
            modifier = Modifier.padding(16.dp).fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text("Order #${order.id.takeLast(6)}", fontWeight = FontWeight.Medium)
                Text(order.createdAt.toString(), color = Color.Gray, fontSize = 12.sp)
            }
            Text("₹$commission", fontWeight = FontWeight.Bold, color = Color(0xFF2E7D32))
        }
    }
}
