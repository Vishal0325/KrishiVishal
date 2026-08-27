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
import androidx.compose.material.icons.filled.ArrowBack
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

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProofOfDeliveryScreen(
    orderId: String,
    onNavigateBack: () -> Unit,
    onSuccess: () -> Unit,
    viewModel: DashboardViewModel = hiltViewModel()
) {
    val orderState by viewModel.orders.collectAsState()
    val order = (orderState as? Resource.Success)?.data?.find { it.id == orderId }
    
    var capturedPhoto by remember { mutableStateOf<Bitmap?>(null) }
    var signaturePoints by remember { mutableStateOf<List<Offset>>(emptyList()) }
    var otpValue by remember { mutableStateOf("") }
    var isUploading by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()
    val snackbarHostState = remember { SnackbarHostState() }

    val cameraLauncher = rememberLauncherForActivityResult(ActivityResultContracts.TakePicturePreview()) { bitmap ->
        if (bitmap != null) capturedPhoto = bitmap
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Proof of Delivery") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                }
            )
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
                        Text("Order #${it.id}", fontWeight = FontWeight.Bold)
                        Text("Customer: ${it.userName}")
                        Text("Address: ${it.address}")
                    }
                }
            }

            // Photo Capture
            Text("Package Photo", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
            if (capturedPhoto != null) {
                Box(modifier = Modifier.fillMaxWidth().height(200.dp).clip(RoundedCornerShape(8.dp))) {
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
                    modifier = Modifier.fillMaxWidth().height(100.dp),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(Icons.Default.CameraAlt, contentDescription = null, modifier = Modifier.size(32.dp))
                        Text("Take Package Photo")
                    }
                }
            }

            // Signature Pad
            Text("Customer Signature", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
            var signatureSize by remember { mutableStateOf(androidx.compose.ui.unit.IntSize.Zero) }
            Surface(
                modifier = Modifier
                    .fillMaxWidth()
                    .height(200.dp)
                    .onGloballyPositioned { signatureSize = it.size },
                color = Color.White,
                border = BorderStroke(1.dp, MaterialTheme.colorScheme.outline),
                shape = RoundedCornerShape(8.dp)
            ) {
                Box {
                    Canvas(
                        modifier = Modifier
                            .fillMaxSize()
                            .pointerInput(Unit) {
                                detectDragGestures { change, _ ->
                                    change.consume()
                                    signaturePoints = signaturePoints + change.position
                                }
                            }
                    ) {
                        if (signaturePoints.size > 1) {
                            val path = Path()
                            path.moveTo(signaturePoints[0].x, signaturePoints[0].y)
                            for (i in 1 until signaturePoints.size) {
                                path.lineTo(signaturePoints[i].x, signaturePoints[i].y)
                            }
                            drawPath(
                                path = path,
                                color = Color.Black,
                                style = Stroke(width = 4f, cap = StrokeCap.Round)
                            )
                        }
                    }
                    IconButton(
                        onClick = { signaturePoints = emptyList() },
                        modifier = Modifier.align(Alignment.TopEnd)
                    ) {
                        Icon(Icons.Default.Clear, contentDescription = "Clear Signature")
                    }
                }
            }

            // OTP Verification Section
            Text("Customer Delivery PIN (OTP)", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onSurface)
            OutlinedTextField(
                value = otpValue,
                onValueChange = { if (it.length <= 6) otpValue = it },
                modifier = Modifier.fillMaxWidth(),
                placeholder = { Text("Enter 6-digit PIN") },
                keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(
                    keyboardType = androidx.compose.ui.text.input.KeyboardType.Number
                ),
                leadingIcon = { Icon(Icons.Default.QrCode, contentDescription = null) },
                shape = RoundedCornerShape(12.dp)
            )

            Spacer(modifier = Modifier.weight(1f))

            Button(
                onClick = {
                    if (otpValue.length < 6) {
                        scope.launch { snackbarHostState.showSnackbar("Please enter valid 6-digit PIN") }
                        return@Button
                    }
                    scope.launch {
                        isUploading = true
                        val photoBytes = capturedPhoto?.let { bitmapToByteArray(it) }
                        val signatureBitmap = if (signatureSize.width > 0 && signatureSize.height > 0) {
                            createSignatureBitmap(signaturePoints, signatureSize.width, signatureSize.height)
                        } else {
                            createSignatureBitmap(signaturePoints, 400, 200)
                        }
                        val signatureBytes = signatureBitmap?.let { bitmapToByteArray(it) }
                        
                        // 1. Upload POD
                        val podSuccess = viewModel.uploadProofOfDelivery(orderId, photoBytes, signatureBytes)
                        
                        if (podSuccess) {
                            // 2. Verify OTP and Mark Delivered
                            val verifyRes = viewModel.verifyDelivery(orderId, otpValue)
                            isUploading = false
                            
                            if (verifyRes is Resource.Success) {
                                onSuccess()
                            } else {
                                snackbarHostState.showSnackbar("OTP Verification Failed: ${verifyRes.message}")
                            }
                        } else {
                            isUploading = false
                            snackbarHostState.showSnackbar("Failed to upload Photo/Signature. Please try again.")
                        }
                    }
                },
                modifier = Modifier.fillMaxWidth().height(56.dp),
                enabled = !isUploading && capturedPhoto != null && signaturePoints.isNotEmpty() && otpValue.length == 6,
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

private fun createSignatureBitmap(points: List<Offset>, width: Int, height: Int): Bitmap? {
    if (points.isEmpty()) return null
    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = AndroidCanvas(bitmap)
    val paint = Paint().apply {
        color = android.graphics.Color.BLACK
        strokeWidth = 4f
        style = Paint.Style.STROKE
        strokeJoin = Paint.Join.ROUND
        strokeCap = Paint.Cap.ROUND
    }
    val path = AndroidPath()
    path.moveTo(points[0].x, points[0].y)
    for (i in 1 until points.size) {
        path.lineTo(points[i].x, points[i].y)
    }
    canvas.drawPath(path, paint)
    return bitmap
}
