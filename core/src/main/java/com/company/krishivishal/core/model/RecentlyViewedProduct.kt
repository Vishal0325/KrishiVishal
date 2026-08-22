package com.company.krishivishal.core.model

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(
    tableName = "recently_viewed",
    primaryKeys = ["userId", "productId"]
)
data class RecentlyViewedProduct(
    val userId: String,
    val productId: String,
    val timestamp: Long = System.currentTimeMillis()
)
