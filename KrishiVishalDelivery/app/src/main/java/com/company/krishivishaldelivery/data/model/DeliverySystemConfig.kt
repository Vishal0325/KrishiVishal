package com.company.krishivishaldelivery.data.model

import com.google.firebase.Timestamp
import com.google.firebase.firestore.DocumentSnapshot
import timber.log.Timber

/**
 * Global system controls & kill switches for the KrishiVishal Delivery App.
 * Maps to Firestore collection `system_configs`, document `global`.
 */
data class DeliveryGlobalConfig(
    val maintenanceMode: DeliveryMaintenanceMode = DeliveryMaintenanceMode(),
    val versioning: DeliveryVersioningConfig = DeliveryVersioningConfig(),
    val delivery: DeliveryOperationalConfig = DeliveryOperationalConfig(),
    val adminWriteLock: Boolean = false,
    val version: Long = 0L,
    val updatedAt: Long = 0L
) {
    val isMaintenanceMode: Boolean get() = maintenanceMode.isEnabled
    val isAssignmentEnabled: Boolean get() = delivery.assignmentEnabled
    val isCashCollectionEnabled: Boolean get() = delivery.cashCollectionEnabled

    fun isVersionBlocked(currentVersionCode: Int): Boolean {
        if (versioning.minVersionCode > 0 && currentVersionCode < versioning.minVersionCode) {
            return true
        }
        return versioning.blockedVersionCodes.contains(currentVersionCode)
    }

    companion object {
        fun fromDocument(snapshot: DocumentSnapshot?): DeliveryGlobalConfig {
            if (snapshot == null || !snapshot.exists()) {
                return DeliveryGlobalConfig()
            }

            return try {
                val killSwitches = snapshot.get("killSwitches") as? Map<*, *>
                val maintenanceMap = killSwitches?.get("maintenanceMode") as? Map<*, *>

                val maintenanceEnabled = when {
                    maintenanceMap?.get("value") is Boolean -> maintenanceMap["value"] as Boolean
                    maintenanceMap?.get("enabled") is Boolean -> maintenanceMap["enabled"] as Boolean
                    snapshot.get("maintenanceMode") is Boolean -> snapshot.getBoolean("maintenanceMode") ?: false
                    else -> false
                }

                @Suppress("UNCHECKED_CAST")
                val maintenanceMsgMap = (maintenanceMap?.get("message") as? Map<String, String>)
                    ?: (snapshot.get("maintenanceMessage") as? Map<String, String>)
                    ?: emptyMap()

                val maintenanceCustomMsg = when {
                    maintenanceMap?.get("message") is String -> maintenanceMap["message"] as String
                    snapshot.get("maintenanceMessage") is String -> snapshot.getString("maintenanceMessage")
                    else -> null
                }

                val finalMessages = if (maintenanceMsgMap.isNotEmpty()) {
                    maintenanceMsgMap
                } else if (!maintenanceCustomMsg.isNullOrBlank()) {
                    mapOf("en" to maintenanceCustomMsg, "hi" to maintenanceCustomMsg)
                } else {
                    emptyMap()
                }

                // Versioning: Check delivery-specific gate first, then fallback to global versioning
                val versioningMap = snapshot.get("versioning") as? Map<*, *>
                val deliveryVersioningMap = versioningMap?.get("delivery") as? Map<*, *>

                val minVersion = when {
                    deliveryVersioningMap?.get("minVersionCode") is Number -> (deliveryVersioningMap["minVersionCode"] as Number).toInt()
                    versioningMap?.get("minVersionCode") is Number -> (versioningMap["minVersionCode"] as Number).toInt()
                    snapshot.get("minVersionCode") is Number -> snapshot.getLong("minVersionCode")?.toInt() ?: 0
                    else -> 0
                }

                val blockedListRaw = deliveryVersioningMap?.get("blockedVersionCodes") as? List<*>
                    ?: versioningMap?.get("blockedVersionCodes") as? List<*>
                    ?: snapshot.get("blockedVersionCodes") as? List<*>
                    ?: emptyList<Any>()

                val blockedVersions = blockedListRaw.mapNotNull {
                    when (it) {
                        is Number -> it.toInt()
                        is String -> it.toIntOrNull()
                        else -> null
                    }
                }

                // Delivery operational toggles
                val deliveryMap = snapshot.get("delivery") as? Map<*, *>
                val assignmentEnabled = when {
                    deliveryMap?.get("assignment_enabled") is Boolean -> deliveryMap["assignment_enabled"] as Boolean
                    deliveryMap?.get("assignmentEnabled") is Boolean -> deliveryMap["assignmentEnabled"] as Boolean
                    snapshot.get("assignment_enabled") is Boolean -> snapshot.getBoolean("assignment_enabled") ?: true
                    snapshot.get("assignmentEnabled") is Boolean -> snapshot.getBoolean("assignmentEnabled") ?: true
                    else -> true
                }

                val cashCollectionEnabled = when {
                    deliveryMap?.get("cash_collection_enabled") is Boolean -> deliveryMap["cash_collection_enabled"] as Boolean
                    deliveryMap?.get("cashCollectionEnabled") is Boolean -> deliveryMap["cashCollectionEnabled"] as Boolean
                    snapshot.get("cash_collection_enabled") is Boolean -> snapshot.getBoolean("cash_collection_enabled") ?: true
                    snapshot.get("codEnabled") is Boolean -> snapshot.getBoolean("codEnabled") ?: true
                    else -> true
                }

                val adminWriteLock = snapshot.getBoolean("adminWriteLock") ?: false
                val version = snapshot.getLong("version") ?: 0L
                val updatedAt = when (val raw = snapshot.get("updatedAt")) {
                    is Timestamp -> raw.toDate().time
                    is Number -> raw.toLong()
                    is String -> raw.toLongOrNull() ?: 0L
                    else -> 0L
                }

                DeliveryGlobalConfig(
                    maintenanceMode = DeliveryMaintenanceMode(
                        isEnabled = maintenanceEnabled,
                        messages = finalMessages
                    ),
                    versioning = DeliveryVersioningConfig(
                        minVersionCode = minVersion,
                        blockedVersionCodes = blockedVersions
                    ),
                    delivery = DeliveryOperationalConfig(
                        assignmentEnabled = assignmentEnabled,
                        cashCollectionEnabled = cashCollectionEnabled
                    ),
                    adminWriteLock = adminWriteLock,
                    version = version,
                    updatedAt = updatedAt
                )
            } catch (e: Exception) {
                Timber.e(e, "Error parsing DeliveryGlobalConfig from snapshot")
                DeliveryGlobalConfig()
            }
        }
    }
}

/**
 * Maintenance mode state with bilingual Hindi/English announcements.
 */
data class DeliveryMaintenanceMode(
    val isEnabled: Boolean = false,
    val messages: Map<String, String> = emptyMap(),
    val title: Map<String, String> = emptyMap()
) {
    fun getMessage(lang: String = "hi"): String {
        return messages[lang]
            ?: messages["hi"]
            ?: messages["en"]
            ?: if (lang == "hi") {
                "डिलीवरी सिस्टम का सर्वर रखरखाव जारी है। कृपया कुछ समय बाद पुनः प्रयास करें या हब मैनेजर से संपर्क करें।"
            } else {
                "The delivery system is currently undergoing scheduled maintenance. Please check back shortly or contact your Hub Manager."
            }
    }

    fun getTitle(lang: String = "hi"): String {
        return title[lang]
            ?: title["hi"]
            ?: title["en"]
            ?: if (lang == "hi") "सिस्टम मेंटेनेंस" else "System Maintenance"
    }
}

/**
 * Version constraints for Delivery App.
 */
data class DeliveryVersioningConfig(
    val minVersionCode: Int = 0,
    val blockedVersionCodes: List<Int> = emptyList()
)

/**
 * Operational switches specific to delivery operations.
 */
data class DeliveryOperationalConfig(
    val assignmentEnabled: Boolean = true,
    val cashCollectionEnabled: Boolean = true
)

/**
 * Hub-specific system overrides fetched from `system_configs/hubs_{hubId}`.
 */
data class DeliveryHubConfig(
    val hubId: String = "",
    val isLockdown: Boolean = false,
    val acceptingOrders: Boolean = true,
    val cashCollectionEnabled: Boolean = true,
    val deliverySlots: Map<String, Any> = emptyMap(),
    val updatedAt: Long = 0L
) {
    val isOperational: Boolean get() = !isLockdown && acceptingOrders

    companion object {
        fun fromDocument(snapshot: DocumentSnapshot?, hubId: String): DeliveryHubConfig {
            if (snapshot == null || !snapshot.exists()) {
                return DeliveryHubConfig(hubId = hubId)
            }

            return try {
                val lockdownMap = snapshot.get("lockdown") as? Map<*, *>
                val isLockdown = when {
                    lockdownMap?.get("active") is Boolean -> lockdownMap["active"] as Boolean
                    snapshot.get("lockdown") is Boolean -> snapshot.getBoolean("lockdown") ?: false
                    else -> false
                }

                val acceptingOrders = snapshot.getBoolean("acceptingOrders") ?: true

                val cashCollectionEnabled = when {
                    snapshot.get("cash_collection_enabled") is Boolean -> snapshot.getBoolean("cash_collection_enabled") ?: true
                    snapshot.get("cashCollectionEnabled") is Boolean -> snapshot.getBoolean("cashCollectionEnabled") ?: true
                    snapshot.get("codEnabled") is Boolean -> snapshot.getBoolean("codEnabled") ?: true
                    else -> true
                }

                @Suppress("UNCHECKED_CAST")
                val deliverySlots = (snapshot.get("deliverySlots") as? Map<String, Any>)
                    ?: (snapshot.get("slotVisibility") as? Map<String, Any>)
                    ?: emptyMap()

                val updatedAt = when (val raw = snapshot.get("updatedAt")) {
                    is Timestamp -> raw.toDate().time
                    is Number -> raw.toLong()
                    is String -> raw.toLongOrNull() ?: 0L
                    else -> 0L
                }

                DeliveryHubConfig(
                    hubId = hubId,
                    isLockdown = isLockdown,
                    acceptingOrders = acceptingOrders,
                    cashCollectionEnabled = cashCollectionEnabled,
                    deliverySlots = deliverySlots,
                    updatedAt = updatedAt
                )
            } catch (e: Exception) {
                Timber.e(e, "Error parsing DeliveryHubConfig for hub $hubId")
                DeliveryHubConfig(hubId = hubId)
            }
        }
    }
}
