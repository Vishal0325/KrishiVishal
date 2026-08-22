package com.company.krishivishal.di

import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent

@Module
@InstallIn(SingletonComponent::class)
object AnalyticsModule {
    // Analytics-related bindings are handled in com.company.krishivishal.data.di.AnalyticsModule
    // This module is kept for future app-level analytics configurations if needed.
}
