package com.company.krishivishal.domain.usecase.checkout

import com.company.krishivishal.core.model.CartItem
import com.company.krishivishal.core.model.CartWithProduct
import com.company.krishivishal.core.model.Product
import com.company.krishivishal.core.model.Variant
import com.company.krishivishal.utils.CSVUtil
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class CheckoutWeightValidationTest {

    private fun calculateTotalWeightGrams(items: List<CartWithProduct>): Double {
        return items.sumOf { item ->
            val directWeightGrams = item.variant?.weightGrams?.toDouble()
                ?: item.product?.weightGrams?.toDouble()
            val finalWeightGrams = if (directWeightGrams != null && directWeightGrams > 0.0) {
                directWeightGrams
            } else {
                val weightStr = item.variant?.weight ?: item.product?.weight ?: ""
                parseWeightToGrams(weightStr)
            }
            val qty = item.cartItem.quantity
            finalWeightGrams * qty
        }
    }

    private fun parseWeightToGrams(raw: String): Double {
        if (raw.isBlank()) return 0.0
        val clean = raw.trim().lowercase()
        val regex = Regex("""^([\d.]+)\s*(kg|g|gm|gms|l|ltr|litre|litres|ml)?$""")
        val match = regex.find(clean) ?: return clean.toDoubleOrNull() ?: 0.0
        val value = match.groupValues[1].toDoubleOrNull() ?: 0.0
        val unit = match.groupValues.getOrNull(2) ?: "g"
        return when (unit) {
            "kg", "l", "ltr", "litre", "litres" -> value * 1000.0
            else -> value
        }
    }

    @Test
    fun `calculateTotalWeightGrams prioritizes numeric weightGrams over legacy string`() {
        val product = Product(id = "p1", weight = "500g", weightGrams = 1000L) // string says 500g, numeric is 1000g
        val cartItem = CartItem(id = "c1", userId = "u1", productId = "p1", quantity = 2)
        val items = listOf(CartWithProduct(cartItem, product, null))

        val totalGrams = calculateTotalWeightGrams(items)
        assertEquals(2000.0, totalGrams, 0.001)
    }

    @Test
    fun `calculateTotalWeightGrams falls back to legacy string when weightGrams is null`() {
        val product = Product(id = "p1", weight = "2.5 kg", weightGrams = null)
        val cartItem = CartItem(id = "c1", userId = "u1", productId = "p1", quantity = 2)
        val items = listOf(CartWithProduct(cartItem, product, null))

        val totalGrams = calculateTotalWeightGrams(items)
        assertEquals(5000.0, totalGrams, 0.001)
    }

    @Test
    fun `calculateTotalWeightGrams accurately flags 50kg weight limit exceeded`() {
        val maxLimitGrams = 50000.0

        // 3 bags of 20kg Urea = 60kg (60,000g)
        val product = Product(id = "p1", weight = "20kg", weightGrams = 20000L)
        val cartItem = CartItem(id = "c1", userId = "u1", productId = "p1", quantity = 3)
        val items = listOf(CartWithProduct(cartItem, product, null))

        val totalGrams = calculateTotalWeightGrams(items)
        assertTrue("Total weight $totalGrams should exceed 50kg limit", totalGrams > maxLimitGrams)

        // 2 bags of 20kg Urea = 40kg (40,000g) -> within limit
        val withinLimitItem = cartItem.copy(quantity = 2)
        val withinLimitItems = listOf(CartWithProduct(withinLimitItem, product, null))
        val totalWithinLimit = calculateTotalWeightGrams(withinLimitItems)
        assertFalse("Total weight $totalWithinLimit should be within limit", totalWithinLimit > maxLimitGrams)
    }

    @Test
    fun `CSVUtil parseWeightToGrams accurately converts various units`() {
        assertEquals(500L, CSVUtil.parseWeightToGrams("500g"))
        assertEquals(1000L, CSVUtil.parseWeightToGrams("1kg"))
        assertEquals(1500L, CSVUtil.parseWeightToGrams("1.5 kg"))
        assertEquals(250L, CSVUtil.parseWeightToGrams("250ml"))
        assertEquals(1000L, CSVUtil.parseWeightToGrams("1L"))
        assertEquals(50L, CSVUtil.parseWeightToGrams("50 gm"))
        assertEquals(null, CSVUtil.parseWeightToGrams(""))
        assertEquals(null, CSVUtil.parseWeightToGrams(null))
    }
}
