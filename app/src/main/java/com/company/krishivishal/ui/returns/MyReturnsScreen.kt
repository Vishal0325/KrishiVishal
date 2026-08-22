package com.company.krishivishal.ui.returns

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.company.krishivishal.core.model.ReturnRequest
import com.company.krishivishal.ui.theme.PrimaryGreen
import com.company.krishivishal.ui.components.EmptyState
import java.text.SimpleDateFormat
import java.util.Locale

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MyReturnsScreen(
    onBack: () -> Unit,
    viewModel: MyReturnsViewModel = hiltViewModel()
) {
    val returns by viewModel.returns.collectAsState()
    val isLoading by viewModel.isLoading.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("My Returns", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.surface)
            )
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .background(MaterialTheme.colorScheme.background)
        ) {
            if (isLoading && returns.isEmpty()) {
                CircularProgressIndicator(modifier = Modifier.align(Alignment.Center), color = PrimaryGreen)
            } else if (returns.isEmpty()) {
                EmptyState(
                    icon = Icons.Default.Refresh,
                    title = "No returns",
                    description = "You haven't requested any returns yet.",
                    actionText = "Go Back",
                    onActionClick = onBack
                )
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(returns, key = { it.id }) { returnReq ->
                        ReturnItemCard(returnReq)
                    }
                }
            }
        }
    }
}

@Composable
fun ReturnItemCard(returnRequest: ReturnRequest) {
    val dateFormat = remember { SimpleDateFormat("dd MMM yyyy, hh:mm a", Locale.getDefault()) }

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        elevation = CardDefaults.cardElevation(defaultElevation = 2.dp)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "Return #${returnRequest.id.takeLast(6).uppercase()}",
                        fontWeight = FontWeight.Bold,
                        fontSize = 15.sp
                    )
                    Text(
                        text = dateFormat.format(returnRequest.createdAt),
                        fontSize = 12.sp,
                        color = Color.Gray
                    )
                }
                ReturnStatusBadge(status = returnRequest.status)
            }
            
            HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp), thickness = 0.5.dp)
            
            Text(
                text = returnRequest.productName,
                fontWeight = FontWeight.Medium,
                fontSize = 14.sp
            )
            Text(
                text = "Reason: ${returnRequest.reason}",
                fontSize = 13.sp,
                color = Color.DarkGray,
                modifier = Modifier.padding(top = 4.dp)
            )

            if (returnRequest.status == "COMPLETED") {
                Spacer(modifier = Modifier.height(12.dp))
                Card(
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFE8F5E9)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    PaddingValues(8.dp)
                    Text(
                        text = "Refund Processed: ₹${returnRequest.refundAmount.toInt()}",
                        color = PrimaryGreen,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(12.dp),
                        fontSize = 13.sp
                    )
                }
            } else if (returnRequest.qcStatus == "FAILED") {
                Spacer(modifier = Modifier.height(12.dp))
                Card(
                    colors = CardDefaults.cardColors(containerColor = Color(0xFFFFEBEE)),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    PaddingValues(8.dp)
                    Text(
                        text = "QC Failed: ${returnRequest.adminNotes}",
                        color = Color.Red,
                        fontWeight = FontWeight.Bold,
                        modifier = Modifier.padding(12.dp),
                        fontSize = 13.sp
                    )
                }
            }
        }
    }
}

@Composable
fun ReturnStatusBadge(status: String) {
    val color = when (status) {
        "REQUESTED" -> Color(0xFF2196F3)
        "PICKUP_SCHEDULED" -> Color(0xFFFF9800)
        "PICKED_UP" -> Color(0xFF9C27B0)
        "COMPLETED" -> PrimaryGreen
        "CANCELLED", "QC_FAILED" -> Color.Red
        else -> Color.Gray
    }

    Surface(
        color = color.copy(alpha = 0.1f),
        shape = RoundedCornerShape(6.dp)
    ) {
        Text(
            text = status,
            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
            fontSize = 11.sp,
            fontWeight = FontWeight.Bold,
            color = color
        )
    }
}
