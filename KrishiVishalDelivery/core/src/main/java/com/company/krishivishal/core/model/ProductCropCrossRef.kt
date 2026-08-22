package com.company.krishivishal.core.model

import androidx.room.Entity
import androidx.room.Index

@Entity(
    tableName = "product_crop_cross_ref",
    primaryKeys = ["productId", "cropId"],
    indices = [Index(value = ["cropId"])]
)
data class ProductCropCrossRef(
    val productId: String,
    val cropId: String
)
