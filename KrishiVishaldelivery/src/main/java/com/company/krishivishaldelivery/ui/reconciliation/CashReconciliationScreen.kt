package com.company.krishivishaldelivery.ui.reconciliation

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.company.krishivishaldelivery.ui.dashboard.DeliveryViewModel
import com.company.krishivishaldelivery.utils.Resource

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CashReconciliationScreen(
    onBack: () -> Unit,
    viewModel: DeliveryViewModel = hiltViewModel()
) {
    val ordersResource by viewModel.orders.collectAsState()
    val orders = (ordersResource as? Resource.Success)?.data ?: emptyList()
    
    val pendingCashOrders = orders.filter { it.isCOD && it.status == "DELIVERED" && !it.isCashDeposited }
    val totalPendingAmount = pendingCashOrders.sumOf { it.codAmount }
    
    var isLoading by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Cash Reconciliation", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color(0xFF2E7D32), titleContentColor = Color.White, navigationIconContentColor = Color.White)
            )
        }
    ) { padding ->
        Column(modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Color(0xFFFFF3E0)),
                shape = RoundedCornerShape(16.dp)
            ) {
                Column(modifier = Modifier.padding(24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("Total COD Cash Pending", color = Color(0xFFE65100))
                    Text("₹$totalPendingAmount", color = Color(0xFFE65100), fontSize = 36.sp, fontWeight = FontWeight.Bold)
                    Spacer(modifier = Modifier.height(16.dp))
                    Button(
                        onClick = {
                            isLoading = true
                            // Logic to mark as deposited in ViewModel/Repository
                            // viewModel.markCashAsDeposited(totalPendingAmount)
                            isLoading = false
                        },
                        enabled = totalPendingAmount > 0 && !isLoading,
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFE65100))
                    ) {
                        Text("Mark as Deposited at Office")
                    }
                }
            }

            Spacer(modifier = Modifier.height(24.dp))
            Text("Pending Orders Details", fontWeight = FontWeight.Bold, fontSize = 18.sp)
            Spacer(modifier = Modifier.height(8.dp))

            if (pendingCashOrders.isEmpty()) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("No pending cash to deposit", color = Color.Gray)
                }
            } else {
                LazyColumn(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    items(pendingCashOrders) { order ->
                        ListItem(
                            headlineContent = { Text("Order #${order.id.takeLast(6)}") },
                            supportingContent = { Text(order.userName) },
                            trailingContent = { Text("₹${order.codAmount}", fontWeight = FontWeight.Bold) },
                            leadingContent = { Icon(Icons.Default.AccountBalanceWallet, contentDescription = null, tint = Color(0xFFE65100)) }
                        )
                        HorizontalDivider(thickness = 0.5.dp, color = Color.LightGray)
                    }
                }
            }
        }
    }
}
