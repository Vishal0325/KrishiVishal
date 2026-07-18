package com.company.krishivishal.data.local

import androidx.room.*
import com.company.krishivishal.data.model.SearchHistory
import kotlinx.coroutines.flow.Flow

@Dao
interface HistoryDao {
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertSearchQuery(searchHistory: SearchHistory)

    @Query("SELECT * FROM search_history WHERE userId = :userId ORDER BY timestamp DESC LIMIT 20")
    fun getSearchHistory(userId: String): Flow<List<SearchHistory>>

    @Query("DELETE FROM search_history WHERE userId = :userId")
    suspend fun clearSearchHistory(userId: String)
}
