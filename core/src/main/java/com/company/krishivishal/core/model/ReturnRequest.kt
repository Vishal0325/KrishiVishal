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
    
    @SerializedName("userId")
    val userId: String = "",
    
    @SerializedName("productId")
    val productId: String = "",
    
    @SerializedName("productName")
    val productName: String = "",
    
    @SerializedName("reason")
    val reason: String = "",
    
    @SerializedName("description")
    val description: String = "",
    
    @SerializedName("proofUrls")
    val proofUrls: List<String> = emptyList(),
    
    @SerializedName("status")
    val status: String = "PENDING", // PENDING, UNDER_REVIEW, APPROVED, REJECTED, PICKUP_SCHEDULED, PICKED_UP, VERIFIED, REFUND_INITIATED, COMPLETED
    
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
