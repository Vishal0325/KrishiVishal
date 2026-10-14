package com.company.krishivishal.service

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.company.krishivishal.MainActivity
import com.company.krishivishal.R
import com.company.krishivishal.data.local.datastore.UserPreferences
import com.company.krishivishal.data.repository.NotificationRepository
import com.company.krishivishal.utils.NotificationHelper
import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import timber.log.Timber
import javax.inject.Inject

@AndroidEntryPoint
open class KrishiVishalFirebaseMessagingService : FirebaseMessagingService() {

    @Inject
    lateinit var repository: NotificationRepository

    @Inject
    lateinit var notificationHelper: NotificationHelper

    @Inject
    lateinit var auth: FirebaseAuth

    @Inject
    lateinit var userPreferences: UserPreferences

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        val userId = auth.currentUser?.uid
        serviceScope.launch {
            try {
                if (userId != null) {
                    repository.updateFcmToken(userId, token)
                }
                val abBucket = userPreferences.getOrInitAbBucket()
                com.google.firebase.messaging.FirebaseMessaging.getInstance().subscribeToTopic("all_customers")
                com.google.firebase.messaging.FirebaseMessaging.getInstance().subscribeToTopic(abBucket)
                Timber.d("FCM token updated and subscribed to all_customers and $abBucket")
            } catch (e: Exception) {
                Timber.e(e, "Failed to update FCM token / topic for user $userId")
            }
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)

        val type = message.data["type"] ?: "GENERAL"
        val orderId = message.data["orderId"]
        val status = message.data["status"]
        val productId = message.data["productId"]
        val deepLink = message.data["deepLink"]
        val campaignId = message.data["campaignId"]
        val targetId = message.data["targetId"] ?: orderId ?: productId ?: deepLink
        val rawTitle = message.notification?.title ?: message.data["title"] ?: if (type == "STOCK_AVAILABLE") "✅ Stock Available!" else "Notification"
        val rawBody = message.notification?.body ?: message.data["body"] ?: if (status != null && orderId != null) "Order #$orderId is now $status" else ""
        val rawImageUrl = message.notification?.imageUrl?.toString()
            ?: message.data["imageUrl"]
            ?: message.data["image"]
            ?: message.data["bannerUrl"]
        val data = message.data["data"]

        // ── A/B Testing Variant Resolution (Feature 4) ──
        val isAbTest = message.data["isAbTest"] == "true"
        val explicitVariant = message.data["variant"]
        val splitRatio = message.data["splitRatio"]?.toIntOrNull() ?: 50

        val chosenVariant = if (!explicitVariant.isNullOrBlank()) {
            explicitVariant.trim().uppercase()
        } else if (isAbTest) {
            val hashSource = auth.currentUser?.uid ?: message.messageId ?: "client"
            if (Math.abs(hashSource.hashCode()) % 100 < splitRatio) "A" else "B"
        } else {
            "A"
        }

        val title = if (isAbTest && chosenVariant == "B" && !message.data["variantB_title"].isNullOrBlank()) {
            message.data["variantB_title"]!!
        } else if (isAbTest && chosenVariant == "A" && !message.data["variantA_title"].isNullOrBlank()) {
            message.data["variantA_title"]!!
        } else {
            rawTitle
        }

        val body = if (isAbTest && chosenVariant == "B" && !message.data["variantB_body"].isNullOrBlank()) {
            message.data["variantB_body"]!!
        } else if (isAbTest && chosenVariant == "A" && !message.data["variantA_body"].isNullOrBlank()) {
            message.data["variantA_body"]!!
        } else {
            rawBody
        }

        val imageUrl = if (isAbTest && chosenVariant == "B" && !message.data["variantB_imageUrl"].isNullOrBlank()) {
            message.data["variantB_imageUrl"]
        } else if (isAbTest && chosenVariant == "A" && !message.data["variantA_imageUrl"].isNullOrBlank()) {
            message.data["variantA_imageUrl"]
        } else {
            rawImageUrl
        }

        val resolvedDeepLink = if (isAbTest && chosenVariant == "B" && !message.data["variantB_deepLink"].isNullOrBlank()) {
            message.data["variantB_deepLink"]
        } else if (isAbTest && chosenVariant == "A" && !message.data["variantA_deepLink"].isNullOrBlank()) {
            message.data["variantA_deepLink"]
        } else {
            deepLink
        }

        val finalTargetId = resolvedDeepLink ?: targetId

        if (title.isNotBlank() || body.isNotBlank() || type == "STOCK_AVAILABLE") {
            val notificationTitle = if (title.isBlank()) "Stock Available!" else title
            val notificationBody = if (body.isBlank()) "Item is back in stock!" else body

            val notification = com.company.krishivishal.core.model.Notification(
                title = notificationTitle,
                body = notificationBody,
                type = type,
                data = data ?: finalTargetId ?: orderId ?: productId ?: resolvedDeepLink
            )

            serviceScope.launch {
                try {
                    repository.saveNotification(notification)
                } catch (e: Exception) {
                    Timber.e(e, "Failed to save in-app notification")
                }

                if (type == "ORDER_STATUS_UPDATE") {
                    showOrderStatusNotification(notificationTitle, notificationBody, orderId ?: targetId)
                } else {
                    notificationHelper.showRichNotification(
                        title = notificationTitle,
                        message = notificationBody,
                        imageUrl = imageUrl,
                        type = type,
                        targetId = finalTargetId,
                        campaignId = campaignId,
                        variant = if (isAbTest || campaignId != null) chosenVariant else null
                    )
                }
            }
        }
    }

    private fun showOrderStatusNotification(title: String, body: String, orderId: String?) {
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        val channelId = "order_updates"

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "Order Updates",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Notifications for order status changes"
                enableVibration(true)
            }
            notificationManager.createNotificationChannel(channel)
        }

        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            if (orderId != null) {
                putExtra("orderId", orderId)
                putExtra(NotificationHelper.EXTRA_TARGET_ID, orderId)
                putExtra(NotificationHelper.EXTRA_NOTIFICATION_TYPE, "ORDER_STATUS_UPDATE")
            }
        }

        val pendingIntent = PendingIntent.getActivity(
            this,
            (System.currentTimeMillis() % 100000).toInt(),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notificationBuilder = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(R.drawable.ic_home)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pendingIntent)

        notificationManager.notify((System.currentTimeMillis() % 100000).toInt(), notificationBuilder.build())
    }
}
