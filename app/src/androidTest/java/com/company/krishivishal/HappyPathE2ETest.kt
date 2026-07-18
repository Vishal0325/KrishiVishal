package com.company.krishivishal

import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.test.ext.junit.runners.AndroidJUnit4
import androidx.test.filters.LargeTest
import dagger.hilt.android.testing.HiltAndroidRule
import dagger.hilt.android.testing.HiltAndroidTest
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
@LargeTest
@HiltAndroidTest
class HappyPathE2ETest {

    @get:Rule(order = 0)
    val hiltRule = HiltAndroidRule(this)

    @get:Rule(order = 1)
    val composeTestRule = createAndroidComposeRule<MainActivity>()

    @Test
    fun testFullUserJourney() {
        // --- 1. LOGIN ---
        // Open Profile to Login
        composeTestRule.onNodeWithText("Profile").performClick()
        
        // Wait for potential login screen or profile screen
        composeTestRule.waitUntil(5000) {
            composeTestRule.onAllNodesWithText("Mobile Number").fetchSemanticsNodes().isNotEmpty() ||
            composeTestRule.onAllNodesWithText("Login").fetchSemanticsNodes().isNotEmpty()
        }

        if (composeTestRule.onAllNodesWithText("Login").fetchSemanticsNodes().isNotEmpty()) {
            composeTestRule.onNodeWithText("Login").performClick()
        }

        // Enter Phone (using demo)
        composeTestRule.onNodeWithText("Mobile Number").performTextInput("9876543210")
        composeTestRule.onNodeWithText("Send OTP").performClick()
        
        // Enter OTP (assuming '123456' works for demo/mock)
        composeTestRule.waitUntil(5000) {
            composeTestRule.onAllNodesWithText("Enter OTP").fetchSemanticsNodes().isNotEmpty()
        }
        composeTestRule.onNodeWithText("Enter OTP").performTextInput("123456")
        composeTestRule.onNodeWithText("Verify & Login").performClick()

        // --- 2. ADD 3 PRODUCTS TO CART ---
        composeTestRule.waitUntil(5000) {
            composeTestRule.onAllNodesWithText("Home").fetchSemanticsNodes().isNotEmpty()
        }
        composeTestRule.onNodeWithText("Home").performClick()
        
        // Wait for products to load
        composeTestRule.waitUntil(10000) {
            composeTestRule.onAllNodesWithContentDescription("Add to Cart").fetchSemanticsNodes().size >= 3
        }
        
        // Click first 3 "Add to Cart" buttons
        val addToCartButtons = composeTestRule.onAllNodesWithContentDescription("Add to Cart")
        addToCartButtons[0].performClick()
        addToCartButtons[1].performClick()
        addToCartButtons[2].performClick()

        // --- 3. CHECK CART ---
        composeTestRule.onNodeWithContentDescription("Cart").performClick()
        composeTestRule.waitUntil(5000) {
            composeTestRule.onAllNodesWithText("My Cart").fetchSemanticsNodes().isNotEmpty()
        }
        
        composeTestRule.onNodeWithText("Checkout").performClick()

        // --- 4. CHECKOUT & ADDRESS ---
        composeTestRule.waitUntil(5000) {
            composeTestRule.onAllNodesWithText("Select Address").fetchSemanticsNodes().isNotEmpty()
        }
        
        // Check if we need to add an address
        if (composeTestRule.onAllNodesWithText("Deliver to this Address").fetchSemanticsNodes().isEmpty()) {
            composeTestRule.onNodeWithText("Add New Address").performClick()
            
            // Fill Address Dialog
            composeTestRule.onNodeWithText("Full Name").performTextInput("Demo Farmer")
            composeTestRule.onNodeWithText("Mobile Number").performTextInput("9876543210")
            composeTestRule.onNodeWithText("House No/Farm Name").performTextInput("Farm 123")
            composeTestRule.onNodeWithText("Street/Area").performTextInput("Krishi Marg")
            composeTestRule.onNodeWithText("Pincode").performTextInput("110001")
            composeTestRule.onNodeWithText("Block").performTextInput("Block A")
            composeTestRule.onNodeWithText("District").performTextInput("North Delhi")
            composeTestRule.onNodeWithText("State").performTextInput("Delhi")
            
            composeTestRule.onNodeWithText("Farm").performClick()
            composeTestRule.onNodeWithText("Save Address").performClick()
            
            // Wait for dialog to close and address to appear
            composeTestRule.waitUntil(5000) {
                composeTestRule.onAllNodesWithText("Deliver to this Address").fetchSemanticsNodes().isNotEmpty()
            }
        }
        
        composeTestRule.onAllNodesWithText("Deliver to this Address").onFirst().performClick()

        // --- 5. ORDER SUMMARY & PAYMENT ---
        composeTestRule.waitUntil(5000) {
            composeTestRule.onAllNodesWithText("Order Summary").fetchSemanticsNodes().isNotEmpty()
        }
        composeTestRule.onNodeWithText("Proceed to Payment").performClick()

        composeTestRule.waitUntil(5000) {
            composeTestRule.onAllNodesWithText("Select Payment Method").fetchSemanticsNodes().isNotEmpty()
        }
        composeTestRule.onNodeWithText("Cash on Delivery").performClick()
        composeTestRule.onNodeWithText("Confirm Order").performClick()

        // --- 6. MY ORDERS & TRACKING ---
        composeTestRule.waitUntil(10000) {
            composeTestRule.onAllNodesWithText("My Orders").fetchSemanticsNodes().isNotEmpty() ||
            composeTestRule.onAllNodesWithText("My Order").fetchSemanticsNodes().isNotEmpty()
        }
        
        // Expand first order (using click on any text that might be in the card, e.g. "Order #")
        // Or assume clicking the first node with text starting with "Order"
        composeTestRule.onAllNodes(hasText("Order", substring = true)).onFirst().performClick()
        
        // Verify tracking info
        composeTestRule.onNodeWithText("Order Placed").assertIsDisplayed()

        // --- 7. PROFILE & ADDRESS MANAGEMENT ---
        composeTestRule.onNodeWithText("Profile").performClick()
        composeTestRule.onNodeWithText("Saved Addresses").performClick()
        
        // Verify address
        composeTestRule.onNodeWithText("Demo Farmer").assertIsDisplayed()
    }
}
