package com.company.krishivishal.core.model

import androidx.room.Entity
import androidx.room.PrimaryKey
import com.google.firebase.Timestamp
import java.util.Date

@Entity(tableName = "notifications")
data class Notification(
    @PrimaryKey
    val id: String = java.util.UUID.randomUUID().toString(),
    val title: String,
    val body: String,
    val type: String, // ORDER_CONFIRMED, DELIVERY_UPDATE, PROMOTION, WALLET_CREDIT
    val timestamp: Long = System.currentTimeMillis(),
    val isRead: Boolean = false,
    val data: String? = null // JSON payload for deep-linking
)
