package com.company.krishivishaldelivery.ui.tracking

import androidx.lifecycle.ViewModel
import com.google.firebase.Timestamp
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestore
import dagger.hilt.android.lifecycle.HiltViewModel
import javax.inject.Inject

@HiltViewModel
class RiderOrderViewModel @Inject constructor(
    private val firestore: FirebaseFirestore
) : ViewModel() {

    fun updateOrderStatus(orderId: String, newStatus: String) {
        val historyEntry = mapOf(
            "status" to newStatus,
            "timestamp" to Timestamp.now()
        )

        firestore.collection("orders").document(orderId)
            .update(
                "status", newStatus,
                "statusHistory", FieldValue.arrayUnion(historyEntry),
                "updatedAt", FieldValue.serverTimestamp()
            )
    }
}
