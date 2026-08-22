package com.company.krishivishal.core.model

data class BannerItem(
    val id: String = "",
    val imageUrl: String = "",
    val title: String = "",
    val linkUrl: String = "",
    val link: String = "", // Added for Firestore compatibility
    val priority: Int = 0,
    val order: Int = 0, // Added for Firestore compatibility
    val isActive: Boolean = true,
    val createdAt: Long = 0L // Added for Firestore compatibility
)
