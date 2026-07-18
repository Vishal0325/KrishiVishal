package com.company.krishivishal.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import com.company.krishivishal.data.local.dao.RecentSearchDao
import com.company.krishivishal.data.model.RecentSearch

/**
 * KrishiVishal Room Database
 * Contains all local database entities and DAOs
 */
@Database(
    entities = [
        RecentSearch::class
        // Add other entities here as needed
    ],
    version = 1,
    exportSchema = false
)
abstract class KrishiVishalDatabase : RoomDatabase() {

    /**
     * Get Recent Search DAO
     */
    abstract fun recentSearchDao(): RecentSearchDao

    // Add other DAOs here as needed
}
