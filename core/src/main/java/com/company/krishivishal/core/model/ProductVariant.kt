package com.company.krishivishal.core.model

import android.os.Parcelable
import androidx.room.Entity
import androidx.room.PrimaryKey
import com.google.firebase.firestore.PropertyName
import kotlinx.parcelize.Parcelize

/**
 * ProductVariant represents a specific variant of a product
 * (e.g., 250ml, 500ml, 1L of the same product)
 * 
 * Only stores fields that differ per variant to keep the model lean.
 * Shared fields (name, description, category, etc.) come from parent Product.
 */
@Parcelize
data class ProductVariant(
    @PrimaryKey
    val variantId: String = "",
    
    val productId: String = "",        // Parent product ID
    val label: String = "",            // Display label: "250ml", "500ml", "1L", "5kg"
    val price: Double = 0.0,           // Selling price
    val mrp: Double = 0.0,             // Maximum retail price
    val stock: Int = 0,                // Stock quantity for this variant
    val sku: String? = null,           // Stock keeping unit (optional)
    val isDefault: Boolean = false,    // Default variant for quick add
    
    @get:PropertyName("imageUrl")
    val imageUrl: String? = null       // Optional variant-specific image (e.g., different size packaging)
) : Parcelable {
    
    /**
     * Calculate discount percentage
     */
    fun discountPercent(): Int {
        if (mrp <= 0) return 0
        return ((mrp - price) / mrp * 100).toInt().coerceAtLeast(0)
    }
    
    /**
     * Calculate savings amount
     */
    fun savedAmount(): Double {
        return (mrp - price).coerceAtLeast(0.0)
    }
    
    /**
     * Check if variant is in stock
     */
    fun isInStock(): Boolean = stock > 0
}
