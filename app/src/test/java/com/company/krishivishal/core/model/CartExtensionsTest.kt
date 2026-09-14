package com.company.krishivishal.core.model

import org.junit.Assert.assertEquals
import org.junit.Test

class CartExtensionsTest {

    @Test
    fun `availableStock should return 0 when product is null`() {
        val cartItem = CartItem(id = "c1", userId = "u1", productId = "deleted_prod", quantity = 2)
        val cartWithProduct = CartWithProduct(cartItem = cartItem, product = null, variant = null)

        val stock = cartWithProduct.availableStock()
        assertEquals(0, stock)
    }

    @Test
    fun `availableStock should prioritize variant availableStock from warehouse sync over legacy stock`() {
        val product = Product(id = "p1", name = "Seeds", stockQuantity = 50)
        val variant = Variant(
            id = "v1",
            productId = "p1",
            availableStock = 25, // Synced from warehouse_inventory
            stock = 10           // Legacy stale field
        )
        val cartItem = CartItem(id = "c1", userId = "u1", productId = "p1", variantId = "v1", quantity = 2)
        val cartWithProduct = CartWithProduct(cartItem = cartItem, product = product, variant = variant)

        val stock = cartWithProduct.availableStock()
        assertEquals(25, stock)
    }

    @Test
    fun `availableStock should fallback to legacy stock when variant availableStock is 0`() {
        val product = Product(id = "p1", name = "Fertilizer", stockQuantity = 50)
        val variant = Variant(
            id = "v1",
            productId = "p1",
            availableStock = 0,
            stock = 15 // Fallback to legacy stock
        )
        val cartItem = CartItem(id = "c1", userId = "u1", productId = "p1", variantId = "v1", quantity = 2)
        val cartWithProduct = CartWithProduct(cartItem = cartItem, product = product, variant = variant)

        val stock = cartWithProduct.availableStock()
        assertEquals(15, stock)
    }

    @Test
    fun `availableStock should return product stockQuantity when no variant is selected`() {
        val product = Product(id = "p1", name = "Sprayer", stockQuantity = 40)
        val cartItem = CartItem(id = "c1", userId = "u1", productId = "p1", variantId = null, quantity = 1)
        val cartWithProduct = CartWithProduct(cartItem = cartItem, product = product, variant = null)

        val stock = cartWithProduct.availableStock()
        assertEquals(40, stock)
    }

    @Test
    fun `displayVariantLabel should format variant label and size properly`() {
        val product = Product(id = "p1", name = "Pesticide", weight = "1.0", unit = "Ltr")
        val variant = Variant(id = "v1", productId = "p1", label = "500 ml Pack", size = "500ml")
        val cartItem = CartItem(id = "c1", userId = "u1", productId = "p1", variantId = "v1", quantity = 1)
        val cartWithProduct = CartWithProduct(cartItem = cartItem, product = product, variant = variant)

        assertEquals("500 ml Pack", cartWithProduct.displayVariantLabel())
    }

    @Test
    fun `displayVariantLabel should fallback to product weight and deduplicate unit`() {
        val product = Product(id = "p1", name = "Pesticide", weight = "500ml", unit = "ml")
        val cartItem = CartItem(id = "c1", userId = "u1", productId = "p1", variantId = null, quantity = 1)
        val cartWithProduct = CartWithProduct(cartItem = cartItem, product = product, variant = null)

        // Deduplicates "500ml" + "ml" -> "500ml"
        assertEquals("500ml", cartWithProduct.displayVariantLabel())
    }
}
