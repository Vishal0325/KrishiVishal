package com.company.krishivishal

import org.junit.Assert.assertEquals
import org.junit.Test
import java.math.BigDecimal
import java.math.RoundingMode

/**
 * Enterprise V4 Accounting Test: Verifies GST calculation and precision.
 */
class GstMathTest {

    @Test
    fun `verify net sales and tax calculation matches total`() {
        val sellingPrice = 1000.0
        val quantity = 2
        val gstRate = 18.0

        val netSales = sellingPrice * quantity
        val expectedTax = (netSales * gstRate) / 100
        val total = netSales + expectedTax

        assertEquals(2000.0, netSales, 0.0)
        assertEquals(360.0, expectedTax, 0.0)
        assertEquals(2360.0, total, 0.0)
    }

    @Test
    fun `verify precision with odd amounts`() {
        val sellingPrice = 955.55
        val quantity = 1
        val gstRate = 12.0

        val netSales = sellingPrice * quantity
        val tax = (netSales * gstRate) / 100
        val total = netSales + tax

        // Use BigDecimal for high-precision verification
        val expectedTotal = BigDecimal("955.55")
            .add(BigDecimal("955.55").multiply(BigDecimal("0.12")))
            .setScale(2, RoundingMode.HALF_UP)
            .toDouble()

        assertEquals(expectedTotal, total, 0.01)
    }

    @Test
    fun `verify bifurcated tax sum equals total tax`() {
        val item1TotalTax = 18.5
        val item2TotalTax = 12.25
        
        val totalTax = item1TotalTax + item2TotalTax
        assertEquals(30.75, totalTax, 0.0)
    }
}
