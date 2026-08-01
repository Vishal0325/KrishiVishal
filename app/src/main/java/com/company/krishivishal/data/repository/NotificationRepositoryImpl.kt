package com.company.krishivishal.data.repository

import com.company.krishivishal.data.local.NotificationDao
import com.company.krishivishal.core.model.Notification
import com.company.krishivishal.di.IoDispatcher
import com.google.firebase.firestore.FirebaseFirestore
import com.google.firebase.firestore.SetOptions
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.tasks.await
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class NotificationRepositoryImpl @Inject constructor(
    private val firestore: FirebaseFirestore,
    private val notificationDao: NotificationDao,
    @IoDispatcher private val ioDispatcher: CoroutineDispatcher
) : NotificationRepository {

    override suspend fun updateFcmToken(userId: String, token: String): Result<Unit> = withContext(ioDispatcher) {
        try {
            val userRef = firestore.collection("users").document(userId)
            val data = mapOf("fcmToken" to token)
            userRef.set(data, SetOptions.merge()).await()
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    override suspend fun sendNotification(userId: String, title: String, message: String, type: String): Result<Unit> = withContext(ioDispatcher) {
        try {
            val notification = mapOf(
                "title" to title,
                "message" to message,
                "type" to type,
                "timestamp" to com.google.firebase.Timestamp.now(),
                "read" to false
            )
            firestore.collection("users").document(userId).collection("notifications").add(notification).await()
            Result.success(Unit)
        } catch (e: Exception) {
            Result.failure(e)
        }
    }

    override fun getAllNotifications(): Flow<List<Notification>> = notificationDao.getAllNotifications()

    override fun getUnreadCount(): Flow<Int> = notificationDao.getUnreadCount()

    override suspend fun markAsRead(id: String) {
        notificationDao.markAsRead(id)
    }

    override suspend fun markAllAsRead() {
        notificationDao.markAllAsRead()
    }

    override suspend fun saveNotification(notification: Notification) {
        notificationDao.insert(notification)
    }
}
