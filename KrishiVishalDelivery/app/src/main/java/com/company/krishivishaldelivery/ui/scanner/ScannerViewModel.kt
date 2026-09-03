package com.company.krishivishaldelivery.ui.scanner

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.company.krishivishal.core.model.Order
import com.company.krishivishal.core.model.OrderStatus
import com.company.krishivishaldelivery.data.repository.OrderRepository
import com.company.krishivishaldelivery.ui.dashboard.DashboardViewModel.Companion.COD_VAULT_LIMIT
import com.google.firebase.auth.FirebaseAuth
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
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
                // Check Cash Limit Security (COD Vault Limit: ₹15,000)
                val currentOrders = orderRepository.getAssignedOrders().first()
                val currentCashInHand = currentOrders
                    .filter { it.isCOD && it.status == OrderStatus.DELIVERED.name && !it.isCashDeposited }
                    .sumOf { it.codAmount }

                val previewOrder = _scannedOrderPreview.value
                val isOrderCOD = previewOrder?.isCOD == true || (previewOrder?.codAmount ?: 0.0) > 0
                val isHighValue = (previewOrder?.totalAmount ?: 0.0) >= 500.0

                if (currentCashInHand >= COD_VAULT_LIMIT && (isOrderCOD || isHighValue)) {
                    onError("⚠️ कैश लिमिट सुरक्षा (COD Vault Limit)!\nआपके पास ₹${currentCashInHand.toInt()} नकद जमा है (सीमा ₹15,000)। नया ऑर्डर लेने के लिए पहले वेयरहाउस में कैश जमा करें।")
                    return@launch
                }

                val order = orderRepository.acceptOrderByScan(orderId, currentRiderId)
                onSuccess(order)
            } catch (e: Exception) {
                onError(e.message ?: "Failed to accept order")
            }
        }
    }
}
