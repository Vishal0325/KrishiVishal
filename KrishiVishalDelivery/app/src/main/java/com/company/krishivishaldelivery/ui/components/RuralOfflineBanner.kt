package com.company.krishivishaldelivery.ui.components

import androidx.compose.animation.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudDone
import androidx.compose.material.icons.filled.CloudSync
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material.icons.filled.WifiOff
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

@Composable
fun RuralOfflineBanner(
    isConnected: Boolean,
    pendingSyncCount: Int = 0,
    isSyncing: Boolean = false,
    onSyncNow: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    // Show banner if disconnected, or syncing, or has pending records
    val shouldShow = !isConnected || isSyncing || pendingSyncCount > 0

    AnimatedVisibility(
        visible = shouldShow,
        enter = expandVertically() + fadeIn(),
        exit = shrinkVertically() + fadeOut(),
        modifier = modifier
    ) {
        when {
            // STATE 1: Offline Zero Network
            !isConnected -> {
                Surface(
                    color = Color(0xFFB71C1C),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 14.dp, vertical = 10.dp)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Row(verticalAlignment = Alignment.CenterVertically) {
                                Icon(
                                    Icons.Default.WifiOff,
                                    contentDescription = null,
                                    tint = Color.White,
                                    modifier = Modifier.size(20.dp)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text(
                                    text = "ग्रामीण ऑफलाइन मोड (No Internet)",
                                    color = Color.White,
                                    fontWeight = FontWeight.Black,
                                    fontSize = 13.sp
                                )
                            }
                            if (pendingSyncCount > 0) {
                                Surface(
                                    color = Color.White.copy(alpha = 0.2f),
                                    shape = RoundedCornerShape(12.dp)
                                ) {
                                    Text(
                                        text = "$pendingSyncCount पेंडिंग सिंक",
                                        color = Color.White,
                                        fontSize = 11.sp,
                                        fontWeight = FontWeight.Bold,
                                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp)
                                    )
                                }
                            }
                        }

                        Spacer(modifier = Modifier.height(4.dp))
                        Text(
                            text = "चिंता न करें! आपकी डिलीवरी, फोटो और OTP फोन में 100% सुरक्षित हैं। नेटवर्क मिलते ही वेयरहाउस सर्वर से अपने-आप सिंक हो जाएंगे।",
                            color = Color(0xFFFFCDD2),
                            fontSize = 11.sp,
                            lineHeight = 15.sp
                        )
                    }
                }
            }

            // STATE 2: Syncing in progress
            isSyncing -> {
                Surface(
                    color = Color(0xFFE65100),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 14.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            CircularProgressIndicator(
                                color = Color.White,
                                strokeWidth = 2.dp,
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "डेटा सर्वर से सिंक हो रहा है...",
                                color = Color.White,
                                fontWeight = FontWeight.Bold,
                                fontSize = 12.sp
                            )
                        }
                        if (pendingSyncCount > 0) {
                            Text(
                                text = "$pendingSyncCount बाकी",
                                color = Color(0xFFFFE0B2),
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }
            }

            // STATE 3: Connected but has pending items to sync
            pendingSyncCount > 0 -> {
                Surface(
                    color = Color(0xFF1B5E20),
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Row(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 14.dp, vertical = 6.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            Icon(
                                Icons.Default.CloudSync,
                                contentDescription = null,
                                tint = Color.White,
                                modifier = Modifier.size(18.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "इंटरनेट चालू है! $pendingSyncCount रिकॉर्ड्स सिंक के लिए तैयार हैं",
                                color = Color.White,
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                        TextButton(
                            onClick = onSyncNow,
                            colors = ButtonDefaults.textButtonColors(contentColor = Color.White),
                            contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp)
                        ) {
                            Text(
                                "अभी सिंक करें",
                                fontSize = 11.sp,
                                fontWeight = FontWeight.Black,
                                color = Color(0xFFFFEB3B)
                            )
                        }
                    }
                }
            }
        }
    }
}
