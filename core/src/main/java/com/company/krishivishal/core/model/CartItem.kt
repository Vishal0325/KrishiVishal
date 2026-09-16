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
    tableName = "cart_items",
    indices = [Index("userId"), Index("productId"), Index("variantId")]
)
data class CartItem(
    @PrimaryKey
    @ColumnInfo(name = "id")
    @SerializedName("id")
    @get:PropertyName("id")
    @set:PropertyName("id")
    var id: String = "",

    @ColumnInfo(name = "userId")
    @SerializedName("user_id")
    @get:PropertyName("user_id")
    @set:PropertyName("user_id")
    var userId: String = "",

    @ColumnInfo(name = "productId")
    @SerializedName("product_id")
    @get:PropertyName("product_id")
    @set:PropertyName("product_id")
    var productId: String = "",

    @ColumnInfo(name = "variantId")
    @SerializedName("variant_id")
    @get:PropertyName("variant_id")
    @set:PropertyName("variant_id")
    var variantId: String? = null,

    @ColumnInfo(name = "quantity")
    @SerializedName("quantity")
    @get:PropertyName("quantity")
    @set:PropertyName("quantity")
    var quantity: Int = 1,

    @ColumnInfo(name = "skuCode")
    @SerializedName("sku_code")
    @get:PropertyName("sku_code")
    @set:PropertyName("sku_code")
    var skuCode: String? = null,

    @ColumnInfo(name = "isSelected")
    @SerializedName("is_selected")
    @get:PropertyName("is_selected")
    @set:PropertyName("is_selected")
    var isSelected: Boolean = true,

    @ColumnInfo(name = "timestamp")
    @SerializedName("timestamp")
    @get:PropertyName("timestamp")
    @set:PropertyName("timestamp")
    var timestamp: Long = System.currentTimeMillis()
) : Parcelable
