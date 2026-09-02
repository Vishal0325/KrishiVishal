package com.company.krishivishal.core.model

import android.os.Parcelable
import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey
import com.google.firebase.firestore.IgnoreExtraProperties
import com.google.gson.annotations.SerializedName
import kotlinx.parcelize.Parcelize

@IgnoreExtraProperties
@Parcelize
@Entity(tableName = "warehouses")
data class Warehouse(
    @PrimaryKey
    @ColumnInfo(name = "id")
    @SerializedName("id")
    var id: String = "WH-PURNEA-01",

    @ColumnInfo(name = "name")
    @SerializedName("name")
    var name: String = "Purnea Main Godown",

    @ColumnInfo(name = "city")
    @SerializedName("city")
    var city: String = "Purnea",

    @ColumnInfo(name = "state")
    @SerializedName("state")
    var state: String = "Bihar",

    @ColumnInfo(name = "type")
    @SerializedName("type")
    var type: String = "GODOWN",

    @ColumnInfo(name = "isActive")
    @SerializedName("isActive")
    var isActive: Boolean = true
) : Parcelable
