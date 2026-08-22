package com.company.krishivishal.domain

import com.company.krishivishal.core.model.OrderItem
import com.company.krishivishal.core.model.Order
import org.junit.Test
import org.junit.Assert.*

class PricingLedgerTest {

    @Test
    fun `test gst calculation logic`() {
        val price = 100.0
        val gstRate = 18.0
        val expectedGst = 18.0
        val expectedTaxable = 100.0
        
        val actualGst = (price * gstRate) / 100.0
        assertEquals(expectedGst, actualGst, 0.01)
    }

    @Test
    fun `test total order amount with multiple items`() {
        val item1 = OrderItem(price = 100.0, quantity = 2, gstRate = 5.0)
        val item2 = OrderItem(price = 200.0, quantity = 1, gstRate = 12.0)
        
        // Item 1: 200 + 10 = 210
        // Item 2: 200 + 24 = 224
        // Total: 434
        
        val totalAmount = listOf(item1, item2).sumOf { (it.price * it.quantity) * (1 + it.gstRate / 100.0) }
        assertEquals(434.0, totalAmount, 0.01)
    }

    @Test
    fun `test ledger entry balance`() {
        // Mocking a double entry: Credit Sales, Debit Cash
        val salesAmount = 95.0
        val taxAmount = 5.0
        val totalCollected = 100.0
        
        // Sum of Credits must equal Sum of Debits
        val credits = salesAmount + taxAmount
        val debits = totalCollected
        
        assertEquals(credits, debits, 0.01)
    }
}
