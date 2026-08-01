package com.company.krishivishal.ui.cart

import androidx.compose.animation.*
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import com.company.krishivishal.core.model.CartWithProduct
import com.company.krishivishal.core.model.availableStock
import com.company.krishivishal.core.model.displayVariantLabel
import com.company.krishivishal.ui.theme.PrimaryGreen
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.ui.components.EmptyState
import com.company.krishivishal.ui.components.ErrorState

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun CartScreen(
    onBack: () -> Unit,
    onCheckout: () -> Unit,
    viewModel: CartViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("My Cart (${uiState.cartItems.size})", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    if (uiState.cartItems.any { it.cartItem.isSelected }) {
                        IconButton(onClick = { viewModel.deleteSelected() }) {
                            Icon(Icons.Default.DeleteSweep, contentDescription = "Delete Selected", tint = Color.Red)
                        }
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = Color.White)
            )
        },
        bottomBar = {
            if (uiState.cartItems.isNotEmpty()) {
                val selectedCount = uiState.cartItems.count { it.cartItem.isSelected }
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
                                Text("Total Amount ($selectedCount items)", fontSize = 12.sp, color = Color.Gray)
                                Text("₹${uiState.totals.grandTotal.toInt()}", fontSize = 20.sp, fontWeight = FontWeight.Bold, color = PrimaryGreen)
                            }
                            if (uiState.totals.totalSavings > 0) {
                                Surface(color = Color(0xFFE8F5E9), shape = RoundedCornerShape(4.dp)) {
                                    Text(
                                        "Saved ₹${uiState.totals.totalSavings.toInt()}", 
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                                        color = Color(0xFF2E7D32),
                                        fontSize = 12.sp,
                                        fontWeight = FontWeight.Medium
                                    )
                                }
                            }
                        }
                        Spacer(modifier = Modifier.height(16.dp))
                        Button(
                            onClick = onCheckout,
                            modifier = Modifier.fillMaxWidth().height(50.dp),
                            enabled = selectedCount > 0,
                            shape = RoundedCornerShape(12.dp),
                            colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen)
                        ) {
                            Text("Checkout Selected Items", fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(Color(0xFFF8F9FA))
        ) {
            when {
                uiState.isLoading -> {
                    CircularProgressIndicator(modifier = Modifier.align(Alignment.Center), color = PrimaryGreen)
                }
                uiState.error != null -> {
                    ErrorState(
                        message = uiState.error!!,
                        onRetry = { viewModel.clearError() },
                        modifier = Modifier.align(Alignment.Center)
                    )
                }
                uiState.cartItems.isEmpty() -> {
                    EmptyState(
                        message = "Your cart is empty. Start shopping for quality farm supplies!",
                        icon = Icons.Default.ShoppingCart,
                        modifier = Modifier.align(Alignment.Center)
                    )
                }
                else -> {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(12.dp)
                    ) {
                        item {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically
                            ) {
                                Checkbox(
                                    checked = uiState.isAllSelected,
                                    onCheckedChange = { viewModel.toggleSelectAll(it) },
                                    colors = CheckboxDefaults.colors(checkedColor = PrimaryGreen)
                                )
                                Text("Select All Products", fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                                Spacer(modifier = Modifier.weight(1f))
                                Text(
                                    "${uiState.cartItems.count { it.cartItem.isSelected }}/${uiState.cartItems.size} Selected",
                                    fontSize = 12.sp,
                                    color = Color.Gray
                                )
                            }
                        }

                        items(uiState.cartItems, key = { it.cartItem.id }) { item ->
                            // Temporarily removing SwipeToDismiss to ensure build success while resolving M3 version differences
                            CartListItem(
                                item = item,
                                onIncrease = { viewModel.updateQuantity(item.cartItem, item.cartItem.quantity + 1) },
                                onDecrease = { viewModel.updateQuantity(item.cartItem, item.cartItem.quantity - 1) },
                                onRemove = { viewModel.removeFromCart(item.cartItem) },
                                onSelectionChange = { viewModel.toggleSelection(item.cartItem.id, it) }
                            )
                        }
                        
                        item {
                            PriceBreakdownCard(uiState.totals)
                        }
                        
                        item { Spacer(modifier = Modifier.height(100.dp)) }
                    }
                }
            }
        }
    }
}

@Composable
fun PriceBreakdownCard(totals: com.company.krishivishal.domain.usecase.cart.CartTotals) {
    Card(
        modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
        colors = CardDefaults.cardColors(containerColor = Color.White),
        border = BorderStroke(1.dp, Color(0xFFEEEEEE))
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Text("Price Details (${totals.totalQuantity} Items)", fontWeight = FontWeight.Bold, fontSize = 16.sp)
            HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))
            
            PriceRow("Subtotal (MRP)", "₹${totals.subtotal.toInt()}")
            PriceRow("Product Discount", "-₹${totals.totalDiscount.toInt()}", color = Color(0xFF4CAF50))
            PriceRow("GST (Tax)", "+₹${totals.gstAmount.toInt()}")
            
            if (totals.platformFee > 0) PriceRow("Platform Fee", "₹${totals.platformFee.toInt()}")
            if (totals.handlingCharge > 0) PriceRow("Handling Charge", "₹${totals.handlingCharge.toInt()}")
            if (totals.packagingFee > 0) PriceRow("Packaging Fee", "₹${totals.packagingFee.toInt()}")
            
            PriceRow("Delivery Charges", if (totals.deliveryCharges > 0) "₹${totals.deliveryCharges.toInt()}" else "FREE", color = if (totals.deliveryCharges > 0) Color.Black else Color(0xFF4CAF50))
            
            HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text("Grand Total", fontWeight = FontWeight.Bold, fontSize = 18.sp)
                Text("₹${totals.grandTotal.toInt()}", fontWeight = FontWeight.Bold, fontSize = 18.sp, color = PrimaryGreen)
            }
            
            if (totals.totalSavings > 0) {
                Text(
                    text = "You will save ₹${totals.totalSavings.toInt()} on this order",
                    color = Color(0xFF2E7D32),
                    fontSize = 12.sp,
                    fontWeight = FontWeight.Medium,
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                    textAlign = TextAlign.Center
                )
            }
        }
    }
}

@Composable
fun PriceRow(label: String, value: String, color: Color = Color.Black) {
    Row(
        modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(label, color = Color.Gray, fontSize = 14.sp)
        Text(value, color = color, fontSize = 14.sp, fontWeight = FontWeight.Medium)
    }
}

@Composable
fun CartListItem(
    item: CartWithProduct,
    onIncrease: () -> Unit,
    onDecrease: () -> Unit,
    onRemove: () -> Unit,
    onSelectionChange: (Boolean) -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = if (item.cartItem.isSelected) Color.White else Color(0xFFF1F3F5)),
        border = if (item.cartItem.isSelected) null else BorderStroke(1.dp, Color.LightGray)
    ) {
        Row(
            modifier = Modifier
                .padding(8.dp)
                .fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Checkbox(
                checked = item.cartItem.isSelected,
                onCheckedChange = onSelectionChange,
                colors = CheckboxDefaults.colors(checkedColor = PrimaryGreen)
            )
            
            AsyncImage(
                model = item.product.images.firstOrNull() ?: item.product.imageUrl,
                contentDescription = null,
                modifier = Modifier
                    .size(70.dp)
                    .clip(RoundedCornerShape(8.dp)),
                contentScale = ContentScale.Fit
            )
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                // Product Name and Variant grouped for accessibility
                Column(modifier = Modifier.semantics(mergeDescendants = true) {}) {
                    Text(item.product.name, fontWeight = FontWeight.Bold, fontSize = 14.sp, maxLines = 1)
                    
                    val variantLabel = item.displayVariantLabel()
                    if (variantLabel.isNotBlank()) {
                        Text("Variant: $variantLabel", fontSize = 11.sp, color = Color.Black, fontWeight = FontWeight.Bold)
                    }
                }
                
                val sellingPrice = item.variant?.price ?: if (item.product.discountedPrice > 0) item.product.discountedPrice else if (item.product.price > 0) item.product.price else item.product.basePrice
                val mrp = item.variant?.basePrice ?: if (item.product.mrp > 0) item.product.mrp else item.product.basePrice

                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text("₹${sellingPrice.toInt()}", color = PrimaryGreen, fontWeight = FontWeight.ExtraBold, fontSize = 16.sp)
                    if (mrp > sellingPrice) {
                        Spacer(modifier = Modifier.width(8.dp))
                        Text("₹${mrp.toInt()}", color = Color.Gray, fontSize = 12.sp, textDecoration = androidx.compose.ui.text.style.TextDecoration.LineThrough)
                    }
                }
                
                Spacer(modifier = Modifier.height(8.dp))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    IconButton(
                        onClick = onDecrease, 
                        modifier = Modifier.size(28.dp),
                        colors = IconButtonDefaults.iconButtonColors(containerColor = Color.White)
                    ) {
                        Icon(Icons.Default.Remove, contentDescription = null, tint = Color.Black, modifier = Modifier.size(16.dp))
                    }
                    Text("${item.cartItem.quantity}", modifier = Modifier.padding(horizontal = 12.dp), fontWeight = FontWeight.Bold)
                    
                    val maxStock = item.availableStock()
                    val canIncrease = item.cartItem.quantity < maxStock

                    IconButton(
                        onClick = onIncrease, 
                        enabled = canIncrease,
                        modifier = Modifier.size(28.dp),
                        colors = IconButtonDefaults.iconButtonColors(containerColor = Color.White)
                    ) {
                        Icon(
                            Icons.Default.Add, 
                            contentDescription = null, 
                            tint = if (canIncrease) PrimaryGreen else Color.LightGray,
                            modifier = Modifier.size(16.dp)
                        )
                    }
                }
            }
            IconButton(onClick = onRemove) {
                Icon(Icons.Default.DeleteOutline, contentDescription = null, tint = Color.Red.copy(alpha = 0.6f))
            }
        }
    }
}


