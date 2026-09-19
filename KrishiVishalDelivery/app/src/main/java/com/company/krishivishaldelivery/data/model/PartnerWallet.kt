package com.company.krishivishaldelivery.data.model

import com.google.firebase.firestore.IgnoreExtraProperties

@IgnoreExtraProperties
data class PartnerWallet(
    val partnerId: String = "",
    val balance: Double = 0.0,
    val negativeLimit: Double = -500.0,
    val minThreshold: Double = 500.0,
    val lastRechargeAmount: Double = 0.0
)

@IgnoreExtraProperties
data class PartnerWalletTransaction(
    val id: String = "",
    val partnerId: String = "",
    val bookingId: String = "",
    val type: String = "COMMISSION_DEDUCT",
    val amount: Double = 0.0,
    val balanceAfter: Double = 0.0,
    val createdAt: Long = System.currentTimeMillis()
)

