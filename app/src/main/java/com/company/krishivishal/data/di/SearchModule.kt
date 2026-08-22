package com.company.krishivishal.data.di

import com.company.krishivishal.data.repository.ProductSearchRepository
import com.google.firebase.firestore.FirebaseFirestore
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
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
        firestore: FirebaseFirestore,
        productDao: com.company.krishivishal.data.local.ProductDao
    ): ProductSearchRepository {
        return ProductSearchRepository(firestore, productDao)
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
