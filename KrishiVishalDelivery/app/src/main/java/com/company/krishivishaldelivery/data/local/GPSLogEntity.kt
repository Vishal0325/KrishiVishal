package com.company.krishivishaldelivery.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "gps_logs")
data class GPSLogEntity(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val riderId: String,
    val orderId: String?,
    val lat: Double,
    val lng: Double,
    val timestamp: Long,
    val isSynced: Boolean = false
)
