package com.company.krishivishal.utils

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.drawable.BitmapDrawable
import android.os.Build
import androidx.core.app.NotificationCompat
import coil.imageLoader
import coil.request.ImageRequest
import coil.request.SuccessResult
import com.company.krishivishal.MainActivity
import com.company.krishivishal.R
import dagger.hilt.android.qualifiers.ApplicationContext
import timber.log.Timber
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class NotificationHelper @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val notificationManager =
        context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    companion object {
        const val CHANNEL_ORDERS = "krishi_orders_channel"
        const val CHANNEL_OFFERS = "krishi_offers_channel"
        const val CHANNEL_GENERAL = "krishi_general_channel"

        const val EXTRA_NOTIFICATION_TYPE = "extra_notification_type"
        const val EXTRA_TARGET_ID = "extra_target_id"
        const val EXTRA_IMAGE_URL = "extra_image_url"
    }

    init {
        createNotificationChannels()
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val ordersChannel = NotificationChannel(
                CHANNEL_ORDERS,
                "ऑर्डर अपडेट्स (Order Updates)",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Real-time updates about your orders and delivery status"
                enableVibration(true)
            }

            val offersChannel = NotificationChannel(
                CHANNEL_OFFERS,
                "ऑफ़र और डिस्काउंट (Offers & Discounts)",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "Exclusive offers, discounts, and seasonal picks"
            }

            val generalChannel = NotificationChannel(
                CHANNEL_GENERAL,
                "सामान्य सूचनाएं (General)",
                NotificationManager.IMPORTANCE_DEFAULT
            ).apply {
                description = "General announcements and alerts"
            }

            notificationManager.createNotificationChannels(listOf(ordersChannel, offersChannel, generalChannel))
        }
    }

    /**
     * Loads a Bitmap from an image URL using the optimized Coil ImageLoader.
     */
    suspend fun fetchBitmap(imageUrl: String?): Bitmap? {
        if (imageUrl.isNullOrBlank()) return null
        return try {
            val request = ImageRequest.Builder(context)
                .data(imageUrl)
                .allowHardware(false) // Non-hardware bitmap is required for Notification rendering
                .build()
            val result = context.imageLoader.execute(request)
            if (result is SuccessResult) {
                (result.drawable as? BitmapDrawable)?.bitmap
            } else {
                null
            }
        } catch (e: Exception) {
            Timber.w(e, "Failed to load image bitmap for Rich Push Notification: $imageUrl")
            null
        }
    }

    /**
     * Shows a Rich Push Notification with optional BigPictureStyle banner image.
     */
    suspend fun showRichNotification(
        title: String?,
        message: String?,
        imageUrl: String? = null,
        type: String = "GENERAL",
        targetId: String? = null,
        notificationId: Int = (System.currentTimeMillis() % 100000).toInt()
    ) {
        val channelId = when (type.uppercase()) {
            "ORDER", "ORDER_PLACED", "ORDER_CONFIRMED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED", "RETURN_UPDATE" -> CHANNEL_ORDERS
            "OFFER", "PROMOTION", "DISCOUNT", "SEASONAL_PICK" -> CHANNEL_OFFERS
            else -> CHANNEL_GENERAL
        }

        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(EXTRA_NOTIFICATION_TYPE, type)
            targetId?.let { putExtra(EXTRA_TARGET_ID, it) }
            imageUrl?.let { putExtra(EXTRA_IMAGE_URL, it) }
        }

        val pendingIntent = PendingIntent.getActivity(
            context,
            notificationId,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val imageBitmap = fetchBitmap(imageUrl)

        val builder = NotificationCompat.Builder(context, channelId)
            .setSmallIcon(R.drawable.ic_home)
            .setContentTitle(title ?: "Krishi Vishal")
            .setContentText(message ?: "")
            .setAutoCancel(true)
            .setPriority(
                if (channelId == CHANNEL_ORDERS) NotificationCompat.PRIORITY_HIGH
                else NotificationCompat.PRIORITY_DEFAULT
            )
            .setContentIntent(pendingIntent)

        if (imageBitmap != null) {
            // Rich Push: BigPictureStyle with large preview and summary text
            builder.setLargeIcon(imageBitmap)
            builder.setStyle(
                NotificationCompat.BigPictureStyle()
                    .bigPicture(imageBitmap)
                    .setBigContentTitle(title)
                    .setSummaryText(message)
            )
        } else if (!message.isNullOrBlank()) {
            // Text Fallback: BigTextStyle to prevent long message truncation
            builder.setStyle(
                NotificationCompat.BigTextStyle()
                    .bigText(message)
                    .setBigContentTitle(title)
            )
        }

        notificationManager.notify(notificationId, builder.build())
    }

    /**
     * Backward-compatible simple notification display
     */
    fun showNotification(title: String?, message: String?) {
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }
        val pendingIntent = PendingIntent.getActivity(
            context, 0, intent,
            PendingIntent.FLAG_IMMUTABLE
        )

        val builder = NotificationCompat.Builder(context, CHANNEL_GENERAL)
            .setSmallIcon(R.drawable.ic_home)
            .setContentTitle(title)
            .setContentText(message)
            .setStyle(NotificationCompat.BigTextStyle().bigText(message))
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(pendingIntent)

        notificationManager.notify(System.currentTimeMillis().toInt(), builder.build())
    }
}

