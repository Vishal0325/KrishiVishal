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

    fun createReferralLink(referralCode: String): Uri {
        return Uri.parse("$DEEP_LINK_BASE/register?ref=$referralCode")
    }
    
    fun getProductIdFromUri(uri: Uri): String? {
        return if (uri.scheme == "https" && uri.host == "www.krishivishal.com" && uri.path?.contains("product") == true) {
            uri.getQueryParameter("id")
        } else if (uri.scheme == CUSTOM_SCHEME && uri.host == "product") {
            uri.getQueryParameter("id")
        } else null
    }
}
