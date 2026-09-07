package com.company.krishivishal.ui.wallet

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.fadeIn
import androidx.compose.animation.slideInVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.company.krishivishal.core.model.WalletTransaction
import com.company.krishivishal.ui.components.EmptyState
import com.company.krishivishal.ui.theme.PrimaryGreen
import com.company.krishivishal.ui.theme.DarkGreen
import java.text.SimpleDateFormat
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun WalletScreen(
    onBack: () -> Unit,
    onInitiateTopUpPayment: (razorpayOrderId: String, topUpId: String, amount: Double, keyId: String) -> Unit,
    viewModel: WalletViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    var showTopUpSheet by remember { mutableStateOf(false) }
    val snackbarHostState = remember { SnackbarHostState() }

    // Handle one-time events
    LaunchedEffect(Unit) {
        viewModel.uiEvent.collect { event ->
            when (event) {
                is WalletUiEvent.InitiateTopUpPayment -> {
                    showTopUpSheet = false
                    onInitiateTopUpPayment(
                        event.razorpayOrderId,
                        event.topUpId,
                        event.amount,
                        event.keyId,
                    )
                }
                is WalletUiEvent.TopUpSuccess -> {
                    snackbarHostState.showSnackbar("₹${event.amount.toInt()} added to your wallet!")
                }
                is WalletUiEvent.ShowError -> {
                    snackbarHostState.showSnackbar(event.message)
                }
            }
        }
    }

    Scaffold(
        snackbarHost = { SnackbarHost(snackbarHostState) },
        topBar = {
            TopAppBar(
                title = { Text("My Wallet", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
            )
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(MaterialTheme.colorScheme.background),
            contentPadding = PaddingValues(bottom = 24.dp)
        ) {
            // ── Balance Card ──────────────────────────────────────────────
            item {
                WalletBalanceCard(
                    balance = uiState.balance,
                    onAddMoney = { showTopUpSheet = true }
                )
            }

            // ── Quick Add Amounts ─────────────────────────────────────────
            item {
                QuickAmountRow(onSelect = { amount ->
                    viewModel.updateTopUpAmount(amount.toString())
                    showTopUpSheet = true
                })
            }

            // ── Transaction History Header ────────────────────────────────
            item {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        "Transaction History",
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp
                    )
                    TextButton(onClick = { viewModel.loadHistory() }) {
                        Text("Refresh", color = PrimaryGreen, fontSize = 12.sp)
                    }
                }
            }

            // ── Transaction List ──────────────────────────────────────────
            if (uiState.isHistoryLoading) {
                item {
                    Box(Modifier.fillMaxWidth().padding(32.dp), contentAlignment = Alignment.Center) {
                        CircularProgressIndicator(color = PrimaryGreen, strokeWidth = 2.dp)
                    }
                }
            } else if (uiState.transactions.isEmpty()) {
                item {
                    EmptyState(
                        icon = Icons.Default.AccountBalanceWallet,
                        title = "No transactions yet",
                        description = "Add money to your wallet to get started.",
                        modifier = Modifier.padding(32.dp)
                    )
                }
            } else {
                items(uiState.transactions, key = { it.id }) { txn ->
                    AnimatedVisibility(
                        visible = true,
                        enter = fadeIn() + slideInVertically(initialOffsetY = { it / 4 })
                    ) {
                        TransactionItem(txn)
                    }
                }
            }
        }
    }

    // ── Bottom Sheet: Add Money ───────────────────────────────────────────
    if (showTopUpSheet) {
        ModalBottomSheet(
            onDismissRequest = { showTopUpSheet = false },
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ) {
            TopUpSheet(
                topUpAmount = uiState.topUpAmount,
                isProcessing = uiState.isTopUpProcessing,
                onAmountChange = viewModel::updateTopUpAmount,
                onConfirm = {
                    viewModel.initiateTopUp()
                },
                onDismiss = { showTopUpSheet = false }
            )
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Wallet Balance Card
// ─────────────────────────────────────────────────────────────────────────────
@Composable
private fun WalletBalanceCard(
    balance: Double,
    onAddMoney: () -> Unit
) {
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp)
            .clip(RoundedCornerShape(24.dp))
            .background(
                Brush.linearGradient(
                    colors = listOf(DarkGreen, PrimaryGreen, Color(0xFF81C784))
                )
            )
    ) {
        Column(
            modifier = Modifier.padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        "KrishiWallet",
                        color = Color.White.copy(alpha = 0.85f),
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium,
                        letterSpacing = 1.5.sp
                    )
                    Spacer(Modifier.height(8.dp))
                    Text(
                        "₹${String.format("%,.2f", balance)}",
                        color = Color.White,
                        fontSize = 36.sp,
                        fontWeight = FontWeight.ExtraBold
                    )
                    Text(
                        "Available Balance",
                        color = Color.White.copy(alpha = 0.7f),
                        fontSize = 12.sp,
                        modifier = Modifier.padding(top = 2.dp)
                    )
                }
                Box(
                    modifier = Modifier
                        .size(56.dp)
                        .clip(CircleShape)
                        .background(Color.White.copy(alpha = 0.15f)),
                    contentAlignment = Alignment.Center
                ) {
                    Icon(
                        Icons.Default.AccountBalanceWallet,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(28.dp)
                    )
                }
            }

            Spacer(Modifier.height(20.dp))

            Button(
                onClick = onAddMoney,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Color.White,
                    contentColor = DarkGreen
                ),
                elevation = ButtonDefaults.buttonElevation(defaultElevation = 0.dp)
            ) {
                Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                Spacer(Modifier.width(6.dp))
                Text("Add Money", fontWeight = FontWeight.Bold, fontSize = 14.sp)
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Quick Amount Row
// ─────────────────────────────────────────────────────────────────────────────
@Composable
private fun QuickAmountRow(onSelect: (Int) -> Unit) {
    val amounts = listOf(100, 200, 500, 1000)
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        amounts.forEach { amt ->
            OutlinedButton(
                onClick = { onSelect(amt) },
                modifier = Modifier.weight(1f),
                shape = RoundedCornerShape(10.dp),
                colors = ButtonDefaults.outlinedButtonColors(contentColor = PrimaryGreen),
                border = androidx.compose.foundation.BorderStroke(1.dp, PrimaryGreen.copy(alpha = 0.5f))
            ) {
                Text("₹$amt", fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
            }
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Transaction Row Item
// ─────────────────────────────────────────────────────────────────────────────
@Composable
private fun TransactionItem(txn: WalletTransaction) {
    val dateFormat = remember { SimpleDateFormat("dd MMM yyyy, hh:mm a", Locale.getDefault()) }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 4.dp),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 1.dp)
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Icon bubble
            val (iconRes, bgColor) = if (txn.isCredit) {
                Icons.Default.ArrowDownward to Color(0xFFE8F5E9)
            } else {
                Icons.Default.ArrowUpward to Color(0xFFFFF3E0)
            }
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .clip(CircleShape)
                    .background(bgColor),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    iconRes,
                    contentDescription = null,
                    tint = if (txn.isCredit) Color(0xFF2E7D32) else Color(0xFFE65100),
                    modifier = Modifier.size(20.dp)
                )
            }

            Spacer(Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    txn.typeLabel,
                    fontWeight = FontWeight.SemiBold,
                    fontSize = 14.sp,
                    color = MaterialTheme.colorScheme.onSurface
                )
                if (txn.description.isNotBlank()) {
                    Text(
                        txn.description,
                        fontSize = 12.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 1
                    )
                }
                txn.timestamp?.let {
                    Text(
                        dateFormat.format(it),
                        fontSize = 11.sp,
                        color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
                    )
                }
            }

            Text(
                "${if (txn.isCredit) "+" else "-"}₹${String.format("%,.2f", txn.amount)}",
                fontWeight = FontWeight.Bold,
                fontSize = 15.sp,
                color = if (txn.isCredit) Color(0xFF2E7D32) else Color(0xFFD32F2F)
            )
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Top-Up Bottom Sheet
// ─────────────────────────────────────────────────────────────────────────────
@Composable
private fun TopUpSheet(
    topUpAmount: String,
    isProcessing: Boolean,
    onAmountChange: (String) -> Unit,
    onConfirm: () -> Unit,
    onDismiss: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 24.dp)
            .padding(bottom = 32.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Box(
            modifier = Modifier
                .width(40.dp)
                .height(4.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.onSurface.copy(alpha = 0.2f))
        )
        Spacer(Modifier.height(20.dp))
        Text("Add Money to Wallet", fontWeight = FontWeight.Bold, fontSize = 20.sp)
        Spacer(Modifier.height(6.dp))
        Text(
            "Instant credit via UPI, Cards, or Net Banking",
            fontSize = 13.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center
        )
        Spacer(Modifier.height(24.dp))

        OutlinedTextField(
            value = topUpAmount,
            onValueChange = { onAmountChange(it.filter { c -> c.isDigit() }) },
            label = { Text("Enter Amount (₹)") },
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
            leadingIcon = {
                Text("₹", fontWeight = FontWeight.Bold, fontSize = 18.sp,
                    modifier = Modifier.padding(start = 8.dp))
            },
            shape = RoundedCornerShape(12.dp),
            colors = OutlinedTextFieldDefaults.colors(
                focusedBorderColor = PrimaryGreen,
                focusedLabelColor = PrimaryGreen
            )
        )

        Spacer(Modifier.height(8.dp))
        Text(
            "Min ₹10 · Max ₹1,00,000",
            fontSize = 11.sp,
            color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f)
        )

        Spacer(Modifier.height(20.dp))

        // Quick amounts
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(100, 200, 500, 1000).forEach { amt ->
                FilterChip(
                    selected = topUpAmount == amt.toString(),
                    onClick = { onAmountChange(amt.toString()) },
                    label = { Text("₹$amt", fontSize = 12.sp) },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = PrimaryGreen,
                        selectedLabelColor = Color.White
                    )
                )
            }
        }

        Spacer(Modifier.height(24.dp))

        Button(
            onClick = onConfirm,
            enabled = topUpAmount.isNotBlank() && !isProcessing,
            modifier = Modifier.fillMaxWidth().height(52.dp),
            shape = RoundedCornerShape(14.dp),
            colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen)
        ) {
            if (isProcessing) {
                CircularProgressIndicator(
                    color = Color.White,
                    strokeWidth = 2.dp,
                    modifier = Modifier.size(20.dp)
                )
            } else {
                Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(20.dp))
                Spacer(Modifier.width(6.dp))
                Text(
                    if (topUpAmount.isBlank()) "Add Money" else "Add ₹$topUpAmount",
                    fontWeight = FontWeight.Bold,
                    fontSize = 15.sp
                )
            }
        }

        Spacer(Modifier.height(8.dp))
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center
        ) {
            Icon(Icons.Default.Lock, contentDescription = null,
                modifier = Modifier.size(12.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f))
            Spacer(Modifier.width(4.dp))
            Text("Secured by Razorpay",
                fontSize = 11.sp,
                color = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f))
        }
    }
}
