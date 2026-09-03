package com.company.krishivishaldelivery.data.model

import com.company.krishivishal.core.model.Order

data class OptimizedStop(
    val stopNumber: Int,
    val order: Order,
    val distanceKmFromPrev: Double = 0.0
)

data class OptimizedTrip(
    val stops: List<OptimizedStop> = emptyList(),
    val totalDistanceKm: Double = 0.0,
    val estimatedPetrolSavedLiters: Double = 0.0,
    val estimatedTimeMinutes: Int = 0
)
