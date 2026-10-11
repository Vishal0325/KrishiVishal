package com.company.krishivishaldelivery.data.model

import com.google.firebase.Timestamp
import com.google.firebase.firestore.IgnoreExtraProperties

@IgnoreExtraProperties
data class RiderPayout(
    val payoutId: String = "",
    val riderId: String = "",
    val periodStart: Timestamp? = null,
    val periodEnd: Timestamp? = null,
    val totalDeliveries: Int = 0,
    val grossAmount: Double = 0.0,
    val tdsRate: Double = 0.01,
    val tdsAmount: Double = 0.0,
    val netPayable: Double = 0.0,
    val status: String = "PENDING_APPROVAL", // PENDING_APPROVAL, APPROVED, PAID
    val bankReferenceNumber: String? = null,
    val paidAt: Timestamp? = null
)
