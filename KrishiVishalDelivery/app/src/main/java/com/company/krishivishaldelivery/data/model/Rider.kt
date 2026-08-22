package com.company.krishivishaldelivery.data.model

import com.google.firebase.firestore.IgnoreExtraProperties

@IgnoreExtraProperties
data class Rider(
    val id: String = "",
    val name: String = "",
    val phone: String = "",
    val isOnline: Boolean = true,
    val currentLat: Double = 0.0,
    val currentLng: Double = 0.0,
    val lastLocationUpdate: Long = 0,
    val totalEarnings: Double = 0.0,
    val pendingPayout: Boolean = true,
    val bankAccount: String = "",
    val bankName: String = "",
    val ifscCode: String = "",
    val fcmToken: String = "",
    val riderIdDisplay: String = "",
    val riderSerialId: String = "",
    // Vehicle & Fuel Details
    val vehicleType: String = "BIKE", // BIKE, SCOOTER, CYCLE
    val vehicleNumber: String = "",
    val fuelAllowance: Double = 0.0,
    val shiftStartTime: Long = 0
)
