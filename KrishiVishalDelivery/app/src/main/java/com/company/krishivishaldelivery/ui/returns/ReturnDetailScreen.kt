package com.company.krishivishaldelivery.ui.returns

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.result.launch
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import com.company.krishivishal.core.model.ReturnRequest
import com.company.krishivishaldelivery.ui.dashboard.DeliveryViewModel
import com.company.krishivishaldelivery.ui.dashboard.StatusBadge
import com.company.krishivishal.core.util.Resource
import com.company.krishivishaldelivery.ui.order_detail.InfoCard
import kotlinx.coroutines.launch
import java.io.ByteArrayOutputStream

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReturnDetailScreen(
    returnId: String,
    onNavigateBack: () -> Unit,
    onConfirmPickup: () -> Unit,
    viewModel: DeliveryViewModel = hiltViewModel()
) {
    val returnsResource by viewModel.returns.collectAsState()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    
    var showConfirmDialog by remember { mutableStateOf(false) }
    var capturedBitmap by remember { mutableStateOf<Bitmap?>(null) }
    var isSubmitting by remember { mutableStateOf(false) }
    var errorText by remember { mutableStateOf<String?>(null) }

    val cameraLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.TakePicturePreview()
    ) { bitmap ->
        if (bitmap != null) {
            capturedBitmap = bitmap
        }
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            cameraLauncher.launch()
        }
    }

    val returnRequest = (returnsResource as? Resource.Success<List<ReturnRequest>>)?.data?.find { it.id == returnId }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Return Pickup Details",
fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color(0xFF1976D2),
                    titleContentColor = Color.White,
                    navigationIconContentColor = Color.White
                )
            )
        }
    ) { padding ->
        if (returnRequest == null) {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("Return Request Not Found")
            }
        } else {
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
            ) {
                LazyColumn(
                    modifier = Modifier
                        .weight(1f)
                        .padding(horizontal = 16.dp),
                    verticalArrangement = Arrangement.spacedBy(16.dp),
                    contentPadding = PaddingValues(vertical = 16.dp)
                ) {
                    item {
                        ReturnHeaderSection(returnRequest)
                    }

                    item {
                        InfoCard(
                            title = "QC Photo Proof",
                            icon = Icons.Default.CameraAlt,
                            content = {
                                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                                    if (capturedBitmap != null) {
                                        Image(
                                            bitmap = capturedBitmap!!.asImageBitmap(),
                                            contentDescription = "Captured Proof",
                                            modifier = Modifier
                                                .fillMaxWidth()
                                                .height(200.dp)
                                                .clip(RoundedCornerShape(12.dp)),
                                            contentScale = ContentScale.Crop
                                        )
                                        Spacer(modifier = Modifier.height(12.dp))
                                    }
                                    
                                    OutlinedButton(
                                        onClick = {
                                            if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                                                cameraLauncher.launch()
                                            } else {
                                                permissionLauncher.launch(Manifest.permission.CAMERA)
                                            }
                                        },
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        Icon(Icons.Default.PhotoCamera, contentDescription = null)
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Text(if (capturedBitmap == null) "Take Product Photo" else "Retake Photo")
                                    }
                                }
                            }
                        )
                    }

                    item {
                        InfoCard(
                            title = "Customer Details",
                            icon = Icons.Default.Person,
                            content = {
                                Column {
                                    // Note: ReturnRequest doesn't have customer name/phone directly in some cases, 
                                    // but usually we map it. For now, using placeholders or order data if available.
                                    Text("Customer ID: ${returnRequest.userId}", fontWeight = FontWeight.Bold)
                                    Text("Order ID: ${returnRequest.orderId}", color = Color.Gray, fontSize = 12.sp)
                                    Spacer(modifier = Modifier.height(8.dp))
                                    // In a real app, we'd fetch user details here.
                                }
                            }
                        )
                    }

                    item {
                        InfoCard(
                            title = "Product to Pickup",
                            icon = Icons.Default.Inventory,
                            content = {
                                Column {
                                    Text(returnRequest.productName, fontWeight = FontWeight.Bold, fontSize = 18.sp)
                                    Text("Reason: ${returnRequest.reason}", color = Color.Red, fontWeight = FontWeight.Medium)
                                    if (returnRequest.description.isNotEmpty()) {
                                        Text("Customer Note: ${returnRequest.description}", fontSize = 14.sp, color = Color.DarkGray)
                                    }
                                }
                            }
                        )
                    }

                    item {
                        InfoCard(
                            title = "Pickup Policy",
                            icon = Icons.Default.Gavel,
                            content = {
                                Text(
                                    "1. Ensure original packaging is present.\n2. Check for physical damage not mentioned in reason.\n3. Verify all accessories are included.",
                                    fontSize = 12.sp,
                                    lineHeight = 18.sp
                                )
                            }
                        )
                    }
                }

                Surface(
                    shadowElevation = 8.dp,
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Box(modifier = Modifier.padding(16.dp)) {
                        if (returnRequest.status == "PICKUP_SCHEDULED") {
                            Button(
                                onClick = { 
                                    if (capturedBitmap == null) {
                                        errorText = "Please take a product photo first."
                                        return@Button
                                    }
                                    showConfirmDialog = true 
                                },
                                modifier = Modifier.fillMaxWidth().height(56.dp),
                                enabled = !isSubmitting,
                                shape = RoundedCornerShape(12.dp),
                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1976D2))
                            ) {
                                if (isSubmitting) {
                                    CircularProgressIndicator(color = Color.White, modifier = Modifier.size(24.dp))
                                } else {
                                    Text("CONFIRM PICKUP", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                                }
                            }
                        } else {
                            // Already picked up or other status
                            Button(
                                onClick = { },
                                enabled = false,
                                modifier = Modifier.fillMaxWidth().height(56.dp),
                                shape = RoundedCornerShape(12.dp)
                            ) {
                                Text(returnRequest.status, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }
                
                if (errorText != null) {
                    Text(
                        text = errorText!!,
                        color = Color.Red,
                        fontSize = 12.sp,
                        modifier = Modifier.padding(16.dp)
                    )
                }
            }
        }
    }

    // Inside AlertDialog confirmButton, add the actual submission logic
    if (showConfirmDialog) {
        AlertDialog(
            onDismissRequest = { showConfirmDialog = false },
            title = { Text("Confirm Pickup") },
            text = { Text("Have you physically collected the item and checked its condition?") },
            confirmButton = {
                Button(
                    onClick = {
                        showConfirmDialog = false
                        scope.launch {
                            isSubmitting = true
                            val stream = ByteArrayOutputStream()
                            capturedBitmap?.compress(Bitmap.CompressFormat.JPEG, 80, stream)
                            val bytes = stream.toByteArray()
                            
                            val success = viewModel.repository.confirmReturnPickup(returnId, bytes)
                            if (success) {
                                onConfirmPickup()
                            } else {
                                errorText = "Failed to upload. Check internet connection."
                            }
                            isSubmitting = false
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2E7D32))
                ) {
                    Text("Confirm")
                }
            },
            dismissButton = {
                TextButton(onClick = { showConfirmDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }
}

@Composable
fun ReturnHeaderSection(request: ReturnRequest) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column {
            Text("Return #${request.id.takeLast(6)}", fontWeight = FontWeight.ExtraBold, fontSize = 22.sp)
            Text("Scheduled Pickup", color = Color.Gray, fontSize = 14.sp)
        }
        StatusBadge(request.status)
    }
}
