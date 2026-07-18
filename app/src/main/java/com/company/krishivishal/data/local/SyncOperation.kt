package com.company.krishivishal.data.local

import androidx.room.Entity
import androidx.room.PrimaryKey
import java.util.UUID

/**
 * Represents a pending operation to sync with remote (Firestore)
 * When offline, operations are queued and synced when connection is restored
 */
@Entity(tableName = "sync_operations")
data class SyncOperation(
    @PrimaryKey
    val id: String = UUID.randomUUID().toString(),
    val operationType: String, // ADD_TO_CART, UPDATE_CART, REMOVE_CART, UPDATE_ORDER, etc.
    val entityType: String,    // cart_item, order, product, etc.
    val entityId: String,
    val userId: String,
    val payload: String,       // JSON string of the data
    val createdAt: Long = System.currentTimeMillis(),
    val attemptCount: Int = 0,
    val lastAttemptAt: Long? = null,
    val isSynced: Boolean = false
)
