package com.company.krishivishal.domain.usecase.cart

import com.company.krishivishal.core.model.AppConfig
import com.company.krishivishal.core.model.CartWithProduct
import com.company.krishivishal.core.model.getEffectiveMrp
import com.company.krishivishal.core.model.getEffectiveSellingPrice
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
    operator fun invoke(items: List<CartWithProduct>, config: AppConfig? = null): CartTotals {
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
            
            val sellingPrice = if (variant != null) {
                if (variant.price > 0.0) variant.price else if (variant.basePrice > 0.0) variant.basePrice else product.getEffectiveSellingPrice()
            } else {
                product.getEffectiveSellingPrice()
            }

            val mrp = (if (variant != null) {
                if (variant.basePrice > 0.0) variant.basePrice else if (variant.price > 0.0) variant.price else product.getEffectiveMrp()
            } else {
                product.getEffectiveMrp()
            }).coerceAtLeast(sellingPrice)
            
            subtotal += mrp * quantity
            totalSavings += (mrp - sellingPrice).coerceAtLeast(0.0) * quantity
            totalQuantity += quantity
        }

        val netAmount = subtotal - totalSavings
        
        // Delivery charges logic: Free above 500, else 40
        val deliveryCharges = if (netAmount >= 500.0 || selectedItems.isEmpty()) 0.0 else 40.0
        
        // Fixed fees for production quality based on config
        val platformFee = if (selectedItems.isNotEmpty() && config?.enablePlatformFee != false) 2.0 else 0.0
        val handlingCharge = if (selectedItems.isNotEmpty() && config?.enableHandlingCharge != false) 5.0 else 0.0
        val packagingFee = if (selectedItems.isNotEmpty() && config?.enablePackagingFee != false) 10.0 else 0.0

        val grandTotal = netAmount + deliveryCharges + platformFee + handlingCharge + packagingFee

        fun round2(v: Double): Double = (kotlin.math.round(v * 100.0)) / 100.0

        return CartTotals(
            subtotal = round2(subtotal),
            totalDiscount = round2(totalSavings),
            gstAmount = round2(gstAmount),
            deliveryCharges = round2(deliveryCharges),
            platformFee = platformFee,
            handlingCharge = handlingCharge,
            packagingFee = packagingFee,
            grandTotal = round2(grandTotal),
            totalQuantity = totalQuantity,
            totalSavings = round2(totalSavings)
        )
    }
}
