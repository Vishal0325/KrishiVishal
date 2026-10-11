package com.company.krishivishaldelivery.ui.reconciliation

import android.graphics.Bitmap
import android.widget.Toast
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.ReceiptLong
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.hilt.navigation.compose.hiltViewModel
import com.company.krishivishaldelivery.data.model.CashDepositRecord
import com.company.krishivishaldelivery.ui.dashboard.DashboardViewModel
import com.company.krishivishaldelivery.ui.reconciliation.components.CashDepositSlipDialog
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.core.model.OrderStatus
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.functions.FirebaseFunctions
import com.google.zxing.BarcodeFormat
import com.google.zxing.qrcode.QRCodeWriter
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CashReconciliationScreen(
    onNavigateBack: () -> Unit,
    viewModel: DashboardViewModel = hiltViewModel()
) {
    val context = LocalContext.current
    val currentRiderId = remember { FirebaseAuth.getInstance().currentUser?.uid ?: "" }
    val ordersResource by viewModel.orders.collectAsState()
    val depositHistoryResource by viewModel.cashDepositHistory.collectAsState()

    val orders = (ordersResource as? Resource.Success)?.data ?: emptyList()
    val depositHistory = (depositHistoryResource as? Resource.Success)?.data ?: emptyList()
    val riderProfileResource by viewModel.riderProfile.collectAsState()
    val currentRider = (riderProfileResource as? Resource.Success)?.data
    val riderCashInHand by viewModel.cashInHand.collectAsState()

    val pendingCashOrders = orders.filter { it.isCOD && it.status == OrderStatus.DELIVERED.name && !it.isCashDeposited }
    val totalPendingAmount = if (riderCashInHand > 0.0) riderCashInHand else pendingCashOrders.sumOf { if (it.codAmount > 0) it.codAmount else it.totalAmount }
    val pendingOrderIds = pendingCashOrders.map { it.id }
    val riderHubId = currentRider?.hubCode?.ifBlank { "HUB_CENTRAL" } ?: "HUB_CENTRAL"

    var selectedTabIndex by remember { mutableIntStateOf(0) }
    var isLoading by remember { mutableStateOf(false) }
    var activeDepositSlipRecord by remember { mutableStateOf<CashDepositRecord?>(null) }
    var activeSettlementId by remember { mutableStateOf<String?>(null) }
    var showSettlementQrDialog by remember { mutableStateOf(false) }
    val coroutineScope = rememberCoroutineScope()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Cash Vault & Receipts", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
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
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            // Tab Selector Row
            TabRow(
                selectedTabIndex = selectedTabIndex,
                containerColor = Color.White,
                contentColor = Color(0xFF2E7D32)
            ) {
                Tab(
                    selected = selectedTabIndex == 0,
                    onClick = { selectedTabIndex = 0 },
                    text = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.AccountBalanceWallet, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("नकद तिजोरी (Vault)", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                        }
                    }
                )
                Tab(
                    selected = selectedTabIndex == 1,
                    onClick = { selectedTabIndex = 1 },
                    text = {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(Icons.Default.ReceiptLong, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(modifier = Modifier.width(6.dp))
                            Text("जमा रसीदें (${depositHistory.size})", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                        }
                    }
                )
            }

            if (selectedTabIndex == 0) {
                // TAB 1: PENDING VAULT & DEPOSIT ACTION
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(16.dp)
                ) {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(
                            containerColor = if (totalPendingAmount >= DashboardViewModel.COD_VAULT_LIMIT) Color(0xFFFFEBEE) else Color(0xFFFFF3E0)
                        ),
                        shape = RoundedCornerShape(16.dp)
                    ) {
                        Column(modifier = Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                            Text(
                                text = if (totalPendingAmount >= DashboardViewModel.COD_VAULT_LIMIT)
                                    "⚠️ COD Vault Limit Exceeded (₹15,000+)"
                                else
                                    "Total COD Cash in Hand (Vault)",
                                color = if (totalPendingAmount >= DashboardViewModel.COD_VAULT_LIMIT) Color(0xFFC62828) else Color(0xFFE65100),
                                fontWeight = FontWeight.Bold
                            )
                            Spacer(modifier = Modifier.height(6.dp))
                            Text(
                                text = "₹${totalPendingAmount.toInt()}",
                                color = if (totalPendingAmount >= DashboardViewModel.COD_VAULT_LIMIT) Color(0xFFC62828) else Color(0xFFE65100),
                                fontSize = 38.sp,
                                fontWeight = FontWeight.ExtraBold
                            )
                            Spacer(modifier = Modifier.height(16.dp))
                            Button(
                                onClick = {
                                    if (totalPendingAmount <= 0) return@Button
                                    isLoading = true
                                    coroutineScope.launch {
                                        try {
                                            val functions = FirebaseFunctions.getInstance("asia-south1")
                                            val result = functions
                                                .getHttpsCallable("settleRiderCash")
                                                .call(mapOf(
                                                    "action" to "REQUEST_SETTLEMENT",
                                                    "amount" to totalPendingAmount,
                                                    "hubCode" to riderHubId
                                                ))
                                                .await()

                                            isLoading = false
                                            Toast.makeText(context, "✅ ₹${totalPendingAmount.toInt()} submitted to Hub Manager", Toast.LENGTH_LONG).show()
                                            viewModel.onSettlementConfirmed {}
                                            onNavigateBack()
                                        } catch (e: Exception) {
                                            isLoading = false
                                            Toast.makeText(context, "Settlement failed: ${e.message}. Try again.", Toast.LENGTH_LONG).show()
                                        }
                                    }
                                },
                                enabled = totalPendingAmount > 0 && !isLoading,
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2E7D32)),
                                shape = RoundedCornerShape(10.dp),
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .height(50.dp)
                            ) {
                                if (isLoading) {
                                    CircularProgressIndicator(color = Color.White, modifier = Modifier.size(22.dp))
                                } else {
                                    Icon(Icons.Default.AccountBalanceWallet, contentDescription = null)
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text("Request Hub Settlement", fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(20.dp))
                    Text("Pending COD Orders (${pendingCashOrders.size})", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                    Spacer(modifier = Modifier.height(8.dp))

                    if (pendingCashOrders.isEmpty()) {
                        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Color(0xFF2E7D32), modifier = Modifier.size(48.dp))
                                Spacer(modifier = Modifier.height(8.dp))
                                Text("No pending COD cash! Vault is clear.", color = Color.Gray, fontWeight = FontWeight.Medium)
                            }
                        }
                    } else {
                        LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                            items(pendingCashOrders) { order ->
                                ListItem(
                                    headlineContent = { Text("Order #${order.id.takeLast(6).uppercase()}", fontWeight = FontWeight.SemiBold) },
                                    supportingContent = {
                                        Column {
                                            Text(order.userName)
                                            val lm = order.getEffectiveLandmark()
                                            if (lm.isNotBlank()) {
                                                Text("📍 $lm", fontSize = 11.sp, color = Color(0xFFE65100))
                                            }
                                        }
                                    },
                                    trailingContent = { Text("₹${order.codAmount.toInt()}", fontWeight = FontWeight.ExtraBold, fontSize = 16.sp, color = Color(0xFFE65100)) },
                                    leadingContent = { Icon(Icons.Default.AccountBalanceWallet, contentDescription = null, tint = Color(0xFFE65100)) }
                                )
                                HorizontalDivider(thickness = 0.5.dp, color = Color.LightGray)
                            }
                        }
                    }
                }
            } else {
                // TAB 2: DEPOSIT SLIPS & HISTORY
                Column(
                    modifier = Modifier
                        .fillMaxSize()
                        .padding(16.dp)
                ) {
                    Text("Past Cash Deposit Receipts", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                    Spacer(modifier = Modifier.height(8.dp))

                    if (depositHistory.isEmpty()) {
                        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                Icon(Icons.Default.History, contentDescription = null, tint = Color.Gray, modifier = Modifier.size(48.dp))
                                Spacer(modifier = Modifier.height(8.dp))
                                Text("No deposit receipts found yet.", color = Color.Gray, fontWeight = FontWeight.Medium)
                            }
                        }
                    } else {
                        LazyColumn(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            items(depositHistory) { record ->
                                val dateStr = SimpleDateFormat("dd MMM yyyy, hh:mm a", Locale.getDefault()).format(Date(record.depositedAtMillis))
                                val slipId = if (record.id.isNotBlank()) "DEP-${record.id.takeLast(8).uppercase()}" else "DEP-OFFLINE"

                                Card(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .clickable { activeDepositSlipRecord = record },
                                    colors = CardDefaults.cardColors(containerColor = Color.White),
                                    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
                                    shape = RoundedCornerShape(12.dp)
                                ) {
                                    Row(
                                        modifier = Modifier
                                            .padding(16.dp)
                                            .fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween,
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            Surface(
                                                color = Color(0xFFE8F5E9),
                                                shape = RoundedCornerShape(10.dp),
                                                modifier = Modifier.size(44.dp)
                                            ) {
                                                Box(contentAlignment = Alignment.Center) {
                                                    Icon(Icons.Default.ReceiptLong, contentDescription = null, tint = Color(0xFF2E7D32))
                                                }
                                            }
                                            Spacer(modifier = Modifier.width(12.dp))
                                            Column {
                                                Text(slipId, fontWeight = FontWeight.Bold, fontSize = 14.sp, color = Color(0xFF333333))
                                                Text(dateStr, fontSize = 11.sp, color = Color.Gray)
                                                Text("${record.ordersCount} COD Orders Deposited", fontSize = 11.sp, color = Color(0xFF2E7D32), fontWeight = FontWeight.SemiBold)
                                            }
                                        }

                                        Column(horizontalAlignment = Alignment.End) {
                                            Text("₹${record.amount.toInt()}", fontWeight = FontWeight.ExtraBold, fontSize = 18.sp, color = Color(0xFF2E7D32))
                                            Text("Tap to view slip ›", fontSize = 10.sp, color = Color(0xFF1976D2), fontWeight = FontWeight.Bold)
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Digital Deposit Slip Receipt Modal
    activeDepositSlipRecord?.let { record ->
        CashDepositSlipDialog(
            record = record,
            onDismiss = { activeDepositSlipRecord = null }
        )
    }

    if (showSettlementQrDialog && activeSettlementId != null) {
        SettlementQrDialog(
            settlementId = activeSettlementId!!,
            amount = totalPendingAmount,
            onDismiss = {
                showSettlementQrDialog = false
            }
        )
    }
}

@Composable
fun SettlementQrDialog(
    settlementId: String,
    amount: Double,
    onDismiss: () -> Unit
) {
    val qrBitmap = remember(settlementId) {
        try {
            val bitMatrix = QRCodeWriter().encode(
                settlementId,
                BarcodeFormat.QR_CODE,
                512,
                512
            )
            val width = bitMatrix.width
            val height = bitMatrix.height
            val bmp = Bitmap.createBitmap(width, height, Bitmap.Config.RGB_565)
            for (x in 0 until width) {
                for (y in 0 until height) {
                    bmp.setPixel(x, y, if (bitMatrix[x, y]) android.graphics.Color.BLACK else android.graphics.Color.WHITE)
                }
            }
            bmp
        } catch (e: Exception) {
            null
        }
    }

    Dialog(onDismissRequest = onDismiss) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White)
        ) {
            Column(
                modifier = Modifier
                    .padding(20.dp)
                    .fillMaxWidth(),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    "Hub Cash Settlement",
                    fontWeight = FontWeight.Bold,
                    fontSize = 18.sp,
                    color = Color(0xFF2E7D32)
                )
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    "₹${amount.toInt()}",
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 28.sp,
                    color = Color(0xFF1B5E20)
                )
                Text(
                    "ID: ${settlementId.takeLast(8).uppercase()}",
                    fontSize = 12.sp,
                    color = Color.Gray
                )

                Spacer(modifier = Modifier.height(16.dp))

                if (qrBitmap != null) {
                    androidx.compose.foundation.Image(
                        bitmap = qrBitmap.asImageBitmap(),
                        contentDescription = "Settlement QR",
                        modifier = Modifier
                            .size(220.dp)
                            .padding(8.dp)
                    )
                } else {
                    Box(modifier = Modifier.size(220.dp), contentAlignment = Alignment.Center) {
                        Text("Unable to generate QR")
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.Center
                ) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(16.dp),
                        strokeWidth = 2.dp,
                        color = Color(0xFF2E7D32)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    Text(
                        "Waiting for Hub Manager scan...",
                        fontSize = 12.sp,
                        fontWeight = FontWeight.Medium,
                        color = Color(0xFF555555)
                    )
                }

                Spacer(modifier = Modifier.height(16.dp))

                OutlinedButton(
                    onClick = onDismiss,
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text("Close / Keep in Background")
                }
            }
        }
    }
}
