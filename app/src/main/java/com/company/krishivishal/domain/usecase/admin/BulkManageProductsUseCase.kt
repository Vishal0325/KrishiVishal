package com.company.krishivishal.domain.usecase.admin

import android.content.Context
import android.net.Uri
import com.company.krishivishal.data.model.Product
import com.company.krishivishal.data.repository.ProductRepository
import com.company.krishivishal.utils.Resource
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import javax.inject.Inject

import com.company.krishivishal.utils.CSVUtil
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.Dispatchers
import java.io.BufferedReader
import java.io.InputStreamReader

/**
 * UseCase to handle CSV import and export of products.
 */
class BulkManageProductsUseCase @Inject constructor(
    private val repository: ProductRepository,
    @dagger.hilt.android.qualifiers.ApplicationContext private val context: Context
) {
    fun importFromCsv(uri: Uri): Flow<Resource<Int>> = flow {
        emit(Resource.Loading())
        try {
            val inputStream = context.contentResolver.openInputStream(uri)
            val reader = BufferedReader(InputStreamReader(inputStream))
            
            val header = reader.readLine() // Read header
            if (header == null) {
                emit(Resource.Error("Empty CSV file"))
                return@flow
            }

            val products = mutableListOf<Product>()
            var line = reader.readLine()
            var count = 0
            
            while (line != null) {
                val values = CSVUtil.parseLine(line)
                if (values.size >= 5) {
                    // Mapping CSV: name, brand, category, basePrice, stockQuantity, description
                    val product = Product(
                        id = java.util.UUID.randomUUID().toString(),
                        name = values.getOrNull(0) ?: "",
                        brand = values.getOrNull(1) ?: "",
                        category = values.getOrNull(2) ?: "",
                        basePrice = values.getOrNull(3)?.toDoubleOrNull() ?: 0.0,
                        stockQuantity = values.getOrNull(4)?.toIntOrNull() ?: 0,
                        description = values.getOrNull(5) ?: ""
                    )
                    products.add(product)
                    count++
                }
                line = reader.readLine()
            }
            reader.close()

            // Bulk save (simulated or via loop for now since repository.saveProduct handles single)
            products.forEach { repository.saveProduct(it).collect {} }
            
            emit(Resource.Success(count))
        } catch (e: Exception) {
            emit(Resource.Error(e.message ?: "CSV Import Failed"))
        }
    }.flowOn(Dispatchers.IO)

    fun exportToCsv(): Flow<Resource<String>> = flow {
        emit(Resource.Loading())
        try {
            repository.getProducts().collect { resource ->
                if (resource is Resource.Success) {
                    val products = resource.data ?: emptyList()
                    val sb = StringBuilder()
                    sb.append("Name,Brand,Category,MRP,Stock,Description\n")
                    
                    products.forEach { p ->
                        val row = listOf(p.name, p.brand, p.category, p.basePrice, p.stockQuantity, p.description)
                        sb.append(CSVUtil.toCsvRow(row)).append("\n")
                    }
                    emit(Resource.Success(sb.toString()))
                } else if (resource is Resource.Error) {
                    emit(Resource.Error(resource.message ?: "Failed to fetch products"))
                }
            }
        } catch (e: Exception) {
            emit(Resource.Error(e.message ?: "CSV Export Failed"))
        }
    }.flowOn(Dispatchers.IO)
}
