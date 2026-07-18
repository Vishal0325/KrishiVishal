package com.company.krishivishal.model

import com.google.firebase.Timestamp
import com.google.firebase.firestore.GeoPoint

data class OrderTrackingState(
    val status: String = "PLACED",
    val statusHistory: List<StatusStep> = emptyList(),
    val riderLocation: GeoPoint? = null,
    val estimatedDeliveryTime: Timestamp? = null,
    val isLoading: Boolean = true,
    val error: String? = null
)

data class StatusStep(
    val status: String,
    val timestamp: Timestamp
)
