package com.company.krishivishaldelivery.ui.pod

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import androidx.camera.core.*
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import com.company.krishivishal.core.model.Order
import com.company.krishivishaldelivery.ui.dashboard.DeliveryViewModel
import com.company.krishivishal.core.util.Resource
import kotlinx.coroutines.launch
import java.io.ByteArrayOutputStream

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProofOfDeliveryScreen(
    orderId: String,
    onBack: () -> Unit,
    onSuccess: () -> Unit,
    viewModel: DeliveryViewModel = hiltViewModel()
) {
    var signaturePoints = remember { mutableStateListOf<Offset?>() }
    var capturedImage by remember { mutableStateOf<Bitmap?>(null) }
    var showCamera by remember { mutableStateOf(false) }
    
    var notes by remember { mutableStateOf("") }
    var codReceived by remember { mutableStateOf("") }
    var otpEntered by remember { mutableStateOf("") }
    var isLoading by remember { mutableStateOf(false) }
    var errorMessage by remember { mutableStateOf<String?>(null) }
    
    val ordersResource by viewModel.orders.collectAsState()
    val order = (ordersResource as? Resource.Success<List<Order>>)?.data?.find { it.id == orderId }
    
    val coroutineScope = rememberCoroutineScope()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Proof of Delivery", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Color(0xFF2E7D32),
                    titleContentColor = Color.White,
                    navigationIconContentColor = Color.White
                )
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            // Photo Capture Section
            Text("Package Photo", fontWeight = FontWeight.Bold)
            Card(
                modifier = Modifier.fillMaxWidth().height(200.dp),
                colors = CardDefaults.cardColors(containerColor = Color.LightGray.copy(alpha = 0.2f))
            ) {
                Box(contentAlignment = Alignment.Center, modifier = Modifier.fillMaxSize()) {
                    if (capturedImage != null) {
                        androidx.compose.foundation.Image(
                            bitmap = capturedImage!!.asImageBitmap(),
                            contentDescription = "Captured Photo",
                            modifier = Modifier.fillMaxSize().clickable { showCamera = true },
                            contentScale = androidx.compose.ui.layout.ContentScale.Crop
                        )
                    } else if (showCamera) {
                        CameraCaptureView(
                            onImageCaptured = { bitmap ->
                                capturedImage = bitmap
                                showCamera = false
                            },
                            onError = { errorMessage = it }
                        )
                    } else {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            modifier = Modifier.clickable { showCamera = true }
                        ) {
                            Icon(Icons.Default.CameraAlt, contentDescription = null, modifier = Modifier.size(48.dp))
                            Text("Tap to Capture Photo", fontWeight = FontWeight.Medium)
                        }
                    }
                }
            }

            // Signature Pad
            Text("Customer Signature", fontWeight = FontWeight.Bold)
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(200.dp)
                    .background(Color.White),
                border = androidx.compose.foundation.BorderStroke(1.dp, Color.Gray),
                shape = RoundedCornerShape(8.dp)
            ) {
                Box {
                    Canvas(modifier = Modifier
                        .fillMaxSize()
                        .pointerInput(Unit) {
                            detectDragGestures(
                                onDragStart = { offset ->
                                    signaturePoints.add(offset)
                                },
                                onDrag = { change, _ ->
                                    signaturePoints.add(change.position)
                                },
                                onDragEnd = {
                                    signaturePoints.add(null) // null indicates break in line
                                }
                            )
                        }
                    ) {
                        if (signaturePoints.size > 1) {
                            val path = Path()
                            var first = true
                            signaturePoints.forEach { point ->
                                if (point == null) {
                                    first = true
                                } else {
                                    if (first) {
                                        path.moveTo(point.x, point.y)
                                        first = false
                                    } else {
                                        path.lineTo(point.x, point.y)
                                    }
                                }
                            }
                            drawPath(
                                path = path,
                                color = Color.Black,
                                style = Stroke(width = 4.dp.toPx(), cap = StrokeCap.Round)
                            )
                        }
                    }
                    IconButton(
                        onClick = { signaturePoints.clear() },
                        modifier = Modifier.align(Alignment.TopEnd)
                    ) {
                        Icon(Icons.Default.Clear, contentDescription = "Clear")
                    }
                }
            }

            OutlinedTextField(
                value = codReceived,
                onValueChange = { codReceived = it },
                label = { Text("COD Amount Received (₹)") },
                modifier = Modifier.fillMaxWidth(),
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                    keyboardType = androidx.compose.ui.text.input.KeyboardType.Number
                )
            )

            OutlinedTextField(
                value = notes,
                onValueChange = { notes = it },
                label = { Text("Additional Notes (Optional)") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 3
            )

            OutlinedTextField(
                value = otpEntered,
                onValueChange = { otpEntered = it },
                label = { Text("Enter Customer OTP") },
                modifier = Modifier.fillMaxWidth(),
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                    keyboardType = androidx.compose.ui.text.input.KeyboardType.NumberPassword
                )
            )

            if (errorMessage != null) {
                Text(errorMessage!!, color = Color.Red, fontSize = 12.sp)
            }

            Spacer(modifier = Modifier.weight(1f))

            Button(
                onClick = { 
                    val isOtpValid = order?.customerOTP?.trim()?.toIntOrNull() == otpEntered.trim().toIntOrNull()
                    if (order != null && !isOtpValid) {
                        errorMessage = "Invalid OTP. Please ask customer for correct OTP."
                        return@Button
                    }
                    if (capturedImage == null) {
                        errorMessage = "Please capture a package photo."
                        return@Button
                    }
                    coroutineScope.launch {
                        isLoading = true
                        
                        val photoBytes = capturedImage?.let { bitmap ->
                            val stream = ByteArrayOutputStream()
                            bitmap.compress(Bitmap.CompressFormat.JPEG, 70, stream)
                            stream.toByteArray()
                        }
                        
                        // Convert signature to bytes (simple version)
                        val signatureBytes = ByteArray(0) 

                        viewModel.uploadProofOfDelivery(orderId, photoBytes, signatureBytes)
                        viewModel.updateStatus(orderId, "DELIVERED")
                        isLoading = false
                        onSuccess()
                    }
                },
                modifier = Modifier.fillMaxWidth().height(56.dp),
                enabled = !isLoading,
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2E7D32))
            ) {
                if (isLoading) {
                    CircularProgressIndicator(color = Color.White, modifier = Modifier.size(24.dp))
                } else {
                    Text("CONFIRM DELIVERY", fontWeight = FontWeight.Bold, fontSize = 16.sp)
                }
            }
        }
    }
}

@Composable
fun CameraCaptureView(
    onImageCaptured: (Bitmap) -> Unit,
    onError: (String) -> Unit
) {
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val cameraProviderFuture = remember { ProcessCameraProvider.getInstance(context) }
    val imageCapture = remember { ImageCapture.Builder().build() }

    Box(modifier = Modifier.fillMaxSize()) {
        AndroidView(
            factory = { ctx ->
                val previewView = PreviewView(ctx)
                cameraProviderFuture.addListener({
                    val cameraProvider = cameraProviderFuture.get()
                    val preview = Preview.Builder().build().also {
                        it.setSurfaceProvider(previewView.surfaceProvider)
                    }
                    try {
                        cameraProvider.unbindAll()
                        cameraProvider.bindToLifecycle(
                            lifecycleOwner,
                            CameraSelector.DEFAULT_BACK_CAMERA,
                            preview,
                            imageCapture
                        )
                    } catch (e: Exception) {
                        onError("Camera failed: ${e.message}")
                    }
                }, ContextCompat.getMainExecutor(ctx))
                previewView
            },
            modifier = Modifier.fillMaxSize()
        )

        Button(
            onClick = {
                val executor = ContextCompat.getMainExecutor(context)
                imageCapture.takePicture(executor, object : ImageCapture.OnImageCapturedCallback() {
                    override fun onCaptureSuccess(image: ImageProxy) {
                        val buffer = image.planes[0].buffer
                        val bytes = ByteArray(buffer.remaining())
                        buffer.get(bytes)
                        val bitmap = BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
                        onImageCaptured(bitmap)
                        image.close()
                    }

                    override fun onError(exception: ImageCaptureException) {
                        onError("Capture failed: ${exception.message}")
                    }
                })
            },
            modifier = Modifier.align(Alignment.BottomCenter).padding(bottom = 16.dp)
        ) {
            Text("Capture")
        }
    }
}
