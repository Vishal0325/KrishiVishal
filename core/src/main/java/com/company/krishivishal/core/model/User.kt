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
@Entity(tableName = "users")
data class User(
    @PrimaryKey
    @ColumnInfo(name = "id")
    @SerializedName("id")
    val id: String = "",

    @ColumnInfo(name = "name")
    @SerializedName("name")
    val name: String = "",

    @ColumnInfo(name = "email")
    @SerializedName("email")
    val email: String? = null,

    @ColumnInfo(name = "phone")
    @SerializedName("phone")
    val phone: String? = null,

    @ColumnInfo(name = "image_url")
    @SerializedName("image_url")
    val imageUrl: String? = null,

    @ColumnInfo(name = "tier")
    @SerializedName("tier")
    val tier: String = "New Farmer", // Default tier

    @ColumnInfo(name = "walletBalance", defaultValue = "0")
    @SerializedName("walletBalance")
    val walletBalance: Double = 0.0,

    @ColumnInfo(name = "role")
    @SerializedName("role")
    val role: String = "CUSTOMER", // GUEST, CUSTOMER, SELLER, RIDER, ADMIN

    @ColumnInfo(name = "location")
    @SerializedName("location")
    val location: String = "Samastipur, Bihar",

    @ColumnInfo(name = "interestedCategories")
    @SerializedName("interestedCategories")
    val interestedCategories: List<String> = emptyList(),

    @ColumnInfo(name = "fcmToken")
    @SerializedName("fcmToken")
    val fcmToken: String? = null,

    @ColumnInfo(name = "age")
    @SerializedName("age")
    val age: Int? = null,

    @ColumnInfo(name = "totalLand", defaultValue = "0.0")
    @SerializedName("totalLand")
    val totalLand: Double = 0.0,

    @ColumnInfo(name = "landUnit", defaultValue = "'Katha'")
    @SerializedName("landUnit")
    val landUnit: String = "Katha",

    @ColumnInfo(name = "cropAllocations", defaultValue = "'[]'")
    @SerializedName("cropAllocations")
    val cropAllocations: List<CropAllocation> = emptyList()
) : Parcelable
