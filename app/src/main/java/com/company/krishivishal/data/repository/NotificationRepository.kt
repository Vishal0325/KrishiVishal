package com.company.krishivishal.data.repository

import kotlinx.coroutines.flow.Flow

interface NotificationRepository {
    suspend fun updateFcmToken(userId: String, token: String): Result<Unit>
    suspend fun getSavedToken(): Flow<String?>
    suspend fun sendNotification(userId: String, title: String, message: String, type: String): Result<Unit>
}
