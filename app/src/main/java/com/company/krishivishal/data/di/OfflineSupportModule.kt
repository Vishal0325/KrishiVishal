package com.company.krishivishal.data.di

import android.content.Context
import com.company.krishivishal.data.local.AppDatabase
import com.company.krishivishal.data.sync.SyncManager
import com.company.krishivishal.performance.SyncResilienceManager
import com.company.krishivishal.utils.ConnectivityObserver
import com.company.krishivishal.utils.NetworkConnectivityObserver
import com.google.firebase.firestore.FirebaseFirestore
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import kotlinx.coroutines.Dispatchers
import javax.inject.Singleton

/**
 * Dependency injection module for offline support
 */
@Module
@InstallIn(SingletonComponent::class)
object OfflineSupportModule {

    @Provides
    @Singleton
    fun provideConnectivityObserver(
        @ApplicationContext context: Context
    ): ConnectivityObserver = NetworkConnectivityObserver(context)

    @Provides
    @Singleton
    fun provideSyncManager(
        database: AppDatabase,
        firestore: FirebaseFirestore,
        connectivityObserver: ConnectivityObserver,
        syncResilienceManager: SyncResilienceManager,
        @ApplicationContext context: Context
    ): SyncManager = SyncManager(
        database = database,
        firestore = firestore,
        connectivityObserver = connectivityObserver,
        syncResilienceManager = syncResilienceManager,
        context = context,
        dispatcher = Dispatchers.IO
    )
}
