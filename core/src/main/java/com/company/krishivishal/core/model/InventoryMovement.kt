package com.company.krishivishal.core.model

import android.os.Parcelable
import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import com.google.firebase.firestore.IgnoreExtraProperties
import com.google.gson.annotations.SerializedName
import kotlinx.parcelize.Parcelize

@IgnoreExtraProperties
@Parcelize
@Entity(
    tableName = "inventory_movements",
    indices = [
        Index("skuCode"),
        Index("timestamp"),
        Index("referenceId")
    ]
)
data class InventoryMovement(
    @PrimaryKey
    @ColumnInfo(name = "movementId")
    @SerializedName("movementId")
    var movementId: String = "",

    @ColumnInfo(name = "movementType")
    @SerializedName("movementType")
    var movementType: String = "", // STOCK_IN, PURCHASE_RECEIPT, ORDER_RESERVED, ORDER_RELEASED, ORDER_COMPLETED, RETURN_IN, DAMAGE, ADJUSTMENT, EXPIRED

    @ColumnInfo(name = "skuCode")
    @SerializedName("skuCode")
    var skuCode: String = "",

    @ColumnInfo(name = "batchId")
    @SerializedName("batchId")
    var batchId: String? = null,

    @ColumnInfo(name = "batchNumber")
    @SerializedName("batchNumber")
    var batchNumber: String? = null,

    @ColumnInfo(name = "warehouseId")
    @SerializedName("warehouseId")
    var warehouseId: String = "WH-PURNEA-01",

    @ColumnInfo(name = "quantity")
    @SerializedName("quantity")
    var quantity: Int = 0,

    @ColumnInfo(name = "availableBefore")
    @SerializedName("availableBefore")
    var availableBefore: Int = 0,

    @ColumnInfo(name = "availableAfter")
    @SerializedName("availableAfter")
    var availableAfter: Int = 0,

    @ColumnInfo(name = "committedBefore")
    @SerializedName("committedBefore")
    var committedBefore: Int = 0,

    @ColumnInfo(name = "committedAfter")
    @SerializedName("committedAfter")
    var committedAfter: Int = 0,

    @ColumnInfo(name = "referenceId")
    @SerializedName("referenceId")
    var referenceId: String = "",

    @ColumnInfo(name = "actorId")
    @SerializedName("actorId")
    var actorId: String = "",

    @ColumnInfo(name = "actorRole")
    @SerializedName("actorRole")
    var actorRole: String = "SYSTEM",

    @ColumnInfo(name = "reason")
    @SerializedName("reason")
    var reason: String = "",

    @ColumnInfo(name = "note")
    @SerializedName("note")
    var note: String = "",

    @ColumnInfo(name = "idempotencyKey")
    @SerializedName("idempotencyKey")
    var idempotencyKey: String? = null,

    @ColumnInfo(name = "timestamp")
    @SerializedName("timestamp")
    var timestamp: Long = 0
) : Parcelable
