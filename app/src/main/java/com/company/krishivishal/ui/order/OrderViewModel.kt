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
import com.company.krishivishal.data.repository.OrderRepository
import com.company.krishivishal.core.util.Resource
import com.company.krishivishal.analytics.AnalyticsTracker
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import timber.log.Timber
import javax.inject.Inject

@HiltViewModel
class OrderViewModel @Inject constructor(
    private val getOrdersUseCase: GetOrdersUseCase,
    private val cancelOrderUseCase: CancelOrderUseCase,
    private val getCurrentUserUseCase: GetCurrentUserUseCase,
    private val returnRepository: ReturnRepository,
    private val orderRepository: OrderRepository,
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
                    is Resource.Success -> {
                        val rawOrders = resource.data ?: emptyList()
                        _uiState.update { 
                            it.copy(isLoading = false, orders = rawOrders, error = null) 
                        }
                        // Enrich orders with original product images if any imageUrl is blank
                        enrichOrdersWithProductImages(rawOrders)
                    }
                    is Resource.Error -> _uiState.update { 
                        it.copy(isLoading = false, error = resource.message) 
                    }
                    else -> {}
                }
            }
        }
    }

    private fun enrichOrdersWithProductImages(orders: List<Order>) {
        if (orders.isEmpty()) return
        val missingProductIds = orders.flatMap { it.items }
            .filter { it.imageUrl.isBlank() && it.productId.isNotBlank() }
            .map { it.productId }
            .toSet()

        if (missingProductIds.isEmpty()) return

        viewModelScope.launch {
            val productImageMap = mutableMapOf<String, String>()
            for (productId in missingProductIds) {
                try {
                    val doc = firestore.collection("products").document(productId).get().await()
                    if (doc.exists()) {
                        val data = doc.data ?: emptyMap()
                        val url = (data["imageUrl"] ?: data["image"] ?: data["thumb"] ?: "").toString().trim()
                        val imagesList = (data["images"] as? List<*>)?.mapNotNull { it?.toString() }
                            ?: (data["imageUrls"] as? List<*>)?.mapNotNull { it?.toString() }
                            ?: emptyList()
                        val finalUrl = if (url.isNotBlank() && url != "null") url else (imagesList.firstOrNull { it.isNotBlank() && it != "null" } ?: "")
                        if (finalUrl.isNotBlank()) {
                            productImageMap[productId] = finalUrl
                        }
                    }
                } catch (e: Exception) {
                    Timber.w(e, "Failed to fetch original product image for $productId")
                }
            }

            if (productImageMap.isNotEmpty()) {
                val updatedOrders = _uiState.value.orders.map { order ->
                    val updatedItems = order.items.map { item ->
                        if (item.imageUrl.isBlank() && productImageMap.containsKey(item.productId)) {
                            item.copy(imageUrl = productImageMap[item.productId]!!)
                        } else {
                            item
                        }
                    }
                    order.copy(items = updatedItems)
                }
                _uiState.update { it.copy(orders = updatedOrders) }
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
            orderRepository.updateOrderStatus(orderId, orderStatus).collectLatest { resource ->
                if (resource is Resource.Success<*>) {
                    loadOrders()
                }
            }
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
                    loadOrders()
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
