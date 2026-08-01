package com.company.krishivishal.data.local

import androidx.room.TypeConverter
import com.google.gson.Gson
import com.google.gson.reflect.TypeToken
import com.google.firebase.Timestamp
import java.util.Date

import com.company.krishivishal.core.model.OrderItem

class AppConverters {
    @TypeConverter
    fun fromTimestamp(value: Long?): Date? {
        return value?.let { Date(it) }
    }

    @TypeConverter
    fun dateToTimestamp(date: Date?): Long? {
        return date?.time
    }

    @TypeConverter
    fun fromFirebaseTimestamp(value: Timestamp?): Long? {
        return value?.toDate()?.time
    }

    @TypeConverter
    fun toFirebaseTimestamp(value: Long?): Timestamp? {
        return value?.let { Timestamp(Date(it)) }
    }

    @TypeConverter
    fun fromStringList(value: String?): List<String> {
        val listType = object : TypeToken<List<String>>() {}.type
        return Gson().fromJson(value, listType) ?: emptyList()
    }

    @TypeConverter
    fun toStringList(list: List<String>): String {
        return Gson().toJson(list)
    }

    @TypeConverter
    fun fromSubCategoryList(value: String?): List<com.company.krishivishal.core.model.SubCategory> {
        val listType = object : TypeToken<List<com.company.krishivishal.core.model.SubCategory>>() {}.type
        return Gson().fromJson(value, listType) ?: emptyList()
    }

    @TypeConverter
    fun toSubCategoryList(list: List<com.company.krishivishal.core.model.SubCategory>): String {
        return Gson().toJson(list)
    }

    @TypeConverter
    fun fromOrderItemList(value: String?): List<OrderItem> {
        val listType = object : TypeToken<List<OrderItem>>() {}.type
        return Gson().fromJson(value, listType) ?: emptyList()
    }

    @TypeConverter
    fun toOrderItemList(list: List<OrderItem>): String {
        return Gson().toJson(list)
    }
}
