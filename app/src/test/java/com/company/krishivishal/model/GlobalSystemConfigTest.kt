package com.company.krishivishal.model

import com.google.gson.Gson
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GlobalSystemConfigTest {

    private val gson = Gson()

    @Test
    fun defaultValues_allowNormalOperations() {
        val config = GlobalSystemConfig()
        assertFalse(config.isMaintenanceMode)
        assertFalse(config.isCheckoutFrozen)
        assertTrue(config.payments.onlineEnabled)
        assertTrue(config.payments.codEnabled)
        assertFalse(config.isVersionBlocked(100))
    }

    @Test
    fun versionBlocking_blocksBelowMinVersion() {
        val config = GlobalSystemConfig(
            versioning = VersioningConfig(minVersionCode = 25, blockedVersionCodes = listOf(20, 21))
        )
        assertTrue(config.isVersionBlocked(24))
        assertFalse(config.isVersionBlocked(25))
        assertFalse(config.isVersionBlocked(26))
    }

    @Test
    fun versionBlocking_blocksSpecificBlacklistedVersions() {
        val config = GlobalSystemConfig(
            versioning = VersioningConfig(minVersionCode = 10, blockedVersionCodes = listOf(15, 18))
        )
        assertTrue(config.isVersionBlocked(15))
        assertTrue(config.isVersionBlocked(18))
        assertFalse(config.isVersionBlocked(16))
    }

    @Test
    fun maintenanceMode_activeState() {
        val config = GlobalSystemConfig(
            maintenanceMode = MaintenanceMode(
                isEnabled = true,
                messages = mapOf("en" to "Down for upgrades", "hi" to "Kripya intezar karein")
            )
        )
        assertTrue(config.isMaintenanceMode)
        assertEquals("Down for upgrades", config.maintenanceMode.getMessage("en"))
        assertEquals("Kripya intezar karein", config.maintenanceMode.getMessage("hi"))
    }

    @Test
    fun checkoutFrozen_activeState() {
        val config = GlobalSystemConfig(
            checkoutFrozen = CheckoutFrozenConfig(
                isFrozen = true,
                reason = "Inventory recount in progress"
            )
        )
        assertTrue(config.isCheckoutFrozen)
        assertEquals("Inventory recount in progress", config.checkoutFrozen.reason)
    }

    @Test
    fun hubConfig_defaultValues() {
        val hub = HubSystemConfig(hubId = "HUB-SAM-001")
        assertFalse(hub.isLockdown)
        assertTrue(hub.acceptingOrders)
        assertTrue(hub.codEnabled)
        assertEquals("HUB-SAM-001", hub.hubId)
    }

    @Test
    fun hubConfig_lockdownActive() {
        val hub = HubSystemConfig(hubId = "HUB-SAM-001", isLockdown = true, acceptingOrders = false)
        assertTrue(hub.isLockdown)
        assertFalse(hub.acceptingOrders)
    }

    @Test
    fun jsonSerialization_preservesAllFieldsForDataStoreCache() {
        val original = GlobalSystemConfig(
            maintenanceMode = MaintenanceMode(isEnabled = true, messages = mapOf("en" to "Testing")),
            checkoutFrozen = CheckoutFrozenConfig(isFrozen = true, reason = "Freeze Reason"),
            payments = PaymentsConfig(onlineEnabled = false, codEnabled = true),
            versioning = VersioningConfig(minVersionCode = 50, blockedVersionCodes = listOf(48, 49)),
            version = 42L
        )

        val json = gson.toJson(original)
        val deserialized = gson.fromJson(json, GlobalSystemConfig::class.java)

        assertEquals(original.version, deserialized.version)
        assertEquals(original.isMaintenanceMode, deserialized.isMaintenanceMode)
        assertEquals(original.isCheckoutFrozen, deserialized.isCheckoutFrozen)
        assertEquals(original.payments.onlineEnabled, deserialized.payments.onlineEnabled)
        assertEquals(original.payments.codEnabled, deserialized.payments.codEnabled)
        assertEquals(original.versioning.minVersionCode, deserialized.versioning.minVersionCode)
        assertEquals(original.versioning.blockedVersionCodes, deserialized.versioning.blockedVersionCodes)
    }
}
