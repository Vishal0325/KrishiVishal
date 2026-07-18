package com.company.krishivishal.data.model

import android.os.Parcelable
import com.google.firebase.Timestamp
import kotlinx.parcelize.Parcelize

@Parcelize
data class Review(
    val id: String = "",
    val productId: String = "",
    val userId: String = "",
    val userName: String = "",
    val rating: Float = 0f,
    val comment: String = "",
    val createdAt: Timestamp? = null
) : Parcelable
