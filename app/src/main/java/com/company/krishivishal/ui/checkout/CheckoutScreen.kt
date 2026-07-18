package com.company.krishivishal.ui.checkout

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import com.company.krishivishal.data.model.Address
import com.company.krishivishal.ui.theme.PrimaryGreen
import com.company.krishivishal.utils.Resource
import com.company.krishivishal.ui.components.ErrorState
import com.company.krishivishal.ui.address.AddAddressDialog

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CheckoutScreen(
    source: CheckoutSource = CheckoutSource.CART,
    onBack: () -> Unit,
    onOrderSuccess: () -> Unit,
    viewModel: CheckoutViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    var showAddAddressDialog by remember { mutableStateOf(false) }

    LaunchedEffect(source) {
        viewModel.setSource(source)
    }

    LaunchedEffect(uiState.checkoutResource) {
        if (uiState.checkoutResource is Resource.Success) {
            onOrderSuccess()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Secure Checkout", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White)
            )
        },
        bottomBar = {
            if (uiState.checkoutItems.isNotEmpty()) {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shadowElevation = 8.dp,
                    color = Color.White
                ) {
                    Column(modifier = Modifier.padding(16.dp).navigationBarsPadding()) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column {
                                Text("Amount Payable", fontSize = 12.sp, color = Color.Gray)
                                Text("₹${uiState.totals.grandTotal.toInt()}", fontSize = 22.sp, fontWeight = FontWeight.ExtraBold, color = PrimaryGreen)
                            }
                            if (uiState.totals.totalSavings > 0) {
                                Surface(color = Color(0xFFE8F5E9), shape = RoundedCornerShape(4.dp)) {
                                    Text(
                                        "Saved ₹${uiState.totals.totalSavings.toInt()}", 
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                        color = Color(0xFF2E7D32),
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                            }
                        }
                        Spacer(modifier = Modifier.height(16.dp))
                        Button(
                            onClick = { viewModel.placeOrder() },
                            modifier = Modifier.fillMaxWidth().height(52.dp),
                            enabled = uiState.selectedAddress != null && uiState.checkoutResource !is Resource.Loading,
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen)
                        ) {
                            if (uiState.checkoutResource is Resource.Loading) {
                                CircularProgressIndicator(modifier = Modifier.size(24.dp), color = Color.White, strokeWidth = 2.dp)
                            } else {
                                Text("Confirm Order", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                            }
                        }
                    }
                }
            }
        }
    ) { padding ->
        Box(modifier = Modifier.fillMaxSize().padding(padding).background(Color(0xFFF8F9FA))) {
            when {
                uiState.isCartLoading || uiState.isAddressesLoading -> {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.Center), color = PrimaryGreen)
                }
                uiState.error != null -> {
                    ErrorState(
                        message = uiState.error!!,
                        onRetry = { viewModel.clearError() },
                        modifier = Modifier.align(Alignment.Center)
                    )
                }
                else -> {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        // Address Section
                        item {
                            SectionHeader("Delivery Address", "Change", onAction = { showAddAddressDialog = true })
                            Spacer(modifier = Modifier.height(8.dp))
                            
                            if (uiState.addresses.isEmpty()) {
                                OutlinedButton(
                                    onClick = { showAddAddressDialog = true },
                                    modifier = Modifier.fillMaxWidth(),
                                    shape = RoundedCornerShape(12.dp),
                                    border = BorderStroke(1.dp, PrimaryGreen)
                                ) {
                                    Icon(Icons.Default.AddLocationAlt, contentDescription = null, tint = PrimaryGreen)
                                    Spacer(modifier = Modifier.width(8.dp))
                                    Text("Add Delivery Address", color = PrimaryGreen)
                                }
                            } else {
                                uiState.addresses.take(3).forEach { addr ->
                                    AddressRadioItem(
                                        address = addr,
                                        isSelected = uiState.selectedAddress?.id == addr.id,
                                        onSelect = { viewModel.selectAddress(addr) }
                                    )
                                    Spacer(modifier = Modifier.height(8.dp))
                                }
                            }
                        }

                        // Order Summary Section
                        item {
                            SectionHeader("Order Items", "${uiState.checkoutItems.size} total")
                        }

                        items(uiState.checkoutItems) { item ->
                            OrderSummaryItem(item)
                        }

                        // Price Details Section
                        item {
                            com.company.krishivishal.ui.cart.PriceBreakdownCard(uiState.totals)
                        }

                        // Payment Method Section
                        item {
                            SectionHeader("Payment Method")
                            Spacer(modifier = Modifier.height(8.dp))
                            PaymentMethodCard()
                        }

                        item { Spacer(modifier = Modifier.height(100.dp)) }
                    }
                }
            }

            if (showAddAddressDialog) {
                AddAddressDialog(
                    onDismiss = { showAddAddressDialog = false },
                    onSave = { name, mobile, house, street, ward, pin, block, district, state, landmark, isDefault, type ->
                        viewModel.addAddress(name, mobile, house, street, ward, pin, block, district, state, landmark, isDefault, type)
                        showAddAddressDialog = false
                    }
                )
            }
            
            // Error Snackbar
            uiState.error?.let { msg ->
                LaunchedEffect(msg) {
                    kotlinx.coroutines.delay(3000)
                    viewModel.clearError()
                }
                Surface(
                    modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 120.dp, start = 16.dp, end = 16.dp),
                    color = Color.Black.copy(alpha = 0.9f),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text(msg, color = Color.White, modifier = Modifier.padding(12.dp), fontSize = 14.sp)
                }
            }
        }
    }
}

@Composable
fun SectionHeader(title: String, actionText: String? = null, onAction: () -> Unit = {}) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(title, fontWeight = FontWeight.Bold, fontSize = 15.sp, color = Color.DarkGray)
        if (actionText != null) {
            Text(
                actionText, 
                color = PrimaryGreen, 
                fontSize = 13.sp, 
                fontWeight = FontWeight.Bold,
                modifier = Modifier.clickable { onAction() }
            )
        }
    }
}

@Composable
fun OrderSummaryItem(item: com.company.krishivishal.data.model.CartWithProduct) {
    val sellingPrice = item.variant?.price ?: if (item.product.discountedPrice > 0) item.product.discountedPrice else if (item.product.price > 0) item.product.price else item.product.basePrice
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(1.dp, Color(0xFFF1F3F5))
    ) {
        Row(modifier = Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
            AsyncImage(
                model = item.product.images.firstOrNull() ?: item.product.imageUrl,
                contentDescription = null,
                modifier = Modifier.size(50.dp).clip(RoundedCornerShape(8.dp)),
                contentScale = ContentScale.Fit
            )
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(item.product.name, maxLines = 1, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                val variant = item.variant?.label ?: item.variant?.size ?: item.product.weight
                Text("${item.cartItem.quantity} x $variant", fontSize = 12.sp, color = Color.Gray)
            }
            Text("₹${(sellingPrice * item.cartItem.quantity).toInt()}", fontWeight = FontWeight.Bold, color = Color.Black)
        }
    }
}

@Composable
fun PaymentMethodCard() {
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(1.dp, Color(0xFFF1F3F5))
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                Icons.Default.Payments, 
                contentDescription = null, 
                tint = Color(0xFFFF9800),
                modifier = Modifier.size(24.dp)
            )
            Spacer(modifier = Modifier.width(12.dp))
            Column {
                Text("Cash on Delivery (COD)", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                Text("Pay at your doorstep", fontSize = 12.sp, color = Color.Gray)
            }
            Spacer(modifier = Modifier.weight(1f))
            RadioButton(selected = true, onClick = null, colors = RadioButtonDefaults.colors(selectedColor = PrimaryGreen))
        }
    }
}

@Composable
fun AddressRadioItem(address: Address, isSelected: Boolean, onSelect: () -> Unit) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onSelect() },
        shape = RoundedCornerShape(12.dp),
        color = Color.White,
        border = if (isSelected) BorderStroke(2.dp, PrimaryGreen) else BorderStroke(1.dp, Color(0xFFF1F3F5))
    ) {
        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            RadioButton(selected = isSelected, onClick = onSelect, colors = RadioButtonDefaults.colors(selectedColor = PrimaryGreen))
            Spacer(modifier = Modifier.width(8.dp))
            Column {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(address.fullName, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                    Spacer(modifier = Modifier.width(8.dp))
                    Surface(color = Color(0xFFF1F3F5), shape = RoundedCornerShape(4.dp)) {
                        Text(address.addressType, modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp), fontSize = 10.sp, fontWeight = FontWeight.Bold)
                    }
                }
                Text("${address.houseNo}, ${address.street}, ${address.block}", fontSize = 12.sp, color = Color.Gray, maxLines = 1)
                Text("${address.district}, ${address.state} - ${address.pincode}", fontSize = 12.sp, color = Color.Gray)
            }
        }
    }
}
