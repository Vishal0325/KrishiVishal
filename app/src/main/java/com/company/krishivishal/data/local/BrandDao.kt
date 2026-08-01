package com.company.krishivishal.data.local

import androidx.room.*
import com.company.krishivishal.core.model.Brand
import kotlinx.coroutines.flow.Flow

@Dao
interface BrandDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertBrands(brands: List<Brand>)

    @Query("SELECT * FROM brands WHERE isActive = 1")
    fun getAllBrands(): Flow<List<Brand>>

    @Query("DELETE FROM brands")
    suspend fun clearBrands()
}
