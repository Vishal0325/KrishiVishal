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
    val enableDeliveryTracking: Boolean = true
)
