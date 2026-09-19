package com.company.krishivishaldelivery.service

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import com.company.krishivishaldelivery.MainActivity
import com.google.firebase.auth.FirebaseAuth
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
    lateinit var auth: FirebaseAuth

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
                    "deviceModel" to Build.MODEL,
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
        Log.d("FCM_DATA", "Data payload: ${remoteMessage.data}")

        val action = remoteMessage.data["action"]

        if (action == "NEW_JOB") {
            // New Job Alert with Full-Screen Intent!
            showJobAlertNotification(remoteMessage.data)
        } else {
            // Normal Notification
            val title = remoteMessage.notification?.title ?: remoteMessage.data["title"] ?: "KrishiVishal Delivery"
            val message = remoteMessage.notification?.body ?: remoteMessage.data["message"] ?: "New Update"
            showNotification(title, message)
        }
    }

    private fun showJobAlertNotification(data: Map<String, String>) {
        val channelId = "urgent_job_alerts"
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "Urgent Job Alerts",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Used to wake up screen for new job alerts"
            }
            notificationManager.createNotificationChannel(channel)
        }

        // Extract Data Payload
        val serviceName = data["serviceName"] ?: "New Service Job"
        val location = data["location"] ?: "Farm Plot"
        val area = data["area"] ?: "Unknown"
        val earnings = data["earnings"] ?: "0.0"

        // Create DeepLink URI for Compose Navigation
        val deepLinkUri = Uri.parse(
            "krishivishal://job_alert/${Uri.encode(serviceName)}?location=${Uri.encode(location)}&area=${Uri.encode(area)}&earnings=${Uri.encode(earnings)}"
        )

        val intent = Intent(Intent.ACTION_VIEW, deepLinkUri, this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }

        // Must use FLAG_UPDATE_CURRENT for deep link extras
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Build High-Priority Notification with Full-Screen Intent
        val notification = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("New Job: $serviceName")
            .setContentText("Tap to view details or wait for screen to wake up.")
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL) // Important for waking up screen
            .setAutoCancel(true)
            .setFullScreenIntent(pendingIntent, true) // WAKES UP THE SCREEN!
            .build()

        notificationManager.notify(System.currentTimeMillis().toInt(), notification)
    }

    private fun showNotification(title: String, message: String) {
        val channelId = "delivery_updates"
        val notificationManager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                channelId,
                "Delivery Updates",
                NotificationManager.IMPORTANCE_HIGH
            )
            notificationManager.createNotificationChannel(channel)
        }

        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
        }
        val pendingIntent = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(message)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        notificationManager.notify(System.currentTimeMillis().toInt(), notification)
    }
}
