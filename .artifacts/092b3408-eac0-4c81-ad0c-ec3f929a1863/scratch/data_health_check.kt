package com.company.krishivishal.scratch

import android.util.Log
import com.company.krishivishal.data.repository.ProductRepository
import com.company.krishivishal.core.util.Resource
import kotlinx.coroutines.flow.first
import javax.inject.Inject

/**
 * Run this to inspect problematic products.
 */
class DataHealthCheck @Inject constructor(
    private val repository: ProductRepository
) {
    suspend fun checkProducts() {
        Log.d("HealthCheck", "Starting product data inspection...")
        val resource = repository.getProducts().first { it is Resource.Success }
        val products = resource.data ?: emptyList()
        
        val targets = listOf("Amistar", "Reclaim")
        
        products.filter { p -> targets.any { t -> p.name.contains(it, ignoreCase = true) } }
            .forEach { p ->
                Log.d("HealthCheck", "FOUND: ${p.name}")
                Log.d("HealthCheck", "  ID: ${p.id}")
                Log.d("HealthCheck", "  Weight: '${p.weight}', Unit: '${p.unit}'")
                Log.d("HealthCheck", "  Images: ${p.images}")
                Log.d("HealthCheck", "  Main Image: ${p.imageUrl}")
            }
        Log.d("HealthCheck", "Inspection finished.")
    }
}
