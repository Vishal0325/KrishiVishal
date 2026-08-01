package com.company.krishivishal.domain.usecase.admin

import android.content.Context
import android.net.Uri
import com.company.krishivishal.core.model.Product
import com.company.krishivishal.data.repository.ProductRepository
import com.company.krishivishal.core.util.Resource
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
                    // Mapping CSV: name, brand, category, mrp, basePrice, discountedPrice, stockQuantity, unit, weight, description
                    val name = values.getOrNull(0) ?: ""
                    val weight = values.getOrNull(8) ?: ""
                    val unit = values.getOrNull(7) ?: ""
                    
                    // Validation: Skip rows with missing critical data or invalid weight
                    val isWeightValid = weight.isNotBlank() && weight != "0"
                    
                    if (name.isNotBlank() && isWeightValid) {
                        val product = Product(
                            id = java.util.UUID.randomUUID().toString(),
                            name = name,
                            brand = values.getOrNull(1) ?: "",
                            category = values.getOrNull(2) ?: "",
                            mrp = values.getOrNull(3)?.toDoubleOrNull() ?: 0.0,
                            basePrice = values.getOrNull(4)?.toDoubleOrNull() ?: 0.0,
                            discountedPrice = values.getOrNull(5)?.toDoubleOrNull() ?: 0.0,
                            stockQuantity = values.getOrNull(6)?.toIntOrNull() ?: 0,
                            unit = unit,
                            weight = weight,
                            description = values.getOrNull(9) ?: ""
                        )
                        products.add(product)
                        count++
                    } else {
                        android.util.Log.w("CSVImport", "Skipping invalid row: name='$name', weight='$weight'")
                    }
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
                    sb.append("Name,Brand,Category,MRP,BasePrice,DiscountedPrice,Stock,Unit,Weight,Description\n")
                    
                    products.forEach { p ->
                        val row = listOf(
                            p.name, 
                            p.brand, 
                            p.category, 
                            p.mrp, 
                            p.basePrice, 
                            p.discountedPrice, 
                            p.stockQuantity, 
                            p.unit, 
                            p.weight, 
                            p.description
                        )
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
