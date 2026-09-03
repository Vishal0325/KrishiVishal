package com.company.krishivishaldelivery.ui.earnings

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.company.krishivishal.core.model.AppConfig
import com.company.krishivishal.core.model.Order
import com.company.krishivishal.core.model.OrderStatus
import com.company.krishivishal.core.util.Resource
import com.company.krishivishaldelivery.data.model.IncentiveSlab
import java.util.Calendar

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EarningsScreen(viewModel: EarningsViewModel = hiltViewModel()) {
    val ordersResource by viewModel.orders.collectAsState()
    val appConfigResource by viewModel.appConfig.collectAsState()
    val payoutsResource by viewModel.payouts.collectAsState()
    val incentiveSlabs by viewModel.incentiveSlabs.collectAsState()
    
    val orders = (ordersResource as? Resource.Success)?.data ?: emptyList()
    val config = (appConfigResource as? Resource.Success)?.data ?: AppConfig()
    val payoutLogs = (payoutsResource as? Resource.Success)?.data ?: emptyList()
    
    var selectedFilter by remember { mutableStateOf("All Time") }

    // Today's Live Calculation for Rider Incentive Screen
    val todayOrders = orders.filter {
        val cal1 = Calendar.getInstance().apply { time = it.createdAt }
        val cal2 = Calendar.getInstance()
        cal1.get(Calendar.YEAR) == cal2.get(Calendar.YEAR) &&
        cal1.get(Calendar.DAY_OF_YEAR) == cal2.get(Calendar.DAY_OF_YEAR)
    }
    val todayDeliveredCount = todayOrders.count { it.status == OrderStatus.DELIVERED.name }
    val commissionPerOrder = if (config.commissionPerOrder > 0) config.commissionPerOrder else 50.0
    val todayCommission = todayDeliveredCount * commissionPerOrder
    val achievedBonus = incentiveSlabs.lastOrNull { it.ordersRequired <= todayDeliveredCount }?.bonusAmount ?: 0.0
    val nextSlab = incentiveSlabs.firstOrNull { it.ordersRequired > todayDeliveredCount }
    val todayTotalEarnings = todayCommission + achievedBonus

    val filteredOrders = when(selectedFilter) {
        "Today" -> todayOrders
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

    // Logic for Cash to Deposit (COD Vault)
    val cashToDeposit = orders
        .filter { it.isCOD && it.status == OrderStatus.DELIVERED.name && !it.isCashDeposited }
        .sumOf { it.codAmount }
    
    val totalEarningsPotential = filteredOrders
        .filter { it.status == OrderStatus.DELIVERED.name }
        .sumOf { config.commissionPerOrder }

    val settledAmount = payoutLogs.sumOf { (it["amount"] as? Number)?.toDouble() ?: 0.0 }
    val pendingSettlement = (totalEarningsPotential - settledAmount).coerceAtLeast(0.0)

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Rider Wallet & Incentives", fontWeight = FontWeight.Bold) },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primary,
                    titleContentColor = MaterialTheme.colorScheme.onPrimary
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
            // Requirement 4: Live Rider Wallet and Incentive Card
            item {
                LiveRiderIncentiveCard(
                    deliveredCount = todayDeliveredCount,
                    commission = todayCommission,
                    bonus = achievedBonus,
                    total = todayTotalEarnings,
                    nextSlab = nextSlab
                )
            }

            item {
                EarningSummaryCard(totalEarningsPotential, pendingSettlement, selectedFilter)
            }

            item {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    FilterChip(
                        selected = selectedFilter == "Today",
                        onClick = { selectedFilter = "Today" },
                        label = { Text("Today") }
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
                    FilterChip(
                        selected = selectedFilter == "All Time",
                        onClick = { selectedFilter = "All Time" },
                        label = { Text("All Time") }
                    )
                }
            }

            // COD Vault In-Hand Cash Card
            item {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(
                        containerColor = if (cashToDeposit >= 15000.0) Color(0xFFFFEBEE) else Color(0xFFFFF3E0)
                    ),
                    shape = RoundedCornerShape(16.dp),
                    border = BorderStroke(1.dp, if (cashToDeposit >= 15000.0) Color(0xFFEF5350) else Color(0xFFFFCC80))
                ) {
                    Column(modifier = Modifier.padding(20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.AccountBalanceWallet, contentDescription = null, tint = if (cashToDeposit >= 15000.0) Color(0xFFC62828) else Color(0xFFE65100))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = if (cashToDeposit >= 15000.0) "COD Vault (Limit Exceeded)" else "Cash in Hand (Deposit at Warehouse)",
                                color = if (cashToDeposit >= 15000.0) Color(0xFFC62828) else Color(0xFFE65100),
                                fontWeight = FontWeight.Bold
                            )
                        }
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = "₹${cashToDeposit.toInt()}",
                            color = if (cashToDeposit >= 15000.0) Color(0xFFC62828) else Color(0xFFE65100),
                            fontSize = 32.sp,
                            fontWeight = FontWeight.ExtraBold
                        )
                        if (cashToDeposit >= 15000.0) {
                            Spacer(modifier = Modifier.height(4.dp))
                            Text("₹15,000 की सुरक्षा सीमा पार हो चुकी है। कृपया तुरंत वेयरहाउस में कैश जमा करें।", fontSize = 12.sp, color = Color(0xFFB71C1C))
                        }
                    }
                }
            }

            item {
                Text("Performance Stats", fontWeight = FontWeight.Bold, fontSize = 18.sp)
            }

            item {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    val deliveredCount = filteredOrders.count { it.status == OrderStatus.DELIVERED.name }
                    val avgPay = if (deliveredCount != 0) totalEarningsPotential / deliveredCount else 0.0
                    StatCard("Orders", deliveredCount.toString(), Icons.Default.History, Modifier.weight(1f))
                    StatCard("Avg Pay", "₹${avgPay.toInt()}", Icons.Default.Payments, Modifier.weight(1f))
                }
            }

            item {
                Text("Recent Deliveries", fontWeight = FontWeight.Bold, fontSize = 18.sp)
            }

            val deliveredOrders = filteredOrders.filter { it.status == OrderStatus.DELIVERED.name }
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

/**
 * Live Rider Incentive Card
 * Live displays: "आज 10 डिलीवरी पूरी की = ₹500 कमाई + ₹100 बोनस"
 */
@Composable
fun LiveRiderIncentiveCard(
    deliveredCount: Int,
    commission: Double,
    bonus: Double,
    total: Double,
    nextSlab: IncentiveSlab?
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFFE8F5E9)),
        border = BorderStroke(1.5.dp, Color(0xFF4CAF50)),
        elevation = CardDefaults.cardElevation(3.dp)
    ) {
        Column(modifier = Modifier.padding(18.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.MonetizationOn, contentDescription = null, tint = Color(0xFF2E7D32), modifier = Modifier.size(24.dp))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("राइडर वॉलेट और लाइव इंसेंटिव", fontWeight = FontWeight.ExtraBold, fontSize = 16.sp, color = Color(0xFF1B5E20))
                }
                Surface(
                    color = Color(0xFF2E7D32),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text("LIVE", color = Color.White, fontWeight = FontWeight.ExtraBold, fontSize = 11.sp, modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp))
                }
            }

            Spacer(modifier = Modifier.height(14.dp))

            // The exact live earnings formula requested
            Surface(
                color = Color.White,
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier.fillMaxWidth(),
                border = BorderStroke(1.dp, Color(0xFFC8E6C9))
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Text(
                        text = "आज $deliveredCount डिलीवरी पूरी की = ₹${commission.toInt()} कमाई + ₹${bonus.toInt()} बोनस",
                        fontWeight = FontWeight.Black,
                        fontSize = 16.sp,
                        color = Color(0xFF1B5E20),
                        lineHeight = 22.sp
                    )
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = "कुल लाइव कमाई: ₹${total.toInt()}",
                        fontWeight = FontWeight.ExtraBold,
                        fontSize = 20.sp,
                        color = Color(0xFF2E7D32)
                    )
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            if (nextSlab != null) {
                val remaining = nextSlab.ordersRequired - deliveredCount
                val progressFrac = (deliveredCount.toFloat() / nextSlab.ordersRequired).coerceIn(0f, 1f)
                
                Text(
                    text = "अगले ₹${nextSlab.bonusAmount.toInt()} बोनस के लिए केवल $remaining डिलीवरी और बाकी! 🚀",
                    fontWeight = FontWeight.Bold,
                    fontSize = 13.sp,
                    color = Color(0xFF2E7D32)
                )
                Spacer(modifier = Modifier.height(6.dp))
                LinearProgressIndicator(
                    progress = { progressFrac },
                    modifier = Modifier.fillMaxWidth().height(8.dp),
                    color = Color(0xFF2E7D32),
                    trackColor = Color.White
                )
            } else {
                Text(
                    text = "🌟 शानदार! आपने आज के सभी बोनस लक्ष्य प्राप्त कर लिए हैं!",
                    fontWeight = FontWeight.Bold,
                    fontSize = 13.sp,
                    color = Color(0xFF1B5E20)
                )
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
            Text("₹${total.toInt()}", color = Color.White, fontSize = 36.sp, fontWeight = FontWeight.Bold)
            
            if (pending > 0) {
                Spacer(modifier = Modifier.height(8.dp))
                Surface(
                    color = Color.White.copy(alpha = 0.15f),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text(
                        "Pending Settle: ₹${pending.toInt()}", 
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
    val landmark = order.getEffectiveLandmark()
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
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "Order #${order.id.takeLast(6).uppercase()}",
                    fontWeight = FontWeight.Medium,
                    color = MaterialTheme.colorScheme.onSurface
                )
                Text(
                    text = order.userName,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 13.sp
                )
                if (landmark.isNotBlank()) {
                    Text(
                        text = "📍 $landmark",
                        color = Color(0xFFE65100),
                        fontSize = 11.sp
                    )
                }
            }
            Text(
                text = "₹${commission.toInt()}",
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary,
                fontSize = 16.sp
            )
        }
    }
}
