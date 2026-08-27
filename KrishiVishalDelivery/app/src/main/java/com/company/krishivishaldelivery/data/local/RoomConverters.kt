package com.company.krishivishaldelivery.data.local

import androidx.room.TypeConverter
import com.company.krishivishal.core.model.OrderItem
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class RoomConverters {
    @TypeConverter
    fun fromOrderItemList(value: List<OrderItem>): String {
        return Json.encodeToString(value)
    }

    @TypeConverter
    fun toOrderItemList(value: String): List<OrderItem> {
        return try {
            Json.decodeFromString(value)
        } catch (e: Exception) {
            emptyList()
        }
    }
}
