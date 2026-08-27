package com.company.krishivishal.ui.product.components

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Remove
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.company.krishivishal.R
import com.company.krishivishal.ui.theme.PrimaryGreen
import com.company.krishivishal.ui.theme.SecondaryOrange

@Composable
fun BottomActions(
    quantity: Int,
    maxStock: Int,
    isOutOfStock: Boolean = false,
    isNotifyMeLoading: Boolean = false,
    notifyMeSuccess: Boolean = false,
    onQuantityChange: (Int) -> Unit,
    onAddToCart: () -> Unit,
    onBuyNow: () -> Unit,
    onNotifyMe: () -> Unit = {}
) {
    Surface(
        color = MaterialTheme.colorScheme.surface,
        shadowElevation = 8.dp,
        border = BorderStroke(0.5.dp, MaterialTheme.colorScheme.outlineVariant)
    ) {
        Column(modifier = Modifier.navigationBarsPadding().padding(16.dp)) {
            if (!isOutOfStock) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.End,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(stringResource(R.string.quantity), fontWeight = FontWeight.Medium, fontSize = 14.sp)
                    Spacer(modifier = Modifier.width(8.dp))
                    Row(
                        modifier = Modifier
                            .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(4.dp))
                            .padding(horizontal = 4.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        IconButton(
                            onClick = { onQuantityChange(quantity - 1) },
                            modifier = Modifier.size(24.dp),
                            enabled = quantity > 1
                        ) {
                            Icon(
                                Icons.Default.Remove,
                                null,
                                modifier = Modifier.size(16.dp),
                                tint = if (quantity > 1) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.outline
                            )
                        }
                        Text(
                            "$quantity",
                            modifier = Modifier.padding(horizontal = 12.dp),
                            fontWeight = FontWeight.Bold,
                            fontSize = 14.sp
                        )
                        IconButton(
                            onClick = { onQuantityChange(quantity + 1) },
                            modifier = Modifier.size(24.dp),
                            enabled = quantity < maxStock
                        ) {
                            Icon(
                                Icons.Default.Add,
                                null,
                                modifier = Modifier.size(16.dp),
                                tint = if (quantity < maxStock) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.outline
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))
            }

            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                if (isOutOfStock) {
                    Button(
                        onClick = onNotifyMe,
                        modifier = Modifier.fillMaxWidth().height(48.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = if (notifyMeSuccess) Color.Gray else PrimaryGreen
                        ),
                        shape = RoundedCornerShape(8.dp),
                        enabled = !isNotifyMeLoading && !notifyMeSuccess
                    ) {
                        if (isNotifyMeLoading) {
                            CircularProgressIndicator(modifier = Modifier.size(24.dp), color = Color.White, strokeWidth = 2.dp)
                        } else {
                            Text(
                                if (notifyMeSuccess) stringResource(R.string.notify_request_sent) else stringResource(R.string.notify_me_label),
                                fontWeight = FontWeight.Bold,
                                fontSize = 14.sp
                            )
                        }
                    }
                } else {
                    Button(
                        onClick = onAddToCart,
                        modifier = Modifier.weight(1f).height(48.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = SecondaryOrange),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text(stringResource(R.string.add_to_cart), fontWeight = FontWeight.Bold, fontSize = 14.sp)
                    }
                    Button(
                        onClick = onBuyNow,
                        modifier = Modifier.weight(1f).height(48.dp),
                        colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen),
                        shape = RoundedCornerShape(8.dp)
                    ) {
                        Text(stringResource(R.string.buy_now), fontWeight = FontWeight.Bold, fontSize = 14.sp)
                    }
                }
            }
        }
    }
}
