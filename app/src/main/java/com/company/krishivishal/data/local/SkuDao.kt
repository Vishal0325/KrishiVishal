package com.company.krishivishal.data.local

import androidx.room.*
import com.company.krishivishal.core.model.Sku
import kotlinx.coroutines.flow.Flow

@Dao
interface SkuDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertSkus(skus: List<Sku>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertSku(sku: Sku)

    @Query("SELECT * FROM skus WHERE skuCode = :skuCode")
    suspend fun getSkuByCode(skuCode: String): Sku?

    @Query("SELECT * FROM skus WHERE skuCode = :skuCode")
    fun getSkuByCodeFlow(skuCode: String): Flow<Sku?>

    @Query("SELECT * FROM skus WHERE barcode = :barcode OR skuCode = :barcode LIMIT 1")
    suspend fun getSkuByBarcode(barcode: String): Sku?

    @Query("SELECT * FROM skus WHERE productId = :productId AND isActive = 1")
    fun getSkusByProductId(productId: String): Flow<List<Sku>>

    @Query("SELECT * FROM skus WHERE availableStock <= reorderLevel AND isActive = 1 ORDER BY availableStock ASC")
    fun getLowStockSkus(): Flow<List<Sku>>

    @Query("SELECT * FROM skus WHERE availableStock <= minStockLimit AND isActive = 1 ORDER BY availableStock ASC")
    fun getCriticalStockSkus(): Flow<List<Sku>>

    @Query("DELETE FROM skus WHERE skuCode = :skuCode")
    suspend fun deleteSku(skuCode: String)
}
