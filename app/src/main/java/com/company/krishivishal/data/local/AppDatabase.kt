package com.company.krishivishal.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import com.company.krishivishal.core.model.*

@Database(
    entities = [
        User::class,
        Address::class,
        Product::class,
        Variant::class,
        Category::class,
        CartItem::class,
        Order::class,
        WishlistItem::class,
        SearchHistory::class,
        ReturnRequest::class,
        Brand::class,
        SyncOperation::class,
        Crop::class,
        Notification::class,
        ProductCropCrossRef::class,
        ProductRecommendationCrossRef::class,
        RecentlyViewedProduct::class
    ],
    version = 48,
    exportSchema = false
)
@TypeConverters(AppConverters::class)
abstract class AppDatabase : RoomDatabase() {
    abstract fun userDao(): UserDao
    abstract fun productDao(): ProductDao
    abstract fun categoryDao(): CategoryDao
    abstract fun cartDao(): CartDao
    abstract fun orderDao(): OrderDao
    abstract fun historyDao(): HistoryDao
    abstract fun brandDao(): BrandDao
    abstract fun syncOperationDao(): SyncOperationDao
    abstract fun cropDao(): CropDao
    abstract fun wishlistDao(): WishlistDao
    abstract fun notificationDao(): NotificationDao
    abstract fun returnDao(): ReturnDao
}
