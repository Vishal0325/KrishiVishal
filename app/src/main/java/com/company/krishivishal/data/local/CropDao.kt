package com.company.krishivishal.data.local

import androidx.room.*
import com.company.krishivishal.core.model.Crop
import kotlinx.coroutines.flow.Flow

@Dao
interface CropDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertCrops(crops: List<Crop>)

    @Query("SELECT * FROM crops WHERE isActive = 1")
    fun getAllCrops(): Flow<List<Crop>>

    @Query("DELETE FROM crops")
    suspend fun clearCrops()

    @Delete
    suspend fun deleteCrop(crop: Crop)
}
