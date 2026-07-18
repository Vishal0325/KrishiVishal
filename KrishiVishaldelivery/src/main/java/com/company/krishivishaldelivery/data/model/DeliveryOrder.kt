package com.company.krishivishaldelivery.data.model

import android.os.Parcelable
import com.google.firebase.firestore.IgnoreExtraProperties
import kotlinx.parcelize.Parcelize
import java.util.Date

@Parcelize
data class DeliveryItem(
    val productId: String = "",
    val productName: String = "",
    val quantity: Int = 0,
    val price: Double = 0.0
) : Parcelable

@IgnoreExtraProperties
@Parcelize
data class DeliveryOrder(
    val id: String = "",
    val userId: String = "",
    val userName: String = "",
    val userPhone: String = "",
    val items: List<DeliveryItem> = emptyList(),
    val totalAmount: Double = 0.0,
    val address: String = "",
    val status: String = "ASSIGNED", // ASSIGNED, PICKED_UP, OUT_FOR_DELIVERY, DELIVERED
    val riderId: String = "",
    val createdAt: Date = Date(),
    val customerOTP: String = "", // Code to verify delivery
    val isCOD: Boolean = false,
    val codAmount: Double = 0.0,
    val collectedCash: Double = 0.0,
    val isCashDeposited: Boolean = false,
    val targetLat: Double = 0.0,
    val targetLng: Double = 0.0
) : Parcelable
