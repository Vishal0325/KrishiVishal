package com.company.krishivishal.core.model

import android.os.Parcelable
import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.PrimaryKey
import com.google.firebase.firestore.Exclude
import com.google.firebase.firestore.IgnoreExtraProperties
import com.google.gson.annotations.SerializedName
import kotlinx.parcelize.Parcelize
import kotlinx.serialization.Serializable
import com.company.krishivishal.core.util.DateSerializer
import java.util.Date

/**
 * OrderItem represents a single product item in an order.
 * 
 * variantId and variantLabel are nullable to support:
 * 1. Legacy orders created before variant support (backward compatible)
 * 2. Single-variant products that have no variants
 * 3. Edge case: variant was deleted after order creation
 * 
 * When deserializing from Firestore:
 * - Old orders: variantId and variantLabel will be null (defaults applied)
 * - New orders: both fields populated from variant selection
 */
@Parcelize
@Serializable
data class OrderItem(
    @SerializedName("productId") val productId: String = "",
    @SerializedName("productName") val productName: String = "",
    @SerializedName("quantity") val quantity: Int = 0,
    @SerializedName("price") val price: Double = 0.0,
    @SerializedName("imageUrl") val imageUrl: String = "",
    
    // NEW: Variant identification fields (nullable for backward compatibility)
    @SerializedName("variantId") val variantId: String? = null,
    @SerializedName("variantLabel") val variantLabel: String? = null,

    // V4: Tax Compliance Fields
    @SerializedName("hsnCode") val hsnCode: String = "",
    @SerializedName("gstRate") val gstRate: Double = 0.0,
    @SerializedName("gstAmount") val gstAmount: Double = 0.0,
    @SerializedName("taxableAmount") val taxableAmount: Double = 0.0,
    @SerializedName("costPrice") val costPrice: Double = 0.0
) : Parcelable

@Parcelize
@Serializable
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

    @ColumnInfo(name = "landmark")
    @SerializedName("landmark")
    val landmark: String = "",

    @ColumnInfo(name = "status")
    @SerializedName("status")
    val status: String = "PLACED",

    @ColumnInfo(name = "createdAt")
    @SerializedName("createdAt")
    @Serializable(with = DateSerializer::class)
    val createdAt: Date = Date(),

    @ColumnInfo(name = "expectedDelivery")
    @SerializedName("expectedDelivery")
    @Serializable(with = DateSerializer::class)
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
    val customerOTP: String = "",

    @ColumnInfo(name = "userName")
    @SerializedName("userName")
    val userName: String = "",

    @ColumnInfo(name = "userPhone")
    @SerializedName("userPhone")
    val userPhone: String = "",

    @ColumnInfo(name = "collectedCash")
    @SerializedName("collectedCash")
    val collectedCash: Double = 0.0,

    @ColumnInfo(name = "isCashDeposited")
    @SerializedName("isCashDeposited")
    val isCashDeposited: Boolean = false,

    // V4: GST & Tax Summary
    @ColumnInfo(name = "totalTax")
    @SerializedName("totalTax")
    val totalTax: Double = 0.0,

    @ColumnInfo(name = "taxableTotal")
    @SerializedName("taxableTotal")
    val taxableTotal: Double = 0.0,

    @ColumnInfo(name = "cgst")
    @SerializedName("cgst")
    val cgst: Double = 0.0,

    @ColumnInfo(name = "sgst")
    @SerializedName("sgst")
    val sgst: Double = 0.0,

    @ColumnInfo(name = "igst")
    @SerializedName("igst")
    val igst: Double = 0.0,

    // V4 Hardened: Price Breakdown Components
    @ColumnInfo(name = "subtotal")
    @SerializedName("subtotal")
    val subtotal: Double = 0.0,

    @ColumnInfo(name = "totalDiscount")
    @SerializedName("totalDiscount")
    val totalDiscount: Double = 0.0,

    @ColumnInfo(name = "deliveryCharges")
    @SerializedName("deliveryCharges")
    val deliveryCharges: Double = 0.0,

    @ColumnInfo(name = "platformFee")
    @SerializedName("platformFee")
    val platformFee: Double = 0.0,

    @ColumnInfo(name = "handlingCharge")
    @SerializedName("handlingCharge")
    val handlingCharge: Double = 0.0,

    @ColumnInfo(name = "packagingFee")
    @SerializedName("packagingFee")
    val packagingFee: Double = 0.0
) : Parcelable {
    @get:Exclude
    val orderStatus: OrderStatus 
        get() = OrderStatus.fromString(status)

    fun getEffectiveLandmark(): String {
        if (landmark.isNotBlank()) return landmark
        val landmarkPrefixes = listOf("Landmark:", "Landmark -", "लैंडमार्क:", "(Landmark:")
        for (prefix in landmarkPrefixes) {
            val idx = address.indexOf(prefix, ignoreCase = true)
            if (idx != -1) {
                val sub = address.substring(idx + prefix.length).trim()
                val endIdx = sub.indexOfAny(charArrayOf(',', ')', ';', '\n'))
                val result = if (endIdx != -1) sub.substring(0, endIdx).trim() else sub.trim()
                if (result.isNotBlank()) return result
            }
        }
        return ""
    }
}
