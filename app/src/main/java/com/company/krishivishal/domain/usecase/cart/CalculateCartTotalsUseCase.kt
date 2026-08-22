package com.company.krishivishal.domain.usecase.cart

import com.company.krishivishal.core.model.CartWithProduct
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
            val product = item.product ?: return@forEach
            val variant = item.variant
            val quantity = item.cartItem.quantity
            
            val mrp = variant?.basePrice ?: if (product.mrp > 0) product.mrp else product.basePrice
            val sellingPrice = variant?.price ?: if (product.discountedPrice > 0) product.discountedPrice else if (product.price > 0) product.price else product.basePrice
            
            subtotal += mrp * quantity
            totalSavings += (mrp - sellingPrice).coerceAtLeast(0.0) * quantity
            totalQuantity += quantity
            
            // Indian GST Calculation: based on product's specific rate (fallback to 5%)
            val rate = if (product.gstRate > 0) product.gstRate else 5.0
            gstAmount += (sellingPrice * quantity * (rate / 100.0))
        }

        val netAmount = subtotal - totalSavings
        
        // Delivery charges logic: Free above 500, else 40
        val deliveryCharges = if (netAmount >= 500.0 || selectedItems.isEmpty()) 0.0 else 40.0
        
        // Fixed fees for production quality
        val platformFee = if (selectedItems.isNotEmpty()) 2.0 else 0.0
        val handlingCharge = if (selectedItems.isNotEmpty()) 5.0 else 0.0
        val packagingFee = if (selectedItems.isNotEmpty()) 10.0 else 0.0

        val grandTotal = netAmount + gstAmount + deliveryCharges + platformFee + handlingCharge + packagingFee

        // Return rounded totals to prevent floating-point display issues (e.g., 99.999999)
        return CartTotals(
            subtotal = kotlin.math.round(subtotal),
            totalDiscount = kotlin.math.round(totalSavings),
            gstAmount = kotlin.math.round(gstAmount),
            deliveryCharges = deliveryCharges,
            platformFee = platformFee,
            handlingCharge = handlingCharge,
            packagingFee = packagingFee,
            grandTotal = kotlin.math.round(grandTotal),
            totalQuantity = totalQuantity,
            totalSavings = kotlin.math.round(totalSavings)
        )
    }
}
