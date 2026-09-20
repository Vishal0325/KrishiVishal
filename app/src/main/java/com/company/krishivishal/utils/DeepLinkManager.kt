package com.company.krishivishal.utils

import android.net.Uri
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Typed deep link destination.
 */
sealed interface DeepLinkDestination {
    data class Product(val productId: String) : DeepLinkDestination
    data class Order(val orderId: String) : DeepLinkDestination
}

@Singleton
class DeepLinkManager @Inject constructor() {

    private companion object {
        const val DEEP_LINK_BASE = "https://www.krishivishal.com"
        const val CUSTOM_SCHEME = "krishivishal"
    }

    fun createProductShareLink(productId: String): Uri {
        return Uri.parse("$DEEP_LINK_BASE/product?id=$productId")
    }

    fun createOrderShareLink(orderId: String): Uri {
        return Uri.parse("$DEEP_LINK_BASE/order?id=$orderId")
    }

    fun isValidDeepLink(uri: Uri?): Boolean {
        return parseDeepLink(uri) != null
    }

    /**
     * Parses the deep link into a typed destination containing the target path and ID.
     */
    fun parseDeepLink(uri: Uri?): DeepLinkDestination? {
        if (uri == null || uri.fragment != null || uri.queryParameterNames != setOf("id")) {
            return null
        }

        val id = uri.getQueryParameter("id")
        if (id.isNullOrBlank() || id.length > 128 ||
            !id.matches(Regex("[A-Za-z0-9._-]+"))
        ) {
            return null
        }

        return when {
            uri.scheme == "https" && uri.host == "www.krishivishal.com" -> {
                when (uri.path) {
                    "/product" -> DeepLinkDestination.Product(id)
                    "/order" -> DeepLinkDestination.Order(id)
                    else -> null
                }
            }
            uri.scheme == CUSTOM_SCHEME && uri.host == "product" &&
                (uri.path.isNullOrEmpty() || uri.path == "/") -> {
                DeepLinkDestination.Product(id)
            }
            uri.scheme == CUSTOM_SCHEME && uri.host == "order" &&
                (uri.path.isNullOrEmpty() || uri.path == "/") -> {
                DeepLinkDestination.Order(id)
            }
            else -> null
        }
    }

    /**
     * Returns product ID only if the deep link points to a product destination.
     * Prevents order IDs from being mistakenly interpreted as product IDs.
     */
    fun getProductIdFromUri(uri: Uri): String? {
        return (parseDeepLink(uri) as? DeepLinkDestination.Product)?.productId
    }

    /**
     * Returns order ID only if the deep link points to an order destination.
     */
    fun getOrderIdFromUri(uri: Uri): String? {
        return (parseDeepLink(uri) as? DeepLinkDestination.Order)?.orderId
    }
}
