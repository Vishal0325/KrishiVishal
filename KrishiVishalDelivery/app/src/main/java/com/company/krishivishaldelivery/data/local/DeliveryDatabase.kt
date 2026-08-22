package com.company.krishivishaldelivery.data.local

import androidx.room.Database
import androidx.room.RoomDatabase

@Database(entities = [DeliveryOrderEntity::class, GPSLogEntity::class], version = 3, exportSchema = false)
abstract class DeliveryDatabase : RoomDatabase() {
    abstract fun deliveryDao(): DeliveryDao
}
