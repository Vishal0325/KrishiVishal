package com.company.krishivishaldelivery.ui.pod

import android.graphics.Canvas as AndroidCanvas
import android.graphics.Paint
import android.graphics.Path as AndroidPath
import android.graphics.Bitmap
import android.Manifest
import android.content.pm.PackageManager
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.result.launch
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
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
import androidx.compose.material.icons.filled.CheckCircle
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
import androidx.compose.ui.platform.LocalContext
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.compose.ui.window.Dialog
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import coil.compose.AsyncImage
import com.company.krishivishal.core.model.Order
import com.company.krishivishal.core.model.OrderStatus
import com.company.krishivishaldelivery.ui.dashboard.DashboardViewModel
import com.company.krishivishal.core.util.Resource
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import kotlinx.coroutines.launch
import java.io.ByteArrayOutputStream
import java.net.URLEncoder
import java.nio.charset.StandardCharsets
import java.util.concurrent.Executors

import com.company.krishivishaldelivery.ui.components.RuralOfflineBanner

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProofOfDeliveryScreen(
    orderId: String,
    onNavigateBack: () -> Unit,
    onSuccess: () -> Unit,
    viewModel: DashboardViewModel = hiltViewModel()
) {
    val context = LocalContext.current
    val orderState by viewModel.orders.collectAsState()
    val isConnected by viewModel.isConnected.collectAsState()
    val pendingSyncCount by viewModel.pendingSyncCount.collectAsState()
    val isSyncing by viewModel.isSyncing.collectAsState()
    val order = (orderState as? Resource.Success)?.data?.find { it.id == orderId }
    
    var capturedPhoto by remember { mutableStateOf<Bitmap?>(null) }
    var isParcelScanned by remember { mutableStateOf(false) }
    var showScannerDialog by remember { mutableStateOf(false) }

    var hasCameraPermission by remember {
        mutableStateOf(
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.CAMERA
            ) == PackageManager.PERMISSION_GRANTED
        )
    }

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

    val cameraPermissionLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        hasCameraPermission = isGranted
        if (isGranted) {
            showScannerDialog = true
        } else {
            scope.launch {
                snackbarHostState.showSnackbar("Camera permission is required to scan parcel barcode.")
            }
        }
    }

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

            // Mandatory Parcel Barcode/QR Verification Section
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(
                    containerColor = if (isParcelScanned) Color(0xFFE8F5E9) else Color(0xFFFFF3E0)
                ),
                border = BorderStroke(1.dp, if (isParcelScanned) Color(0xFF2E7D32) else Color(0xFFFF9800)),
                shape = RoundedCornerShape(12.dp)
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            "📦 पार्सल बारकोड सत्यापन (Parcel Scan)",
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 14.sp,
                            color = if (isParcelScanned) Color(0xFF2E7D32) else Color(0xFFE65100)
                        )
                        if (isParcelScanned) {
                            Surface(
                                color = Color(0xFF2E7D32),
                                shape = RoundedCornerShape(16.dp)
                            ) {
                                Text(
                                    "Parcel Verified ✓",
                                    color = Color.White,
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp)
                                )
                            }
                        }
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    if (isParcelScanned) {
                        Text(
                            "✓ बॉक्स बारकोड सत्यापित हो गया है (Order #${(order?.id ?: orderId).takeLast(8).uppercase()})। अब आप ओटीपी दर्ज कर सकते हैं।",
                            fontSize = 12.sp,
                            color = Color(0xFF1B5E20),
                            fontWeight = FontWeight.Medium
                        )
                    } else {
                        Text(
                            "अनिवार्य: डिलीवरी पूरी करने से पहले बॉक्स पर लगे बारकोड / क्यूआर कोड को स्कैन करें।",
                            fontSize = 12.sp,
                            color = Color(0xFFD84315)
                        )
                        Spacer(modifier = Modifier.height(8.dp))
                        Button(
                            onClick = {
                                if (hasCameraPermission) {
                                    showScannerDialog = true
                                } else {
                                    cameraPermissionLauncher.launch(Manifest.permission.CAMERA)
                                }
                            },
                            modifier = Modifier.fillMaxWidth(),
                            colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary),
                            shape = RoundedCornerShape(8.dp)
                        ) {
                            Icon(Icons.Default.QrCode, contentDescription = null, modifier = Modifier.size(20.dp))
                            Spacer(modifier = Modifier.width(8.dp))
                            Text("Scan Parcel QR")
                        }
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
                placeholder = { Text(if (isParcelScanned) "Enter 4-digit PIN" else "Scan parcel QR first to unlock") },
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                    keyboardType = androidx.compose.ui.text.input.KeyboardType.Number
                ),
                leadingIcon = { Icon(Icons.Default.QrCode, contentDescription = null) },
                shape = RoundedCornerShape(12.dp),
                enabled = isParcelScanned
            )
            if (!isParcelScanned) {
                Text(
                    "🔒 OTP locked until parcel barcode/QR is verified.",
                    fontSize = 12.sp,
                    color = Color(0xFFD32F2F),
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(top = 2.dp)
                )
            }

            Spacer(modifier = Modifier.weight(1f))

            Button(
                onClick = {
                    if (!isParcelScanned) {
                        scope.launch { snackbarHostState.showSnackbar("Please scan the parcel barcode first.") }
                        return@Button
                    }
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
                enabled = !isUploading && isParcelScanned && capturedPhoto != null && otpValue.length == 4 && (order?.isCOD != true || collectedCash.isNotEmpty()),
                shape = RoundedCornerShape(8.dp)
            ) {
                if (isUploading) CircularProgressIndicator(color = Color.White, modifier = Modifier.size(24.dp))
                else Text("Verify & Complete Delivery")
            }
        }
    }

    if (showScannerDialog) {
        ParcelScannerDialog(
            onDismiss = { showScannerDialog = false },
            onBarcodeScanned = { scanned ->
                showScannerDialog = false
                val targetId = order?.id ?: orderId
                val cleanScanned = scanned.trim()
                val cleanTarget = targetId.trim()
                val isMatch = cleanScanned.equals(cleanTarget, ignoreCase = true) ||
                              cleanScanned.contains(cleanTarget, ignoreCase = true) ||
                              (cleanTarget.isNotEmpty() && cleanScanned.endsWith(cleanTarget, ignoreCase = true))

                if (isMatch) {
                    isParcelScanned = true
                    scope.launch { snackbarHostState.showSnackbar("Parcel Verified ✓") }
                } else {
                    isParcelScanned = false
                    scope.launch {
                        snackbarHostState.showSnackbar("Barcode does not match this order. Verify the box!")
                    }
                }
            }
        )
    }
}

@OptIn(ExperimentalGetImage::class)
@Composable
fun ParcelScannerDialog(
    onDismiss: () -> Unit,
    onBarcodeScanned: (String) -> Unit
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val cameraProviderFuture = remember { ProcessCameraProvider.getInstance(context) }
    var isProcessing by remember { mutableStateOf(false) }

    Dialog(onDismissRequest = onDismiss) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .height(450.dp),
            shape = RoundedCornerShape(16.dp)
        ) {
            Column(
                modifier = Modifier.fillMaxSize(),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        "Scan Parcel QR / Barcode",
                        fontWeight = FontWeight.Bold,
                        fontSize = 16.sp
                    )
                    IconButton(onClick = onDismiss) {
                        Icon(Icons.Default.Clear, contentDescription = "Close")
                    }
                }

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .weight(1f)
                ) {
                    AndroidView(
                        factory = { ctx ->
                            val previewView = PreviewView(ctx)
                            val executor = ContextCompat.getMainExecutor(ctx)

                            cameraProviderFuture.addListener({
                                val cameraProvider = cameraProviderFuture.get()
                                val preview = Preview.Builder().build()
                                val selector = CameraSelector.Builder()
                                    .requireLensFacing(CameraSelector.LENS_FACING_BACK)
                                    .build()
                                preview.setSurfaceProvider(previewView.surfaceProvider)

                                val imageAnalysis = ImageAnalysis.Builder()
                                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                                    .build()

                                val options = com.google.mlkit.vision.barcode.BarcodeScannerOptions.Builder()
                                    .setBarcodeFormats(Barcode.FORMAT_ALL_FORMATS)
                                    .build()
                                val scanner = BarcodeScanning.getClient(options)

                                imageAnalysis.setAnalyzer(Executors.newSingleThreadExecutor()) { imageProxy ->
                                    val mediaImage = imageProxy.image
                                    if (mediaImage != null && !isProcessing) {
                                        val image = InputImage.fromMediaImage(
                                            mediaImage,
                                            imageProxy.imageInfo.rotationDegrees
                                        )
                                        scanner.process(image)
                                            .addOnSuccessListener { barcodes ->
                                                if (!isProcessing) {
                                                    for (barcode in barcodes) {
                                                        val rawVal = barcode.rawValue
                                                        if (!rawVal.isNullOrBlank()) {
                                                            isProcessing = true
                                                            onBarcodeScanned(rawVal)
                                                            break
                                                        }
                                                    }
                                                }
                                            }
                                            .addOnCompleteListener {
                                                imageProxy.close()
                                            }
                                    } else {
                                        imageProxy.close()
                                    }
                                }

                                try {
                                    cameraProvider.unbindAll()
                                    cameraProvider.bindToLifecycle(
                                        lifecycleOwner,
                                        selector,
                                        preview,
                                        imageAnalysis
                                    )
                                } catch (e: Exception) {
                                    e.printStackTrace()
                                }
                            }, executor)

                            previewView
                        },
                        modifier = Modifier.fillMaxSize()
                    )
                }

                Text(
                    "Point camera at parcel barcode or QR label",
                    fontSize = 12.sp,
                    color = Color.Gray,
                    modifier = Modifier.padding(12.dp)
                )
            }
        }
    }
}

private fun bitmapToByteArray(bitmap: Bitmap): ByteArray {
    val stream = ByteArrayOutputStream()
    bitmap.compress(Bitmap.CompressFormat.JPEG, 80, stream)
    return stream.toByteArray()
}


