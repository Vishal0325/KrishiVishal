package com.company.krishivishal.analytics.events

/**
 * Event models for Firebase Analytics tracking
 * All events follow Firebase naming conventions and best practices
 */

// ==================== E-COMMERCE EVENTS ====================

/**
 * User searched for products
 */
data class SearchEvent(
    val query: String,
    val resultsCount: Int = 0,
    val filters: Map<String, String> = emptyMap()
) {
    fun toEventMap(): Map<String, Any> = mapOf(
        "search_term" to query,
        "results_count" to resultsCount
    ).apply {
        filters.forEach { (key, value) ->
            (this as MutableMap)["filter_$key"] = value
        }
    }
}

/**
 * User viewed a product
 */
data class ViewProductEvent(
    val productId: String,
    val productName: String,
    val productCategory: String,
    val price: Double,
    val currency: String = "INR"
) {
    fun toEventMap(): Map<String, Any> = mapOf(
        "product_id" to productId,
        "product_name" to productName,
        "product_category" to productCategory,
        "price" to price,
        "currency" to currency
    )
}

/**
 * User added item to cart
 */
data class AddToCartEvent(
    val productId: String,
    val productName: String,
    val price: Double,
    val quantity: Int = 1,
    val currency: String = "INR"
) {
    fun toEventMap(): Map<String, Any> = mapOf(
        "product_id" to productId,
        "product_name" to productName,
        "price" to price,
        "quantity" to quantity,
        "currency" to currency,
        "value" to (price * quantity)
    )
}

/**
 * User removed item from cart
 */
data class RemoveFromCartEvent(
    val productId: String,
    val productName: String,
    val price: Double,
    val quantity: Int = 1
) {
    fun toEventMap(): Map<String, Any> = mapOf(
        "product_id" to productId,
        "product_name" to productName,
        "price" to price,
        "quantity" to quantity,
        "value" to (price * quantity)
    )
}

/**
 * User viewed cart
 */
data class ViewCartEvent(
    val cartValue: Double,
    val itemCount: Int,
    val currency: String = "INR"
) {
    fun toEventMap(): Map<String, Any> = mapOf(
        "value" to cartValue,
        "item_count" to itemCount,
        "currency" to currency
    )
}

/**
 * User initiated checkout
 */
data class CheckoutInitiatedEvent(
    val cartValue: Double,
    val itemCount: Int,
    val currency: String = "INR"
) {
    fun toEventMap(): Map<String, Any> = mapOf(
        "value" to cartValue,
        "items" to itemCount,
        "currency" to currency
    )
}

/**
 * User completed purchase
 */
data class PurchaseCompletedEvent(
    val orderId: String,
    val value: Double,
    val tax: Double = 0.0,
    val shipping: Double = 0.0,
    val itemCount: Int,
    val paymentMethod: String,
    val currency: String = "INR",
    val items: List<PurchaseItem> = emptyList()
) {
    fun toEventMap(): Map<String, Any> = mapOf(
        "transaction_id" to orderId,
        "value" to value,
        "tax" to tax,
        "shipping" to shipping,
        "item_count" to itemCount,
        "payment_method" to paymentMethod,
        "currency" to currency,
        "items" to items.size
    )
    
    data class PurchaseItem(
        val id: String,
        val name: String,
        val price: Double,
        val quantity: Int
    )
}

/**
 * User attempted purchase but failed
 */
data class PurchaseFailedEvent(
    val orderId: String,
    val cartValue: Double,
    val failureReason: String,
    val paymentMethod: String
) {
    fun toEventMap(): Map<String, Any> = mapOf(
        "order_id" to orderId,
        "cart_value" to cartValue,
        "failure_reason" to failureReason,
        "payment_method" to paymentMethod
    )
}

/**
 * User applied discount/promo code
 */
data class PromoCodeAppliedEvent(
    val promoCode: String,
    val discountAmount: Double,
    val cartValue: Double
) {
    fun toEventMap(): Map<String, Any> = mapOf(
        "promo_code" to promoCode,
        "discount_amount" to discountAmount,
        "cart_value" to cartValue
    )
}

// ==================== USER ENGAGEMENT EVENTS ====================

/**
 * User signed up
 */
data class SignUpEvent(
    val method: String = "email", // email, phone, google, etc.
    val timestamp: Long = System.currentTimeMillis()
) {
    fun toEventMap(): Map<String, Any> = mapOf(
        "method" to method,
        "timestamp" to timestamp
    )
}

/**
 * User logged in
 */
data class LoginEvent(
    val method: String = "email",
    val isFirstTime: Boolean = false
) {
    fun toEventMap(): Map<String, Any> = mapOf(
        "method" to method,
        "first_time" to isFirstTime
    )
}

/**
 * User viewed home screen
 */
data class HomeScreenViewEvent(
    val bannerCount: Int = 0,
    val featuredProductsCount: Int = 0
) {
    fun toEventMap(): Map<String, Any> = mapOf(
        "banner_count" to bannerCount,
        "featured_products_count" to featuredProductsCount
    )
}

/**
 * User shared product/order
 */
data class ShareEvent(
    val contentType: String, // product, order, referral
    val contentId: String,
    val method: String // whatsapp, facebook, etc.
) {
    fun toEventMap(): Map<String, Any> = mapOf(
        "content_type" to contentType,
        "content_id" to contentId,
        "method" to method
    )
}

/**
 * User viewed wishlist
 */
data class ViewWishlistEvent(
    val itemCount: Int
) {
    fun toEventMap(): Map<String, Any> = mapOf(
        "item_count" to itemCount
    )
}

/**
 * User added to wishlist
 */
data class AddToWishlistEvent(
    val productId: String,
    val productName: String,
    val price: Double
) {
    fun toEventMap(): Map<String, Any> = mapOf(
        "product_id" to productId,
        "product_name" to productName,
        "price" to price
    )
}

// ==================== SUPPORT & FEEDBACK EVENTS ====================

/**
 * User opened support/help
 */
data class SupportOpenedEvent(
    val category: String,
    val topic: String? = null
) {
    fun toEventMap(): Map<String, Any> = mapOf(
        "category" to category
    ).apply {
        topic?.let { (this as MutableMap)["topic"] = it }
    }
}

/**
 * User submitted feedback
 */
data class FeedbackSubmittedEvent(
    val rating: Int, // 1-5
    val category: String,
    val message: String? = null
) {
    fun toEventMap(): Map<String, Any> = mapOf(
        "rating" to rating,
        "category" to category
    ).apply {
        message?.let { (this as MutableMap)["message"] = it }
    }
}

/**
 * User reported issue
 */
data class IssueReportedEvent(
    val issueType: String,
    val orderId: String? = null,
    val description: String? = null
) {
    fun toEventMap(): Map<String, Any> = mapOf(
        "issue_type" to issueType
    ).apply {
        orderId?.let { (this as MutableMap)["order_id"] = it }
        description?.let { (this as MutableMap)["description"] = it }
    }
}

// ==================== PERFORMANCE EVENTS ====================

/**
 * Screen load time measurement
 */
data class ScreenLoadedEvent(
    val screenName: String,
    val loadTimeMs: Long
) {
    fun toEventMap(): Map<String, Any> = mapOf(
        "screen_name" to screenName,
        "load_time_ms" to loadTimeMs
    )
}

/**
 * API call performance
 */
data class ApiCallEvent(
    val endpoint: String,
    val responseTimeMs: Long,
    val statusCode: Int,
    val success: Boolean
) {
    fun toEventMap(): Map<String, Any> = mapOf(
        "endpoint" to endpoint,
        "response_time_ms" to responseTimeMs,
        "status_code" to statusCode,
        "success" to success
    )
}

/**
 * Custom event for tracking any action
 */
data class CustomEvent(
    val eventName: String,
    val parameters: Map<String, Any> = emptyMap()
) {
    fun toEventMap(): Map<String, Any> = parameters
}
