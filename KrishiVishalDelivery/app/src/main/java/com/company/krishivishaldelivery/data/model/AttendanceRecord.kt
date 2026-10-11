package com.company.krishivishaldelivery.data.model

import com.google.firebase.Timestamp
import com.google.firebase.firestore.IgnoreExtraProperties

@IgnoreExtraProperties
data class AttendanceRecord(
    val date: String = "",
    val shiftStart: Timestamp? = null,
    val shiftEnd: Timestamp? = null,
    val startLat: Double = 0.0,
    val startLng: Double = 0.0,
    val endLat: Double = 0.0,
    val endLng: Double = 0.0,
    val totalHours: Double = 0.0,
    val status: String = "NOT_STARTED" // NOT_STARTED, ACTIVE, COMPLETED
)
