package com.company.krishivishal.domain.usecase.cart

import com.company.krishivishal.data.model.CartWithProduct
import javax.inject.Inject

data class CartTotals(
    val subtotal: Double = 0.0,
    val totalDiscount: Double = 0.0,
    val gstAmount: Double = 0.0,
    val deliveryCharges: Double = 0.0,
    val platformFee: Double = 0.0,
    val handlingCharge: Double = 0.0,
    val packagingFee: Double = 0.0,
    val grandTotal: Double = 0.0,
    val totalQuantity: Int = 0,
    val totalSavings: Double = 0.0
)

/**
 * UseCase to calculate total prices, discounts, and delivery charges for the cart.
 */
class CalculateCartTotalsUseCase @Inject constructor() {
    operator fun invoke(items: List<CartWithProduct>): CartTotals {
        // Filter only selected items for calculation
        val selectedItems = items.filter { it.cartItem.isSelected }
        
        var subtotal = 0.0
        var totalSavings = 0.0
        var totalQuantity = 0
        var gstAmount = 0.0

        selectedItems.forEach { item ->
            val product = item.product
            val variant = item.variant
            val quantity = item.cartItem.quantity
            
            val mrp = variant?.basePrice ?: if (product.mrp > 0) product.mrp else product.basePrice
            val sellingPrice = variant?.price ?: if (product.discountedPrice > 0) product.discountedPrice else if (product.price > 0) product.price else product.basePrice
            
            subtotal += mrp * quantity
            totalSavings += (mrp - sellingPrice).coerceAtLeast(0.0) * quantity
            totalQuantity += quantity
            
            // Assume 5% GST if not specified, or calculate based on price if needed
            // For now, let's just calculate a sample GST included in selling price or added
            // Requirement says GST should be per product. 
            // In many Indian e-commerce, it's included. But here we'll show it separately as requested.
            gstAmount += (sellingPrice * quantity * 0.05) // 5% GST example
        }

        val netAmount = subtotal - totalSavings
        
        // Delivery charges logic: Free above 500, else 40
        val deliveryCharges = if (netAmount >= 500.0 || selectedItems.isEmpty()) 0.0 else 40.0
        
        // Fixed fees for production quality
        val platformFee = if (selectedItems.isNotEmpty()) 2.0 else 0.0
        val handlingCharge = if (selectedItems.isNotEmpty()) 5.0 else 0.0
        val packagingFee = if (selectedItems.isNotEmpty()) 10.0 else 0.0

        val grandTotal = netAmount + gstAmount + deliveryCharges + platformFee + handlingCharge + packagingFee

        return CartTotals(
            subtotal = subtotal,
            totalDiscount = totalSavings,
            gstAmount = gstAmount,
            deliveryCharges = deliveryCharges,
            platformFee = platformFee,
            handlingCharge = handlingCharge,
            packagingFee = packagingFee,
            grandTotal = grandTotal,
            totalQuantity = totalQuantity,
            totalSavings = totalSavings
        )
    }
}
