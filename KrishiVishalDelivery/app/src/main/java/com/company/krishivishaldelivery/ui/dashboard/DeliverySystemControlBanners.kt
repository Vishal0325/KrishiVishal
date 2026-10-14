package com.company.krishivishaldelivery.ui.dashboard

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Block
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.PauseCircle
import androidx.compose.material.icons.filled.QrCode
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.company.krishivishaldelivery.data.model.DeliveryHubConfig

/**
 * Persistent warning banner shown on Home/Dashboard when the rider's
 * assigned hub is under lockdown or service is paused.
 */
@Composable
fun HubLockdownBanner(
    hubConfig: DeliveryHubConfig,
    modifier: Modifier = Modifier
) {
    val isLockdown = hubConfig.isLockdown
    val hubLabel = if (hubConfig.hubId.isNotBlank()) " [Hub: ${hubConfig.hubId}]" else ""

    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (isLockdown) Color(0xFFDC2626) else Color(0xFFD97706)
        ),
        border = BorderStroke(1.5.dp, if (isLockdown) Color(0xFFB91C1C) else Color(0xFFB45309))
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = if (isLockdown) Icons.Default.Block else Icons.Default.PauseCircle,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(28.dp)
            )
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = if (isLockdown) "🛑 हब लॉकडाउन सक्रिय$hubLabel" else "⏸️ हब सेवा स्थगित$hubLabel",
                    color = Color.White,
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 15.sp
                )
                Spacer(modifier = Modifier.height(2.dp))
                Text(
                    text = if (isLockdown) {
                        "प्रबंधन द्वारा हब संचालन पूर्णतः बंद किया गया है। नए ऑर्डर स्वीकार करना और डिलीवरी रूट शुरू करना प्रतिबंधित है।"
                    } else {
                        "हब वर्तमान में नए ऑर्डर स्वीकार नहीं कर रहा है। कृपया हब मैनेजर के अगले निर्देश की प्रतीक्षा करें।"
                    },
                    color = Color.White.copy(alpha = 0.95f),
                    fontSize = 12.sp,
                    lineHeight = 17.sp,
                    fontWeight = FontWeight.Medium
                )
            }
        }
    }
}

/**
 * Notice banner displayed when Cash Collection (COD) is disabled globally
 * or at the rider's specific hub.
 */
@Composable
fun CashCollectionNoticeBanner(
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(containerColor = Color(0xFFFFFBEB)),
        border = BorderStroke(1.dp, Color(0xFFF59E0B))
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = Icons.Default.QrCode,
                contentDescription = null,
                tint = Color(0xFFD97706),
                modifier = Modifier.size(24.dp)
            )
            Spacer(modifier = Modifier.width(10.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "💵 कैश स्वीकार करना बंद (Digital Payment Only)",
                    color = Color(0xFF92400E),
                    fontWeight = FontWeight.Bold,
                    fontSize = 13.sp
                )
                Text(
                    text = "सिस्टम में कैश कलेक्शन बंद है। सभी डिलीवरी पर ग्राहक से केवल UPI QR या डिजिटल भुगतान स्वीकार करें।",
                    color = Color(0xFFB45309),
                    fontSize = 11.sp,
                    lineHeight = 15.sp
                )
            }
        }
    }
}

/**
 * Notice chip displayed when automated order assignment is disabled by Admin.
 */
@Composable
fun AutoAssignmentStatusChip(
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(10.dp),
        color = Color(0xFFEFF6FF),
        border = BorderStroke(1.dp, Color(0xFFBFDBFE))
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = Icons.Default.Info,
                contentDescription = null,
                tint = Color(0xFF2563EB),
                modifier = Modifier.size(16.dp)
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = "ऑटो-असाइनमेंट बंद: नए ऑर्डर हब से मैन्युअल रूप से आवंटित किए जाएंगे।",
                color = Color(0xFF1E40AF),
                fontWeight = FontWeight.SemiBold,
                fontSize = 12.sp
            )
        }
    }
}
