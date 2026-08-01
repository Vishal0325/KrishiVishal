package com.company.krishivishal.core.model

import com.google.firebase.Timestamp

data class AdminLog(
    val id: String = "",
    val adminId: String = "",
    val adminName: String = "",
    val action: String = "",
    val targetId: String = "",
    val targetType: String = "", // PRODUCT, ORDER, USER, etc.
    val timestamp: Timestamp = Timestamp.now(),
    val details: String = ""
)
