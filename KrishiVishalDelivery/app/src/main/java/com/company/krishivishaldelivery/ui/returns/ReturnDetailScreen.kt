package com.company.krishivishaldelivery.ui.returns

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.net.Uri
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.activity.result.launch
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
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
import com.company.krishivishal.core.model.ReturnStatus
import com.company.krishivishaldelivery.ui.dashboard.DashboardViewModel
import com.company.krishivishaldelivery.ui.components.StatusBadge
import com.company.krishivishal.core.util.Resource
import com.company.krishivishaldelivery.ui.order_detail.InfoCard
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.launch

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReturnDetailScreen(
    returnId: String,
    onNavigateBack: () -> Unit,
    onConfirmPickup: () -> Unit,
    viewModel: DashboardViewModel = hiltViewModel()
) {
    val returnsResource by viewModel.returns.collectAsState()
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    
    var showConfirmDialog by remember { mutableStateOf(false) }
    var capturedBitmap by remember { mutableStateOf<Bitmap?>(null) }
    var isSubmitting by remember { mutableStateOf(false) }
    var errorText by remember { mutableStateOf<String?>(null) }
    var isQcPassed by remember { mutableStateOf(true) }
    var qcNote by remember { mutableStateOf("") }
    var isPackageIntact by remember { mutableStateOf(true) }
    var isReasonMatched by remember { mutableStateOf(true) }

    // Doorstep QC Rejection states
    var showRejectDialog by remember { mutableStateOf(false) }
    var rejectReason by remember { mutableStateOf("Item Damaged / Tampered") }
    var rejectNotes by remember { mutableStateOf("") }
    var rejectPhotoBitmap by remember { mutableStateOf<Bitmap?>(null) }
    var rejectPhotoError by remember { mutableStateOf<String?>(null) }

    // Fallback state for customer contact and address from linked order
    var fallbackCustomerName by remember { mutableStateOf("") }
    var fallbackCustomerPhone by remember { mutableStateOf("") }
    var fallbackCustomerAddress by remember { mutableStateOf("") }
    var fallbackLat by remember { mutableStateOf<Double?>(null) }
    var fallbackLng by remember { mutableStateOf<Double?>(null) }

    val cameraLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.TakePicturePreview()
    ) { bitmap ->
        if (bitmap != null) {
            capturedBitmap = bitmap
            errorText = null
        }
    }

    val permissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            cameraLauncher.launch()
        }
    }

    val rejectCameraLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.TakePicturePreview()
    ) { bitmap ->
        if (bitmap != null) {
            rejectPhotoBitmap = bitmap
            rejectPhotoError = null
        }
    }

    val rejectPermissionLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            rejectCameraLauncher.launch()
        }
    }

    val returnRequest = (returnsResource as? Resource.Success<List<ReturnRequest>>)?.data?.find { it.id == returnId }

    // Fetch order details for customer info if not present on return request
    LaunchedEffect(returnRequest?.orderId) {
        val orderId = returnRequest?.orderId
        if (!orderId.isNullOrBlank()) {
            try {
                FirebaseFirestore.getInstance().collection("orders").document(orderId).get()
                    .addOnSuccessListener { snap ->
                        if (snap.exists()) {
                            val data = snap.data ?: return@addOnSuccessListener
                            val name = data["customerName"] as? String
                                ?: data["userName"] as? String
                                ?: (data["shippingAddress"] as? Map<*, *>)?.get("fullName") as? String
                                ?: (data["shippingAddress"] as? Map<*, *>)?.get("name") as? String
                                ?: ""
                            val phone = data["customerPhone"] as? String
                                ?: data["userPhone"] as? String
                                ?: (data["shippingAddress"] as? Map<*, *>)?.get("phoneNumber") as? String
                                ?: (data["shippingAddress"] as? Map<*, *>)?.get("phone") as? String
                                ?: ""
                            val addr = data["shippingAddress"] as? Map<*, *>
                            val addrStr = if (addr != null) {
                                val street = addr["street"] as? String ?: addr["address"] as? String ?: ""
                                val city = addr["city"] as? String ?: ""
                                val landmark = addr["landmark"] as? String ?: ""
                                val pincode = addr["pincode"] as? String ?: addr["pinCode"] as? String ?: ""
                                listOf(street, landmark, city, pincode).filter { it.isNotBlank() }.joinToString(", ")
                            } else {
                                data["deliveryAddress"] as? String ?: data["address"] as? String ?: ""
                            }
                            val lat = (data["targetLat"] as? Number)?.toDouble() ?: (addr?.get("lat") as? Number)?.toDouble()
                            val lng = (data["targetLng"] as? Number)?.toDouble() ?: (addr?.get("lng") as? Number)?.toDouble()

                            fallbackCustomerName = name
                            fallbackCustomerPhone = phone
                            fallbackCustomerAddress = addrStr
                            fallbackLat = lat
                            fallbackLng = lng
                        }
                    }
            } catch (e: Exception) {
                // Ignore fallback error
            }
        }
    }

    val effectiveCustomerName = returnRequest?.customerName?.ifBlank { fallbackCustomerName } ?: fallbackCustomerName
    val effectiveCustomerPhone = returnRequest?.customerPhone?.ifBlank { fallbackCustomerPhone } ?: fallbackCustomerPhone
    val effectiveCustomerAddress = returnRequest?.customerAddress?.ifBlank { fallbackCustomerAddress } ?: fallbackCustomerAddress

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Return Pickup Details", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "Back")
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

                    // Customer Details Card with Call & Navigate
                    item {
                        InfoCard(
                            title = "Customer Details",
                            icon = Icons.Default.Person,
                            content = {
                                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                    if (effectiveCustomerName.isNotBlank()) {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            Icon(Icons.Default.AccountCircle, contentDescription = null, tint = Color(0xFF1976D2), modifier = Modifier.size(20.dp))
                                            Spacer(modifier = Modifier.width(8.dp))
                                            Text(
                                                text = effectiveCustomerName,
                                                fontWeight = FontWeight.Bold,
                                                fontSize = 15.sp,
                                                color = Color(0xFF1F2937)
                                            )
                                        }
                                    }

                                    if (effectiveCustomerPhone.isNotBlank()) {
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.CenterVertically
                                        ) {
                                            Row(verticalAlignment = Alignment.CenterVertically) {
                                                Icon(Icons.Default.Phone, contentDescription = null, tint = Color(0xFF2E7D32), modifier = Modifier.size(18.dp))
                                                Spacer(modifier = Modifier.width(8.dp))
                                                Text(
                                                    text = effectiveCustomerPhone,
                                                    fontWeight = FontWeight.SemiBold,
                                                    fontSize = 14.sp
                                                )
                                            }
                                            Button(
                                                onClick = {
                                                    val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:$effectiveCustomerPhone"))
                                                    context.startActivity(intent)
                                                },
                                                colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2E7D32)),
                                                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                                                shape = RoundedCornerShape(8.dp)
                                            ) {
                                                Icon(Icons.Default.Call, contentDescription = "Call", modifier = Modifier.size(16.dp))
                                                Spacer(modifier = Modifier.width(4.dp))
                                                Text("Call", fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                            }
                                        }
                                    }

                                    if (effectiveCustomerAddress.isNotBlank()) {
                                        HorizontalDivider(thickness = 0.5.dp)
                                        Row(
                                            modifier = Modifier.fillMaxWidth(),
                                            horizontalArrangement = Arrangement.SpaceBetween,
                                            verticalAlignment = Alignment.Top
                                        ) {
                                            Row(modifier = Modifier.weight(1f), verticalAlignment = Alignment.Top) {
                                                Icon(Icons.Default.LocationOn, contentDescription = null, tint = Color(0xFFE65100), modifier = Modifier.size(18.dp))
                                                Spacer(modifier = Modifier.width(8.dp))
                                                Column {
                                                    Text("Pickup Address:", fontSize = 11.sp, fontWeight = FontWeight.Bold, color = Color.Gray)
                                                    Text(
                                                        text = effectiveCustomerAddress,
                                                        fontSize = 13.sp,
                                                        color = Color.DarkGray,
                                                        lineHeight = 18.sp
                                                    )
                                                }
                                            }

                                            val lat = fallbackLat
                                            val lng = fallbackLng
                                            if (lat != null && lng != null && lat != 0.0) {
                                                IconButton(
                                                    onClick = {
                                                        val gmmIntentUri = Uri.parse("google.navigation:q=$lat,$lng")
                                                        val mapIntent = Intent(Intent.ACTION_VIEW, gmmIntentUri).apply {
                                                            setPackage("com.google.android.apps.maps")
                                                        }
                                                        if (mapIntent.resolveActivity(context.packageManager) != null) {
                                                            context.startActivity(mapIntent)
                                                        } else {
                                                            val webIntent = Intent(Intent.ACTION_VIEW, Uri.parse("https://www.google.com/maps/dir/?api=1&destination=$lat,$lng"))
                                                            context.startActivity(webIntent)
                                                        }
                                                    }
                                                ) {
                                                    Icon(Icons.Default.Navigation, contentDescription = "Navigate", tint = Color(0xFF1976D2))
                                                }
                                            }
                                        }
                                    }

                                    Row(
                                        modifier = Modifier.fillMaxWidth(),
                                        horizontalArrangement = Arrangement.SpaceBetween
                                    ) {
                                        Text("Order ID: #${returnRequest.orderId.takeLast(8).uppercase()}", color = Color.Gray, fontSize = 12.sp, fontWeight = FontWeight.Medium)
                                        Text("Return Qty: ${returnRequest.quantity}", color = Color(0xFF1976D2), fontSize = 12.sp, fontWeight = FontWeight.Bold)
                                    }
                                }
                            }
                        )
                    }

                    // Product to Pickup Card
                    item {
                        InfoCard(
                            title = "Product to Pickup",
                            icon = Icons.Default.Inventory,
                            content = {
                                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                                    Text(returnRequest.productName, fontWeight = FontWeight.Bold, fontSize = 16.sp)
                                    if (returnRequest.skuCode.isNotBlank()) {
                                        Text("SKU: ${returnRequest.skuCode}", fontSize = 11.sp, color = Color.Gray, fontWeight = FontWeight.Medium)
                                    }
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Text("Reason: ", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                        Text(returnRequest.reason, color = Color(0xFFD32F2F), fontWeight = FontWeight.SemiBold, fontSize = 13.sp)
                                    }
                                    if (returnRequest.customerComment.isNotBlank()) {
                                        Text("Customer Comment: \"${returnRequest.customerComment}\"", fontSize = 13.sp, color = Color.DarkGray)
                                    } else if (returnRequest.description.isNotBlank()) {
                                        Text("Customer Note: \"${returnRequest.description}\"", fontSize = 13.sp, color = Color.DarkGray)
                                    }
                                }
                            }
                        )
                    }

                    // QC Photo Proof
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
                                        Text(if (capturedBitmap == null) "Take Product Photo (Mandatory)" else "Retake Photo")
                                    }
                                }
                            }
                        )
                    }

                    // QC Inspection Checklist
                    item {
                        InfoCard(
                            title = "QC Inspection Checklist",
                            icon = Icons.Default.Checklist,
                            content = {
                                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Checkbox(
                                            checked = isPackageIntact,
                                            onCheckedChange = { isPackageIntact = it }
                                        )
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Text("Package intact & seal verified", fontSize = 13.sp)
                                    }
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        Checkbox(
                                            checked = isReasonMatched,
                                            onCheckedChange = { isReasonMatched = it }
                                        )
                                        Spacer(modifier = Modifier.width(8.dp))
                                        Text("Customer reason matches physical state", fontSize = 13.sp)
                                    }
                                    HorizontalDivider(modifier = Modifier.padding(vertical = 4.dp))
                                    Text("Overall QC Result:", fontWeight = FontWeight.Bold, fontSize = 13.sp)
                                    Row(verticalAlignment = Alignment.CenterVertically) {
                                        RadioButton(
                                            selected = isQcPassed,
                                            onClick = { isQcPassed = true }
                                        )
                                        Text("Passed (Restockable)", fontSize = 13.sp, color = Color(0xFF2E7D32), fontWeight = FontWeight.SemiBold)
                                        Spacer(modifier = Modifier.width(16.dp))
                                        RadioButton(
                                            selected = !isQcPassed,
                                            onClick = { isQcPassed = false }
                                        )
                                        Text("Failed (Damaged)", fontSize = 13.sp, color = Color.Red, fontWeight = FontWeight.SemiBold)
                                    }
                                    OutlinedTextField(
                                        value = qcNote,
                                        onValueChange = { qcNote = it },
                                        label = { Text("QC Notes / Remarks (Optional)") },
                                        modifier = Modifier.fillMaxWidth(),
                                        singleLine = false,
                                        maxLines = 3
                                    )
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
                                    "1. Ensure original packaging is present.\n2. Check for physical damage not mentioned in reason.\n3. Verify all accessories / items match quantity.",
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
                        when (returnRequest.status) {
                            ReturnStatus.PICKUP_SCHEDULED.name -> {
                                Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                    Button(
                                        onClick = { 
                                            if (capturedBitmap == null) {
                                                errorText = "Please take a product photo first."
                                                return@Button
                                            }
                                            showConfirmDialog = true 
                                        },
                                        modifier = Modifier.fillMaxWidth().height(52.dp),
                                        enabled = !isSubmitting,
                                        shape = RoundedCornerShape(12.dp),
                                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF1976D2))
                                    ) {
                                        if (isSubmitting) {
                                            CircularProgressIndicator(color = Color.White, modifier = Modifier.size(24.dp))
                                        } else {
                                            Row(verticalAlignment = Alignment.CenterVertically) {
                                                Icon(Icons.Default.CheckCircle, contentDescription = null, modifier = Modifier.size(20.dp))
                                                Spacer(modifier = Modifier.width(8.dp))
                                                Text("ACCEPT & CONFIRM PICKUP", fontWeight = FontWeight.Bold, fontSize = 15.sp)
                                            }
                                        }
                                    }

                                    OutlinedButton(
                                        onClick = {
                                            if (rejectPhotoBitmap == null && capturedBitmap != null) {
                                                rejectPhotoBitmap = capturedBitmap
                                            }
                                            showRejectDialog = true
                                        },
                                        modifier = Modifier.fillMaxWidth().height(50.dp),
                                        enabled = !isSubmitting,
                                        shape = RoundedCornerShape(12.dp),
                                        colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFD32F2F)),
                                        border = BorderStroke(1.5.dp, Color(0xFFD32F2F))
                                    ) {
                                        Row(verticalAlignment = Alignment.CenterVertically) {
                                            Icon(Icons.Default.Cancel, contentDescription = null, tint = Color(0xFFD32F2F), modifier = Modifier.size(20.dp))
                                            Spacer(modifier = Modifier.width(8.dp))
                                            Text("REJECT RETURN AT DOORSTEP", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                                        }
                                    }
                                }
                            }
                            "REJECTED_AT_DOORSTEP", "QC_REJECTED" -> {
                                Surface(
                                    color = Color(0xFFFFEBEE),
                                    shape = RoundedCornerShape(12.dp),
                                    border = BorderStroke(1.dp, Color(0xFFFFCDD2)),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                                        Icon(Icons.Default.Cancel, contentDescription = null, tint = Color(0xFFD32F2F), modifier = Modifier.size(26.dp))
                                        Spacer(modifier = Modifier.width(12.dp))
                                        Column {
                                            Text("QC Rejected at Doorstep", fontWeight = FontWeight.Bold, fontSize = 14.sp, color = Color(0xFFB71C1C))
                                            Text("Return item rejected by rider. Proof uploaded.", fontSize = 12.sp, color = Color(0xFFD32F2F))
                                        }
                                    }
                                }
                            }
                            "PICKED_UP" -> {
                                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                    Surface(
                                        color = Color(0xFFFFF8E1),
                                        shape = RoundedCornerShape(8.dp),
                                        border = BorderStroke(1.dp, Color(0xFFFFD54F)),
                                        modifier = Modifier.fillMaxWidth()
                                    ) {
                                        Row(modifier = Modifier.padding(10.dp), verticalAlignment = Alignment.CenterVertically) {
                                            Text("🎒", fontSize = 16.sp)
                                            Spacer(modifier = Modifier.width(8.dp))
                                            Text("Item is in your bag. Deposit at Hub to earn ₹25 return commission.", fontSize = 12.sp, color = Color(0xFFE65100), fontWeight = FontWeight.Medium)
                                        }
                                    }
                                    Button(
                                        onClick = {
                                            scope.launch {
                                                isSubmitting = true
                                                val success = viewModel.depositReturnAtHub(returnId)
                                                if (success) {
                                                    onConfirmPickup()
                                                } else {
                                                    errorText = "Failed to record hub deposit. Please retry."
                                                }
                                                isSubmitting = false
                                            }
                                        },
                                        enabled = !isSubmitting,
                                        modifier = Modifier.fillMaxWidth().height(56.dp),
                                        shape = RoundedCornerShape(12.dp),
                                        colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2E7D32))
                                    ) {
                                        if (isSubmitting) {
                                            CircularProgressIndicator(color = Color.White, modifier = Modifier.size(24.dp))
                                        } else {
                                            Row(verticalAlignment = Alignment.CenterVertically) {
                                                Icon(Icons.Default.Warehouse, contentDescription = null)
                                                Spacer(modifier = Modifier.width(8.dp))
                                                Text("DEPOSIT AT HUB (+₹25 EARNED)", fontWeight = FontWeight.Bold, fontSize = 14.sp)
                                            }
                                        }
                                    }
                                }
                            }
                            "HUB_RECEIVED" -> {
                                Surface(
                                    color = Color(0xFFE8F5E9),
                                    shape = RoundedCornerShape(12.dp),
                                    border = BorderStroke(1.dp, Color(0xFFA5D6A7)),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Row(modifier = Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
                                        Icon(Icons.Default.CheckCircle, contentDescription = null, tint = Color(0xFF2E7D32), modifier = Modifier.size(24.dp))
                                        Spacer(modifier = Modifier.width(12.dp))
                                        Column {
                                            Text("Deposited at Warehouse Hub", fontWeight = FontWeight.Bold, fontSize = 14.sp, color = Color(0xFF1B5E20))
                                            Text("✓ Verified in Hub Inventory (₹25 Earned)", fontSize = 12.sp, color = Color(0xFF2E7D32))
                                        }
                                    }
                                }
                            }
                            else -> {
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

    // QC Confirm Dialog
    if (showConfirmDialog) {
        AlertDialog(
            onDismissRequest = { showConfirmDialog = false },
            title = { Text("Confirm Pickup & QC", fontWeight = FontWeight.Bold) },
            text = { Text("Confirm pickup and record QC result as ${if (isQcPassed) "PASSED" else "FAILED"}?") },
            confirmButton = {
                Button(
                    onClick = {
                        showConfirmDialog = false
                        scope.launch {
                            isSubmitting = true
                            val success = viewModel.submitReturnQC(
                                returnId = returnId,
                                qcPassed = isQcPassed,
                                note = qcNote,
                                photoBitmap = capturedBitmap
                            )
                            if (success) {
                                onConfirmPickup()
                            } else {
                                errorText = "Failed to update return. Please check internet connection."
                            }
                            isSubmitting = false
                        }
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF2E7D32))
                ) {
                    Text("Confirm Pickup")
                }
            },
            dismissButton = {
                TextButton(onClick = { showConfirmDialog = false }) {
                    Text("Cancel")
                }
            }
        )
    }

    // Doorstep QC Reject Dialog
    if (showRejectDialog) {
        val rejectionReasons = listOf(
            "📦 Seal Broken / Package Tampered",
            "🏷️ Tags Missing / Used Item",
            "❌ Wrong Product Returned",
            "⚠️ Physical Damage by Customer",
            "🚫 Customer Refused Handover",
            "📝 Other Issue"
        )

        AlertDialog(
            onDismissRequest = { if (!isSubmitting) showRejectDialog = false },
            title = {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.Warning, contentDescription = null, tint = Color(0xFFD32F2F))
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Reject Return at Doorstep", fontWeight = FontWeight.Bold, fontSize = 18.sp, color = Color(0xFFD32F2F))
                }
            },
            text = {
                LazyColumn(
                    modifier = Modifier.fillMaxWidth(),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    item {
                        Text(
                            "Select reason why this item failed doorstep QC inspection:",
                            fontSize = 13.sp,
                            color = Color.DarkGray
                        )
                    }

                    item {
                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                            rejectionReasons.forEach { reasonItem ->
                                val isSelected = rejectReason == reasonItem
                                Surface(
                                    onClick = { rejectReason = reasonItem },
                                    shape = RoundedCornerShape(8.dp),
                                    color = if (isSelected) Color(0xFFFFEBEE) else Color(0xFFF5F5F5),
                                    border = BorderStroke(
                                        1.dp,
                                        if (isSelected) Color(0xFFD32F2F) else Color.Transparent
                                    ),
                                    modifier = Modifier.fillMaxWidth()
                                ) {
                                    Row(
                                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 10.dp),
                                        verticalAlignment = Alignment.CenterVertically
                                    ) {
                                        RadioButton(
                                            selected = isSelected,
                                            onClick = { rejectReason = reasonItem },
                                            colors = RadioButtonDefaults.colors(selectedColor = Color(0xFFD32F2F))
                                        )
                                        Spacer(modifier = Modifier.width(6.dp))
                                        Text(
                                            text = reasonItem,
                                            fontSize = 13.sp,
                                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Normal,
                                            color = if (isSelected) Color(0xFFB71C1C) else Color.Black
                                        )
                                    }
                                }
                            }
                        }
                    }

                    // Mandatory Photo Proof Section
                    item {
                        Surface(
                            shape = RoundedCornerShape(10.dp),
                            color = Color(0xFFFAFAFA),
                            border = BorderStroke(1.dp, if (rejectPhotoBitmap == null) Color(0xFFFFCDD2) else Color(0xFFA5D6A7)),
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column(
                                modifier = Modifier.padding(12.dp),
                                horizontalAlignment = Alignment.CenterHorizontally
                            ) {
                                Row(
                                    modifier = Modifier.fillMaxWidth(),
                                    horizontalArrangement = Arrangement.SpaceBetween,
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text("Photo Proof (Mandatory)", fontWeight = FontWeight.Bold, fontSize = 13.sp, color = Color(0xFFD32F2F))
                                    if (rejectPhotoBitmap != null) {
                                        Text("✓ Photo Captured", fontSize = 11.sp, color = Color(0xFF2E7D32), fontWeight = FontWeight.Bold)
                                    }
                                }

                                Spacer(modifier = Modifier.height(8.dp))

                                if (rejectPhotoBitmap != null) {
                                    Image(
                                        bitmap = rejectPhotoBitmap!!.asImageBitmap(),
                                        contentDescription = "QC Rejection Photo",
                                        modifier = Modifier
                                            .fillMaxWidth()
                                            .height(140.dp)
                                            .clip(RoundedCornerShape(8.dp)),
                                        contentScale = ContentScale.Crop
                                    )
                                    Spacer(modifier = Modifier.height(8.dp))
                                }

                                OutlinedButton(
                                    onClick = {
                                        if (ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                                            rejectCameraLauncher.launch()
                                        } else {
                                            rejectPermissionLauncher.launch(Manifest.permission.CAMERA)
                                        }
                                    },
                                    modifier = Modifier.fillMaxWidth(),
                                    colors = ButtonDefaults.outlinedButtonColors(contentColor = Color(0xFFD32F2F)),
                                    border = BorderStroke(1.dp, Color(0xFFD32F2F))
                                ) {
                                    Icon(Icons.Default.PhotoCamera, contentDescription = null, modifier = Modifier.size(18.dp))
                                    Spacer(modifier = Modifier.width(6.dp))
                                    Text(if (rejectPhotoBitmap == null) "Take Proof Photo" else "Retake Photo", fontSize = 12.sp)
                                }
                            }
                        }
                    }

                    // Optional Notes
                    item {
                        OutlinedTextField(
                            value = rejectNotes,
                            onValueChange = { rejectNotes = it },
                            label = { Text("Remarks / Explanation") },
                            placeholder = { Text("e.g. Customer seal was torn, liquid leaking...") },
                            modifier = Modifier.fillMaxWidth(),
                            maxLines = 3
                        )
                    }

                    if (rejectPhotoError != null) {
                        item {
                            Text(
                                text = rejectPhotoError!!,
                                color = Color.Red,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        if (rejectPhotoBitmap == null) {
                            rejectPhotoError = "Photo proof is mandatory to reject return!"
                            return@Button
                        }
                        scope.launch {
                            isSubmitting = true
                            rejectPhotoError = null
                            val success = viewModel.rejectReturnAtDoorstep(
                                returnId = returnId,
                                reason = rejectReason,
                                notes = rejectNotes,
                                photoBitmap = rejectPhotoBitmap
                            )
                            if (success) {
                                showRejectDialog = false
                                onConfirmPickup()
                            } else {
                                rejectPhotoError = "Failed to submit rejection. Please retry."
                            }
                            isSubmitting = false
                        }
                    },
                    enabled = !isSubmitting,
                    colors = ButtonDefaults.buttonColors(containerColor = Color(0xFFD32F2F))
                ) {
                    if (isSubmitting) {
                        CircularProgressIndicator(color = Color.White, modifier = Modifier.size(18.dp))
                    } else {
                        Text("Confirm QC Rejection", fontWeight = FontWeight.Bold)
                    }
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { showRejectDialog = false },
                    enabled = !isSubmitting
                ) {
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
            Text("Return #${request.id.takeLast(6).uppercase()}", fontWeight = FontWeight.ExtraBold, fontSize = 22.sp)
            Text("Scheduled Pickup", color = Color.Gray, fontSize = 14.sp)
        }
        StatusBadge(request.status)
    }
}
