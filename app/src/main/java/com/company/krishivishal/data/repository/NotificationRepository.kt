package com.company.krishivishal.data.repository

import com.company.krishivishal.core.model.Notification
import kotlinx.coroutines.flow.Flow

interface NotificationRepository {
    suspend fun updateFcmToken(userId: String, token: String): Result<Unit>
    suspend fun sendNotification(userId: String, title: String, message: String, type: String): Result<Unit>
    
    // Local DB methods
    fun getAllNotifications(): Flow<List<Notification>>
    fun getUnreadCount(): Flow<Int>
    suspend fun markAsRead(id: String)
    suspend fun markAllAsRead()
    suspend fun saveNotification(notification: Notification)
}
