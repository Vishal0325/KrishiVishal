package com.company.krishivishal.core.model

import androidx.room.Embedded
import androidx.room.Relation

data class CartWithProduct(
    @Embedded val cartItem: CartItem,
    @Relation(
        parentColumn = "productId",
        entityColumn = "id"
    )
    val product: Product?,
    
    @Relation(
        parentColumn = "variantId",
        entityColumn = "id"
    )
    val variant: Variant?
)
