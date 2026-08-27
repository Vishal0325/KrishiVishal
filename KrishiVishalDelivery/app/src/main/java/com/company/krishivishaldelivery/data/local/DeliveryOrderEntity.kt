package com.company.krishivishaldelivery.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.company.krishivishal.core.model.OrderItem

@Entity(tableName = "delivery_orders")
data class DeliveryOrderEntity(
    @PrimaryKey val id: String,
    val userId: String,
    val userName: String,
    val userPhone: String,
    val items: List<OrderItem>,
    val totalAmount: Double,
    val address: String,
    val status: String,
    val riderId: String,
    val createdAtMillis: Long,
    val customerOTP: String,
    val isCOD: Boolean,
    val codAmount: Double,
    val collectedCash: Double = 0.0,
    val isCashDeposited: Boolean = false,
    val targetLat: Double,
    val targetLng: Double,
    // POD local storage for offline sync
    val localPodPhotoPath: String? = null,
    val localPodSignaturePath: String? = null,
    val isPendingSync: Boolean = false
)
