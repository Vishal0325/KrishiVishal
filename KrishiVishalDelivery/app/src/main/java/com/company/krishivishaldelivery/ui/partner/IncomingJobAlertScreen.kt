package com.company.krishivishaldelivery.ui.partner

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Agriculture
import androidx.compose.material.icons.filled.LocationOn
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.company.krishivishaldelivery.utils.IncomingJobAlertManager
import kotlinx.coroutines.delay

@Composable
fun IncomingJobAlertScreen(
    serviceName: String,
    farmLocationText: String = "Village Farm Plot #4",
    farmArea: String = "5 Acres",
    estimatedEarnings: Double = 750.0,
    onAccept: () -> Unit,
    onDecline: () -> Unit
) {
    var secondsLeft by remember { mutableIntStateOf(60) }
    val context = LocalContext.current

    // ── Loud Siren + Vibration Alert (like Ola/Uber/Swiggy) ──
    val alertManager = remember { IncomingJobAlertManager(context) }

    DisposableEffect(Unit) {
        alertManager.start()
        onDispose {
            alertManager.stop()
        }
    }

    // ── Keep Screen On while alert is showing ──
    val view = LocalView.current
    DisposableEffect(Unit) {
        view.keepScreenOn = true
        onDispose {
            view.keepScreenOn = false
        }
    }

    // ── Wrapped callbacks to stop siren before navigating ──
    val wrappedOnAccept: () -> Unit = {
        alertManager.stop()
        onAccept()
    }

    val wrappedOnDecline: () -> Unit = {
        alertManager.stop()
        onDecline()
    }

    LaunchedEffect(Unit) {
        while (secondsLeft > 0) {
            delay(1000L)
            secondsLeft--
        }
        if (secondsLeft == 0) {
            wrappedOnDecline()
        }
    }

    val progress by animateFloatAsState(
        targetValue = secondsLeft / 60f,
        label = "countdown"
    )

    Surface(
        modifier = Modifier.fillMaxSize(),
        color = MaterialTheme.colorScheme.background
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.SpaceBetween
        ) {
            // Header Tag
            Surface(
                color = MaterialTheme.colorScheme.primaryContainer,
                shape = CircleShape,
                modifier = Modifier.padding(top = 16.dp)
            ) {
                Text(
                    text = "⚡ INCOMING AGRI-SERVICE JOB",
                    style = MaterialTheme.typography.labelLarge,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                    modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                )
            }

            // Central Countdown Circular Indicator
            Box(
                contentAlignment = Alignment.Center,
                modifier = Modifier.size(160.dp)
            ) {
                CircularProgressIndicator(
                    progress = { progress },
                    modifier = Modifier.fillMaxSize(),
                    color = if (secondsLeft < 15) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary,
                    strokeWidth = 10.dp
                )
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Text(
                        text = "$secondsLeft",
                        style = MaterialTheme.typography.displayMedium,
                        fontWeight = FontWeight.Bold,
                        fontSize = 44.sp
                    )
                    Text(
                        text = "seconds left",
                        style = MaterialTheme.typography.labelMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            // Job Details Card
            Card(
                modifier = Modifier.fillMaxWidth(),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant)
            ) {
                Column(modifier = Modifier.padding(20.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.Agriculture,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.primary
                        )
                        Spacer(modifier = Modifier.width(12.dp))
                        Column {
                            Text("Service Required", style = MaterialTheme.typography.labelMedium)
                            Text(
                                text = serviceName,
                                style = MaterialTheme.typography.titleLarge,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }

                    HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))

                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.LocationOn,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.secondary
                        )
                        Spacer(modifier = Modifier.width(12.dp))
                        Column {
                            Text("Farm Location & Area", style = MaterialTheme.typography.labelMedium)
                            Text(
                                text = "$farmLocationText ($farmArea)",
                                style = MaterialTheme.typography.bodyLarge
                            )
                        }
                    }

                    HorizontalDivider(modifier = Modifier.padding(vertical = 12.dp))

                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.Payments,
                            contentDescription = null,
                            tint = MaterialTheme.colorScheme.tertiary
                        )
                        Spacer(modifier = Modifier.width(12.dp))
                        Column {
                            Text("Estimated Partner Earnings", style = MaterialTheme.typography.labelMedium)
                            Text(
                                text = "₹${estimatedEarnings.toInt()} (Net after commission)",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.primary
                            )
                        }
                    }
                }
            }

            // Bottom Action Buttons
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                OutlinedButton(
                    onClick = wrappedOnDecline,
                    modifier = Modifier
                        .weight(1f)
                        .height(54.dp),
                    colors = ButtonDefaults.outlinedButtonColors(contentColor = MaterialTheme.colorScheme.error)
                ) {
                    Text("Decline", fontSize = 18.sp, fontWeight = FontWeight.Bold)
                }

                Button(
                    onClick = wrappedOnAccept,
                    modifier = Modifier
                        .weight(1.5f)
                        .height(54.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.primary)
                ) {
                    Text("ACCEPT JOB", fontSize = 18.sp, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
}
