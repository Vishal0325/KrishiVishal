package com.company.krishivishal.domain.usecase.cart

import com.company.krishivishal.data.model.CartItem
import com.company.krishivishal.data.model.CartWithProduct
import com.company.krishivishal.data.model.Product
import com.company.krishivishal.data.model.Variant
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

        assertEquals(200.0, result.subtotal, 0.1)
        assertEquals(40.0, result.discount, 0.1)
        assertEquals(40.0, result.deliveryCharges, 0.1) // 160 < 500
        assertEquals(200.0, result.grandTotal, 0.1) // 160 + 40
    }

    @Test
    fun `calculate totals with variant`() {
        val product = Product(id = "p1", basePrice = 100.0)
        val variant = Variant(id = "v1", productId = "p1", basePrice = 200.0, price = 150.0)
        val cartItem = CartItem(id = "c1", userId = "u1", productId = "p1", variantId = "v1", quantity = 1)
        val items = listOf(CartWithProduct(cartItem, product, variant))

        val result = useCase(items)

        assertEquals(200.0, result.subtotal, 0.1)
        assertEquals(50.0, result.discount, 0.1)
        assertEquals(40.0, result.deliveryCharges, 0.1)
        assertEquals(190.0, result.grandTotal, 0.1)
    }

    @Test
    fun `calculate totals with free delivery`() {
        val product = Product(id = "p1", basePrice = 600.0, discountedPrice = 550.0, mrp = 600.0)
        val cartItem = CartItem(id = "c1", userId = "u1", productId = "p1", variantId = null, quantity = 1)
        val items = listOf(CartWithProduct(cartItem, product, null))

        val result = useCase(items)

        assertEquals(0.0, result.deliveryCharges, 0.1)
        assertEquals(550.0, result.grandTotal, 0.1)
    }
}
