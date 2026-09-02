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
 * Batch Room Entity — First-class Lot/Manufacturing record.
 * Read-only cache of Firestore `skus/{skuCode}/batches/{batchId}`
 */
@IgnoreExtraProperties
@Parcelize
@Entity(
    tableName = "batches",
    indices = [
        Index("skuCode"),
        Index("expiryDate"),
        Index("warehouseId"),
        Index("qualityStatus")
    ]
)
data class Batch(
    @PrimaryKey
    @ColumnInfo(name = "batchId")
    @SerializedName("batchId")
    var batchId: String = "",

    @ColumnInfo(name = "skuCode")
    @SerializedName("skuCode")
    var skuCode: String = "",

    @ColumnInfo(name = "batchNumber")
    @SerializedName("batchNumber")
    var batchNumber: String = "",

    @ColumnInfo(name = "mfgDate")
    @SerializedName("mfgDate")
    var mfgDate: Long? = null,

    @ColumnInfo(name = "expiryDate")
    @SerializedName("expiryDate")
    var expiryDate: Long? = null,

    @ColumnInfo(name = "stock")
    @SerializedName("stock")
    var stock: Int = 0,

    @ColumnInfo(name = "warehouseId")
    @SerializedName("warehouseId")
    var warehouseId: String = "WH-PURNEA-01",

    @ColumnInfo(name = "binLocation")
    @SerializedName("binLocation")
    var binLocation: String = "",

    @ColumnInfo(name = "supplierId")
    @SerializedName("supplierId")
    var supplierId: String = "",

    @ColumnInfo(name = "purchaseOrderId")
    @SerializedName("purchaseOrderId")
    var purchaseOrderId: String = "",

    @ColumnInfo(name = "grnId")
    @SerializedName("grnId")
    var grnId: String = "",

    @ColumnInfo(name = "landingCost")
    @SerializedName("landingCost")
    var landingCost: Double = 0.0,

    @ColumnInfo(name = "qualityStatus")
    @SerializedName("qualityStatus")
    var qualityStatus: String = "PASSED", // PENDING, PASSED, QUARANTINED, REJECTED, EXPIRED

    @ColumnInfo(name = "isActive")
    @SerializedName("isActive")
    var isActive: Boolean = true,

    @ColumnInfo(name = "createdAt")
    @SerializedName("createdAt")
    var createdAt: Long = 0,

    @ColumnInfo(name = "updatedAt")
    @SerializedName("updatedAt")
    var updatedAt: Long = 0
) : Parcelable
