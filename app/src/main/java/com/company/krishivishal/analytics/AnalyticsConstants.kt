package com.company.krishivishal.analytics

object AnalyticsConstants {
    // Events
    const val EVENT_PRODUCT_INTERACTION = "product_interaction"
    const val EVENT_CATEGORY_VIEW = "category_view"
    const val EVENT_WISHLIST_TOGGLE = "wishlist_toggle"
    const val EVENT_CHECKOUT_FAILED = "checkout_failed"
    const val EVENT_OFFLINE_SYNC_COMPLETE = "offline_sync_complete"
    
    // Params
    const val PARAM_PRODUCT_ID = "product_id"
    const val PARAM_PRODUCT_NAME = "product_name"
    const val PARAM_CATEGORY_NAME = "category_name"
    const val PARAM_IS_WISHLISTED = "is_wishlisted"
    const val PARAM_ERROR_MESSAGE = "error_message"
    const val PARAM_SYNC_COUNT = "sync_count"
    
    // User Properties
    const val USER_PROP_DISTRICT = "user_district"
    const val USER_PROP_PREFERRED_CROP = "preferred_crop"
    const val USER_PROP_IS_GUEST = "is_guest"
}
