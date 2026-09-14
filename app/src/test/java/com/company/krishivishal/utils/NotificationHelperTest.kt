package com.company.krishivishal.utils

import android.app.NotificationManager
import android.content.Context
import io.mockk.every
import io.mockk.mockk
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test

class NotificationHelperTest {

    private val mockContext = mockk<Context>(relaxed = true)
    private val mockNotificationManager = mockk<NotificationManager>(relaxed = true)

    @Before
    fun setUp() {
        every { mockContext.getSystemService(Context.NOTIFICATION_SERVICE) } returns mockNotificationManager
    }

    @Test
    fun `channel constants should match defined names`() {
        assertEquals("krishi_orders_channel", NotificationHelper.CHANNEL_ORDERS)
        assertEquals("krishi_offers_channel", NotificationHelper.CHANNEL_OFFERS)
        assertEquals("krishi_general_channel", NotificationHelper.CHANNEL_GENERAL)
    }

    @Test
    fun `extra constants should match defined keys`() {
        assertEquals("extra_notification_type", NotificationHelper.EXTRA_NOTIFICATION_TYPE)
        assertEquals("extra_target_id", NotificationHelper.EXTRA_TARGET_ID)
        assertEquals("extra_image_url", NotificationHelper.EXTRA_IMAGE_URL)
    }
}
