package com.company.krishivishaldelivery.data.model

import com.google.firebase.firestore.IgnoreExtraProperties
import java.util.Date

@IgnoreExtraProperties
data class PayoutRequest(
    val id: String = "",
    val riderId: String = "",
    val riderName: String = "",
    val riderPhone: String = "",
    val amount: Double = 0.0,
    val paymentMethod: String = "UPI",
    val upiId: String = "",
    val notes: String = "",
    val status: String = "PENDING", // PENDING, TRANSFERRED, REJECTED
    val transactionRef: String = "",
    val rejectionReason: String = "",
    val requestedAt: Date? = null,
    val createdAt: Date? = null,
    val updatedAt: Date? = null
)
