package com.company.krishivishal.data.model

import android.os.Parcelable
import com.google.firebase.Timestamp
import kotlinx.parcelize.Parcelize

@Parcelize
data class Coupon(
    val id: String = "",
    val code: String = "",
    val description: String = "",
    val discountPercent: Int = 0,
    val maxDiscount: Double = 0.0,
    val minOrderValue: Double = 0.0,
    val expiryDate: Timestamp? = null,
    val isActive: Boolean = true,
    val usageCount: Int = 0,
    val limitPerUser: Int = 1
) : Parcelable
