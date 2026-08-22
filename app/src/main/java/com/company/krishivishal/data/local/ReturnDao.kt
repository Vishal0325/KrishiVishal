package com.company.krishivishal.data.local

import androidx.room.*
import com.company.krishivishal.core.model.ReturnRequest
import kotlinx.coroutines.flow.Flow

@Dao
interface ReturnDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertReturn(returnRequest: ReturnRequest)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertReturns(returnRequests: List<ReturnRequest>)

    @Query("SELECT * FROM returns WHERE userId = :userId ORDER BY createdAt DESC")
    fun getReturnsByUserId(userId: String): Flow<List<ReturnRequest>>

    @Query("SELECT * FROM returns WHERE id = :id")
    suspend fun getReturnById(id: String): ReturnRequest?

    @Query("DELETE FROM returns")
    suspend fun clearReturns()
}
