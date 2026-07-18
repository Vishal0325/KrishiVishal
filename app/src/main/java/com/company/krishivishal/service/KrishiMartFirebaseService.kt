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
        message.notification?.let {
            notificationHelper.showNotification(it.title, it.body)
        } ?: run {
            // Handle data payload if needed
            val title = message.data["title"]
            val body = message.data["body"]
            if (title != null || body != null) {
                notificationHelper.showNotification(title, body)
            }
        }
    }
}
