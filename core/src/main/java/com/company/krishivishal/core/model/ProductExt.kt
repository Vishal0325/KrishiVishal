package com.company.krishivishal.core.model

/**
 * Checks if the product is in stock.
 * A product is considered in stock if it's active AND:
 * - If it has variants, at least one variant has stock > 0
 * - If it has no variants, its base stockQuantity is > 0
 */
fun Product.isAvailable(): Boolean {
    if (!isActive) return false
    val hasVariantStock = variants.any { it.stock > 0 }
    return if (variants.isNotEmpty()) hasVariantStock else stockQuantity > 0
}

/**
 * Gets the effective selling price of the product.
 * - If it has variants, it takes the price of the first variant.
 * - Otherwise, it takes discountedPrice if it's > 0, else basePrice.
 */
fun Product.getEffectiveSellingPrice(): Double {
    val firstVariant = variants.firstOrNull()
    return when {
        firstVariant != null -> firstVariant.price
        discountedPrice > 0 -> discountedPrice
        else -> basePrice
    }
}

/**
 * Gets the effective MRP of the product.
 * - If it has variants, it takes the basePrice of the first variant.
 * - Otherwise, it takes mrp if > 0, else basePrice (but bounded to be at least selling price).
 */
fun Product.getEffectiveMrp(): Double {
    val firstVariant = variants.firstOrNull()
    val sellingPrice = getEffectiveSellingPrice()
    return when {
        firstVariant != null -> firstVariant.basePrice
        mrp > 0 -> mrp
        else -> basePrice.coerceAtLeast(sellingPrice)
    }
}

/**
 * Gets the auto-calculated discount percentage based on effective MRP and Selling Price.
 */
fun Product.getEffectiveDiscountPercent(): Int {
    val mrp = getEffectiveMrp()
    val sellingPrice = getEffectiveSellingPrice()
    return if (mrp > sellingPrice) {
        (((mrp - sellingPrice) / mrp) * 100).toInt()
    } else {
        discountPercent
    }
}
