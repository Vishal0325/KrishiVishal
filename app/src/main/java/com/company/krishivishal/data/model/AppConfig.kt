package com.company.krishivishal.data.model

import com.google.firebase.firestore.IgnoreExtraProperties

@IgnoreExtraProperties
data class AppConfig(
    val whatsappNumber: String = "",
    val supportCallNumber: String = "",
    val supportEmail: String = ""
)
