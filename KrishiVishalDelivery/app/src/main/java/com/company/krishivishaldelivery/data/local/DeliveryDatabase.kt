package com.company.krishivishaldelivery.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.TypeConverters

@Database(entities = [DeliveryOrderEntity::class, GPSLogEntity::class], version = 5, exportSchema = false)
@TypeConverters(RoomConverters::class)
abstract class DeliveryDatabase : RoomDatabase() {
    abstract fun deliveryDao(): DeliveryDao
}
