package com.company.krishivishal.ui.checkout

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ShoppingBag
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.company.krishivishal.R
import com.company.krishivishal.ui.theme.PrimaryGreen
import com.airbnb.lottie.compose.*

@Composable
fun OrderSuccessScreen(
    otp: String = "",
    orderId: String = "",
    onContinueShopping: () -> Unit,
    onTrackOrder: () -> Unit
) {
    val composition by rememberLottieComposition(LottieCompositionSpec.RawRes(R.raw.anim_order_success))
    val progress by animateLottieCompositionAsState(
        composition = composition,
        iterations = LottieConstants.IterateForever
    )

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        // Lottie Animation
        LottieAnimation(
            composition = composition,
            progress = { progress },
            modifier = Modifier.size(200.dp)
        )

        Spacer(modifier = Modifier.height(16.dp))

        // Confirmation Text
        Text(
            text = stringResource(R.string.order_success),
            fontSize = 24.sp,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onBackground,
            textAlign = TextAlign.Center
        )

        if (otp.isNotEmpty()) {
            Spacer(modifier = Modifier.height(24.dp))
            Surface(
                color = Color(0xFFFFF9C4), // Light Yellow
                shape = RoundedCornerShape(16.dp),
                border = androidx.compose.foundation.BorderStroke(1.dp, Color(0xFFFBC02D))
            ) {
                Column(
                    modifier = Modifier.padding(horizontal = 32.dp, vertical = 16.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Text("Delivery PIN", fontWeight = FontWeight.Bold, fontSize = 12.sp, color = Color(0xFFF57F17))
                    Text(
                        text = otp,
                        fontWeight = FontWeight.Black,
                        fontSize = 32.sp,
                        letterSpacing = 8.sp,
                        color = Color.Black
                    )
                    Text("Share with delivery boy only", fontSize = 10.sp, color = Color.Gray)
                }
            }
        }

        Spacer(modifier = Modifier.height(12.dp))

        Text(
            text = if (orderId.isNotEmpty()) "Order #${orderId.takeLast(8).uppercase()} has been received." else "Your order has been received and is being processed. Thank you for shopping with us!",
            fontSize = 14.sp,
            color = Color.Gray,
            textAlign = TextAlign.Center,
            lineHeight = 20.sp
        )

        Spacer(modifier = Modifier.height(48.dp))

        // Action Buttons
        Button(
            onClick = onTrackOrder,
            modifier = Modifier
                .fillMaxWidth()
                .height(54.dp),
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.buttonColors(containerColor = PrimaryGreen)
        ) {
            Icon(Icons.Default.ShoppingBag, contentDescription = null)
            Spacer(modifier = Modifier.width(8.dp))
            Text("Track My Order", fontWeight = FontWeight.Bold, fontSize = 16.sp)
        }

        Spacer(modifier = Modifier.height(16.dp))

        OutlinedButton(
            onClick = onContinueShopping,
            modifier = Modifier
                .fillMaxWidth()
                .height(54.dp),
            shape = RoundedCornerShape(12.dp),
            border = androidx.compose.foundation.BorderStroke(1.dp, PrimaryGreen)
        ) {
            Text("Continue Shopping", color = PrimaryGreen, fontWeight = FontWeight.Bold, fontSize = 16.sp)
        }
    }
}
