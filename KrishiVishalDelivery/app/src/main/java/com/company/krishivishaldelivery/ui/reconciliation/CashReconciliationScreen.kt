package com.company.krishivishaldelivery.ui.reconciliation

import android.widget.Toast
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.AccountBalanceWallet
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.company.krishivishaldelivery.ui.dashboard.DashboardViewModel
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.core.model.OrderStatus

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CashReconciliationScreen(
    onNavigateBack: () -> Unit,
    viewModel: DashboardViewModel = hiltViewModel()
) {
    val context = LocalContext.current
    val ordersResource by viewModel.orders.collectAsState()
    val orders = (ordersResource as? Resource.Success)?.data ?: emptyList()
    
    val pendingCashOrders = orders.filter { it.isCOD && it.status == OrderStatus.DELIVERED.name && !it.isCashDeposited }
    val totalPendingAmount = pendingCashOrders.sumOf { it.codAmount }
    
    var isLoading by remember { mutableStateOf(false) }
    var depositSuccess by remember { mutableStateOf(false) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Cash Reconciliation & Vault", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
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
        Column(modifier = Modifier.fillMaxSize().padding(padding).padding(16.dp)) {
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
                            isLoading = true
                            viewModel.markCashAsDeposited { success ->
                                isLoading = false
                                if (success) {
                                    depositSuccess = true
                                    Toast.makeText(context, "नकद सफलतापूर्वक वेयरहाउस में जमा हो गया! अब आप नए ऑर्डर ले सकते हैं।", Toast.LENGTH_LONG).show()
                                } else {
                                    Toast.makeText(context, "जमा करने में त्रुटि आई। कृपया दोबारा प्रयास करें।", Toast.LENGTH_SHORT).show()
                                }
                            }
                        },
                        enabled = totalPendingAmount > 0 && !isLoading,
                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2E7D32)),
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier.fillMaxWidth().height(50.dp)
                    ) {
                        if (isLoading) {
                            CircularProgressIndicator(color = Color.White, modifier = Modifier.size(22.dp))
                        } else {
                            Icon(Icons.Default.CheckCircle, contentDescription = null)
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Mark as Deposited at Warehouse / Office", fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(24.dp))
            Text("Pending COD Orders Details (${pendingCashOrders.size})", fontWeight = FontWeight.Bold, fontSize = 18.sp)
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
    }
}
