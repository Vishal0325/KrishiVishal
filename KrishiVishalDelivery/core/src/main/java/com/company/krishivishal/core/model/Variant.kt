package com.company.krishivishal.core.model

import android.os.Parcelable
import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey
import com.google.gson.annotations.SerializedName
import com.google.firebase.firestore.IgnoreExtraProperties
import com.google.firebase.firestore.PropertyName
import kotlinx.parcelize.Parcelize
import com.google.firebase.Timestamp

@IgnoreExtraProperties
@Parcelize
@Entity(
    tableName = "variants",
    foreignKeys = [
        ForeignKey(
            entity = Product::class,
            parentColumns = ["id"],
            childColumns = ["productId"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [Index("productId")]
)
data class Variant(
    @PrimaryKey
    @ColumnInfo(name = "id")
    @SerializedName("id")
    var id: String = "",

    @ColumnInfo(name = "productId")
    @SerializedName("product_id")
    var productId: String = "",

    @ColumnInfo(name = "size")
    @SerializedName("size")
    @get:PropertyName("size")
    @set:PropertyName("size")
    var size: String = "",

    @ColumnInfo(name = "price")
    @SerializedName("price")
    @get:PropertyName("price")
    @set:PropertyName("price")
    var price: Double = 0.0,

    @ColumnInfo(name = "basePrice")
    @SerializedName("basePrice")
    @get:PropertyName("basePrice")
    @set:PropertyName("basePrice")
    var basePrice: Double = 0.0,

    @ColumnInfo(name = "discountPercent")
    @SerializedName("discountPercent")
    @get:PropertyName("discountPercent")
    @set:PropertyName("discountPercent")
    var discountPercent: Int = 0,

    @ColumnInfo(name = "isBestSeller")
    @SerializedName("isBestSeller")
    @get:PropertyName("isBestSeller")
    @set:PropertyName("isBestSeller")
    var isBestSeller: Boolean = false,

    @ColumnInfo(name = "mfgDate")
    @SerializedName("mfgDate")
    @get:PropertyName("mfgDate")
    @set:PropertyName("mfgDate")
    var mfgDate: Timestamp? = null,

    @ColumnInfo(name = "expiryDate")
    @SerializedName("expiryDate")
    @get:PropertyName("expiryDate")
    @set:PropertyName("expiryDate")
    var expiryDate: Timestamp? = null,

    @ColumnInfo(name = "stock")
    @SerializedName("stock")
    @get:PropertyName("stock")
    @set:PropertyName("stock")
    var stock: Int = 0,

    @ColumnInfo(name = "batchNumber")
    @SerializedName("batchNumber")
    @get:PropertyName("batchNumber")
    @set:PropertyName("batchNumber")
    var batchNumber: String = "",

    @ColumnInfo(name = "label")
    @SerializedName("label")
    @get:PropertyName("label")
    @set:PropertyName("label")
    var label: String = "",

    @ColumnInfo(name = "weight")
    @SerializedName("weight")
    @get:PropertyName("weight")
    @set:PropertyName("weight")
    var weight: String = "",

    @ColumnInfo(name = "unit")
    @SerializedName("unit")
    @get:PropertyName("unit")
    @set:PropertyName("unit")
    var unit: String = ""
) : Parcelable
