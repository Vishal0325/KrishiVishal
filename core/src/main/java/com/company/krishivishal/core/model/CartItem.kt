package com.company.krishivishal.core.model

import android.os.Parcelable
import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey
import com.google.gson.annotations.SerializedName
import kotlinx.parcelize.Parcelize

@Parcelize
@Entity(
    tableName = "cart_items",
    indices = [Index("userId"), Index("productId"), Index("variantId")]
)
data class CartItem(
    @PrimaryKey
    @ColumnInfo(name = "id")
    @SerializedName("id")
    val id: String = "",

    @ColumnInfo(name = "userId")
    @SerializedName("user_id")
    val userId: String = "",

    @ColumnInfo(name = "productId")
    @SerializedName("product_id")
    val productId: String = "",

    @ColumnInfo(name = "variantId")
    @SerializedName("variant_id")
    val variantId: String? = null,

    @ColumnInfo(name = "quantity")
    @SerializedName("quantity")
    val quantity: Int = 1,

    @ColumnInfo(name = "skuCode")
    @SerializedName("sku_code")
    val skuCode: String? = null,

    @ColumnInfo(name = "isSelected")
    @SerializedName("is_selected")
    val isSelected: Boolean = true,

    @ColumnInfo(name = "timestamp")
    @SerializedName("timestamp")
    val timestamp: Long = System.currentTimeMillis()
) : Parcelable
