package com.company.krishivishal.ui.services

import android.content.Intent
import android.net.Uri
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.viewmodel.compose.viewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BookingTrackingScreen(
    bookingId: String,
    onBack: () -> Unit,
    viewModel: ServiceViewModel = viewModel()
) {
    val bookingStatus by viewModel.bookingStatus.collectAsState()
    val context = LocalContext.current

    LaunchedEffect(bookingId) {
        viewModel.trackBooking(bookingId)
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Service Live Tracker", fontWeight = FontWeight.Bold) },
                navigationIcon = {
                    IconButton(onClick = onBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.primaryContainer,
                    titleContentColor = MaterialTheme.colorScheme.onPrimaryContainer
                )
            )
        }
    ) { padding ->
        val booking = bookingStatus
        if (booking == null) {
            Box(modifier = Modifier.fillMaxSize().padding(padding), contentAlignment = Alignment.Center) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    CircularProgressIndicator()
                    Spacer(modifier = Modifier.height(16.dp))
                    Text("Loading booking live tracking details...")
                }
            }
        } else {
            val status = booking.status
            val isSearching = status == "PENDING_ASSIGNMENT"

            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .verticalScroll(rememberScrollState())
                    .padding(16.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                // Header Status Card
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(
                        containerColor = if (status == "COMPLETED") MaterialTheme.colorScheme.primaryContainer
                        else if (status == "NO_PARTNER_FOUND") MaterialTheme.colorScheme.errorContainer
                        else MaterialTheme.colorScheme.secondaryContainer
                    ),
                    shape = RoundedCornerShape(16.dp)
                ) {
                    Column(modifier = Modifier.padding(20.dp)) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Column {
                                Text(
                                    text = booking.serviceName,
                                    style = MaterialTheme.typography.titleLarge,
                                    fontWeight = FontWeight.Bold
                                )
                                Text(
                                    text = "Booking ID: #${booking.id.takeLast(8)}",
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }

                            Surface(
                                shape = CircleShape,
                                color = when (status) {
                                    "COMPLETED" -> Color(0xFF1B5E20)
                                    "IN_PROGRESS" -> Color(0xFFE65100)
                                    "ON_THE_WAY" -> Color(0xFF0277BD)
                                    "ASSIGNED" -> Color(0xFF2E7D32)
                                    "NO_PARTNER_FOUND" -> MaterialTheme.colorScheme.error
                                    else -> MaterialTheme.colorScheme.primary
                                }
                            ) {
                                Text(
                                    text = when (status) {
                                        "PENDING_ASSIGNMENT" -> "SEARCHING PARTNER"
                                        "ASSIGNED" -> "PARTNER ASSIGNED"
                                        "ON_THE_WAY" -> "EN ROUTE"
                                        "IN_PROGRESS" -> "JOB IN PROGRESS"
                                        "COMPLETED" -> "COMPLETED ✓"
                                        "NO_PARTNER_FOUND" -> "NO PARTNER FOUND"
                                        else -> status
                                    },
                                    style = MaterialTheme.typography.labelSmall,
                                    fontWeight = FontWeight.Bold,
                                    color = Color.White,
                                    modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp)
                                )
                            }
                        }

                        if (isSearching) {
                            Spacer(modifier = Modifier.height(16.dp))
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                                Spacer(modifier = Modifier.width(12.dp))
                                Text(
                                    text = "Notifying nearby partners in your radius...",
                                    style = MaterialTheme.typography.bodyMedium,
                                    fontWeight = FontWeight.Medium
                                )
                            }
                        }
                    }
                }

                // Visual Timeline Stepper
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            text = "Live Execution Progress",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.padding(bottom = 12.dp)
                        )

                        val steps = listOf(
                            "PENDING_ASSIGNMENT" to "Request Sent",
                            "ASSIGNED" to "Partner Accepted",
                            "ON_THE_WAY" to "Partner En Route",
                            "IN_PROGRESS" to "Work In Progress",
                            "COMPLETED" to "Job Completed"
                        )

                        val currentStepIndex = when (status) {
                            "PENDING_ASSIGNMENT" -> 0
                            "ASSIGNED" -> 1
                            "ON_THE_WAY" -> 2
                            "IN_PROGRESS" -> 3
                            "COMPLETED" -> 4
                            else -> 0
                        }

                        steps.forEachIndexed { idx, (stepKey, label) ->
                            Row(
                                verticalAlignment = Alignment.CenterVertically,
                                modifier = Modifier.padding(vertical = 6.dp)
                            ) {
                                Surface(
                                    shape = CircleShape,
                                    color = if (idx <= currentStepIndex) MaterialTheme.colorScheme.primary
                                            else MaterialTheme.colorScheme.outlineVariant,
                                    modifier = Modifier.size(24.dp)
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        if (idx <= currentStepIndex) {
                                            Icon(
                                                imageVector = Icons.Default.Check,
                                                contentDescription = null,
                                                tint = Color.White,
                                                modifier = Modifier.size(14.dp)
                                            )
                                        } else {
                                            Text(
                                                text = "${idx + 1}",
                                                style = MaterialTheme.typography.labelSmall,
                                                color = MaterialTheme.colorScheme.onSurfaceVariant
                                            )
                                        }
                                    }
                                }

                                Spacer(modifier = Modifier.width(12.dp))
                                Text(
                                    text = label,
                                    style = MaterialTheme.typography.bodyMedium,
                                    fontWeight = if (idx == currentStepIndex) FontWeight.Bold else FontWeight.Normal,
                                    color = if (idx <= currentStepIndex) MaterialTheme.colorScheme.onSurface
                                            else MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                    }
                }

                // Security OTP Cards for Farmer
                if (status == "ASSIGNED" || status == "ON_THE_WAY") {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
                        shape = RoundedCornerShape(16.dp)
                    ) {
                        Column(
                            modifier = Modifier.padding(20.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Text(
                                text = "🔑 START JOB SECURITY OTP",
                                style = MaterialTheme.typography.labelLarge,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onPrimaryContainer
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = booking.startOtp ?: "----",
                                style = MaterialTheme.typography.displayMedium,
                                fontWeight = FontWeight.Black,
                                letterSpacing = 8.sp,
                                color = MaterialTheme.colorScheme.primary
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = "Share this 4-digit OTP with partner when they arrive at your farm to start work.",
                                style = MaterialTheme.typography.bodySmall,
                                textAlign = TextAlign.Center,
                                color = MaterialTheme.colorScheme.onPrimaryContainer
                            )
                        }
                    }
                }

                if (status == "IN_PROGRESS") {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.tertiaryContainer),
                        shape = RoundedCornerShape(16.dp)
                    ) {
                        Column(
                            modifier = Modifier.padding(20.dp),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Text(
                                text = "✅ END JOB SECURITY OTP",
                                style = MaterialTheme.typography.labelLarge,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onTertiaryContainer
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = booking.endOtp ?: "----",
                                style = MaterialTheme.typography.displayMedium,
                                fontWeight = FontWeight.Black,
                                letterSpacing = 8.sp,
                                color = MaterialTheme.colorScheme.tertiary
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            Text(
                                text = "Share this 4-digit OTP with partner AFTER service completion to verify & finalize payment.",
                                style = MaterialTheme.typography.bodySmall,
                                textAlign = TextAlign.Center,
                                color = MaterialTheme.colorScheme.onTertiaryContainer
                            )
                        }
                    }
                }

                // Partner Info Card with Call Action
                if (!booking.assignedPartnerId.isNullOrBlank()) {
                    Card(
                        modifier = Modifier.fillMaxWidth(),
                        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
                    ) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(16.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Surface(
                                    shape = CircleShape,
                                    color = MaterialTheme.colorScheme.primary,
                                    modifier = Modifier.size(44.dp)
                                ) {
                                    Box(contentAlignment = Alignment.Center) {
                                        Icon(Icons.Default.Person, contentDescription = null, tint = Color.White)
                                    }
                                }
                                Spacer(modifier = Modifier.width(12.dp))
                                Column {
                                    Text(
                                        text = "Assigned Agri Partner",
                                        style = MaterialTheme.typography.labelMedium
                                    )
                                    Text(
                                        text = "Partner #${booking.assignedPartnerId!!.takeLast(6)}",
                                        style = MaterialTheme.typography.titleMedium,
                                        fontWeight = FontWeight.Bold
                                    )
                                }
                            }

                            IconButton(
                                onClick = {
                                    val intent = Intent(Intent.ACTION_DIAL).apply {
                                        data = Uri.parse("tel:9876543210")
                                    }
                                    context.startActivity(intent)
                                },
                                modifier = Modifier
                                    .background(MaterialTheme.colorScheme.primary, CircleShape)
                                    .size(40.dp)
                            ) {
                                Icon(Icons.Default.Phone, contentDescription = "Call Partner", tint = Color.White)
                            }
                        }
                    }
                }

                // Booking Summary Card
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
                ) {
                    Column(modifier = Modifier.padding(16.dp)) {
                        Text(
                            text = "Booking Details",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                        Spacer(modifier = Modifier.height(12.dp))

                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Service:", style = MaterialTheme.typography.bodyMedium)
                            Text(booking.serviceName, fontWeight = FontWeight.Bold)
                        }

                        if (!booking.selectedVariantName.isNullOrBlank()) {
                            Spacer(modifier = Modifier.height(6.dp))
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("Package:", style = MaterialTheme.typography.bodyMedium)
                                Text(booking.selectedVariantName!!, fontWeight = FontWeight.Bold)
                            }
                        }

                        if (booking.farmArea != null) {
                            Spacer(modifier = Modifier.height(6.dp))
                            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                                Text("Farm Area:", style = MaterialTheme.typography.bodyMedium)
                                Text("${booking.farmArea} ${booking.areaUnit}", fontWeight = FontWeight.Bold)
                            }
                        }

                        Spacer(modifier = Modifier.height(6.dp))
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Total Amount:", style = MaterialTheme.typography.bodyMedium)
                            Text("₹${booking.amount}", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                        }

                        Spacer(modifier = Modifier.height(6.dp))
                        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                            Text("Payment Mode:", style = MaterialTheme.typography.bodyMedium)
                            Text(booking.paymentMethod, fontWeight = FontWeight.Bold)
                        }
                    }
                }

                // Bottom Action
                if (status == "COMPLETED") {
                    Button(
                        onClick = onBack,
                        modifier = Modifier.fillMaxWidth().height(50.dp)
                    ) {
                        Text("Back to Home", fontSize = 16.sp, fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

