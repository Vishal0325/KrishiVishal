package com.company.krishivishal.domain.usecase.admin

import com.company.krishivishal.data.repository.OrderRepository
import com.company.krishivishal.data.repository.ProductRepository
import com.company.krishivishal.core.util.Resource
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import java.text.SimpleDateFormat
import java.util.Locale
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
    private val orderRepository: OrderRepository,
    private val productRepository: ProductRepository
) {
    operator fun invoke(): Flow<Resource<AdminStats>> {
        return combine(
            orderRepository.getOrders(""),
            productRepository.getProducts()
        ) { ordersRes, productsRes ->
            if (ordersRes is Resource.Success && productsRes is Resource.Success) {
                val orders = ordersRes.data ?: emptyList()
                val products = productsRes.data ?: emptyList()
                
                val dateFormat = SimpleDateFormat("dd/MM", Locale.getDefault())
                val revenueByDay = orders.groupBy { dateFormat.format(it.createdAt) }
                    .mapValues { (_, dayOrders) -> dayOrders.sumOf { it.totalAmount } }

                val ordersByStatus = orders.groupBy { it.status }
                    .mapValues { it.value.size }

                val topCategories = products.groupBy { it.category }
                    .mapValues { it.value.size }

                Resource.Success(
                    AdminStats(
                        totalOrders = orders.size,
                        totalProducts = products.size,
                        totalRevenue = orders.sumOf { it.totalAmount },
                        pendingOrders = orders.count { it.status == "PLACED" },
                        revenueByDay = revenueByDay,
                        ordersByStatus = ordersByStatus,
                        topCategories = topCategories
                    )
                )
            } else if (ordersRes is Resource.Error) {
                Resource.Error(ordersRes.message ?: "Error loading stats")
            } else if (productsRes is Resource.Error) {
                Resource.Error(productsRes.message ?: "Error loading stats")
            } else {
                Resource.Loading()
            }
        }
    }
}
