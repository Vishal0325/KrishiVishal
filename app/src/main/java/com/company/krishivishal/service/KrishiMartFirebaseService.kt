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
class KrishiMartFirebaseService : FirebaseMessagingService() {

    @Inject
    lateinit var repository: NotificationRepository

    @Inject
    lateinit var notificationHelper: NotificationHelper

    @Inject
    lateinit var auth: FirebaseAuth

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
        
        val title = message.notification?.title ?: message.data["title"]
        val body = message.notification?.body ?: message.data["body"]
        val type = message.data["type"] ?: "GENERAL"
        val data = message.data["data"]

        if (title != null || body != null) {
            val notification = com.company.krishivishal.core.model.Notification(
                title = title ?: "New Notification",
                body = body ?: "",
                type = type,
                data = data
            )

            serviceScope.launch {
                repository.saveNotification(notification)
            }

            notificationHelper.showNotification(title, body)
        }
    }
}
