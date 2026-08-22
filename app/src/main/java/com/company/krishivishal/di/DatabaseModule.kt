package com.company.krishivishal.di

import android.content.Context
import androidx.room.Room
import com.company.krishivishal.data.local.*
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton
import com.company.krishivishal.data.local.datastore.UserPreferences

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun provideAppDatabase(@ApplicationContext context: Context): AppDatabase {
        return Room.databaseBuilder(
            context,
            AppDatabase::class.java,
            "krishi_vishal_db"
        )
            .addMigrations(*DatabaseMigrations.ALL_MIGRATIONS)
            .fallbackToDestructiveMigration()
            .build()
    }

    @Provides
    fun provideUserDao(database: AppDatabase): UserDao = database.userDao()

    @Provides
    fun provideProductDao(database: AppDatabase): ProductDao = database.productDao()

    @Provides
    fun provideCategoryDao(database: AppDatabase): CategoryDao = database.categoryDao()

    @Provides
    fun provideCartDao(database: AppDatabase): CartDao = database.cartDao()

    @Provides
    fun provideOrderDao(database: AppDatabase): OrderDao = database.orderDao()

    @Provides
    fun provideHistoryDao(database: AppDatabase): HistoryDao = database.historyDao()

    @Provides
    fun provideBrandDao(database: AppDatabase): BrandDao = database.brandDao()

    @Provides
    fun provideCropDao(database: AppDatabase): CropDao = database.cropDao()

    @Provides
    fun provideWishlistDao(database: AppDatabase): WishlistDao = database.wishlistDao()

    @Provides
    fun provideNotificationDao(database: AppDatabase): NotificationDao = database.notificationDao()

    @Provides
    fun provideSyncOperationDao(database: AppDatabase): SyncOperationDao = database.syncOperationDao()

    @Provides
    fun provideReturnDao(database: AppDatabase): ReturnDao = database.returnDao()

    @Provides
    @Singleton
    fun provideKrishiVishalDatabase(@ApplicationContext context: Context): KrishiVishalDatabase {
        return Room.databaseBuilder(
            context,
            KrishiVishalDatabase::class.java,
            "krishi_vishal_search_db"
        ).fallbackToDestructiveMigration().build()
    }

    @Provides
    fun provideRecentSearchDao(database: KrishiVishalDatabase): com.company.krishivishal.data.local.dao.RecentSearchDao =
        database.recentSearchDao()
}
