package com.company.krishivishal.domain.usecase.cart

import com.company.krishivishal.core.model.CartItem
import com.company.krishivishal.core.model.CartWithProduct
import com.company.krishivishal.core.model.Product
import com.company.krishivishal.core.model.Variant
import org.junit.Assert.assertEquals
import org.junit.Test

class CalculateCartTotalsUseCaseTest {

    private val useCase = CalculateCartTotalsUseCase()

    @Test
    fun `calculate totals with single item no variant`() {
        val product = Product(id = "p1", basePrice = 100.0, discountedPrice = 80.0, mrp = 100.0)
        val cartItem = CartItem(id = "c1", userId = "u1", productId = "p1", variantId = null, quantity = 2)
        val items = listOf(CartWithProduct(cartItem, product, null))

        val result = useCase(items)

        // Subtotal = 100 * 2 = 200
        // totalSavings = (100 - 80) * 2 = 40
        // netAmount = 200 - 40 = 160
        // gstAmount = 80 * 2 * 0.05 = 8.0
        // deliveryCharges = 40.0 (160 < 500)
        // fees = 2 (platform) + 5 (handling) + 10 (packaging) = 17.0
        // grandTotal = 160 + 8.0 + 40.0 + 17.0 = 225.0

        assertEquals(200.0, result.subtotal, 0.1)
        assertEquals(40.0, result.totalDiscount, 0.1)
        assertEquals(40.0, result.deliveryCharges, 0.1)
        assertEquals(225.0, result.grandTotal, 0.1)
    }

    @Test
    fun `calculate totals with variant`() {
        val product = Product(id = "p1", basePrice = 100.0)
        val variant = Variant(id = "v1", productId = "p1", basePrice = 200.0, price = 150.0)
        val cartItem = CartItem(id = "c1", userId = "u1", productId = "p1", variantId = "v1", quantity = 1)
        val items = listOf(CartWithProduct(cartItem, product, variant))

        val result = useCase(items)

        // Subtotal = 200 * 1 = 200
        // totalSavings = (200 - 150) * 1 = 50
        // netAmount = 200 - 50 = 150
        // gstAmount = 150 * 1 * 0.05 = 7.5
        // deliveryCharges = 40.0 (150 < 500)
        // fees = 2 + 5 + 10 = 17.0
        // grandTotal = 150 + 7.5 + 40.0 + 17.0 = 214.5

        assertEquals(200.0, result.subtotal, 0.1)
        assertEquals(50.0, result.totalDiscount, 0.1)
        assertEquals(40.0, result.deliveryCharges, 0.1)
        assertEquals(214.5, result.grandTotal, 0.1)
    }

    @Test
    fun `calculate totals with free delivery`() {
        val product = Product(id = "p1", basePrice = 600.0, discountedPrice = 550.0, mrp = 600.0)
        val cartItem = CartItem(id = "c1", userId = "u1", productId = "p1", variantId = null, quantity = 1)
        val items = listOf(CartWithProduct(cartItem, product, null))

        val result = useCase(items)

        // Subtotal = 600 * 1 = 600
        // totalSavings = (600 - 550) * 1 = 50
        // netAmount = 600 - 50 = 550
        // gstAmount = 550 * 1 * 0.05 = 27.5
        // deliveryCharges = 0.0 (550 >= 500)
        // fees = 2 + 5 + 10 = 17.0
        // grandTotal = 550 + 27.5 + 0.0 + 17.0 = 594.5

        assertEquals(0.0, result.deliveryCharges, 0.1)
        assertEquals(594.5, result.grandTotal, 0.1)
    }
}
