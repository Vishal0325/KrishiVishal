package com.company.krishivishal.data.local.dao

import androidx.room.Dao
import androidx.room.Delete
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import com.company.krishivishal.data.model.RecentSearch
import kotlinx.coroutines.flow.Flow

/**
 * Room DAO for Recent Searches
 * Manages local caching of user's search history
 */
@Dao
interface RecentSearchDao {

    /**
     * Insert or replace a recent search
     * Stores the query with timestamp
     */
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertRecentSearch(recentSearch: RecentSearch)

    /**
     * Get all recent searches ordered by most recent first
     * Limited to 5 results for UI display
     */
    @Query("SELECT * FROM recent_searches ORDER BY searchedAt DESC LIMIT 5")
    fun getRecentSearches(): Flow<List<RecentSearch>>

    /**
     * Get most recent searches with limit
     */
    @Query("SELECT * FROM recent_searches ORDER BY searchedAt DESC LIMIT :limit")
    fun getRecentSearchesWithLimit(limit: Int = 5): Flow<List<RecentSearch>>

    /**
     * Clear a specific search by ID
     */
    @Delete
    suspend fun deleteRecentSearch(recentSearch: RecentSearch)

    /**
     * Clear all recent searches
     */
    @Query("DELETE FROM recent_searches")
    suspend fun clearAllRecentSearches()

    /**
     * Check if a search query already exists
     */
    @Query("SELECT COUNT(*) FROM recent_searches WHERE query = :query")
    suspend fun getSearchCount(query: String): Int

    /**
     * Delete oldest searches when exceeding 5
     * Keep only the most recent 5
     */
    @Query("DELETE FROM recent_searches WHERE id IN (SELECT id FROM recent_searches ORDER BY searchedAt ASC LIMIT (SELECT COUNT(*) - 5 FROM recent_searches))")
    suspend fun deleteOldSearchesIfExceedingLimit()

    /**
     * Get search by query (for updating timestamp)
     */
    @Query("SELECT * FROM recent_searches WHERE query = :query LIMIT 1")
    suspend fun getSearchByQuery(query: String): RecentSearch?
}
