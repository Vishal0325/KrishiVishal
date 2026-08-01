package com.company.krishivishal.core.model

import android.os.Parcelable
import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey
import com.google.firebase.firestore.PropertyName
import com.google.gson.annotations.SerializedName
import kotlinx.parcelize.Parcelize

@Parcelize
@Entity(
    tableName = "addresses",
    foreignKeys = [
        ForeignKey(
            entity = User::class,
            parentColumns = ["id"],
            childColumns = ["userId"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [Index("userId")]
)
data class Address(
    @PrimaryKey
    @ColumnInfo(name = "id")
    @SerializedName("id")
    var id: String = "",

    @ColumnInfo(name = "userId")
    @SerializedName("user_id")
    @get:PropertyName("user_id")
    @set:PropertyName("user_id")
    var userId: String = "",

    @ColumnInfo(name = "fullName")
    @SerializedName("full_name")
    @get:PropertyName("full_name")
    @set:PropertyName("full_name")
    var fullName: String = "",

    @ColumnInfo(name = "mobileNumber")
    @SerializedName("mobile_number")
    @get:PropertyName("mobile_number")
    @set:PropertyName("mobile_number")
    var mobileNumber: String = "",

    @ColumnInfo(name = "houseNo")
    @SerializedName("house_no")
    @get:PropertyName("house_no")
    @set:PropertyName("house_no")
    var houseNo: String = "",

    @ColumnInfo(name = "street")
    @SerializedName("street")
    var street: String = "",

    @ColumnInfo(name = "ward")
    @SerializedName("ward")
    var ward: String = "",

    @ColumnInfo(name = "pincode")
    @SerializedName("pincode")
    var pincode: String = "",

    @ColumnInfo(name = "block")
    @SerializedName("block")
    var block: String = "",

    @ColumnInfo(name = "district")
    @SerializedName("district")
    var district: String = "",

    @ColumnInfo(name = "landmark")
    @SerializedName("landmark")
    var landmark: String = "",

    @ColumnInfo(name = "state")
    @SerializedName("state")
    var state: String = "",

    @ColumnInfo(name = "isDefault")
    @SerializedName("is_default")
    @get:PropertyName("is_default")
    @set:PropertyName("is_default")
    var isDefault: Boolean = false,

    @ColumnInfo(name = "addressType")
    @SerializedName("address_type")
    @get:PropertyName("address_type")
    @set:PropertyName("address_type")
    var addressType: String = "Farm" // Default to Farm
) : Parcelable
