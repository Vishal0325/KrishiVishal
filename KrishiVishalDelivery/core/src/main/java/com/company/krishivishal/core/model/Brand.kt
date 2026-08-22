package com.company.krishivishal.core.model

import android.os.Parcelable
import androidx.room.Entity
import androidx.room.PrimaryKey
import com.google.gson.annotations.SerializedName
import kotlinx.parcelize.Parcelize

@Parcelize
@Entity(tableName = "brands")
data class Brand(
    @PrimaryKey
    @SerializedName("id")
    var id: String = "",
    
    @SerializedName("name")
    var name: String = "",
    
    @SerializedName("imageUrl")
    var imageUrl: String = "",
    
    @SerializedName("isActive")
    var isActive: Boolean = true
) : Parcelable
