package com.company.krishivishaldelivery.ui.tracking

import android.content.Context
import android.content.Intent
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.company.krishivishaldelivery.service.LocationUpdateService

@Composable
fun RiderDeliveryScreen(
    orderId: String,
    viewModel: RiderOrderViewModel
) {
    val context = LocalContext.current

    Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Text("Delivery Console", style = MaterialTheme.typography.headlineMedium)
        Text("Order: #$orderId", color = Color.Gray)
        
        Spacer(modifier = Modifier.height(32.dp))

        Button(
            onClick = { 
                viewModel.updateOrderStatus(orderId, "OUT_FOR_DELIVERY")
                startLocationService(context, orderId)
            },
            modifier = Modifier.fillMaxWidth().height(56.dp)
        ) {
            Text("Mark as Out for Delivery")
        }

        Spacer(modifier = Modifier.height(16.dp))

        Button(
            onClick = { 
                viewModel.updateOrderStatus(orderId, "DELIVERED")
                stopLocationService(context)
            },
            modifier = Modifier.fillMaxWidth().height(56.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Color(0xFF4CAF50))
        ) {
            Text("Mark as Delivered")
        }
    }
}

private fun startLocationService(context: Context, orderId: String) {
    val intent = Intent(context, LocationUpdateService::class.java).apply {
        putExtra("ORDER_ID", orderId)
    }
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
    } else {
        context.startService(intent)
    }
}

private fun stopLocationService(context: Context) {
    val intent = Intent(context, LocationUpdateService::class.java)
    context.stopService(intent)
}
