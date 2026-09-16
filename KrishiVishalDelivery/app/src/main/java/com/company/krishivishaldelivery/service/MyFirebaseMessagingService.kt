package com.company.krishivishaldelivery.service

import android.util.Log
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class MyFirebaseMessagingService : FirebaseMessagingService() {

    @Inject
    lateinit var firestore: FirebaseFirestore

    @Inject
    lateinit var auth: com.google.firebase.auth.FirebaseAuth

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d("FCM_TOKEN", "Refreshed token: $token")
        val uid = auth.currentUser?.uid
        if (uid != null) {
            try {
                val tokenId = java.security.MessageDigest.getInstance("SHA-256")
                    .digest(token.trim().toByteArray())
                    .joinToString("") { "%02x".format(it) }
                    .take(32)

                val tokenData = mapOf(
                    "token" to token.trim(),
                    "platform" to "ANDROID",
                    "deviceModel" to android.os.Build.MODEL,
                    "appType" to "RIDER",
                    "lastUpdated" to com.google.firebase.firestore.FieldValue.serverTimestamp()
                )
                firestore.collection("users").document(uid)
                    .collection("fcm_tokens").document(tokenId)
                    .set(tokenData, com.google.firebase.firestore.SetOptions.merge())
            } catch (e: Exception) {
                Log.e("FCM_TOKEN", "Failed to register FCM token for rider", e)
            }
        }
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)
        
        Log.d("FCM_MSG", "From: ${remoteMessage.from}")

        val title = remoteMessage.notification?.title ?: remoteMessage.data["title"] ?: "KrishiVishal Delivery"
        val message = remoteMessage.notification?.body ?: remoteMessage.data["message"] ?: "New Update"

        showNotification(title, message)
    }

    private fun showNotification(title: String, message: String) {
        val channelId = "delivery_updates"
        val notificationManager = getSystemService(android.content.Context.NOTIFICATION_SERVICE) as android.app.NotificationManager

        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            val channel = android.app.NotificationChannel(
                channelId,
                "Delivery Updates",
                android.app.NotificationManager.IMPORTANCE_HIGH
            )
            notificationManager.createNotificationChannel(channel)
        }

        val intent = android.content.Intent(this, com.company.krishivishaldelivery.MainActivity::class.java).apply {
            flags = android.content.Intent.FLAG_ACTIVITY_NEW_TASK or android.content.Intent.FLAG_ACTIVITY_CLEAR_TASK
        }
        val pendingIntent = android.app.PendingIntent.getActivity(
            this, 0, intent,
            android.app.PendingIntent.FLAG_IMMUTABLE
        )

        val notification = androidx.core.app.NotificationCompat.Builder(this, channelId)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(message)
            .setPriority(androidx.core.app.NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        notificationManager.notify(System.currentTimeMillis().toInt(), notification)
    }
}
