package com.company.krishivishal.core.model

import android.os.Parcelable
import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey
import com.google.firebase.firestore.IgnoreExtraProperties
import com.google.gson.annotations.SerializedName
import kotlinx.parcelize.Parcelize

/**
 * Wishlist Item Entity for Room Database
 * Stores products saved by guest or logged-in users locally
 */
@IgnoreExtraProperties
@Parcelize
@Entity(tableName = "wishlist_items")
data class WishlistItem(
    @PrimaryKey
    @ColumnInfo(name = "productId")
    @SerializedName("productId")
    val productId: String = "",

    @ColumnInfo(name = "productName")
    @SerializedName("productName")
    val productName: String = "",

    @ColumnInfo(name = "price")
    @SerializedName("price")
    val price: Double = 0.0,

    @ColumnInfo(name = "imageUrl")
    @SerializedName("imageUrl")
    val imageUrl: String = "",

    @ColumnInfo(name = "userId")
    @SerializedName("userId")
    val userId: String = "guest_user",

    @ColumnInfo(name = "timestamp")
    @SerializedName("timestamp")
    val timestamp: Long = System.currentTimeMillis()
) : Parcelable
