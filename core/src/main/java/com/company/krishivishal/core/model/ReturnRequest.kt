package com.company.krishivishal.core.model

import android.os.Parcelable
import androidx.room.Entity
import androidx.room.PrimaryKey
import com.google.gson.annotations.SerializedName
import kotlinx.parcelize.Parcelize
import java.util.Date

@Parcelize
@Entity(tableName = "returns")
data class ReturnRequest(
    @PrimaryKey
    @SerializedName("id")
    val id: String = "",
    
    @SerializedName("orderId")
    val orderId: String = "",

    @SerializedName("orderItemId")
    val orderItemId: String = "",

    @SerializedName("userId")
    val userId: String = "",
    
    @SerializedName("productId")
    val productId: String = "",
    
    @SerializedName("productName")
    val productName: String = "",

    @SerializedName("quantity")
    val quantity: Int = 1,

    @SerializedName("reason")
    val reason: String = "",
    
    @SerializedName("description")
    val description: String = "",

    @SerializedName("customerComment")
    val customerComment: String = "",

    @SerializedName("proofUrls")
    val proofUrls: List<String> = emptyList(),
    
    @SerializedName("status")
    val status: String = "REQUESTED", // REQUESTED, APPROVED, RIDER_ASSIGNED, PICKUP_SCHEDULED, PICKED_UP, HUB_RECEIVED, QC_PENDING, QC_PASSED, QC_FAILED, REFUND_PENDING, COMPLETED, REJECTED, CANCELLED

    @SerializedName("riderId")
    val riderId: String = "",

    @SerializedName("qcStatus")
    val qcStatus: String = "PENDING", // PENDING, PASSED, FAILED

    @SerializedName("qcPhotos")
    val qcPhotos: List<String> = emptyList(),

    @SerializedName("refundStatus")
    val refundStatus: String = "PENDING", // PENDING, INITIATED, COMPLETED, FAILED

    @SerializedName("refundAmount")
    val refundAmount: Double = 0.0,

    @SerializedName("gatewayRefundId")
    val gatewayRefundId: String = "",

    @SerializedName("rejectionReason")
    val rejectionReason: String = "",

    @SerializedName("refundMethod")
    val refundMethod: String = "UPI", // UPI, BANK_ACCOUNT, WALLET
    
    @SerializedName("adminNotes")
    val adminNotes: String = "",
    
    @SerializedName("pickupDate")
    val pickupDate: Date? = null,
    
    @SerializedName("createdAt")
    val createdAt: Date = Date(),
    
    @SerializedName("updatedAt")
    val updatedAt: Date = Date()
) : Parcelable
