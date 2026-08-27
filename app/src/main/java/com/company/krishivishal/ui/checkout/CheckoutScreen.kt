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
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import com.company.krishivishal.core.model.Address
import com.company.krishivishal.core.model.displayVariantLabel
import com.company.krishivishal.ui.theme.PrimaryGreen
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.ui.components.ErrorState
import com.company.krishivishal.ui.address.AddAddressDialog
import com.razorpay.Checkout
import org.json.JSONObject
import androidx.compose.ui.platform.LocalContext
import android.app.Activity
import android.widget.Toast
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import androidx.compose.ui.res.stringResource
import com.company.krishivishal.R
import com.google.android.gms.location.LocationServices
import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import kotlinx.coroutines.tasks.await

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CheckoutScreen(
    source: CheckoutSource = CheckoutSource.CART,
    onBack: () -> Unit,
    onOrderSuccess: (String, String) -> Unit,
    onLoginRequired: () -> Unit = {},
    viewModel: CheckoutViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    var showAddAddressDialog by remember { mutableStateOf(false) }
    val context = LocalContext.current

    LaunchedEffect(source) {
        viewModel.setSource(source)
    }

    LaunchedEffect(uiState.checkoutResource) {
        // No-op here, handled by uiEvent for better data passing
    }

    LaunchedEffect(Unit) {
        viewModel.uiEvent.collectLatest { event ->
            when (event) {
                is CheckoutUiEvent.InitiatePayment -> {
                    startRazorpay(
                        activity = context as Activity,
                        amount = event.amount,
                        orderId = event.orderId,
                        userEmail = uiState.userEmail,
                        userPhone = uiState.userPhone
                    )
                }
                is CheckoutUiEvent.OrderSuccess -> {
                    onOrderSuccess(event.orderId, event.otp)
                }
            }
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
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
            )
        },
        bottomBar = {
            if (uiState.checkoutItems.isNotEmpty()) {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shadowElevation = 8.dp,
                    color = MaterialTheme.colorScheme.surface
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
                        val isPlacingOrder = uiState.checkoutResource is Resource.Loading
                        val scope = rememberCoroutineScope()
                        val fusedLocationClient = remember { LocationServices.getFusedLocationProviderClient(context) }
                        
                        val locationPermissionLauncher = rememberLauncherForActivityResult(
                            ActivityResultContracts.RequestPermission()
                        ) { isGranted ->
                            if (isGranted) {
                                scope.launch {
                                    try {
                                        val location = fusedLocationClient.lastLocation.await()
                                        viewModel.placeOrder(location?.latitude ?: 0.0, location?.longitude ?: 0.0)
                                    } catch (e: Exception) {
                                        viewModel.placeOrder(0.0, 0.0)
                                    }
                                }
                            } else {
                                viewModel.placeOrder(0.0, 0.0)
                            }
                        }

                        Button(
                            onClick = { 
                                if (!isPlacingOrder) {
                                    if (ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                                        scope.launch {
                                            try {
                                                val location = fusedLocationClient.lastLocation.await()
                                                viewModel.placeOrder(location?.latitude ?: 0.0, location?.longitude ?: 0.0)
                                            } catch (e: Exception) {
                                                viewModel.placeOrder(0.0, 0.0)
                                            }
                                        }
                                    } else {
                                        locationPermissionLauncher.launch(Manifest.permission.ACCESS_FINE_LOCATION)
                                    }
                                }
                            },
                            modifier = Modifier.fillMaxWidth().height(52.dp),
                            enabled = !isPlacingOrder,
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen)
                        ) {
                            if (isPlacingOrder) {
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
        Box(modifier = Modifier.fillMaxSize().padding(padding).background(MaterialTheme.colorScheme.background)) {
            when {
                uiState.isCartLoading || uiState.isAddressesLoading -> {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.Center), color = PrimaryGreen)
                }
                uiState.error != null && uiState.checkoutItems.isEmpty() -> {
                    ErrorState(
                        message = uiState.error ?: "Something went wrong",
                        buttonText = if (uiState.isSessionExpired) "Login" else stringResource(R.string.retry),
                        onRetry = {
                            if (uiState.isSessionExpired) {
                                viewModel.clearError()
                                onLoginRequired()
                            } else {
                                viewModel.clearError()
                                viewModel.setSource(source)
                            }
                        },
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
                            OrderSummaryItem(
                                item = item,
                                onQuantityChange = { newQty -> viewModel.updateQuantity(item.cartItem.id, newQty) },
                                onRemove = { viewModel.removeItem(item.cartItem.id) }
                            )
                        }

                        // Price Details Section
                        item {
                            com.company.krishivishal.ui.cart.PriceBreakdownCard(uiState.totals)
                        }

                        // Payment Method Section
                        item {
                            SectionHeader("Payment Method")
                            Spacer(modifier = Modifier.height(8.dp))
                            
                            if (uiState.paymentOptions.size > 1) {
                                uiState.paymentOptions.forEach { option ->
                                    PaymentMethodItem(
                                        title = option.title,
                                        subtitle = option.subtitle,
                                        icon = option.icon,
                                        iconColor = option.iconColor,
                                        isSelected = uiState.selectedPaymentMethod == option.method,
                                        onSelect = { viewModel.updatePaymentMethod(option.method) }
                                    )
                                    Spacer(modifier = Modifier.height(8.dp))
                                }
                            } else {
                                // Only one option available (usually COD if online disabled)
                                val option = uiState.paymentOptions.firstOrNull() ?: PaymentOption(
                                    method = PaymentMethod.COD,
                                    title = "Cash on delivery",
                                    subtitle = "Pay when order arrives",
                                    icon = Icons.Default.Payments,
                                    iconColor = Color(0xFFFF9800)
                                )
                                PaymentMethodItem(
                                    title = option.title,
                                    subtitle = option.subtitle,
                                    icon = option.icon,
                                    iconColor = option.iconColor,
                                    isSelected = true,
                                    onSelect = {}
                                )
                            }
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
                if (uiState.checkoutItems.isNotEmpty()) {
                    LaunchedEffect(msg) {
                        kotlinx.coroutines.delay(5000)
                        viewModel.clearError()
                    }
                    Surface(
                        modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 120.dp, start = 16.dp, end = 16.dp),
                        color = Color.Black.copy(alpha = 0.9f),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Row(
                            modifier = Modifier.padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(msg, color = Color.White, modifier = Modifier.weight(1f), fontSize = 14.sp)
                            if (uiState.isSessionExpired) {
                                TextButton(onClick = {
                                    viewModel.clearError()
                                    onLoginRequired()
                                }) {
                                    Text("Login", color = PrimaryGreen, fontWeight = FontWeight.Bold)
                                }
                            }
                        }
                    }
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
fun OrderSummaryItem(
    item: com.company.krishivishal.core.model.CartWithProduct,
    onQuantityChange: (Int) -> Unit,
    onRemove: () -> Unit
) {
    val sellingPrice = item.variant?.price ?: if ((item.product?.discountedPrice ?: 0.0) > 0) item.product?.discountedPrice ?: 0.0 else if ((item.product?.price ?: 0.0) > 0) item.product?.price ?: 0.0 else item.product?.basePrice ?: 0.0
    Card(
        modifier = Modifier.fillMaxWidth(),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            AsyncImage(
                model = item.product?.images?.firstOrNull() ?: item.product?.imageUrl,
                contentDescription = null,
                modifier = Modifier
                    .size(52.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(Color(0xFFF8F9FA)),
                contentScale = ContentScale.Fit,
                placeholder = androidx.compose.ui.res.painterResource(R.drawable.ic_placeholder_product)
            )
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                // Group Name and Variant for accessibility
                Column(modifier = Modifier.semantics(mergeDescendants = true) {}) {
                    Text(
                        text = item.product?.name ?: "Unknown Product",
                        maxLines = 1,
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp,
                        overflow = TextOverflow.Ellipsis
                    )
                    
                    val variantLabel = item.displayVariantLabel()
                    if (variantLabel.isNotBlank()) {
                        Text(
                            text = variantLabel,
                            fontSize = 11.sp,
                            color = Color.Black,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }

                Text(
                    text = "₹${sellingPrice.toInt()}",
                    fontSize = 13.sp,
                    color = PrimaryGreen,
                    fontWeight = FontWeight.Medium
                )
            }
            
            // Quantity Controls
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier
                    .background(Color(0xFFF1F3F5), RoundedCornerShape(8.dp))
                    .padding(horizontal = 4.dp)
            ) {
                IconButton(
                    onClick = { if (item.cartItem.quantity > 1) onQuantityChange(item.cartItem.quantity - 1) else onRemove() },
                    modifier = Modifier.size(32.dp)
                ) {
                    Icon(
                        imageVector = if (item.cartItem.quantity > 1) Icons.Default.Remove else Icons.Default.Delete,
                        contentDescription = null,
                        tint = if (item.cartItem.quantity > 1) Color.DarkGray else Color.Red,
                        modifier = Modifier.size(18.dp)
                    )
                }
                
                Text(
                    text = item.cartItem.quantity.toString(),
                    modifier = Modifier.padding(horizontal = 8.dp),
                    fontWeight = FontWeight.Bold,
                    fontSize = 14.sp
                )
                
                IconButton(
                    onClick = { onQuantityChange(item.cartItem.quantity + 1) },
                    modifier = Modifier.size(32.dp)
                ) {
                    Icon(
                        Icons.Default.Add,
                        contentDescription = null,
                        tint = PrimaryGreen,
                        modifier = Modifier.size(18.dp)
                    )
                }
            }
        }
    }
}

@Composable
fun PaymentMethodItem(
    title: String,
    subtitle: String,
    icon: ImageVector,
    iconColor: Color,
    isSelected: Boolean,
    onSelect: () -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onSelect() },
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = BorderStroke(1.dp, if (isSelected) PrimaryGreen else MaterialTheme.colorScheme.outlineVariant)
    ) {
        Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                icon, 
                contentDescription = null, 
                tint = iconColor,
                modifier = Modifier.size(24.dp)
            )
            Spacer(modifier = Modifier.width(12.dp))
            Column {
                Text(title, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                Text(subtitle, fontSize = 12.sp, color = Color.Gray)
            }
            Spacer(modifier = Modifier.weight(1f))
            RadioButton(
                selected = isSelected, 
                onClick = onSelect, 
                colors = RadioButtonDefaults.colors(selectedColor = PrimaryGreen)
            )
        }
    }
}

fun startRazorpay(
    activity: Activity, 
    amount: Double, 
    orderId: String,
    userEmail: String?,
    userPhone: String?
) {
    val checkout = Checkout()
    
    try {
        val options = JSONObject()
        options.put("name", "KrishiVishal")
        options.put("description", "Payment for Order #$orderId")
        options.put("theme.color", "#2E7D32")
        options.put("currency", "INR")
        options.put("amount", (amount * 100).toInt()) // Amount in paise
        
        val prefill = JSONObject()
        prefill.put("email", userEmail ?: "customer@example.com")
        prefill.put("contact", userPhone ?: "9999999999")
        options.put("prefill", prefill)

        checkout.open(activity, options)
    } catch (e: Exception) {
        Toast.makeText(activity, "Error in payment: " + e.message, Toast.LENGTH_LONG).show()
    }
}

@Composable
fun AddressRadioItem(address: Address, isSelected: Boolean, onSelect: () -> Unit) {
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .clickable { onSelect() },
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surface,
        border = if (isSelected) BorderStroke(2.dp, PrimaryGreen) else BorderStroke(1.dp, MaterialTheme.colorScheme.outlineVariant)
    ) {
        Row(modifier = Modifier.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
            RadioButton(selected = isSelected, onClick = onSelect, colors = RadioButtonDefaults.colors(selectedColor = PrimaryGreen))
            Spacer(modifier = Modifier.width(8.dp))
            Column {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(address.fullName, fontWeight = FontWeight.Bold, fontSize = 14.sp)
                    Spacer(modifier = Modifier.width(8.dp))
                    Surface(color = MaterialTheme.colorScheme.surfaceVariant, shape = RoundedCornerShape(4.dp)) {
                        Text(address.addressType, modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp), fontSize = 10.sp, fontWeight = FontWeight.Bold)
                    }
                }
                Text("${address.houseNo}, ${address.street}, ${address.block}", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1)
                Text("${address.district}, ${address.state} - ${address.pincode}", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        }
    }
}
