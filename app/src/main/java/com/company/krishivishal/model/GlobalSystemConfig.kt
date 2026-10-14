package com.company.krishivishal.model

import com.google.firebase.firestore.DocumentSnapshot

/**
 * System configuration model representing global kill switches, operational toggles,
 * and version gates fetched from Firestore collection `system_configs`, document `global`.
 */
data class GlobalSystemConfig(
    val maintenanceMode: MaintenanceMode = MaintenanceMode(),
    val checkoutFrozen: CheckoutFrozenConfig = CheckoutFrozenConfig(),
    val payments: PaymentsConfig = PaymentsConfig(),
    val versioning: VersioningConfig = VersioningConfig(),
    val adminWriteLock: Boolean = false,
    val version: Long = 0L,
    val updatedAt: Long = 0L
) {
    val isMaintenanceMode: Boolean get() = maintenanceMode.isEnabled
    val isCheckoutFrozen: Boolean get() = checkoutFrozen.isFrozen

    fun isVersionBlocked(currentVersionCode: Int): Boolean {
        if (versioning.minVersionCode > 0 && currentVersionCode < versioning.minVersionCode) {
            return true
        }
        return versioning.blockedVersionCodes.contains(currentVersionCode)
    }

    companion object {
        fun fromDocument(snapshot: DocumentSnapshot?): GlobalSystemConfig {
            if (snapshot == null || !snapshot.exists()) {
                return GlobalSystemConfig()
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

            // Checkout Frozen - Defensive parsing
            val checkoutFrozenMap = killSwitches?.get("checkoutFrozen") as? Map<*, *>
            val isCheckoutFrozen = when {
                checkoutFrozenMap?.get("value") is Boolean -> checkoutFrozenMap["value"] as Boolean
                checkoutFrozenMap?.get("enabled") is Boolean -> checkoutFrozenMap["enabled"] as Boolean
                snapshot.get("checkoutFrozen") is Boolean -> snapshot.getBoolean("checkoutFrozen") ?: false
                else -> false
            }
            val checkoutReason = checkoutFrozenMap?.get("reason") as? String
                ?: snapshot.getString("checkoutFrozenReason")

            // Payments
            val paymentsMap = snapshot.get("payments") as? Map<*, *>
            val onlineEnabled = when {
                paymentsMap?.get("onlineEnabled") is Boolean -> paymentsMap["onlineEnabled"] as Boolean
                snapshot.get("paymentsOnlineEnabled") is Boolean -> snapshot.getBoolean("paymentsOnlineEnabled") ?: true
                else -> true
            }
            val codEnabled = when {
                paymentsMap?.get("codEnabled") is Boolean -> paymentsMap["codEnabled"] as Boolean
                snapshot.get("codEnabled") is Boolean -> snapshot.getBoolean("codEnabled") ?: true
                else -> true
            }

            // Versioning
            val versioningMap = snapshot.get("versioning") as? Map<*, *>
            val userVersioningMap = versioningMap?.get("user") as? Map<*, *>

            val minVersion = when {
                userVersioningMap?.get("minVersionCode") is Number -> (userVersioningMap["minVersionCode"] as Number).toInt()
                versioningMap?.get("minVersionCode") is Number -> (versioningMap["minVersionCode"] as Number).toInt()
                snapshot.get("minVersionCode") is Number -> snapshot.getLong("minVersionCode")?.toInt() ?: 0
                else -> 0
            }

            val blockedListRaw = userVersioningMap?.get("blockedVersionCodes") as? List<*>
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

            val adminWriteLock = snapshot.getBoolean("adminWriteLock") ?: false
            val version = snapshot.getLong("version") ?: 0L
            val updatedAt = when (val raw = snapshot.get("updatedAt")) {
                is com.google.firebase.Timestamp -> raw.toDate().time
                is Number -> raw.toLong()
                else -> 0L
            }

            GlobalSystemConfig(
                maintenanceMode = MaintenanceMode(
                    isEnabled = maintenanceEnabled,
                    messages = finalMessages
                ),
                checkoutFrozen = CheckoutFrozenConfig(
                    isFrozen = isCheckoutFrozen,
                    reason = checkoutReason
                ),
                payments = PaymentsConfig(
                    onlineEnabled = onlineEnabled,
                    codEnabled = codEnabled
                ),
                versioning = VersioningConfig(
                    minVersionCode = minVersion,
                    blockedVersionCodes = blockedVersions
                ),
                adminWriteLock = adminWriteLock,
                version = version,
                updatedAt = updatedAt
            )
        } catch (e: Exception) {
            timber.log.Timber.e(e, "Error parsing GlobalSystemConfig from document snapshot")
            GlobalSystemConfig()
        }
    }
    }
}

/**
 * Maintenance mode state and localized announcements.
 */
data class MaintenanceMode(
    val isEnabled: Boolean = false,
    val messages: Map<String, String> = emptyMap(),
    val title: Map<String, String> = emptyMap()
) {
    fun getMessage(lang: String = "en"): String {
        return messages[lang]
            ?: messages["en"]
            ?: messages["hi"]
            ?: if (lang == "hi") {
                "सर्वर रखरखाव जारी है। हम जल्द ही वापस लौटेंगे।"
            } else {
                "The app is currently undergoing scheduled maintenance. Please check back shortly."
            }
    }

    fun getTitle(lang: String = "en"): String {
        return title[lang]
            ?: title["en"]
            ?: if (lang == "hi") "रखरखाव जारी है" else "System Maintenance"
    }
}

/**
 * Checkout freeze / kill switch state and admin broadcast reason.
 */
data class CheckoutFrozenConfig(
    val isFrozen: Boolean = false,
    val reason: String? = null
)

/**
 * Payment method global operational toggles.
 */
data class PaymentsConfig(
    val onlineEnabled: Boolean = true,
    val codEnabled: Boolean = true
)

/**
 * App version gatekeeping parameters.
 */
data class VersioningConfig(
    val minVersionCode: Int = 0,
    val blockedVersionCodes: List<Int> = emptyList()
)

/**
 * Hub-level overrides and operational toggles fetched from
 * collection `system_configs`, document `hubs_{hubId}`.
 */
data class HubSystemConfig(
    val hubId: String = "",
    val isLockdown: Boolean = false,
    val acceptingOrders: Boolean = true,
    val codEnabled: Boolean = true,
    val slotVisibility: Map<String, Boolean> = emptyMap(),
    val updatedAt: Long = 0L
) {
    companion object {
        fun fromDocument(snapshot: DocumentSnapshot?, hubId: String): HubSystemConfig {
            if (snapshot == null || !snapshot.exists()) {
                return HubSystemConfig(hubId = hubId)
            }

            return try {
                val lockdownMap = snapshot.get("lockdown") as? Map<*, *>
                val isLockdown = when {
                    lockdownMap?.get("active") is Boolean -> lockdownMap["active"] as Boolean
                    snapshot.get("lockdown") is Boolean -> snapshot.getBoolean("lockdown") ?: false
                    else -> false
                }

                val acceptingOrders = snapshot.getBoolean("acceptingOrders") ?: true
                val codEnabled = snapshot.getBoolean("codEnabled") ?: true

                @Suppress("UNCHECKED_CAST")
                val slotVisibility = (snapshot.get("slotVisibility") as? Map<String, Boolean>) ?: emptyMap()
                val updatedAt = when (val raw = snapshot.get("updatedAt")) {
                    is com.google.firebase.Timestamp -> raw.toDate().time
                    is Number -> raw.toLong()
                    else -> 0L
                }

                HubSystemConfig(
                    hubId = hubId,
                    isLockdown = isLockdown,
                    acceptingOrders = acceptingOrders,
                    codEnabled = codEnabled,
                    slotVisibility = slotVisibility,
                    updatedAt = updatedAt
                )
            } catch (e: Exception) {
                timber.log.Timber.e(e, "Error parsing HubSystemConfig from document snapshot")
                HubSystemConfig(hubId = hubId)
            }
        }
    }
}
