package com.company.krishivishaldelivery.data.model

data class IncentiveSlab(
    val ordersRequired: Int = 0,
    val bonusAmount: Double = 0.0
)

data class IncentiveProgress(
    val currentCount: Int = 0,
    val nextSlab: IncentiveSlab? = null,
    val ordersRemaining: Int = 0,
    val progress: Float = 0f,
    val slabAchieved: Boolean = false,
    val earnedBonus: Double = 0.0,
    val earnedCommission: Double = 0.0,
    val totalEarningsToday: Double = 0.0
)
