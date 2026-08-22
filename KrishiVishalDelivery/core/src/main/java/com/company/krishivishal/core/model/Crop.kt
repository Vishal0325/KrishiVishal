package com.company.krishivishal.core.model

import android.os.Parcelable
import androidx.room.Entity
import androidx.room.PrimaryKey
import com.google.gson.annotations.SerializedName
import kotlinx.parcelize.Parcelize

@Parcelize
@Entity(tableName = "crops")
data class Crop(
    @PrimaryKey
    @SerializedName("id")
    val id: String = "",
    @SerializedName("name")
    val name: String = "",
    @SerializedName("imageUrl")
    val imageUrl: String = "",
    @SerializedName("isActive")
    val isActive: Boolean = true
) : Parcelable
