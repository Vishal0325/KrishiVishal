package com.company.krishivishaldelivery.di

import android.content.Context
import androidx.room.Room
import com.company.krishivishaldelivery.data.local.DeliveryDao
import com.company.krishivishaldelivery.data.local.DeliveryDatabase
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun provideDeliveryDatabase(@ApplicationContext context: Context): DeliveryDatabase {
        return Room.databaseBuilder(
            context,
            DeliveryDatabase::class.java,
            "delivery_database"
        ).fallbackToDestructiveMigration()
            .build()
    }

    @Provides
    fun provideDeliveryDao(database: DeliveryDatabase): DeliveryDao {
        return database.deliveryDao()
    }
}
