package com.company.krishivishal.ui.admin

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.company.krishivishal.data.model.Coupon
import com.company.krishivishal.ui.theme.PrimaryGreen
import com.company.krishivishal.utils.Resource
import java.util.UUID

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AdminCouponScreen(
    onBack: () -> Unit,
    viewModel: AdminCouponViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    var showAddDialog by remember { mutableStateOf(false) }
    var couponToEdit by remember { mutableStateOf<Coupon?>(null) }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Manage Coupons", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { showAddDialog = true }) {
                        Icon(Icons.Default.Add, contentDescription = "Add Coupon")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White)
            )
        }
    ) { padding ->
        Box(modifier = Modifier.padding(padding).fillMaxSize().background(Color(0xFFF8F9FA))) {
            when (val res = uiState.couponsResource) {
                is Resource.Loading -> CircularProgressIndicator(modifier = Modifier.align(Alignment.Center), color = PrimaryGreen)
                is Resource.Success -> {
                    val coupons = res.data ?: emptyList()
                    if (coupons.isEmpty()) {
                        Text("No coupons available", modifier = Modifier.align(Alignment.Center), color = Color.Gray)
                    } else {
                        LazyColumn(modifier = Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            items(coupons) { coupon ->
                                CouponCard(
                                    coupon = coupon,
                                    onEdit = { couponToEdit = it },
                                    onDelete = { viewModel.deleteCoupon(it.id) }
                                )
                            }
                        }
                    }
                }
                is Resource.Error -> Text("Error: ${res.message}", modifier = Modifier.align(Alignment.Center), color = Color.Red)
                else -> {}
            }
        }

        if (showAddDialog || couponToEdit != null) {
            CouponDialog(
                coupon = couponToEdit ?: Coupon(id = UUID.randomUUID().toString()),
                onDismiss = { 
                    showAddDialog = false
                    couponToEdit = null
                },
                onSave = { 
                    viewModel.saveCoupon(it)
                    showAddDialog = false
                    couponToEdit = null
                }
            )
        }
    }
}

@Composable
fun CouponCard(coupon: Coupon, onEdit: (Coupon) -> Unit, onDelete: (Coupon) -> Unit) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween, verticalAlignment = Alignment.CenterVertically) {
                Text(coupon.code, fontWeight = FontWeight.Black, fontSize = 18.sp, color = PrimaryGreen)
                Row {
                    IconButton(onClick = { onEdit(coupon) }) {
                        Icon(Icons.Default.Edit, null, tint = Color.Gray, modifier = Modifier.size(20.dp))
                    }
                    IconButton(onClick = { onDelete(coupon) }) {
                        Icon(Icons.Default.Delete, null, tint = Color.Red.copy(alpha = 0.6f), modifier = Modifier.size(20.dp))
                    }
                }
            }
            Text(coupon.description, fontSize = 14.sp, color = Color.DarkGray)
            Spacer(modifier = Modifier.height(8.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text("${coupon.discountPercent}% OFF", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                Text("Min: ₹${coupon.minOrderValue.toInt()} | Max: ₹${coupon.maxDiscount.toInt()}", fontSize = 12.sp, color = Color.Gray)
            }
        }
    }
}

@Composable
fun CouponDialog(coupon: Coupon, onDismiss: () -> Unit, onSave: (Coupon) -> Unit) {
    var code by remember { mutableStateOf(coupon.code) }
    var description by remember { mutableStateOf(coupon.description) }
    var discount by remember { mutableStateOf(coupon.discountPercent.toString()) }
    var minOrder by remember { mutableStateOf(coupon.minOrderValue.toString()) }
    var maxDiscount by remember { mutableStateOf(coupon.maxDiscount.toString()) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(if (coupon.code.isEmpty()) "Add Coupon" else "Edit Coupon") },
        text = {
            Column(modifier = Modifier.verticalScroll(rememberScrollState()), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(value = code, onValueChange = { code = it }, label = { Text("Coupon Code") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = description, onValueChange = { description = it }, label = { Text("Description") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = discount, onValueChange = { discount = it }, label = { Text("Discount %") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = minOrder, onValueChange = { minOrder = it }, label = { Text("Min Order Value") }, modifier = Modifier.fillMaxWidth())
                OutlinedTextField(value = maxDiscount, onValueChange = { maxDiscount = it }, label = { Text("Max Discount Amount") }, modifier = Modifier.fillMaxWidth())
            }
        },
        confirmButton = {
            Button(onClick = {
                onSave(coupon.copy(
                    code = code,
                    description = description,
                    discountPercent = discount.toIntOrNull() ?: 0,
                    minOrderValue = minOrder.toDoubleOrNull() ?: 0.0,
                    maxDiscount = maxDiscount.toDoubleOrNull() ?: 0.0
                ))
            }, enabled = code.isNotEmpty()) {
                Text("Save")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Cancel") }
        }
    )
}
