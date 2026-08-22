package com.company.krishivishal.core.model

import com.google.firebase.firestore.IgnoreExtraProperties

@IgnoreExtraProperties
data class AppConfig(
    val whatsappNumber: String = "",
    val supportCallNumber: String = "",
    val supportEmail: String = "",
    val baseSalaryPerDay: Double = 300.0,
    val commissionPerOrder: Double = 20.0,
    val fuelAllowancePerDay: Double = 50.0,
    val adminAlertWhatsApp: String = "",
    val lowStockThreshold: Int = 10,
    val minAppVersion: Int = 1,
    val gstin: String = "",
    val gstRate: Double = 5.0,
    val maintenanceMode: Boolean = false,
    val enableAiSupervisor: Boolean = true,
    val enableOnlinePayments: Boolean = true,
    val enableDeliveryTracking: Boolean = true,
    val ff_product_recommendations: Boolean = false,
    val ff_smart_substitutes: Boolean = false,
    val ff_smart_search: Boolean = false,
    val ff_crop_discovery: Boolean = false,
    val ff_usage_guide: Boolean = false,
    val ff_smart_cart_recommendations: Boolean = false,
    val ff_price_drop_alert: Boolean = false,
    val ff_restock_alert: Boolean = false,
    val ff_wishlist: Boolean = false,
    val ff_order_eta: Boolean = false,
    val ff_buy_again: Boolean = false,
    val ff_product_compare: Boolean = false,
    val ff_seasonal_recommendations: Boolean = false,
    val ff_personalized_home: Boolean = false
)
