package com.company.krishivishal.core.model

import android.os.Parcelable
import com.google.firebase.firestore.IgnoreExtraProperties
import kotlinx.parcelize.Parcelize
import java.util.Date

@IgnoreExtraProperties
@Parcelize
data class Referral(
    val id: String = "",
    val referrerUid: String = "",
    val refereeUid: String = "",
    val referralCode: String = "",
    val status: String = "", // "SIGNED_UP", "REWARDED", "VOIDED"
    val referrerRewardAmount: Double = 0.0,
    val refereeRewardAmount: Double = 0.0,
    val referenceOrderId: String? = null,
    val createdAt: Date? = null,
    val rewardedAt: Date? = null,
    val voidReason: String? = null
) : Parcelable
