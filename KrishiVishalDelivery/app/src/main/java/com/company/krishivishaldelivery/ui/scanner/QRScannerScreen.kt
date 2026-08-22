package com.company.krishivishaldelivery.ui.scanner

import android.Manifest
import android.widget.Toast
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.FlashlightOff
import androidx.compose.material.icons.filled.FlashlightOn
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import com.company.krishivishal.core.model.Order
import com.company.krishivishaldelivery.ui.dashboard.DeliveryViewModel
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.Executors

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QRScannerScreen(
    viewModel: DeliveryViewModel,
    onOrderAccepted: (String) -> Unit,
    onNavigateBack: () -> Unit
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val cameraProviderFuture = remember { ProcessCameraProvider.getInstance(context) }
    
    var hasCameraPermission by remember { mutableStateOf(false) }
    var isFlashOn by remember { mutableStateOf(false) }
    var camera: Camera? by remember { mutableStateOf(null) }
    var isProcessing by remember { mutableStateOf(false) }

    val scannedOrderPreview by viewModel.scannedOrderPreview.collectAsState()

    val permissionLauncher = androidx.activity.compose.rememberLauncherForActivityResult(
        androidx.activity.result.contract.ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        hasCameraPermission = isGranted
    }

    LaunchedEffect(Unit) {
        permissionLauncher.launch(Manifest.permission.CAMERA)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Scan Order QR Code", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                actions = {
                    IconButton(onClick = { 
                        isFlashOn = !isFlashOn
                        camera?.cameraControl?.enableTorch(isFlashOn)
                    }) {
                        Icon(
                            if (isFlashOn) Icons.Default.FlashlightOn else Icons.Default.FlashlightOff, 
                            contentDescription = "Toggle Flash"
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color(0xFF2E7D32),
                    titleContentColor = Color.White,
                    navigationIconContentColor = Color.White,
                    actionIconContentColor = Color.White
                )
            )
        }
    ) { padding ->
        if (hasCameraPermission) {
            Box(modifier = Modifier.fillMaxSize().padding(padding)) {
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

                            val scanner = BarcodeScanning.getClient()

                            imageAnalysis.setAnalyzer(Executors.newSingleThreadExecutor(), object : ImageAnalysis.Analyzer {
                                @ExperimentalGetImage
                                override fun analyze(imageProxy: ImageProxy) {
                                    val mediaImage = imageProxy.image
                                    if (mediaImage != null) {
                                        val image = InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
                                        scanner.process(image)
                                            .addOnSuccessListener { barcodes ->
                                                if (!isProcessing && scannedOrderPreview == null) {
                                                    for (barcode in barcodes) {
                                                        val value = barcode.rawValue
                                                        if (value != null) {
                                                            isProcessing = true
                                                            viewModel.fetchOrderPreview(value) { error ->
                                                                Toast.makeText(context, error, Toast.LENGTH_SHORT).show()
                                                                isProcessing = false
                                                            }
                                                            break
                                                        }
                                                    }
                                                }
                                            }
                                            .addOnCompleteListener {
                                                imageProxy.close()
                                            }
                                    }
                                }
                            })

                            try {
                                cameraProvider.unbindAll()
                                camera = cameraProvider.bindToLifecycle(
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

                // Overlay with cutout
                Canvas(modifier = Modifier.fillMaxSize()) {
                    val canvasWidth = size.width
                    val canvasHeight = size.height
                    val boxSize = canvasWidth * 0.7f
                    val left = (canvasWidth - boxSize) / 2
                    val top = (canvasHeight - boxSize) / 2
                    val rect = Rect(left, top, left + boxSize, top + boxSize)

                    drawRect(color = Color.Black.copy(alpha = 0.5f))

                    drawRoundRect(
                        color = Color.Transparent,
                        topLeft = Offset(rect.left, rect.top),
                        size = androidx.compose.ui.geometry.Size(rect.width, rect.height),
                        cornerRadius = CornerRadius(12.dp.toPx()),
                        blendMode = BlendMode.Clear
                    )

                    drawRoundRect(
                        color = Color.White,
                        topLeft = Offset(rect.left, rect.top),
                        size = androidx.compose.ui.geometry.Size(rect.width, rect.height),
                        cornerRadius = CornerRadius(12.dp.toPx()),
                        style = Stroke(width = 2.dp.toPx())
                    )
                }

                Text(
                    text = "Align QR code inside the box",
                    color = Color.White,
                    modifier = Modifier
                        .align(Alignment.BottomCenter)
                        .padding(bottom = 100.dp),
                    fontSize = 16.sp,
                    fontWeight = FontWeight.Medium
                )
                
                if (isProcessing && scannedOrderPreview == null) {
                    CircularProgressIndicator(
                        modifier = Modifier.align(Alignment.Center),
                        color = Color.White
                    )
                }
            }
        } else {
            Box(modifier = Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                Text("Camera permission is required to scan QR codes.")
            }
        }
    }
    
    // Bottom Sheet for Order Preview
    if (scannedOrderPreview != null) {
        ModalBottomSheet(
            onDismissRequest = {
                viewModel.clearOrderPreview()
                isProcessing = false
            },
            sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ) {
            OrderPreviewContent(
                order = scannedOrderPreview!!,
                onAccept = {
                    viewModel.acceptScannedOrder(
                        orderId = scannedOrderPreview!!.id,
                        onSuccess = {
                            viewModel.clearOrderPreview()
                            isProcessing = false
                            onOrderAccepted(it.id)
                        },
                        onError = { error ->
                            Toast.makeText(context, error, Toast.LENGTH_LONG).show()
                            viewModel.clearOrderPreview()
                            isProcessing = false
                        }
                    )
                },
                onCancel = {
                    viewModel.clearOrderPreview()
                    isProcessing = false
                }
            )
        }
    }
}

@Composable
fun OrderPreviewContent(order: Order, onAccept: () -> Unit, onCancel: () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(16.dp)
            .padding(bottom = 32.dp)
    ) {
        Text("Order Preview", fontWeight = FontWeight.Bold, fontSize = 20.sp, color = Color(0xFF2E7D32))
        Spacer(modifier = Modifier.height(16.dp))
        
        Text("Order #${order.id.takeLast(6)}", fontWeight = FontWeight.ExtraBold, fontSize = 18.sp)
        Spacer(modifier = Modifier.height(8.dp))
        
        Text("Customer: ${order.userName}", fontWeight = FontWeight.Medium)
        Text("Address: ${order.address}", color = Color.Gray)
        Spacer(modifier = Modifier.height(16.dp))
        
        Text("Items:", fontWeight = FontWeight.Medium)
        order.items.forEach { item ->
            Row(
                modifier = Modifier.fillMaxWidth().padding(vertical = 4.dp),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text("${item.quantity}x ${item.productName}")
                Text("₹${item.price * item.quantity}")
            }
        }
        
        HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))
        
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text("Total Amount", fontWeight = FontWeight.Bold, fontSize = 16.sp)
            Text("₹${order.totalAmount}", fontWeight = FontWeight.Bold, fontSize = 16.sp)
        }
        
        Text(
            text = "Payment: ${if (order.isCOD) "Cash on Delivery" else "Online (Prepaid)"}",
            color = if (order.isCOD) Color(0xFFE65100) else Color(0xFF2E7D32),
            fontWeight = FontWeight.Bold,
            modifier = Modifier.padding(top = 8.dp)
        )
        
        Spacer(modifier = Modifier.height(24.dp))
        
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceEvenly) {
            OutlinedButton(
                onClick = onCancel,
                modifier = Modifier.weight(1f).padding(end = 8.dp),
                shape = RoundedCornerShape(12.dp)
            ) {
                Text("Cancel")
            }
            
            Button(
                onClick = onAccept,
                modifier = Modifier.weight(1f).padding(start = 8.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2E7D32))
            ) {
                Text("Accept Order")
            }
        }
    }
}
