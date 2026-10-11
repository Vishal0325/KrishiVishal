package com.company.krishivishaldelivery.ui.dashboard

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccessTime
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.google.firebase.Timestamp

/**
 * Statutory 3-State COD Settlement & Vault Security Banner
 *
 * 1. GREEN (cashInHand == 0.0): All cash settled to Hub Manager. Vault is safe.
 * 2. AMBER (cashInHand > 0.0 && hoursSinceDelivery < 24.0): Active cash, within 24-hour statutory SLA.
 * 3. RED (cashInHand > 0.0 && hoursSinceDelivery >= 24.0): Overdue (>24 hrs).
 *    New COD order allocation blocked by backend Cloud Functions. Must surrender cash immediately.
 */
@Composable
fun CodVaultSecurityBanner(
    cashInHand: Double,
    lastCodDeliveryAt: Timestamp?,
    onSettleClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val now = System.currentTimeMillis()
    val lastDeliveryMs = lastCodDeliveryAt?.toDate()?.time ?: 0L
    val hoursSinceDelivery = if (lastDeliveryMs > 0L) (now - lastDeliveryMs) / 3_600_000.0 else 0.0

    when {
        // GREEN: Fully settled
        cashInHand == 0.0 -> {
            Card(
                modifier = modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xFF22C55E)),
                border = BorderStroke(1.dp, Color(0xFF16A34A))
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.CheckCircle,
                        contentDescription = "Hub Safe",
                        tint = Color.White,
                        modifier = Modifier.size(24.dp)
                    )
                    Spacer(modifier = Modifier.width(12.dp))
                    Text(
                        text = "✅ All Cash Settled — Hub Safe",
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp
                    )
                }
            }
        }

        // RED: Overdue >=24h — BLOCKING
        cashInHand > 0.0 && hoursSinceDelivery >= 24.0 -> {
            val overdueHours = hoursSinceDelivery.toInt()
            Card(
                modifier = modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xFFDC2626)),
                border = BorderStroke(1.5.dp, Color(0xFFB91C1C))
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp)
                ) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = Icons.Default.Warning,
                            contentDescription = "Overdue Warning",
                            tint = Color.White,
                            modifier = Modifier.size(24.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "⚠️ Settlement Overdue (${overdueHours}h)",
                            color = Color.White,
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 16.sp
                        )
                    }
                    Spacer(modifier = Modifier.height(6.dp))
                    Text(
                        text = "New COD deliveries BLOCKED by system",
                        color = Color.White.copy(alpha = 0.95f),
                        fontSize = 13.sp,
                        fontWeight = FontWeight.Medium
                    )
                    Text(
                        text = "Cash in Hand: ₹${cashInHand.toInt()}",
                        color = Color.White,
                        fontWeight = FontWeight.Bold,
                        fontSize = 14.sp
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Button(
                        onClick = onSettleClick,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color.White,
                            contentColor = Color(0xFFDC2626)
                        ),
                        shape = RoundedCornerShape(8.dp),
                        modifier = Modifier.fillMaxWidth()
                    ) {
                        Text(
                            text = "Submit Cash to Hub Now",
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFFDC2626)
                        )
                    }
                }
            }
        }

        // AMBER: Active cash, within SLA (<24h)
        else -> {
            val deadlineHours = kotlin.math.max(1, (24.0 - hoursSinceDelivery).toInt())
            Card(
                modifier = modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xFFF59E0B)),
                border = BorderStroke(1.dp, Color(0xFFD97706))
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(14.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Icon(
                        imageVector = Icons.Default.AccessTime,
                        contentDescription = "Active Cash",
                        tint = Color.White,
                        modifier = Modifier.size(26.dp)
                    )
                    Spacer(modifier = Modifier.width(12.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Cash in Hand: ₹${cashInHand.toInt()}",
                            color = Color.White,
                            fontWeight = FontWeight.ExtraBold,
                            fontSize = 15.sp
                        )
                        Text(
                            text = "Settle within ${deadlineHours}h",
                            color = Color.White.copy(alpha = 0.95f),
                            fontSize = 12.sp,
                            fontWeight = FontWeight.Medium
                        )
                    }
                    Button(
                        onClick = onSettleClick,
                        colors = ButtonDefaults.buttonColors(
                            containerColor = Color.White,
                            contentColor = Color(0xFFD97706)
                        ),
                        shape = RoundedCornerShape(8.dp),
                        contentPadding = PaddingValues(horizontal = 14.dp, vertical = 6.dp)
                    ) {
                        Text(
                            text = "Settle Now",
                            fontWeight = FontWeight.Bold,
                            color = Color(0xFFD97706),
                            fontSize = 12.sp
                        )
                    }
                }
            }
        }
    }
}
