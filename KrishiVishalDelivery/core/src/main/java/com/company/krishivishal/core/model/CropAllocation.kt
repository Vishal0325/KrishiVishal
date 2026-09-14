package com.company.krishivishal.core.model

import android.os.Parcelable
import com.google.firebase.firestore.IgnoreExtraProperties
import com.google.gson.annotations.SerializedName
import kotlinx.parcelize.Parcelize

@IgnoreExtraProperties
@Parcelize
data class CropAllocation(
    @SerializedName("id")
    val id: String = "",

    @SerializedName("cropName")
    val cropName: String = "",

    @SerializedName("allocatedArea")
    val allocatedArea: Double = 0.0,

    @SerializedName("unit")
    val unit: String = "Katha",

    @SerializedName("sowingMonth")
    val sowingMonth: String = "",

    @SerializedName("harvestMonth")
    val harvestMonth: String = "",

    @SerializedName("status")
    val status: String = "GROWING", // GROWING, HARVESTED, PLANNED

    @SerializedName("notes")
    val notes: String = ""
) : Parcelable
