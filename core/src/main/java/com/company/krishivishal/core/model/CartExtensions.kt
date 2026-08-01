package com.company.krishivishal.core.model

/**
 * Extension function for CartWithProduct to safely get available stock.
 * Provides single source of truth for stock availability calculation.
 * 
 * Logic:
 *   - If variant is present: use variant.stock (variant-specific inventory)
 *   - Else: use product.stockQuantity (product-level inventory)
 *   - If product is null (deleted): return 0 (no stock available)
 * 
 * Used by: Cart validation, checkout, quantity updates, stock display
 */
fun CartWithProduct.availableStock(): Int {
    // Defensive: if product is deleted (LEFT JOIN returns null), no stock available
    if (product == null) return 0
    
    // Return variant stock if variant selected, otherwise product stock
    return variant?.stock ?: product.stockQuantity
}

/**
 * Consolidated logic to get a display-friendly label for a product's variant/size.
 * Prioritizes selected Variant label, then falls back to Product weight/unit.
 * 
 * Used by: CartScreen, CheckoutScreen, and OrderHistory previews.
 */
fun CartWithProduct.displayVariantLabel(): String {
    // 1. Try Variant label first (new system)
    val v = variant
    if (v != null) {
        val labelText = if (v.label.isNotBlank()) v.label else v.size
        val formatted = labelText.removeSuffix(".0").trim()
        if (formatted.isNotBlank()) return formatted
    }

    // 2. Fallback to Product weight/unit (legacy system)
    val w = product.weight.removeSuffix(".0").trim()
    val u = product.unit.trim()
    
    return when {
        w.isNotBlank() && u.isNotBlank() -> {
            // Deduplicate if unit is already in the weight string (e.g. "500ml" + "ml")
            if (w.contains(u, ignoreCase = true)) w else "$w $u"
        }
        w.isNotBlank() -> w
        u.isNotBlank() -> u
        else -> ""
    }
}
