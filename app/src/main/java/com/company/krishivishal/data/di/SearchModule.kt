package com.company.krishivishal.data.di

import android.content.Context
import androidx.room.Room
import com.company.krishivishal.data.local.KrishiVishalDatabase
import com.company.krishivishal.data.local.dao.RecentSearchDao
import com.company.krishivishal.data.repository.ProductSearchRepository
import com.google.firebase.firestore.FirebaseFirestore
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

/**
 * Search Feature Dependency Injection Module
 * Provides dependencies for Global Search Feature
 * 
 * Scope: SingletonComponent (app-wide lifetime)
 */
@Module
@InstallIn(SingletonComponent::class)
object SearchModule {

    /**
     * Provide ProductSearchRepository
     * Handles Firestore search queries
     */
    @Provides
    @Singleton
    fun provideProductSearchRepository(
        firestore: FirebaseFirestore
    ): ProductSearchRepository {
        return ProductSearchRepository(firestore)
    }

    /**
     * Provide Recent Search DAO
     * Manages local search history
     */
    @Provides
    @Singleton
    fun provideRecentSearchDao(
        database: KrishiVishalDatabase
    ): RecentSearchDao {
        return database.recentSearchDao()
    }

    /**
     * Provide KrishiVishalDatabase
     * Room database singleton
     */
    @Provides
    @Singleton
    fun provideKrishiVishalDatabase(
        @ApplicationContext context: Context
    ): KrishiVishalDatabase {
        return Room.databaseBuilder(
            context,
            KrishiVishalDatabase::class.java,
            "krishivishal_db"
        )
            .fallbackToDestructiveMigration()
            .build()
    }
}

/**
 * DEPENDENCY INJECTION FLOW:
 * 
 * SearchViewModel (requires these)
 *   ├─ ProductSearchRepository
 *   │   └─ FirebaseFirestore (provided by Firebase module)
 *   └─ RecentSearchDao
 *       └─ KrishiVishalDatabase
 *           └─ Context (Android framework)
 * 
 * All dependencies are automatically provided by Hilt
 * when you use @Inject or hiltViewModel() in Compose
 */
