package com.company.krishivishal.analytics

import android.os.Bundle
import com.google.firebase.analytics.FirebaseAnalytics
import com.google.firebase.analytics.ktx.analytics
import com.google.firebase.perf.FirebasePerformance
import com.google.firebase.perf.metrics.Trace
import com.google.firebase.ktx.Firebase
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Firebase Analytics tracker for event logging
 * Handles all app analytics events with retry and error handling
 */
@Singleton
class AnalyticsTracker @Inject constructor() {

    private val firebaseAnalytics: FirebaseAnalytics = Firebase.analytics
    private val performance: FirebasePerformance = FirebasePerformance.getInstance()

    fun startTrace(traceName: String): Trace {
        val trace = performance.newTrace(traceName)
        trace.start()
        return trace
    }

    /**
     * Track purchase event (standard e-commerce event)
     */
    fun trackPurchase(
        transactionId: String,
        value: Double,
        currency: String = "INR",
        items: List<PurchaseItem> = emptyList()
    ) {
        try {
            val bundle = Bundle().apply {
                putString(FirebaseAnalytics.Param.TRANSACTION_ID, transactionId)
                putDouble(FirebaseAnalytics.Param.VALUE, value)
                putString(FirebaseAnalytics.Param.CURRENCY, currency)
                putInt(FirebaseAnalytics.Param.ITEMS, items.size)
                items.forEachIndexed { index, item ->
                    putString("item_${index}_id", item.id)
                    putString("item_${index}_name", item.name)
                    putDouble("item_${index}_price", item.price)
                    putInt("item_${index}_quantity", item.quantity)
                }
            }
            firebaseAnalytics.logEvent(FirebaseAnalytics.Event.PURCHASE, bundle)
            Timber.d("Purchase tracked: $transactionId")
        } catch (e: Exception) {
            Timber.e(e, "Failed to track purchase event")
        }
    }

    /**
     * Track add to cart event
     */
    fun trackAddToCart(
        productId: String,
        productName: String,
        price: Double,
        quantity: Int = 1
    ) {
        try {
            val bundle = Bundle().apply {
                putString(FirebaseAnalytics.Param.ITEM_ID, productId)
                putString(FirebaseAnalytics.Param.ITEM_NAME, productName)
                putDouble(FirebaseAnalytics.Param.VALUE, price * quantity)
                putInt(FirebaseAnalytics.Param.QUANTITY, quantity)
                putString(FirebaseAnalytics.Param.CURRENCY, "INR")
            }
            firebaseAnalytics.logEvent(FirebaseAnalytics.Event.ADD_TO_CART, bundle)
            Timber.d("Add to cart tracked: $productName")
        } catch (e: Exception) {
            Timber.e(e, "Failed to track add to cart")
        }
    }

    /**
     * Track view item event
     */
    fun trackViewProduct(
        productId: String,
        productName: String,
        category: String,
        price: Double
    ) {
        try {
            val bundle = Bundle().apply {
                putString(FirebaseAnalytics.Param.ITEM_ID, productId)
                putString(FirebaseAnalytics.Param.ITEM_NAME, productName)
                putString(FirebaseAnalytics.Param.ITEM_CATEGORY, category)
                putDouble(FirebaseAnalytics.Param.VALUE, price)
                putString(FirebaseAnalytics.Param.CURRENCY, "INR")
            }
            firebaseAnalytics.logEvent(FirebaseAnalytics.Event.VIEW_ITEM, bundle)
            Timber.d("View product tracked: $productName")
        } catch (e: Exception) {
            Timber.e(e, "Failed to track view product")
        }
    }

    /**
     * Track search event
     */
    fun trackSearch(query: String, resultsCount: Int = 0) {
        try {
            val bundle = Bundle().apply {
                putString(FirebaseAnalytics.Param.SEARCH_TERM, query)
                putInt("results_count", resultsCount)
            }
            firebaseAnalytics.logEvent(FirebaseAnalytics.Event.SEARCH, bundle)
            Timber.d("Search tracked: $query ($resultsCount results)")
        } catch (e: Exception) {
            Timber.e(e, "Failed to track search")
        }
    }

    /**
     * Track user signup
     */
    fun trackSignUp(method: String = "email") {
        try {
            val bundle = Bundle().apply {
                putString(FirebaseAnalytics.Param.METHOD, method)
            }
            firebaseAnalytics.logEvent(FirebaseAnalytics.Event.SIGN_UP, bundle)
            Timber.d("Sign up tracked: $method")
        } catch (e: Exception) {
            Timber.e(e, "Failed to track signup")
        }
    }

    /**
     * Track user login
     */
    fun trackLogin(method: String = "email") {
        try {
            val bundle = Bundle().apply {
                putString(FirebaseAnalytics.Param.METHOD, method)
            }
            firebaseAnalytics.logEvent(FirebaseAnalytics.Event.LOGIN, bundle)
            Timber.d("Login tracked: $method")
        } catch (e: Exception) {
            Timber.e(e, "Failed to track login")
        }
    }

    /**
     * Track screen view
     */
    fun trackScreenView(screenName: String, screenClass: String) {
        try {
            val bundle = Bundle().apply {
                putString(FirebaseAnalytics.Param.SCREEN_NAME, screenName)
                putString(FirebaseAnalytics.Param.SCREEN_CLASS, screenClass)
            }
            firebaseAnalytics.logEvent(FirebaseAnalytics.Event.SCREEN_VIEW, bundle)
            Timber.d("Screen view tracked: $screenName")
        } catch (e: Exception) {
            Timber.e(e, "Failed to track screen view")
        }
    }

    /**
     * Track checkout process
     */
    fun trackCheckout(value: Double, itemCount: Int) {
        try {
            val bundle = Bundle().apply {
                putDouble(FirebaseAnalytics.Param.VALUE, value)
                putInt(FirebaseAnalytics.Param.ITEMS, itemCount)
                putString(FirebaseAnalytics.Param.CURRENCY, "INR")
            }
            firebaseAnalytics.logEvent(FirebaseAnalytics.Event.BEGIN_CHECKOUT, bundle)
            Timber.d("Checkout started: $value INR, $itemCount items")
        } catch (e: Exception) {
            Timber.e(e, "Failed to track checkout")
        }
    }

    /**
     * Track promo code applied
     */
    fun trackPromoCode(code: String, discount: Double) {
        try {
            val bundle = Bundle().apply {
                putString(FirebaseAnalytics.Param.COUPON, code)
                putDouble("discount_amount", discount)
            }
            firebaseAnalytics.logEvent(FirebaseAnalytics.Event.ADD_SHIPPING_INFO, bundle)
            Timber.d("Promo code tracked: $code")
        } catch (e: Exception) {
            Timber.e(e, "Failed to track promo code")
        }
    }

    /**
     * Track remove from cart
     */
    fun trackRemoveFromCart(productId: String, productName: String, price: Double) {
        try {
            val bundle = Bundle().apply {
                putString(FirebaseAnalytics.Param.ITEM_ID, productId)
                putString(FirebaseAnalytics.Param.ITEM_NAME, productName)
                putDouble(FirebaseAnalytics.Param.VALUE, price)
            }
            firebaseAnalytics.logEvent(FirebaseAnalytics.Event.REMOVE_FROM_CART, bundle)
            Timber.d("Remove from cart tracked: $productName")
        } catch (e: Exception) {
            Timber.e(e, "Failed to track remove from cart")
        }
    }

    /**
     * Track view cart
     */
    fun trackViewCart(cartValue: Double, itemCount: Int) {
        try {
            val bundle = Bundle().apply {
                putDouble(FirebaseAnalytics.Param.VALUE, cartValue)
                putInt(FirebaseAnalytics.Param.ITEMS, itemCount)
                putString(FirebaseAnalytics.Param.CURRENCY, "INR")
            }
            firebaseAnalytics.logEvent(FirebaseAnalytics.Event.VIEW_CART, bundle)
            Timber.d("View cart tracked: $cartValue INR, $itemCount items")
        } catch (e: Exception) {
            Timber.e(e, "Failed to track view cart")
        }
    }

    /**
     * Track share event
     */
    fun trackShare(contentType: String, contentId: String, method: String) {
        try {
            val bundle = Bundle().apply {
                putString(FirebaseAnalytics.Param.CONTENT_TYPE, contentType)
                putString(FirebaseAnalytics.Param.ITEM_ID, contentId)
                putString(FirebaseAnalytics.Param.METHOD, method)
            }
            firebaseAnalytics.logEvent(FirebaseAnalytics.Event.SHARE, bundle)
            Timber.d("Share tracked: $contentType via $method")
        } catch (e: Exception) {
            Timber.e(e, "Failed to track share")
        }
    }

    /**
     * Track custom event
     */
    fun trackCustomEvent(eventName: String, params: Map<String, Any> = emptyMap()) {
        try {
            val bundle = Bundle()
            params.forEach { (key, value) ->
                when (value) {
                    is String -> bundle.putString(key, value)
                    is Int -> bundle.putInt(key, value)
                    is Long -> bundle.putLong(key, value)
                    is Double -> bundle.putDouble(key, value)
                    is Boolean -> bundle.putBoolean(key, value)
                    else -> bundle.putString(key, value.toString())
                }
            }
            firebaseAnalytics.logEvent(eventName, bundle)
            Timber.d("Custom event tracked: $eventName")
        } catch (e: Exception) {
            Timber.e(e, "Failed to track custom event: $eventName")
        }
    }

    /**
     * Set user properties
     */
    fun setUserProperties(userId: String, email: String? = null, properties: Map<String, String> = emptyMap()) {
        try {
            firebaseAnalytics.setUserId(userId)
            email?.let { firebaseAnalytics.setUserProperty("email", it) }
            
            properties.forEach { (key, value) ->
                firebaseAnalytics.setUserProperty(key, value)
            }
            Timber.d("User properties set for: $userId")
        } catch (e: Exception) {
            Timber.e(e, "Failed to set user properties")
        }
    }

    /**
     * Enable/disable analytics collection
     */
    fun setAnalyticsCollectionEnabled(enabled: Boolean) {
        try {
            firebaseAnalytics.setAnalyticsCollectionEnabled(enabled)
            Timber.d("Analytics collection: ${if (enabled) "ENABLED" else "DISABLED"}")
        } catch (e: Exception) {
            Timber.e(e, "Failed to set analytics collection")
        }
    }

    /**
     * Track wishlist toggle
     */
    fun trackWishlistToggle(productId: String, productName: String, isWishlisted: Boolean) {
        trackCustomEvent(
            AnalyticsConstants.EVENT_WISHLIST_TOGGLE,
            mapOf(
                AnalyticsConstants.PARAM_PRODUCT_ID to productId,
                AnalyticsConstants.PARAM_PRODUCT_NAME to productName,
                AnalyticsConstants.PARAM_IS_WISHLISTED to isWishlisted
            )
        )
    }

    /**
     * Track category view
     */
    fun trackCategoryView(categoryName: String) {
        trackCustomEvent(
            AnalyticsConstants.EVENT_CATEGORY_VIEW,
            mapOf(AnalyticsConstants.PARAM_CATEGORY_NAME to categoryName)
        )
    }

    data class PurchaseItem(
        val id: String,
        val name: String,
        val price: Double,
        val quantity: Int
    )
}
