package com.company.krishivishal.core.model

import android.os.Parcelable
import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import com.google.firebase.firestore.IgnoreExtraProperties
import com.google.gson.annotations.SerializedName
import kotlinx.parcelize.Parcelize

/**
 * Sku Room Entity — Read-only cache of Firestore `skus/{skuCode}`
 */
@IgnoreExtraProperties
@Parcelize
@Entity(
    tableName = "skus",
    indices = [
        Index("productId"),
        Index("barcode"),
        Index("isActive")
    ]
)
data class Sku(
    @PrimaryKey
    @ColumnInfo(name = "skuCode")
    @SerializedName("skuCode")
    var skuCode: String = "",

    @ColumnInfo(name = "productId")
    @SerializedName("productId")
    var productId: String = "",

    @ColumnInfo(name = "name")
    @SerializedName("name")
    var name: String = "",

    // Segments
    @ColumnInfo(name = "categoryCode")
    @SerializedName("categoryCode")
    var categoryCode: String = "",

    @ColumnInfo(name = "itemCode")
    @SerializedName("itemCode")
    var itemCode: String = "",

    @ColumnInfo(name = "varietyCode")
    @SerializedName("varietyCode")
    var varietyCode: String = "",

    @ColumnInfo(name = "gradeCode")
    @SerializedName("gradeCode")
    var gradeCode: String = "",

    @ColumnInfo(name = "packCode")
    @SerializedName("packCode")
    var packCode: String = "",

    @ColumnInfo(name = "brandCode")
    @SerializedName("brandCode")
    var brandCode: String = "",

    @ColumnInfo(name = "unit")
    @SerializedName("unit")
    var unit: String = "",

    @ColumnInfo(name = "size")
    @SerializedName("size")
    var size: String = "",

    // Pricing (Cached read-only from Firestore)
    @ColumnInfo(name = "mrp")
    @SerializedName("mrp")
    var mrp: Double = 0.0,

    @ColumnInfo(name = "consumerPrice")
    @SerializedName("consumerPrice")
    var consumerPrice: Double = 0.0,

    @ColumnInfo(name = "dealerPrice")
    @SerializedName("dealerPrice")
    var dealerPrice: Double = 0.0,

    @ColumnInfo(name = "landingCost")
    @SerializedName("landingCost")
    var landingCost: Double = 0.0,

    // Inventory (Cached derived aggregate from Firestore)
    @ColumnInfo(name = "totalStock")
    @SerializedName("totalStock")
    var totalStock: Int = 0,

    @ColumnInfo(name = "availableStock")
    @SerializedName("availableStock")
    var availableStock: Int = 0,

    @ColumnInfo(name = "committedStock")
    @SerializedName("committedStock")
    var committedStock: Int = 0,

    // Tax & Compliance
    @ColumnInfo(name = "hsnCode")
    @SerializedName("hsnCode")
    var hsnCode: String = "",

    @ColumnInfo(name = "gstRate")
    @SerializedName("gstRate")
    var gstRate: Double = 0.0,

    // Barcode
    @ColumnInfo(name = "barcode")
    @SerializedName("barcode")
    var barcode: String = "",

    // Reorder thresholds
    @ColumnInfo(name = "reorderLevel")
    @SerializedName("reorderLevel")
    var reorderLevel: Int = 50,

    @ColumnInfo(name = "minStockLimit")
    @SerializedName("minStockLimit")
    var minStockLimit: Int = 10,

    @ColumnInfo(name = "isActive")
    @SerializedName("isActive")
    var isActive: Boolean = true,

    @ColumnInfo(name = "updatedAt")
    @SerializedName("updatedAt")
    var updatedAt: Long = 0
) : Parcelable
