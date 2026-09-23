package com.company.krishivishaldelivery.ui.pod

import android.graphics.Canvas as AndroidCanvas
import android.graphics.Paint
import android.graphics.Path as AndroidPath
import android.graphics.Bitmap
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.result.launch
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.QrCode
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import com.company.krishivishal.core.model.Order
import com.company.krishivishal.core.model.OrderStatus
import com.company.krishivishaldelivery.ui.dashboard.DashboardViewModel
import com.company.krishivishal.core.util.Resource
import kotlinx.coroutines.launch
import java.io.ByteArrayOutputStream
import java.net.URLEncoder
import java.nio.charset.StandardCharsets

import com.company.krishivishaldelivery.ui.components.RuralOfflineBanner

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProofOfDeliveryScreen(
    orderId: String,
    onNavigateBack: () -> Unit,
    onSuccess: () -> Unit,
    viewModel: DashboardViewModel = hiltViewModel()
) {
    val orderState by viewModel.orders.collectAsState()
    val isConnected by viewModel.isConnected.collectAsState()
    val pendingSyncCount by viewModel.pendingSyncCount.collectAsState()
    val isSyncing by viewModel.isSyncing.collectAsState()
    val order = (orderState as? Resource.Success)?.data?.find { it.id == orderId }
    
    var capturedPhoto by remember { mutableStateOf<Bitmap?>(null) }

    var otpValue by remember { mutableStateOf("") }
    var collectedCash by remember { mutableStateOf("") }
    var hasInitializedCash by remember { mutableStateOf(false) }
    
    if (!hasInitializedCash && order != null) {
        if (order.isCOD) {
            collectedCash = (if (order.codAmount > 0) order.codAmount else order.totalAmount).toInt().toString()
        }
        hasInitializedCash = true
    }
    var isUploading by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }

    val cameraLauncher = rememberLauncherForActivityResult(ActivityResultContracts.TakePicturePreview()) { bitmap ->
        if (bitmap != null) capturedPhoto = bitmap
    }

    Scaffold(
        topBar = {
            Column {
                TopAppBar(
                    title = { Text("Proof of Delivery") },
                    navigationIcon = {
                        IconButton(onClick = onNavigateBack) {
                            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
                        }
                    }
                )
                RuralOfflineBanner(
                    isConnected = isConnected,
                    pendingSyncCount = pendingSyncCount,
                    isSyncing = isSyncing,
                    onSyncNow = { viewModel.triggerManualSync() }
                )
            }
        },
        snackbarHost = { SnackbarHost(snackbarHostState) }
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            // Order Info
            order?.let {
                Card(modifier = Modifier.fillMaxWidth()) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text("Order #${it.id.takeLast(8).uppercase()}", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                        Text("Customer: ${it.userName}", fontWeight = FontWeight.Medium)
                        Text("Address: ${it.address}", fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        if (it.isCOD) {
                            Text(
                                "COD Amount: ₹${it.codAmount}",
                                fontWeight = FontWeight.ExtraBold,
                                color = Color(0xFFE65100),
                                modifier = Modifier.padding(top = 4.dp)
                            )
                        }
                    }
                }
            }

            // Multi-Parcel / Item Handover Checklist
            var verifiedParcelIndices by remember { mutableStateOf<Set<Int>>(emptySet()) }
            val totalParcels = order?.items?.size ?: 1

            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = Color(0xFFF9FBE7)),
                border = BorderStroke(1.dp, Color(0xFFC0CA33)),
                shape = RoundedCornerShape(12.dp)
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            "📦 पार्सल हैंडओवर चेकलिस्ट (Item Handover)",
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 14.sp,
                            color = Color(0xFF33691E)
                        )
                        Text(
                            "${verifiedParcelIndices.size}/$totalParcels Handed Over",
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Bold,
                            color = if (verifiedParcelIndices.size == totalParcels) Color(0xFF2E7D32) else Color(0xFFE65100)
                        )
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    order?.items?.forEachIndexed { index, item ->
                        val isChecked = verifiedParcelIndices.contains(index)
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Checkbox(
                                checked = isChecked,
                                onCheckedChange = {
                                    verifiedParcelIndices = if (it) {
                                        verifiedParcelIndices + index
                                    } else {
                                        verifiedParcelIndices - index
                                    }
                                },
                                colors = CheckboxDefaults.colors(checkedColor = Color(0xFF2E7D32))
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    "Box ${index + 1} of $totalParcels: ${item.productName}",
                                    fontWeight = if (isChecked) FontWeight.Bold else FontWeight.Normal,
                                    fontSize = 13.sp
                                )
                                Text("Qty: ${item.quantity}", fontSize = 11.sp, color = Color.Gray)
                            }
                        }
                    }

                    if (verifiedParcelIndices.size < totalParcels) {
                        Text(
                            "⚠️ कृपया किसान को सभी डिब्बे सौंपने के बाद टिक करें।",
                            fontSize = 11.sp,
                            color = Color(0xFFD32F2F),
                            fontWeight = FontWeight.SemiBold,
                            modifier = Modifier.padding(top = 4.dp)
                        )
                    }
                }
            }

            // Photo Capture
            Text("Package Photo", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
            if (capturedPhoto != null) {
                Box(modifier = Modifier.fillMaxWidth().height(100.dp).clip(RoundedCornerShape(8.dp))) {
                    androidx.compose.foundation.Image(
                        bitmap = capturedPhoto!!.asImageBitmap(),
                        contentDescription = "Captured Photo",
                        modifier = Modifier.fillMaxSize(),
                        contentScale = ContentScale.Crop
                    )
                    IconButton(
                        onClick = { capturedPhoto = null },
                        modifier = Modifier.align(Alignment.TopEnd).background(Color.Black.copy(alpha = 0.5f), CircleShape)
                    ) {
                        Icon(Icons.Default.Clear, contentDescription = "Clear", tint = Color.White)
                    }
                }
            } else {
                OutlinedButton(
                    onClick = { cameraLauncher.launch() },
                    modifier = Modifier.fillMaxWidth().height(72.dp),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(Icons.Default.CameraAlt, contentDescription = null, modifier = Modifier.size(32.dp))
                        Text("Take Package Photo")
                    }
                }
            }



            if (order?.isCOD == true) {
                Spacer(modifier = Modifier.height(16.dp))
                Text("Collected Cash Amount (₹)", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
                OutlinedTextField(
                    value = collectedCash,
                    onValueChange = { collectedCash = it.filter { char -> char.isDigit() } },
                    modifier = Modifier.fillMaxWidth(),
                    placeholder = { Text("Enter amount collected") },
                    keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                        keyboardType = androidx.compose.ui.text.input.KeyboardType.Number
                    ),
                    leadingIcon = { Text(" ₹", fontWeight = FontWeight.Bold) },
                    shape = RoundedCornerShape(12.dp)
                )
                Spacer(modifier = Modifier.height(16.dp))
            }
            
            // OTP Verification Section
            Text("Customer Delivery PIN (OTP)", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
            OutlinedTextField(
                value = otpValue,
                onValueChange = { if (it.length <= 4) otpValue = it },
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("Enter 4-digit PIN") },
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                    keyboardType = androidx.compose.ui.text.input.KeyboardType.Number
                ),
                leadingIcon = { Icon(Icons.Default.QrCode, contentDescription = null) },
                shape = RoundedCornerShape(12.dp)
            )

            Spacer(modifier = Modifier.weight(1f))

            Button(
                onClick = {
                    if (otpValue.length < 4) {
                        scope.launch { snackbarHostState.showSnackbar("Please enter valid 4-digit PIN") }
                        return@Button
                    }
                    scope.launch {
                        isUploading = true
                        val deliveryResult = viewModel.completeDeliveryWithPOD(
                            orderId = orderId,
                            otp = otpValue,
                            photoBitmap = capturedPhoto,
                            signatureBitmap = null,
                            collectedCash = collectedCash.toDoubleOrNull() ?: 0.0
                        )
                        isUploading = false

                        when (deliveryResult) {
                            is Resource.Success -> {
                                onSuccess()
                            }
                            is Resource.Error -> {
                                snackbarHostState.showSnackbar(deliveryResult.message ?: "Failed to complete delivery")
                            }
                            else -> {}
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth().height(56.dp),
                enabled = !isUploading && capturedPhoto != null && otpValue.length == 4 && (order?.isCOD != true || collectedCash.isNotEmpty()),
                shape = RoundedCornerShape(8.dp)
            ) {
                if (isUploading) CircularProgressIndicator(color = Color.White, modifier = Modifier.size(24.dp))
                else Text("COMPLETE DELIVERY")
            }
        }
    }
}

private fun bitmapToByteArray(bitmap: Bitmap): ByteArray {
    val stream = ByteArrayOutputStream()
    bitmap.compress(Bitmap.CompressFormat.JPEG, 80, stream)
    return stream.toByteArray()
}


