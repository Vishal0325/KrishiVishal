package com.company.krishivishal.core.model

enum class OrderStatus(val displayName: String) {
    PLACED("Placed"),
    CONFIRMED("Confirmed"),
    ASSIGNED("Assigned to Rider"),
    PICKED_UP("Picked Up"),
    SHIPPED("Shipped"),
    OUT_FOR_DELIVERY("Out for Delivery"),
    DELIVERED("Delivered"),
    CANCELLED("Cancelled"),
    RETURNED("Returned");

    companion object {
        fun fromString(status: String?): OrderStatus {
            return entries.find { it.name.equals(status, ignoreCase = true) } ?: PLACED
        }
    }
}
