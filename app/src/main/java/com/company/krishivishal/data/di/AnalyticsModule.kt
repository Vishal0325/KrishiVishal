package com.company.krishivishal.data.di

import com.company.krishivishal.analytics.AnalyticsTracker
import com.company.krishivishal.analytics.CrashlyticsTree
import com.company.krishivishal.crashlytics.CrashlyticsErrorReporter
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import timber.log.Timber
import javax.inject.Singleton

/**
 * Dependency injection module for Analytics and Monitoring
 */
@Module
@InstallIn(SingletonComponent::class)
object AnalyticsModule {

    @Provides
    @Singleton
    fun provideCrashlyticsErrorReporter(): CrashlyticsErrorReporter {
        return CrashlyticsErrorReporter()
    }

    @Provides
    @Singleton
    fun provideCrashlyticsTree(errorReporter: CrashlyticsErrorReporter): CrashlyticsTree {
        return CrashlyticsTree(errorReporter)
    }
}
