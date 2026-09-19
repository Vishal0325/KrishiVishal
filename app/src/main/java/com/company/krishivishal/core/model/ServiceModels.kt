package com.company.krishivishal.core.model

data class ServiceVariant(
    val id: String = "",
    val name: String = "",
    val capacityInfo: String = "",
    val price: Double = 0.0
)

data class AgriService(
    val id: String = "",
    val name: String = "",
    val icon: String = "",
    val imageUrl: String = "",
    val description: String = "",
    val rateType: String = "PER_ACRE",
    val customRateUnit: String? = null,
    val baseRate: Double = 0.0,
    val includesMaterial: Boolean = false,
    val rating: Double = 4.8,
    val radiusKm: Int = 3,
    val isActive: Boolean = true,
    val hasVariants: Boolean = false,
    val variants: List<ServiceVariant> = emptyList()
)

data class DailyCheckInLog(
    val date: String = "",
    val timestamp: Long = System.currentTimeMillis(),
    val notes: String = "",
    val verified: Boolean = true
)

data class ServiceBooking(
    val id: String = "",
    val farmerId: String = "",
    val serviceId: String = "",
    val serviceName: String = "",
    val selectedVariantName: String? = null,
    val capacityInfo: String? = null,
    val farmArea: Double? = null,
    val areaUnit: String = "ACRE",
    val status: String = "PENDING_ASSIGNMENT",
    val assignedPartnerId: String? = null,
    val preferredPartnerId: String? = null,
    val startOtp: String? = null,
    val endOtp: String? = null,
    val isLongTermJob: Boolean = false,
    val dailyLogs: List<DailyCheckInLog> = emptyList(),
    val amount: Double = 0.0,
    val paymentMethod: String = "CASH"
)

