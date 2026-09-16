package com.company.krishivishaldelivery.ui.order_detail.components

import android.graphics.Bitmap
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CameraAlt
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.WarningAmber
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog

@Composable
fun ReattemptDialog(
    orderId: String,
    onDismiss: () -> Unit,
    onSubmit: (reason: String, notes: String, isRTO: Boolean, photo: Bitmap?) -> Unit
) {
    val reasons = listOf(
        "किसान का फोन नहीं लग रहा / बंद है",
        "किसान गाँव में नहीं है / कल डिलीवरी चाहिए",
        "किसान ने सामान लेने से मना कर दिया (Farmer Refused)",
        "खेत / रास्ते में पानी भरा है या मार्ग बंद है",
        "गलत पता या लैंडमार्क नहीं मिल रहा"
    )

    var selectedReason by remember { mutableStateOf(reasons[0]) }
    var customNotes by remember { mutableStateOf("") }
    var isRtoSelected by remember {
        mutableStateOf(selectedReason.contains("मना", ignoreCase = true))
    }

    var capturedPhotoBitmap by remember { mutableStateOf<Bitmap?>(null) }

    val cameraLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.TakePicturePreview()
    ) { bitmap ->
        if (bitmap != null) {
            capturedPhotoBitmap = bitmap
        }
    }

    LaunchedEffect(selectedReason) {
        isRtoSelected = selectedReason.contains("मना", ignoreCase = true)
    }

    val isSubmitEnabled = !isRtoSelected || capturedPhotoBitmap != null

    Dialog(onDismissRequest = onDismiss) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .padding(8.dp),
            shape = RoundedCornerShape(24.dp),
            colors = CardDefaults.cardColors(containerColor = Color.White),
            elevation = CardDefaults.cardElevation(defaultElevation = 8.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(20.dp)
            ) {
                // Header
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            Icons.Default.WarningAmber,
                            contentDescription = null,
                            tint = Color(0xFFD32F2F),
                            modifier = Modifier.size(24.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            "डिलीवरी समस्या दर्ज करें",
                            fontWeight = FontWeight.Black,
                            fontSize = 17.sp,
                            color = Color(0xFFB71C1C)
                        )
                    }
                    IconButton(onClick = onDismiss, modifier = Modifier.size(28.dp)) {
                        Icon(Icons.Default.Close, contentDescription = "Close", tint = Color.Gray)
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                Text(
                    "डिलीवरी न होने का कारण चुनें:",
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Bold,
                    color = Color.DarkGray
                )

                Spacer(modifier = Modifier.height(8.dp))

                LazyColumn(
                    modifier = Modifier
                        .fillMaxWidth()
                        .heightIn(max = 200.dp),
                    verticalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    items(reasons.size) { index ->
                        val reason = reasons[index]
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { selectedReason = reason }
                                .padding(vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            RadioButton(
                                selected = (selectedReason == reason),
                                onClick = { selectedReason = reason },
                                colors = RadioButtonDefaults.colors(selectedColor = Color(0xFFD32F2F))
                            )
                            Spacer(modifier = Modifier.width(4.dp))
                            Text(
                                text = reason,
                                fontSize = 13.sp,
                                fontWeight = if (selectedReason == reason) FontWeight.Bold else FontWeight.Normal,
                                color = if (selectedReason == reason) Color(0xFFB71C1C) else Color(0xFF333333)
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))

                // Photo Evidence Section (Mandatory for RTO)
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    color = if (isRtoSelected && capturedPhotoBitmap == null) Color(0xFFFFEBEE) else Color(0xFFF5F5F5)
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(12.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        if (capturedPhotoBitmap != null) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Image(
                                    bitmap = capturedPhotoBitmap!!.asImageBitmap(),
                                    contentDescription = "Failure Proof Photo",
                                    modifier = Modifier
                                        .size(52.dp)
                                        .clip(RoundedCornerShape(8.dp)),
                                    contentScale = ContentScale.Crop
                                )
                                Spacer(modifier = Modifier.width(12.dp))
                                Column {
                                    Text(
                                        "फोटो साक्ष्य संलग्न है",
                                        fontWeight = FontWeight.Bold,
                                        fontSize = 12.sp,
                                        color = Color(0xFF2E7D32)
                                    )
                                    Text(
                                        "Photo captured successfully",
                                        fontSize = 10.sp,
                                        color = Color.Gray
                                    )
                                }
                            }
                            IconButton(onClick = { capturedPhotoBitmap = null }) {
                                Icon(Icons.Default.Delete, contentDescription = "Delete photo", tint = Color(0xFFD32F2F))
                            }
                        } else {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = if (isRtoSelected) "📸 फोटो सबूत लें (अनिवार्य / Mandatory)" else "📸 फोटो सबूत लें (वैकल्पिक / Optional)",
                                    fontSize = 12.sp,
                                    fontWeight = FontWeight.Bold,
                                    color = if (isRtoSelected) Color(0xFFD32F2F) else Color(0xFF333333)
                                )
                                Text(
                                    text = "बंद दरवाजा या लोकेशन की फोटो लें",
                                    fontSize = 10.sp,
                                    color = Color.Gray
                                )
                            }
                            Button(
                                onClick = { cameraLauncher.launch(null) },
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = if (isRtoSelected) Color(0xFFD32F2F) else Color(0xFF1976D2)
                                ),
                                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp),
                                shape = RoundedCornerShape(8.dp)
                            ) {
                                Icon(Icons.Default.CameraAlt, contentDescription = null, modifier = Modifier.size(16.dp))
                                Spacer(modifier = Modifier.width(4.dp))
                                Text("फोटो खींचें", fontSize = 11.sp, fontWeight = FontWeight.Bold)
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))

                // Additional Notes
                OutlinedTextField(
                    value = customNotes,
                    onValueChange = { customNotes = it },
                    modifier = Modifier.fillMaxWidth(),
                    label = { Text("अतिरिक्त टिप्पणी (Optional)") },
                    placeholder = { Text("उदा. किसान ने शाम 5 बजे आने को कहा") },
                    shape = RoundedCornerShape(12.dp),
                    maxLines = 2
                )

                Spacer(modifier = Modifier.height(12.dp))

                // Action Type Selector (Reattempt vs RTO)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    FilterChip(
                        selected = !isRtoSelected,
                        onClick = { isRtoSelected = false },
                        label = { Text("कल पुनः प्रयास (Re-attempt)", fontSize = 11.sp, fontWeight = FontWeight.Bold) },
                        modifier = Modifier.weight(1f)
                    )
                    FilterChip(
                        selected = isRtoSelected,
                        onClick = { isRtoSelected = true },
                        label = { Text("ऑर्डर वापसी (RTO)", fontSize = 11.sp, fontWeight = FontWeight.Bold) },
                        modifier = Modifier.weight(1f)
                    )
                }

                if (isRtoSelected && capturedPhotoBitmap == null) {
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        "* RTO दर्ज करने के लिए फोटो सबूत खींचना अनिवार्य है",
                        fontSize = 11.sp,
                        fontWeight = FontWeight.Bold,
                        color = Color(0xFFD32F2F)
                    )
                }

                Spacer(modifier = Modifier.height(12.dp))

                Button(
                    onClick = {
                        if (isSubmitEnabled) {
                            onSubmit(selectedReason, customNotes, isRtoSelected, capturedPhotoBitmap)
                        }
                    },
                    enabled = isSubmitEnabled,
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(48.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (isRtoSelected) Color(0xFFD32F2F) else Color(0xFFE65100),
                        disabledContainerColor = Color.LightGray
                    ),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Text(
                        text = if (isRtoSelected) "RTO दर्ज करें (Confirm RTO)" else "पुनः प्रयास दर्ज करें (Schedule Reattempt)",
                        fontWeight = FontWeight.Bold,
                        fontSize = 13.sp
                    )
                }
            }
        }
    }
}
