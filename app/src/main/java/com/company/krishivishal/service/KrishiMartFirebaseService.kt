package com.company.krishivishal.service

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
import javax.inject.Inject

@AndroidEntryPoint
class KrishiMartFirebaseService : KrishiVishalFirebaseMessagingService() {

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        val userId = auth.currentUser?.uid
        if (userId != null) {
            serviceScope.launch {
                repository.updateFcmToken(userId, token)
            }
        }
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        
        val type = message.data["type"] ?: "GENERAL"
        val productId = message.data["productId"]
        val targetId = message.data["targetId"] ?: message.data["orderId"] ?: productId
        val title = message.notification?.title ?: message.data["title"] ?: if (type == "STOCK_AVAILABLE") "✅ Stock Available!" else null
        val body = message.notification?.body ?: message.data["body"]
        val imageUrl = message.notification?.imageUrl?.toString()
            ?: message.data["imageUrl"]
            ?: message.data["image"]
            ?: message.data["bannerUrl"]
        val data = message.data["data"]

        if (title != null || body != null || type == "STOCK_AVAILABLE") {
            val notificationTitle = title ?: "Stock Available!"
            val notificationBody = body ?: "Item is back in stock!"

            val notification = com.company.krishivishal.core.model.Notification(
                title = notificationTitle,
                body = notificationBody,
                type = type,
                data = data
            )

            serviceScope.launch {
                repository.saveNotification(notification)
                // Display rich notification with channel routing (stock_alerts channel for STOCK_AVAILABLE)
                notificationHelper.showRichNotification(
                    title = notificationTitle,
                    message = notificationBody,
                    imageUrl = imageUrl,
                    type = type,
                    targetId = targetId
                )
            }
        }
    }
}
