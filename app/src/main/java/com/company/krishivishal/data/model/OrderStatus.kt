package com.company.krishivishal.data.model

import androidx.compose.ui.graphics.Color
import com.company.krishivishal.ui.theme.PrimaryGreen

enum class OrderStatus(val displayName: String, val color: Color) {
    PLACED("Placed", Color(0xFF2196F3)),
    CONFIRMED("Confirmed", Color(0xFF4CAF50)),
    SHIPPED("Shipped", Color(0xFFFF9800)),
    OUT_FOR_DELIVERY("Out for Delivery", Color(0xFF9C27B0)),
    DELIVERED("Delivered", PrimaryGreen),
    CANCELLED("Cancelled", Color.Red),
    RETURNED("Returned", Color.Gray);

    companion object {
        fun fromString(status: String?): OrderStatus {
            return entries.find { it.name.equals(status, ignoreCase = true) } ?: PLACED
        }
    }
}
