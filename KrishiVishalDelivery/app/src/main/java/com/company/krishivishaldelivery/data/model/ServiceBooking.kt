package com.company.krishivishaldelivery.data.model

import com.google.firebase.firestore.IgnoreExtraProperties

@IgnoreExtraProperties
data class ServiceBooking(
    val id: String = "",
    val farmerId: String = "",
    val serviceId: String = "",
    val serviceName: String = "",
    val farmArea: Double? = null,
    val actualArea: Double? = null,
    val areaUnit: String = "ACRE",
    val status: String = "PENDING_ASSIGNMENT",
    val assignedPartnerId: String? = null,
    val amount: Double = 0.0,
    val paymentMethod: String = "CASH",
    val paymentStatus: String = "PENDING",
    val startOtp: String = "",
    val endOtp: String = ""
)
