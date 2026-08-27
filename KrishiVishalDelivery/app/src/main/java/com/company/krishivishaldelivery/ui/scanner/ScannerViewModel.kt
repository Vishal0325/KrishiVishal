package com.company.krishivishaldelivery.ui.scanner

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.company.krishivishal.core.model.Order
import com.company.krishivishaldelivery.data.repository.OrderRepository
import com.google.firebase.auth.FirebaseAuth
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ScannerViewModel @Inject constructor(
    private val auth: FirebaseAuth,
    private val orderRepository: OrderRepository
) : ViewModel() {

    private val _scannedOrderPreview = MutableStateFlow<Order?>(null)
    val scannedOrderPreview: StateFlow<Order?> = _scannedOrderPreview.asStateFlow()

    private val currentRiderId: String get() = auth.currentUser?.uid ?: ""

    fun fetchOrderPreview(orderId: String, onError: (String) -> Unit) {
        viewModelScope.launch {
            try {
                val order = orderRepository.fetchOrderForPreview(orderId)
                if (order != null) {
                    _scannedOrderPreview.value = order
                } else {
                    onError("Order not found")
                }
            } catch (e: Exception) {
                onError(e.message ?: "Failed to fetch order details")
            }
        }
    }

    fun clearOrderPreview() {
        _scannedOrderPreview.value = null
    }

    fun acceptScannedOrder(orderId: String, onSuccess: (Order) -> Unit, onError: (String) -> Unit) {
        viewModelScope.launch {
            try {
                val order = orderRepository.acceptOrderByScan(orderId, currentRiderId)
                onSuccess(order)
            } catch (e: Exception) {
                onError(e.message ?: "Failed to accept order")
            }
        }
    }
}
