package com.company.krishivishal.core.model

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "recently_viewed",
    primaryKeys = ["userId", "productId"],
    indices = [Index(value = ["userId", "timestamp"])]
)
data class RecentlyViewedProduct(
    val userId: String,
    val productId: String,
    val timestamp: Long = System.currentTimeMillis()
)
