package com.company.krishivishal.domain.usecase.admin

import com.company.krishivishal.di.IoDispatcher
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.utils.safeCall
import com.google.firebase.functions.FirebaseFunctions
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.tasks.await
import javax.inject.Inject

data class AdminStats(
    val totalOrders: Int = 0,
    val totalProducts: Int = 0,
    val totalRevenue: Double = 0.0,
    val pendingOrders: Int = 0,
    val revenueByDay: Map<String, Double> = emptyMap(),
    val ordersByStatus: Map<String, Int> = emptyMap(),
    val topCategories: Map<String, Int> = emptyMap()
)

class GetAdminStatsUseCase @Inject constructor(
    private val functions: FirebaseFunctions,
    @IoDispatcher private val ioDispatcher: CoroutineDispatcher
) {
    operator fun invoke(): Flow<Resource<AdminStats>> = safeCall(ioDispatcher) {
        val response = functions.getHttpsCallable("getAdminDashboardStats").call().await().data
            as? Map<*, *> ?: error("Dashboard statistics response was invalid")

        fun number(name: String): Double =
            (response[name] as? Number)?.toDouble()
                ?: error("Dashboard statistics response is missing $name")

        fun numberMap(name: String): Map<String, Double> {
            val raw = response[name] as? Map<*, *>
                ?: error("Dashboard statistics response is missing $name")
            return raw.entries.associate { (key, value) ->
                val label = key as? String ?: error("Invalid $name key")
                val amount = (value as? Number)?.toDouble() ?: error("Invalid $name value")
                label to amount
            }
        }

        AdminStats(
            totalOrders = number("totalOrders").toInt(),
            totalProducts = number("totalProducts").toInt(),
            totalRevenue = number("totalRevenue"),
            pendingOrders = number("pendingOrders").toInt(),
            revenueByDay = numberMap("revenueByDay"),
            ordersByStatus = numberMap("ordersByStatus").mapValues { it.value.toInt() },
            topCategories = numberMap("topCategories").mapValues { it.value.toInt() }
        )
    }
}
