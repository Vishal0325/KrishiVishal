package com.company.krishivishal.ui.inventory

import androidx.compose.foundation.background
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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.company.krishivishal.core.model.Batch
import com.company.krishivishal.core.model.Sku
import com.company.krishivishal.ui.theme.*
import java.text.SimpleDateFormat
import java.util.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun InventoryDashboardScreen(
    onNavigateBack: () -> Unit,
    viewModel: InventoryViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    var selectedTab by remember { mutableIntStateOf(0) }
    var searchBarcode by remember { mutableStateOf("") }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "Inventory & Stock Management",
                        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { viewModel.loadDashboardData() }) {
                        Icon(Icons.Default.Refresh, contentDescription = "Refresh")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = StitchSurface,
                    titleContentColor = StitchOnSurface
                )
            )
        },
        containerColor = StitchSurface
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
        ) {
            // Summary KPI Cards
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                KpiCard(
                    title = "Low Stock SKUs",
                    count = uiState.lowStockSkus.size.toString(),
                    color = StitchError,
                    icon = Icons.Default.Warning,
                    modifier = Modifier.weight(1f)
                )
                KpiCard(
                    title = "Near Expiry Batches",
                    count = uiState.expiringBatches.size.toString(),
                    color = StitchSecondaryOrange,
                    icon = Icons.Default.DateRange,
                    modifier = Modifier.weight(1f)
                )
            }

            // Quick Barcode Lookup Bar
            OutlinedTextField(
                value = searchBarcode,
                onValueChange = { searchBarcode = it },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                placeholder = { Text("Scan / Type SKU Code or Barcode (e.g. FE-URE-...)") },
                leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
                trailingIcon = {
                    if (searchBarcode.isNotBlank()) {
                        IconButton(onClick = { viewModel.lookupBarcode(searchBarcode) }) {
                            Icon(Icons.Default.ArrowForward, contentDescription = "Search", tint = StitchPrimary)
                        }
                    }
                },
                singleLine = true,
                shape = RoundedCornerShape(12.dp)
            )

            // Scanned SKU Result Card if present
            uiState.scannedSku?.let { sku ->
                ScannedSkuCard(
                    sku = sku,
                    onDismiss = { viewModel.lookupBarcode("") },
                    onAdjustStock = { delta, reason -> viewModel.adjustStock(sku.skuCode, delta, reason) }
                )
            }

            // Tab Selector
            TabRow(
                selectedTabIndex = selectedTab,
                containerColor = StitchSurfaceContainer,
                contentColor = StitchPrimary
            ) {
                Tab(
                    selected = selectedTab == 0,
                    onClick = { selectedTab = 0 },
                    text = { Text("Low Stock (${uiState.lowStockSkus.size})") }
                )
                Tab(
                    selected = selectedTab == 1,
                    onClick = { selectedTab = 1 },
                    text = { Text("Expiring Batches (${uiState.expiringBatches.size})") }
                )
            }

            // Tab Content
            if (uiState.isLoading) {
                Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator(color = StitchPrimary)
                }
            } else {
                when (selectedTab) {
                    0 -> LowStockList(skus = uiState.lowStockSkus)
                    1 -> ExpiringBatchesList(batches = uiState.expiringBatches)
                }
            }
        }
    }
}

@Composable
fun KpiCard(
    title: String,
    count: String,
    color: Color,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier,
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = color.copy(alpha = 0.1f))
    ) {
        Column(modifier = Modifier.padding(12.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
                modifier = Modifier.fillMaxWidth()
            ) {
                Text(title, style = MaterialTheme.typography.labelMedium, color = StitchOnSurfaceVariant)
                Icon(icon, contentDescription = null, tint = color, modifier = Modifier.size(18.dp))
            }
            Spacer(modifier = Modifier.height(4.dp))
            Text(count, style = MaterialTheme.typography.headlineSmall.copy(fontWeight = FontWeight.Bold), color = color)
        }
    }
}

@Composable
fun ScannedSkuCard(
    sku: Sku,
    onDismiss: () -> Unit,
    onAdjustStock: (Int, String) -> Unit
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 6.dp),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = StitchPrimaryContainer.copy(alpha = 0.4f))
    ) {
        Column(modifier = Modifier.padding(14.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    sku.name.ifBlank { sku.skuCode },
                    style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold),
                    color = StitchPrimaryDark
                )
                IconButton(onClick = onDismiss, modifier = Modifier.size(20.dp)) {
                    Icon(Icons.Default.Close, contentDescription = "Dismiss", modifier = Modifier.size(16.dp))
                }
            }
            Text("SKU: ${sku.skuCode}", style = MaterialTheme.typography.bodySmall, color = StitchOutline)
            Spacer(modifier = Modifier.height(6.dp))
            Row(horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                Text("Avail: ${sku.availableStock} ${sku.unit}", fontWeight = FontWeight.SemiBold)
                Text("Committed: ${sku.committedStock}", color = StitchOutline)
                Text("MRP: ₹${sku.mrp}", color = StitchPrimary)
                Text("Price: ₹${sku.consumerPrice}", fontWeight = FontWeight.Bold, color = StitchPrimaryDark)
            }
        }
    }
}

@Composable
fun LowStockList(skus: List<Sku>) {
    if (skus.isEmpty()) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("All SKUs have healthy stock levels!", color = StitchOutline)
        }
    } else {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            items(skus, key = { it.skuCode }) { sku ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(14.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text(sku.name.ifBlank { sku.skuCode }, fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                            Text("SKU: ${sku.skuCode}", style = MaterialTheme.typography.bodySmall, color = StitchOutline)
                            Text("Reorder Threshold: ${sku.reorderLevel}", style = MaterialTheme.typography.labelSmall, color = StitchOutline)
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            Text(
                                "${sku.availableStock} left",
                                fontWeight = FontWeight.Bold,
                                color = if (sku.availableStock <= sku.minStockLimit) StitchError else StitchSecondaryOrange
                            )
                            Text("₹${sku.consumerPrice}", style = MaterialTheme.typography.labelMedium, color = StitchPrimary)
                        }
                    }
                }
            }
        }
    }
}

@Composable
fun ExpiringBatchesList(batches: List<Batch>) {
    if (batches.isEmpty()) {
        Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            Text("No near-expiry batches found.", color = StitchOutline)
        }
    } else {
        val dateFormat = SimpleDateFormat("dd MMM yyyy", Locale.getDefault())
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
            items(batches, key = { it.batchId }) { batch ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(10.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(14.dp),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column(modifier = Modifier.weight(1f)) {
                            Text("Batch: ${batch.batchNumber}", fontWeight = FontWeight.SemiBold, fontSize = 14.sp)
                            Text("SKU: ${batch.skuCode}", style = MaterialTheme.typography.bodySmall, color = StitchOutline)
                            Text("Warehouse: ${batch.warehouseId} | QC: ${batch.qualityStatus}", style = MaterialTheme.typography.labelSmall, color = StitchOutline)
                        }
                        Column(horizontalAlignment = Alignment.End) {
                            val expDateStr = batch.expiryDate?.let { dateFormat.format(Date(it)) } ?: "N/A"
                            Text("Exp: $expDateStr", fontWeight = FontWeight.Bold, color = StitchSecondaryOrange, fontSize = 12.sp)
                            Text("Stock: ${batch.stock}", style = MaterialTheme.typography.bodySmall, color = StitchOnSurface)
                        }
                    }
                }
            }
        }
    }
}
