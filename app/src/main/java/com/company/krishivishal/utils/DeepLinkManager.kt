package com.company.krishivishal.utils

import android.net.Uri
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class DeepLinkManager @Inject constructor() {

    private companion object {
        const val DEEP_LINK_BASE = "https://www.krishivishal.com"
        const val CUSTOM_SCHEME = "krishivishal"
    }

    fun createProductShareLink(productId: String): Uri {
        return Uri.parse("$DEEP_LINK_BASE/product?id=$productId")
    }

    fun isValidDeepLink(uri: Uri?): Boolean {
        if (uri == null || uri.fragment != null || uri.queryParameterNames != setOf("id")) {
            return false
        }

        val productId = uri.getQueryParameter("id")
        if (productId.isNullOrBlank() || productId.length > 128 ||
            !productId.matches(Regex("[A-Za-z0-9._-]+"))
        ) {
            return false
        }

        return when {
            uri.scheme == "https" && uri.host == "www.krishivishal.com" ->
                uri.path == "/product" || uri.path == "/order"
            uri.scheme == CUSTOM_SCHEME && uri.host == "product" ->
                uri.path.isNullOrEmpty() || uri.path == "/"
            else -> false
        }
    }

    fun getProductIdFromUri(uri: Uri): String? {
        return uri.takeIf(::isValidDeepLink)?.getQueryParameter("id")
    }
}
