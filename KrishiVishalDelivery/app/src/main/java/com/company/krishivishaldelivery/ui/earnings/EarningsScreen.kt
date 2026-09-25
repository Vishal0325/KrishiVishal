package com.company.krishivishaldelivery.ui.earnings

import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.collectAsState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.hilt.navigation.compose.hiltViewModel
import com.company.krishivishal.core.model.AppConfig
import com.company.krishivishal.core.model.Order
import com.company.krishivishal.core.model.OrderStatus
import com.company.krishivishal.core.util.Resource
import com.company.krishivishaldelivery.data.model.IncentiveSlab
import com.company.krishivishaldelivery.data.model.PayoutRequest
import com.company.krishivishaldelivery.data.model.Rider
import java.util.Calendar
import java.text.SimpleDateFormat
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun EarningsScreen(
    viewModel: EarningsViewModel = hiltViewModel(),
    onNavigateToReconciliation: () -> Unit = {}
) {
    val context = LocalContext.current
    val ordersResource by viewModel.orders.collectAsState()
    val returnsResource by viewModel.returns.collectAsState()
    val appConfigResource by viewModel.appConfig.collectAsState()
    val payoutsResource by viewModel.payouts.collectAsState()
    val payoutRequestsResource by viewModel.payoutRequests.collectAsState()
    val riderProfile by viewModel.riderProfile.collectAsState()
    val isSubmittingPayout by viewModel.isSubmittingPayout.collectAsState()
    val incentiveSlabs by viewModel.incentiveSlabs.collectAsState()
    
    val orders = (ordersResource as? Resource.Success)?.data ?: emptyList()
    val returns = (returnsResource as? Resource.Success)?.data ?: emptyList()
    val config = (appConfigResource as? Resource.Success)?.data ?: AppConfig()
    val payoutLogs = (payoutsResource as? Resource.Success)?.data ?: emptyList()
    val payoutRequests = (payoutRequestsResource as? Resource.Success)?.data ?: emptyList()
    
    var selectedFilter by remember { mutableStateOf("Today") }
    var showWithdrawDialog by remember { mutableStateOf(false) }

    val commissionPerOrder = if (config.commissionPerOrder > 0) config.commissionPerOrder else 20.0
    val commissionPerReturn = if (config.commissionPerReturn > 0) config.commissionPerReturn else 25.0

    // Today's Live Calculation for Rider Incentive Screen
    val todayOrders = orders.filter {
        val cal1 = Calendar.getInstance().apply { time = it.createdAt }
        val cal2 = Calendar.getInstance()
        cal1.get(Calendar.YEAR) == cal2.get(Calendar.YEAR) &&
        cal1.get(Calendar.DAY_OF_YEAR) == cal2.get(Calendar.DAY_OF_YEAR)
    }
    val todayDeliveredCount = todayOrders.count { it.status == OrderStatus.DELIVERED.name }
    val todayCommission = todayDeliveredCount * commissionPerOrder

    val todayReturns = returns.filter {
        val returnDate = it.hubDepositedAt ?: it.qcCompletedAt ?: it.createdAt
        val cal1 = Calendar.getInstance().apply { time = returnDate }
        val cal2 = Calendar.getInstance()
        cal1.get(Calendar.YEAR) == cal2.get(Calendar.YEAR) &&
        cal1.get(Calendar.DAY_OF_YEAR) == cal2.get(Calendar.DAY_OF_YEAR)
    }
    val todayReturnsPickedCount = todayReturns.count { it.status == "PICKED_UP" || it.status == "HUB_RECEIVED" || it.status == "COMPLETED" || it.status == "REFUNDED" }
    val todayReturnCommission = todayReturnsPickedCount * commissionPerReturn

    val achievedBonus = incentiveSlabs.lastOrNull { it.ordersRequired <= todayDeliveredCount }?.bonusAmount ?: 0.0
    val nextSlab = incentiveSlabs.firstOrNull { it.ordersRequired > todayDeliveredCount }
    val todayTotalEarnings = todayCommission + todayReturnCommission + achievedBonus

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

    val filteredReturns = when(selectedFilter) {
        "Today" -> todayReturns
        "Last 7 Days" -> {
            val sevenDaysAgo = System.currentTimeMillis() - (7 * 24 * 60 * 60 * 1000)
            returns.filter { (it.hubDepositedAt ?: it.qcCompletedAt ?: it.createdAt).time >= sevenDaysAgo }
        }
        "This Month" -> {
            val oneMonthAgo = System.currentTimeMillis() - (30L * 24 * 60 * 60 * 1000)
            returns.filter { (it.hubDepositedAt ?: it.qcCompletedAt ?: it.createdAt).time >= oneMonthAgo }
        }
        else -> returns
    }.filter { it.status == "PICKED_UP" || it.status == "HUB_RECEIVED" || it.status == "COMPLETED" || it.status == "REFUNDED" }

    // Logic for Cash to Deposit (COD Vault)
    val cashToDeposit = orders
        .filter { it.isCOD && it.status == OrderStatus.DELIVERED.name && !it.isCashDeposited }
        .sumOf { it.codAmount }

    val inBagReturnsCount = returns.count { it.status == "PICKED_UP" }
    
    val totalEarningsPotential = (filteredOrders.filter { it.status == OrderStatus.DELIVERED.name }.size * commissionPerOrder) +
            (filteredReturns.size * commissionPerReturn)

    // Lifetime total earnings
    val allDeliveredOrders = orders.filter { it.status == OrderStatus.DELIVERED.name }
    val allCompletedReturns = returns.filter { it.status == "PICKED_UP" || it.status == "HUB_RECEIVED" || it.status == "COMPLETED" || it.status == "REFUNDED" }
    val totalLifetimeEarnings = (allDeliveredOrders.size * commissionPerOrder) + (allCompletedReturns.size * commissionPerReturn)

    // Withdrawn / Settled amounts
    val transferredPayoutRequestsAmount = payoutRequests.filter { it.status == "TRANSFERRED" }.sumOf { it.amount }
    val pendingPayoutRequestsAmount = payoutRequests.filter { it.status == "PENDING" }.sumOf { it.amount }
    val legacyPayoutLogsAmount = payoutLogs.sumOf { (it["amount"] as? Number)?.toDouble() ?: 0.0 }
    
    val totalSettledAmount = transferredPayoutRequestsAmount + legacyPayoutLogsAmount
    val availableWithdrawableBalance = (totalLifetimeEarnings - totalSettledAmount - pendingPayoutRequestsAmount).coerceAtLeast(0.0)

    Scaffold(
        topBar = {
            TopAppBar(
                title = { 
                    Column {
                        Text("कमाई और निकासी", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                        Text("Earnings & Wallet Payouts", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.surface
                )
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(MaterialTheme.colorScheme.background)
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            item {
                EarningSummaryCard(
                    total = totalEarningsPotential,
                    availableBalance = availableWithdrawableBalance,
                    pendingWithdrawalAmount = pendingPayoutRequestsAmount,
                    totalWithdrawn = totalSettledAmount,
                    filter = selectedFilter,
                    onWithdrawClick = {
                        showWithdrawDialog = true
                    }
                )
            }

            item {
                Row(
                    modifier = Modifier.fillMaxWidth(), 
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    val filters = listOf("Today", "Last 7 Days", "This Month", "All Time")
                    filters.forEach { filter ->
                        Surface(
                            onClick = { selectedFilter = filter },
                            color = if (selectedFilter == filter) MaterialTheme.colorScheme.primary else Color(0xFFF3F4F6),
                            shape = RoundedCornerShape(16.dp)
                        ) {
                            Text(
                                filter,
                                modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Medium,
                                color = if (selectedFilter == filter) Color.White else Color.DarkGray
                            )
                        }
                    }
                }
            }

            // In-Bag Returns Alert Card (if items need to be deposited at hub)
            if (inBagReturnsCount > 0) {
                item {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF8E1)),
                        shape = RoundedCornerShape(16.dp),
                        border = BorderStroke(1.5.dp, Color(0xFFFFB300))
                    ) {
                        Row(
                            modifier = Modifier.padding(16.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = Color(0xFFFF8F00).copy(alpha = 0.15f),
                                modifier = Modifier.size(44.dp)
                            ) {
                                Box(contentAlignment = Alignment.Center) {
                                    Text("🎒", fontSize = 22.sp)
                                }
                            }
                            Spacer(modifier = Modifier.width(12.dp))
                            Column {
                                Text(
                                    text = "$inBagReturnsCount Return Items in Bag",
                                    fontWeight = FontWeight.Bold,
                                    fontSize = 14.sp,
                                    color = Color(0xFFE65100)
                                )
                                Text(
                                    text = "Deposit at Hub to complete handover & get ₹${(inBagReturnsCount * commissionPerReturn).toInt()} credited.",
                                    fontSize = 12.sp,
                                    color = Color(0xFFB45309)
                                )
                            }
                        }
                    }
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
                        Spacer(modifier = Modifier.height(12.dp))
                        Button(
                            onClick = onNavigateToReconciliation,
                            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2E7D32)),
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier.fillMaxWidth().height(44.dp)
                        ) {
                            Icon(Icons.Default.ReceiptLong, contentDescription = null, modifier = Modifier.size(16.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("नकद जमा करें व रसीदें देखें (Vault & Receipts)", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                        }
                    }
                }
            }

            item {
                Text("Performance Stats", fontWeight = FontWeight.Bold, fontSize = 18.sp)
            }

            item {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                    val deliveredCount = filteredOrders.count { it.status == OrderStatus.DELIVERED.name }
                    StatCard("Deliveries", "$deliveredCount (₹${(deliveredCount * commissionPerOrder).toInt()})", Icons.Default.LocalShipping, Modifier.weight(1f))
                    StatCard("Returns", "${filteredReturns.size} (₹${(filteredReturns.size * commissionPerReturn).toInt()})", Icons.Default.Sync, Modifier.weight(1f))
                }
            }

            // ── Recent Payout / Withdrawal Requests Section ──
            if (payoutRequests.isNotEmpty()) {
                item {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text("Withdrawal Requests (निकासी अनुरोध)", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                    }
                }

                items(payoutRequests.size) { index ->
                    WithdrawalRequestItem(payoutRequests[index])
                }
            }

            // ── Recent Deliveries Section ──
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
                    HistoryItem(deliveredOrders[index], commissionPerOrder)
                }
            }

            // ── Recent Return Pickups Section ──
            if (filteredReturns.isNotEmpty()) {
                item {
                    Spacer(modifier = Modifier.height(8.dp))
                    Text("Recent Return Pickups", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                }

                items(filteredReturns.size) { index ->
                    ReturnHistoryItem(filteredReturns[index], commissionPerReturn)
                }
            }

            if (payoutLogs.isNotEmpty()) {
                item {
                    Spacer(modifier = Modifier.height(16.dp))
                    Text("Settlement History (खाते में जमा)", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                }
                
                items(payoutLogs.size) { index ->
                    val log = payoutLogs[index]
                    PayoutLogItem(log)
                }
            }
        }
    }

    if (showWithdrawDialog) {
        WithdrawalRequestDialog(
            pendingBalance = availableWithdrawableBalance,
            riderProfile = riderProfile,
            isLoading = isSubmittingPayout,
            onDismiss = { showWithdrawDialog = false },
            onSubmit = { amount, method, upi, bank, notes ->
                viewModel.requestPayout(
                    amount = amount,
                    paymentMethod = method,
                    upiId = upi,
                    bankDetails = bank,
                    notes = notes,
                    onSuccess = { msg ->
                        Toast.makeText(context, msg, Toast.LENGTH_LONG).show()
                        showWithdrawDialog = false
                    },
                    onError = { err ->
                        Toast.makeText(context, err, Toast.LENGTH_LONG).show()
                    }
                )
            }
        )
    }
}

/**
 * Withdrawal Request Dialog for Rider
 */
@Composable
fun WithdrawalRequestDialog(
    pendingBalance: Double,
    riderProfile: Rider?,
    isLoading: Boolean,
    onDismiss: () -> Unit,
    onSubmit: (amount: Double, method: String, upiId: String, bankDetails: Map<String, String>?, notes: String) -> Unit
) {
    var amountText by remember { mutableStateOf("") }
    var selectedMethod by remember { mutableStateOf("UPI") } // "UPI" or "BANK"
    var upiId by remember { mutableStateOf(riderProfile?.upiId ?: "") }
    var bankAccount by remember { mutableStateOf(riderProfile?.bankAccount ?: "") }
    var bankName by remember { mutableStateOf(riderProfile?.bankName ?: "") }
    var ifscCode by remember { mutableStateOf(riderProfile?.ifscCode ?: "") }
    var notes by remember { mutableStateOf("") }
    var errorMessage by remember { mutableStateOf<String?>(null) }

    Dialog(onDismissRequest = { if (!isLoading) onDismiss() }) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            shape = RoundedCornerShape(24.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            elevation = CardDefaults.cardElevation(8.dp)
        ) {
            Column(
                modifier = Modifier
                    .padding(20.dp)
                    .fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(14.dp)
            ) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column {
                        Text(
                            text = "🏦 पैसे निकालें (Withdraw)",
                            fontWeight = FontWeight.Bold,
                            fontSize = 18.sp,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Text(
                            text = "उपलब्ध बैलेंस: ₹${pendingBalance.toInt()}",
                            fontSize = 13.sp,
                            color = Color(0xFF2E7D32),
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                    IconButton(onClick = onDismiss, enabled = !isLoading) {
                        Icon(Icons.Default.Close, contentDescription = "Close")
                    }
                }

                HorizontalDivider()

                // Quick Amount Chips
                Text("राशि चुनें (Select Amount)", fontSize = 12.sp, fontWeight = FontWeight.Medium, color = Color.Gray)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    val quickAmounts = listOf(100, 500, 1000)
                    quickAmounts.forEach { amt ->
                        if (amt <= pendingBalance) {
                            Surface(
                                shape = RoundedCornerShape(12.dp),
                                color = if (amountText == amt.toString()) MaterialTheme.colorScheme.primary else Color(0xFFF3F4F6),
                                modifier = Modifier
                                    .weight(1f)
                                    .clickable {
                                        amountText = amt.toString()
                                        errorMessage = null
                                    }
                            ) {
                                Text(
                                    text = "₹$amt",
                                    fontSize = 13.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = if (amountText == amt.toString()) Color.White else Color.Black,
                                    modifier = Modifier
                                        .padding(vertical = 8.dp)
                                        .wrapContentWidth(Alignment.CenterHorizontally)
                                )
                            }
                        }
                    }
                    if (pendingBalance >= 100) {
                        Surface(
                            shape = RoundedCornerShape(12.dp),
                            color = if (amountText == pendingBalance.toInt().toString()) MaterialTheme.colorScheme.primary else Color(0xFFE8F5E9),
                            modifier = Modifier
                                .weight(1f)
                                .clickable {
                                    amountText = pendingBalance.toInt().toString()
                                    errorMessage = null
                                }
                        ) {
                            Text(
                                text = "All (₹${pendingBalance.toInt()})",
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold,
                                color = if (amountText == pendingBalance.toInt().toString()) Color.White else Color(0xFF1B5E20),
                                modifier = Modifier
                                    .padding(vertical = 8.dp)
                                    .wrapContentWidth(Alignment.CenterHorizontally)
                            )
                        }
                    }
                }

                // Amount Text Field
                OutlinedTextField(
                    value = amountText,
                    onValueChange = {
                        amountText = it
                        errorMessage = null
                    },
                    label = { Text("निकासी राशि (₹)") },
                    placeholder = { Text("उदा. 500") },
                    leadingIcon = { Icon(Icons.Default.CurrencyRupee, contentDescription = null, tint = MaterialTheme.colorScheme.primary) },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    singleLine = true
                )

                // Method Selector
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = if (selectedMethod == "UPI") MaterialTheme.colorScheme.primary.copy(alpha = 0.15f) else Color(0xFFF3F4F6),
                        border = BorderStroke(1.5.dp, if (selectedMethod == "UPI") MaterialTheme.colorScheme.primary else Color.Transparent),
                        modifier = Modifier
                            .weight(1f)
                            .clickable { selectedMethod = "UPI" }
                    ) {
                        Row(
                            modifier = Modifier.padding(10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.Center
                        ) {
                            Icon(Icons.Default.PhoneAndroid, contentDescription = null, tint = if (selectedMethod == "UPI") MaterialTheme.colorScheme.primary else Color.Gray, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("UPI / QR", fontWeight = FontWeight.Bold, fontSize = 13.sp, color = if (selectedMethod == "UPI") MaterialTheme.colorScheme.primary else Color.Gray)
                        }
                    }

                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = if (selectedMethod == "BANK") MaterialTheme.colorScheme.primary.copy(alpha = 0.15f) else Color(0xFFF3F4F6),
                        border = BorderStroke(1.5.dp, if (selectedMethod == "BANK") MaterialTheme.colorScheme.primary else Color.Transparent),
                        modifier = Modifier
                            .weight(1f)
                            .clickable { selectedMethod = "BANK" }
                    ) {
                        Row(
                            modifier = Modifier.padding(10.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.Center
                        ) {
                            Icon(Icons.Default.AccountBalance, contentDescription = null, tint = if (selectedMethod == "BANK") MaterialTheme.colorScheme.primary else Color.Gray, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("Bank Account", fontWeight = FontWeight.Bold, fontSize = 13.sp, color = if (selectedMethod == "BANK") MaterialTheme.colorScheme.primary else Color.Gray)
                        }
                    }
                }

                if (selectedMethod == "UPI") {
                    OutlinedTextField(
                        value = upiId,
                        onValueChange = { upiId = it },
                        label = { Text("UPI ID (GooglePay / PhonePe / Paytm)") },
                        placeholder = { Text("उदा. 9876543210@upi") },
                        leadingIcon = { Icon(Icons.Default.Payment, contentDescription = null) },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        singleLine = true
                    )
                } else {
                    OutlinedTextField(
                        value = bankAccount,
                        onValueChange = { bankAccount = it },
                        label = { Text("खाता संख्या (Account Number)") },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        singleLine = true,
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number)
                    )
                    OutlinedTextField(
                        value = ifscCode,
                        onValueChange = { ifscCode = it.uppercase() },
                        label = { Text("IFSC कोड") },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        singleLine = true
                    )
                    OutlinedTextField(
                        value = bankName,
                        onValueChange = { bankName = it },
                        label = { Text("बैंक का नाम (उदा. SBI / HDFC)") },
                        modifier = Modifier.fillMaxWidth(),
                        shape = RoundedCornerShape(12.dp),
                        singleLine = true
                    )
                }

                // Error text if any
                if (errorMessage != null) {
                    Text(
                        text = errorMessage ?: "",
                        color = MaterialTheme.colorScheme.error,
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium
                    )
                }

                Text(
                    text = "ℹ️ न्यूनतम निकासी ₹100 है। अनुरोध 24 घंटे के अंदर एडमिन द्वारा बैंक/UPI में ट्रांसफर कर दिया जाएगा।",
                    fontSize = 11.sp,
                    color = Color.Gray,
                    lineHeight = 15.sp
                )

                Button(
                    onClick = {
                        val parsedAmount = amountText.toDoubleOrNull()
                        if (parsedAmount == null || parsedAmount < 100) {
                            errorMessage = "कृपया कम से कम ₹100 की राशि दर्ज करें।"
                            return@Button
                        }
                        if (parsedAmount > pendingBalance) {
                            errorMessage = "राशि उपलब्ध बैलेंस (₹${pendingBalance.toInt()}) से अधिक नहीं हो सकती।"
                            return@Button
                        }
                        if (selectedMethod == "UPI" && upiId.isBlank()) {
                            errorMessage = "कृपया मान्य UPI ID दर्ज करें।"
                            return@Button
                        }
                        if (selectedMethod == "BANK" && (bankAccount.isBlank() || ifscCode.isBlank())) {
                            errorMessage = "कृपया बैंक खाता और IFSC कोड दर्ज करें।"
                            return@Button
                        }

                        val bankDetails = if (selectedMethod == "BANK") {
                            mapOf(
                                "bankAccount" to bankAccount.trim(),
                                "bankName" to bankName.trim(),
                                "ifscCode" to ifscCode.trim()
                            )
                        } else null

                        onSubmit(parsedAmount, selectedMethod, upiId.trim(), bankDetails, notes.trim())
                    },
                    enabled = !isLoading,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2E7D32))
                ) {
                    if (isLoading) {
                        CircularProgressIndicator(color = Color.White, modifier = Modifier.size(22.dp), strokeWidth = 2.dp)
                    } else {
                        Icon(Icons.Default.Send, contentDescription = null, tint = Color.White, modifier = Modifier.size(18.dp))
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("अनुरोध भेजें (Submit Request)", fontWeight = FontWeight.Bold, fontSize = 15.sp, color = Color.White)
                    }
                }
            }
        }
    }
}

/**
 * Item showing past withdrawal request status
 */
@Composable
fun WithdrawalRequestItem(request: PayoutRequest) {
    val dateStr = (request.requestedAt ?: request.createdAt)?.let {
        SimpleDateFormat("dd MMM yyyy, hh:mm a", Locale.getDefault()).format(it)
    } ?: "Recent"

    val (statusLabel, statusBg, statusText, statusBorder) = when (request.status) {
        "TRANSFERRED" -> Quad("✅ सफल (Transferred)", Color(0xFFE8F5E9), Color(0xFF2E7D32), Color(0xFFA5D6A7))
        "REJECTED" -> Quad("❌ निरस्त (Rejected)", Color(0xFFFFEBEE), Color(0xFFC62828), Color(0xFFEF9A9A))
        else -> Quad("⏳ विचाराधीन (Pending)", Color(0xFFFFF8E1), Color(0xFFE65100), Color(0xFFFFE082))
    }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(2.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Surface(
                        shape = RoundedCornerShape(10.dp),
                        color = Color(0xFF2E7D32).copy(alpha = 0.1f),
                        modifier = Modifier.size(38.dp)
                    ) {
                        Box(contentAlignment = Alignment.Center) {
                            Icon(Icons.Default.AccountBalanceWallet, contentDescription = null, tint = Color(0xFF2E7D32), modifier = Modifier.size(20.dp))
                        }
                    }
                    Spacer(modifier = Modifier.width(10.dp))
                    Column {
                        Text(
                            text = "₹${request.amount.toInt()}",
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 18.sp,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                        Text(
                            text = dateStr,
                            fontSize = 11.sp,
                            color = Color.Gray
                        )
                    }
                }

                Surface(
                    shape = RoundedCornerShape(8.dp),
                    color = statusBg,
                    border = BorderStroke(1.dp, statusBorder)
                ) {
                    Text(
                        text = statusLabel,
                        color = statusText,
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(10.dp))
            HorizontalDivider(color = Color(0xFFF3F4F6))
            Spacer(modifier = Modifier.height(10.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = "Method: ${request.paymentMethod}" + if (request.paymentMethod == "UPI" && request.upiId.isNotBlank()) " (${request.upiId})" else "",
                    fontSize = 12.sp,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontWeight = FontWeight.Medium
                )
                if (request.status == "TRANSFERRED" && request.transactionRef.isNotBlank()) {
                    Text(
                        text = "Ref: ${request.transactionRef}",
                        fontSize = 11.sp,
                        color = Color(0xFF2E7D32),
                        fontWeight = FontWeight.Bold
                    )
                }
            }

            if (request.status == "REJECTED" && request.rejectionReason.isNotBlank()) {
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = "कारण: ${request.rejectionReason}",
                    fontSize = 11.sp,
                    color = Color(0xFFC62828),
                    fontWeight = FontWeight.Medium
                )
            }
        }
    }
}

private data class Quad<A, B, C, D>(val first: A, val second: B, val third: C, val fourth: D)

@Composable
fun PayoutLogItem(log: Map<String, Any>) {
    val amount = (log["amount"] as? Number)?.toDouble() ?: 0.0
    val paidAt = log["paidAt"] as? com.google.firebase.Timestamp
    val dateStr = paidAt?.toDate()?.let { 
        SimpleDateFormat("dd MMM yyyy, hh:mm a", Locale.getDefault()).format(it) 
    } ?: "Recent"

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
fun EarningSummaryCard(
    total: Double,
    availableBalance: Double,
    pendingWithdrawalAmount: Double = 0.0,
    totalWithdrawn: Double = 0.0,
    filter: String,
    onWithdrawClick: () -> Unit = {}
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color.Transparent),
        shape = RoundedCornerShape(16.dp),
        elevation = CardDefaults.cardElevation(2.dp)
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .background(
                    brush = androidx.compose.ui.graphics.Brush.linearGradient(
                        colors = listOf(Color(0xFF22C55E), Color(0xFF15803D))
                    )
                )
                .padding(20.dp)
        ) {
            Column {
                Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                    Text("Potential Earnings", color = Color(0xFFDCFCE7), fontSize = 13.sp, fontWeight = FontWeight.Medium)
                    Surface(
                        color = Color.White.copy(alpha = 0.2f),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Text(
                            filter, 
                            color = Color.White, 
                            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
                            fontSize = 10.sp,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
                
                Spacer(modifier = Modifier.height(4.dp))
                Text("₹${total.toInt()}", color = Color.White, fontSize = 32.sp, fontWeight = FontWeight.Bold)
                
                Spacer(modifier = Modifier.height(14.dp))
                
                Surface(
                    color = Color.White.copy(alpha = 0.2f),
                    shape = RoundedCornerShape(12.dp),
                    border = BorderStroke(1.dp, Color.White.copy(alpha = 0.3f))
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 14.dp, vertical = 10.dp)
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(Icons.Default.AccountBalanceWallet, contentDescription = null, tint = Color(0xFFFDE047), modifier = Modifier.size(18.dp))
                                Spacer(modifier = Modifier.width(8.dp))
                                Column {
                                    Text(
                                        "उपलब्ध निकासी बैलेंस (Available)", 
                                        color = Color.White.copy(alpha = 0.85f),
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Medium
                                    )
                                    Text("₹${availableBalance.toInt()}", color = Color.White, fontWeight = FontWeight.Bold, fontSize = 17.sp)
                                }
                            }
                            
                            if (pendingWithdrawalAmount > 0) {
                                Surface(
                                    color = Color(0xFFFEF08A),
                                    shape = RoundedCornerShape(8.dp),
                                    border = BorderStroke(1.dp, Color(0xFFCA8A04))
                                ) {
                                    Text(
                                        "⏳ ₹${pendingWithdrawalAmount.toInt()} Pending",
                                        color = Color(0xFF713F12),
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 11.sp,
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                    )
                                }
                            } else if (availableBalance >= 100) {
                                Button(
                                    onClick = onWithdrawClick,
                                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFFDE047)),
                                    shape = RoundedCornerShape(10.dp),
                                    contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                                    modifier = Modifier.height(34.dp)
                                ) {
                                    Text(
                                        "पैसे निकालें",
                                        color = Color(0xFF1B5E20),
                                        fontWeight = FontWeight.ExtraBold,
                                        fontSize = 12.sp
                                    )
                                }
                            }
                        }

                        if (totalWithdrawn > 0) {
                            Spacer(modifier = Modifier.height(6.dp))
                            Text(
                                "कुल प्राप्त निकासी (Paid Payouts): ₹${totalWithdrawn.toInt()}",
                                fontSize = 11.sp,
                                color = Color.White.copy(alpha = 0.8f),
                                fontWeight = FontWeight.Medium
                            )
                        }
                    }
                }
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

@Composable
fun ReturnHistoryItem(request: com.company.krishivishal.core.model.ReturnRequest, commission: Double) {
    val isHubDeposited = request.status == "HUB_RECEIVED" || request.status == "COMPLETED" || request.status == "REFUNDED"
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
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        text = "Return #${request.id.takeLast(6).uppercase()}",
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Surface(
                        color = if (isHubDeposited) Color(0xFFE8F5E9) else Color(0xFFFFF8E1),
                        shape = RoundedCornerShape(8.dp),
                        border = BorderStroke(1.dp, if (isHubDeposited) Color(0xFFA5D6A7) else Color(0xFFFFD54F))
                    ) {
                        Text(
                            text = if (isHubDeposited) "🏢 Hub Deposited" else "🎒 In Rider Bag",
                            color = if (isHubDeposited) Color(0xFF2E7D32) else Color(0xFFE65100),
                            fontSize = 10.sp,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp)
                        )
                    }
                }
                Text(
                    text = request.productName,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium
                )
                val custName = request.customerName.ifBlank { "Customer" }
                Text(
                    text = "Customer: $custName",
                    color = Color.Gray,
                    fontSize = 11.sp
                )
            }
            Column(horizontalAlignment = Alignment.End) {
                Text(
                    text = "+₹${commission.toInt()}",
                    fontWeight = FontWeight.Bold,
                    color = Color(0xFF2E7D32),
                    fontSize = 16.sp
                )
                Text(
                    text = "Reverse Comm.",
                    fontSize = 10.sp,
                    color = Color.Gray
                )
            }
        }
    }
}

