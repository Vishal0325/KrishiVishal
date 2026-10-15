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
import timber.log.Timber
import kotlinx.coroutines.Dispatchers

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
                ?: error("Unable to open the selected CSV file")
            var importedCount = 0
            var failedCount = 0
            inputStream.bufferedReader().use { reader ->
                if (reader.readLine() == null) {
                    emit(Resource.Error("Empty CSV file"))
                    return@flow
                }

                var line = reader.readLine()
                var rowNumber = 1
                while (line != null) {
                    rowNumber++
                    val values = CSVUtil.parseLine(line)
                    val name = values.getOrNull(0).orEmpty()
                    val weight = values.getOrNull(8).orEmpty()
                    val weightGrams = CSVUtil.parseWeightToGrams(weight)
                    val mrp = values.getOrNull(3)?.toDoubleOrNull()
                    val basePrice = values.getOrNull(4)?.toDoubleOrNull()
                    val discountValue = values.getOrNull(5).orEmpty()
                    val stockValue = values.getOrNull(6).orEmpty()
                    val discountedPrice = if (discountValue.isBlank()) 0.0 else discountValue.toDoubleOrNull() ?: Double.NaN
                    val stockQuantity = if (stockValue.isBlank()) 0 else stockValue.toIntOrNull() ?: -1
                    val validRow = values.size >= 5 && name.isNotBlank() &&
                        weightGrams != null && weightGrams > 0 &&
                        mrp != null && mrp.isFinite() && mrp >= 0.0 &&
                        basePrice != null && basePrice.isFinite() && basePrice >= 0.0 &&
                        discountedPrice.isFinite() && discountedPrice >= 0.0 && stockQuantity >= 0

                    if (!validRow) {
                        failedCount++
                        Timber.w("CSVImport: Skipping invalid row $rowNumber")
                        line = reader.readLine()
                        continue
                    }

                    val product = Product(
                        id = java.util.UUID.randomUUID().toString(),
                        name = name,
                        brand = values.getOrNull(1) ?: "",
                        category = values.getOrNull(2) ?: "",
                        mrp = requireNotNull(mrp),
                        basePrice = requireNotNull(basePrice),
                        discountedPrice = discountedPrice,
                        stockQuantity = stockQuantity,
                        unit = values.getOrNull(7) ?: "",
                        weight = weight,
                        weightGrams = weightGrams,
                        description = values.getOrNull(9) ?: ""
                    )
                    var saved = false
                    var saveError: String? = null
                    repository.saveProduct(product).collect { result ->
                        when (result) {
                            is Resource.Success -> saved = true
                            is Resource.Error -> saveError = result.message
                            is Resource.Loading -> Unit
                            is Resource.Idle -> Unit
                        }
                    }
                    if (saved) {
                        importedCount++
                    } else {
                        failedCount++
                        Timber.e("CSVImport: Product save failed on row $rowNumber: ${saveError ?: "No success result"}")
                    }
                    line = reader.readLine()
                }
            }

            if (failedCount > 0) {
                emit(Resource.Error("Imported $importedCount products; $failedCount rows failed validation or saving."))
            } else if (importedCount == 0) {
                emit(Resource.Error("CSV file contained no valid products"))
            } else {
                emit(Resource.Success(importedCount))
            }
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
