package com.company.krishivishaldelivery.data.model

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class DeliverySystemConfigTest {

    @Test
    fun defaultValues_allowNormalOperations() {
        val config = DeliveryGlobalConfig()
        assertFalse(config.isMaintenanceMode)
        assertTrue(config.isAssignmentEnabled)
        assertTrue(config.isCashCollectionEnabled)
        assertFalse(config.isVersionBlocked(100))
    }

    @Test
    fun versionBlocking_blocksBelowMinVersion() {
        val config = DeliveryGlobalConfig(
            versioning = DeliveryVersioningConfig(
                minVersionCode = 25,
                blockedVersionCodes = listOf(20, 21)
            )
        )
        assertTrue(config.isVersionBlocked(24))
        assertFalse(config.isVersionBlocked(25))
        assertFalse(config.isVersionBlocked(26))
    }

    @Test
    fun versionBlocking_blocksSpecificBlacklistedVersions() {
        val config = DeliveryGlobalConfig(
            versioning = DeliveryVersioningConfig(
                minVersionCode = 10,
                blockedVersionCodes = listOf(15, 18)
            )
        )
        assertTrue(config.isVersionBlocked(15))
        assertTrue(config.isVersionBlocked(18))
        assertFalse(config.isVersionBlocked(16))
    }

    @Test
    fun maintenanceMode_activeStateAndLocalization() {
        val config = DeliveryGlobalConfig(
            maintenanceMode = DeliveryMaintenanceMode(
                isEnabled = true,
                messages = mapOf("en" to "Down for maintenance", "hi" to "रखरखाव जारी है")
            )
        )
        assertTrue(config.isMaintenanceMode)
        assertEquals("Down for maintenance", config.maintenanceMode.getMessage("en"))
        assertEquals("रखरखाव जारी है", config.maintenanceMode.getMessage("hi"))
    }

    @Test
    fun maintenanceMode_defaultFallbacks() {
        val mode = DeliveryMaintenanceMode(isEnabled = true)
        assertTrue(mode.getMessage("hi").contains("रखरखाव"))
        assertTrue(mode.getMessage("en").contains("maintenance"))
        assertEquals("सिस्टम मेंटेनेंस", mode.getTitle("hi"))
        assertEquals("System Maintenance", mode.getTitle("en"))
    }

    @Test
    fun operationalToggles_assignmentAndCash() {
        val config = DeliveryGlobalConfig(
            delivery = DeliveryOperationalConfig(
                assignmentEnabled = false,
                cashCollectionEnabled = false
            )
        )
        assertFalse(config.isAssignmentEnabled)
        assertFalse(config.isCashCollectionEnabled)
    }

    @Test
    fun hubConfig_lockdownActive() {
        val hub = DeliveryHubConfig(
            hubId = "HUB-SAM-001",
            isLockdown = true,
            acceptingOrders = true,
            cashCollectionEnabled = true
        )
        assertTrue(hub.isLockdown)
        assertFalse(hub.isOperational) // Lockdown overrides acceptingOrders
    }

    @Test
    fun hubConfig_servicePaused() {
        val hub = DeliveryHubConfig(
            hubId = "HUB-SAM-001",
            isLockdown = false,
            acceptingOrders = false,
            cashCollectionEnabled = true
        )
        assertFalse(hub.isLockdown)
        assertFalse(hub.acceptingOrders)
        assertFalse(hub.isOperational)
    }

    @Test
    fun hubConfig_operationalState() {
        val hub = DeliveryHubConfig(
            hubId = "HUB_SAMASTIPUR",
            isLockdown = false,
            acceptingOrders = true,
            cashCollectionEnabled = true
        )
        assertFalse(hub.isLockdown)
        assertTrue(hub.acceptingOrders)
        assertTrue(hub.isOperational)
        assertTrue(hub.cashCollectionEnabled)
    }
}
