package com.company.krishivishal.data.model

import android.os.Parcelable
import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey
import com.google.firebase.firestore.Exclude
import com.google.firebase.firestore.IgnoreExtraProperties
import com.google.gson.annotations.SerializedName
import kotlinx.parcelize.Parcelize
import java.util.Date

@Parcelize
data class OrderItem(
    @SerializedName("productId") val productId: String = "",
    @SerializedName("productName") val productName: String = "",
    @SerializedName("quantity") val quantity: Int = 0,
    @SerializedName("price") val price: Double = 0.0,
    @SerializedName("imageUrl") val imageUrl: String = ""
) : Parcelable

@Parcelize
@IgnoreExtraProperties
@Entity(
    tableName = "orders",
    indices = [androidx.room.Index("userId")]
)
data class Order(
    @PrimaryKey
    @ColumnInfo(name = "id")
    @SerializedName("id")
    val id: String = "",

    @ColumnInfo(name = "userId")
    @SerializedName("userId")
    val userId: String = "",

    @ColumnInfo(name = "items")
    @SerializedName("items")
    val items: List<OrderItem> = emptyList(),

    @ColumnInfo(name = "totalAmount")
    @SerializedName("totalAmount")
    val totalAmount: Double = 0.0,

    @ColumnInfo(name = "paymentMethod")
    @SerializedName("paymentMethod")
    val paymentMethod: String = "",

    @ColumnInfo(name = "paymentStatus")
    @SerializedName("paymentStatus")
    val paymentStatus: String = "PENDING",

    @ColumnInfo(name = "razorpayPaymentId")
    @SerializedName("razorpayPaymentId")
    val razorpayPaymentId: String? = null,

    @ColumnInfo(name = "address")
    @SerializedName("address")
    val address: String = "",

    @ColumnInfo(name = "status")
    @SerializedName("status")
    val status: String = "PLACED",

    @ColumnInfo(name = "createdAt")
    @SerializedName("createdAt")
    val createdAt: Date = Date(),

    @ColumnInfo(name = "expectedDelivery")
    @SerializedName("expectedDelivery")
    val expectedDelivery: Date = Date(),

    // Delivery Specific Fields
    @ColumnInfo(name = "riderId")
    @SerializedName("riderId")
    val riderId: String = "",

    @ColumnInfo(name = "isCOD")
    @SerializedName("isCOD")
    val isCOD: Boolean = false,

    @ColumnInfo(name = "codAmount")
    @SerializedName("codAmount")
    val codAmount: Double = 0.0,

    @ColumnInfo(name = "isSettledByAdmin")
    @SerializedName("isSettledByAdmin")
    val isSettledByAdmin: Boolean = false,

    @ColumnInfo(name = "targetLat")
    @SerializedName("targetLat")
    val targetLat: Double = 0.0,

    @ColumnInfo(name = "targetLng")
    @SerializedName("targetLng")
    val targetLng: Double = 0.0,

    @ColumnInfo(name = "customerOTP")
    @SerializedName("customerOTP")
    val customerOTP: String = ""
) : Parcelable {
    @get:Exclude
    val orderStatus: OrderStatus 
        get() = OrderStatus.fromString(status)
}
