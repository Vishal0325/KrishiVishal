package com.company.krishivishal.ui.order

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.company.krishivishal.core.model.Order
import com.company.krishivishal.core.model.OrderStatus
import com.company.krishivishal.core.model.ReturnRequest
import com.company.krishivishal.domain.usecase.auth.GetCurrentUserUseCase
import com.company.krishivishal.domain.usecase.order.CancelOrderUseCase
import com.company.krishivishal.domain.usecase.order.GetOrdersUseCase
import com.company.krishivishal.data.repository.ReturnRepository
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.analytics.AnalyticsTracker
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class OrderViewModel @Inject constructor(
    private val getOrdersUseCase: GetOrdersUseCase,
    private val cancelOrderUseCase: CancelOrderUseCase,
    private val getCurrentUserUseCase: GetCurrentUserUseCase,
    private val returnRepository: ReturnRepository,
    private val analyticsTracker: AnalyticsTracker,
    private val firestore: com.google.firebase.firestore.FirebaseFirestore
) : ViewModel() {

    private val _uiState = MutableStateFlow(OrderHistoryUiState())
    val uiState: StateFlow<OrderHistoryUiState> = _uiState.asStateFlow()

    private val _billTemplate = MutableStateFlow("standard")
    val billTemplate: StateFlow<String> = _billTemplate.asStateFlow()

    private val _appConfig = MutableStateFlow(com.company.krishivishal.core.model.AppConfig())
    val appConfig: StateFlow<com.company.krishivishal.core.model.AppConfig> = _appConfig.asStateFlow()

    init {
        loadOrders()
        observeBillTemplate()
        observeAppConfig()
    }

    private fun observeBillTemplate() {
        viewModelScope.launch {
            firestore.collection("settings").document("store_config")
                .addSnapshotListener { snapshot, _ ->
                    val template = snapshot?.getString("activeBillTemplate") ?: "standard"
                    _billTemplate.value = template
                }
        }
    }

    private fun observeAppConfig() {
        viewModelScope.launch {
            firestore.collection("settings").document("config")
                .addSnapshotListener { snapshot, _ ->
                    val config = snapshot?.toObject(com.company.krishivishal.core.model.AppConfig::class.java)
                    if (config != null) {
                        _appConfig.value = config
                    }
                }
        }
    }

    @OptIn(kotlinx.coroutines.ExperimentalCoroutinesApi::class)
    fun loadOrders(status: OrderStatus? = null) {
        viewModelScope.launch {
            getCurrentUserUseCase().flatMapLatest { user ->
                val userId = user?.id ?: "guest_user"
                getOrdersUseCase(userId, status)
            }.collectLatest { resource ->
                when (resource) {
                    is Resource.Loading -> _uiState.update { it.copy(isLoading = true) }
                    is Resource.Success -> _uiState.update { 
                        it.copy(isLoading = false, orders = resource.data ?: emptyList(), error = null) 
                    }
                    is Resource.Error -> _uiState.update { 
                        it.copy(isLoading = false, error = resource.message) 
                    }
                    else -> {}
                }
            }
        }
    }

    fun cancelOrder(orderId: String, reason: String) {
        viewModelScope.launch {
            cancelOrderUseCase(orderId, reason).collect { resource ->
                _uiState.update { it.copy(cancelOrderResource = resource) }
                if (resource is Resource.Success) {
                    analyticsTracker.trackCustomEvent(
                        "order_cancelled",
                        mapOf("order_id" to orderId, "reason" to reason)
                    )
                }
            }
        }
    }

    fun clearCancelState() {
        _uiState.update { it.copy(cancelOrderResource = null) }
    }

    fun updateOrderStatus(orderId: String, status: String) {
        viewModelScope.launch {
            val orderStatus = OrderStatus.fromString(status)
            firestore.collection("orders").document(orderId).update("status", orderStatus.name)
            loadOrders()
        }
    }

    fun requestReturn(order: Order, reason: String = "Customer requested return") {
        viewModelScope.launch {
            _uiState.update { it.copy(returnRequestResource = Resource.Loading()) }

            val request = ReturnRequest(
                orderId = order.id,
                userId = order.userId,
                productId = order.items.firstOrNull()?.productId ?: "general",
                productName = order.items.firstOrNull()?.productName ?: "Ordered Item",
                reason = reason,
                status = "REQUESTED"
            )

            returnRepository.requestReturn(request).collectLatest { resource ->
                _uiState.update { it.copy(returnRequestResource = resource) }
                if (resource is Resource.Success) {
                    // Update local order status to indicate return is initiated
                    updateOrderStatus(order.id, "RETURNED")
                }
            }
        }
    }

    fun clearReturnState() {
        _uiState.update { it.copy(returnRequestResource = null) }
    }
}

data class OrderHistoryUiState(
    val isLoading: Boolean = false,
    val orders: List<Order> = emptyList(),
    val error: String? = null,
    val cancelOrderResource: Resource<Unit>? = null,
    val returnRequestResource: Resource<String>? = null
)
