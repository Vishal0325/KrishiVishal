package com.company.krishivishal.data.repository

import com.company.krishivishal.model.OrderTrackingState
import com.company.krishivishal.model.StatusStep
import com.google.firebase.firestore.FirebaseFirestore
import kotlinx.coroutines.channels.awaitClose
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.callbackFlow
import javax.inject.Inject

interface OrderTrackingRepository {
    fun trackOrder(orderId: String): Flow<OrderTrackingState>
}

class OrderTrackingRepositoryImpl @Inject constructor(
    private val firestore: FirebaseFirestore
) : OrderTrackingRepository {

    override fun trackOrder(orderId: String): Flow<OrderTrackingState> = callbackFlow {
        val subscription = firestore.collection("orders").document(orderId)
            .addSnapshotListener { snapshot, error ->
                if (error != null) {
                    trySend(OrderTrackingState(error = error.message, isLoading = false))
                    return@addSnapshotListener
                }

                if (snapshot != null && snapshot.exists()) {
                    val historyList = snapshot.get("statusHistory") as? List<Map<String, Any>>
                    val statusHistory = historyList?.map {
                        StatusStep(
                            status = it["status"] as String,
                            timestamp = it["timestamp"] as com.google.firebase.Timestamp
                        )
                    } ?: emptyList()

                    trySend(OrderTrackingState(
                        status = snapshot.getString("status") ?: "PLACED",
                        statusHistory = statusHistory,
                        riderLocation = snapshot.getGeoPoint("riderLocation"),
                        estimatedDeliveryTime = snapshot.getTimestamp("estimatedDeliveryTime"),
                        isLoading = false
                    ))
                }
            }
        awaitClose { subscription.remove() }
    }
}
