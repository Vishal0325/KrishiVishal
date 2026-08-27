package com.company.krishivishaldelivery.ui.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.company.krishivishal.core.model.AppConfig
import com.company.krishivishal.core.model.Order
import com.company.krishivishal.core.model.OrderStatus
import com.company.krishivishal.core.model.ReturnRequest
import com.company.krishivishal.core.util.Resource
import com.company.krishivishaldelivery.data.model.IncentiveProgress
import com.company.krishivishaldelivery.data.model.IncentiveSlab
import com.company.krishivishaldelivery.data.model.Rider
import com.company.krishivishaldelivery.data.repository.ConfigRepository
import com.company.krishivishaldelivery.data.repository.OrderRepository
import com.company.krishivishaldelivery.data.repository.RiderRepository
import com.company.krishivishaldelivery.utils.ConnectivityObserver
import com.google.firebase.auth.FirebaseAuth
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class DashboardViewModel @Inject constructor(
    private val auth: FirebaseAuth,
    private val orderRepository: OrderRepository,
    private val riderRepository: RiderRepository,
    private val configRepository: ConfigRepository,
    private val connectivityObserver: ConnectivityObserver
) : ViewModel() {

    private val _orders = MutableStateFlow<Resource<List<Order>>>(Resource.Loading())
    val orders: StateFlow<Resource<List<Order>>> = _orders.asStateFlow()

    private val _returns = MutableStateFlow<Resource<List<ReturnRequest>>>(Resource.Loading())
    val returns: StateFlow<Resource<List<ReturnRequest>>> = _returns.asStateFlow()

    private val _appConfig = MutableStateFlow<Resource<AppConfig>>(Resource.Loading())
    val appConfig: StateFlow<Resource<AppConfig>> = _appConfig.asStateFlow()

    private val _riderProfile = MutableStateFlow<Resource<Rider?>>(Resource.Loading())
    val riderProfile: StateFlow<Resource<Rider?>> = _riderProfile.asStateFlow()

    private val _incentiveSlabs = MutableStateFlow<List<IncentiveSlab>>(emptyList())

    val isConnected = connectivityObserver.isConnected.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), true)

    val currentTrip = orders.map { res ->
        if (res is Resource.Success) {
            val tripOrders = res.data?.filter { it.status != OrderStatus.DELIVERED.name } ?: emptyList()
            if (tripOrders.isNotEmpty()) optimizeRoute(tripOrders) else null
        } else null
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    val incentiveProgress = combine(orders, _incentiveSlabs) { res, slabs ->
        if (res is Resource.Success) {
            val ordersList = res.data ?: emptyList()
            val count = ordersList.count { it.status == OrderStatus.DELIVERED.name }
            val next = slabs.firstOrNull { it.ordersRequired > count }
            val prev = slabs.lastOrNull { it.ordersRequired <= count }
            IncentiveProgress(
                currentCount = count,
                nextSlab = next,
                ordersRemaining = (next?.ordersRequired ?: 0) - count,
                progress = if (next != null) count.toFloat() / next.ordersRequired else 1f,
                slabAchieved = prev != null
            )
        } else IncentiveProgress()
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), IncentiveProgress())

    private val _locationAction = MutableSharedFlow<LocationAction>()
    val locationAction = _locationAction.asSharedFlow()

    private val currentRiderId: String get() = auth.currentUser?.uid ?: ""

    init {
        loadData()
    }

    private fun loadData() {
        val riderId = currentRiderId
        if (riderId.isNotEmpty()) {
            syncData(riderId)
            loadOrders(riderId)
            loadReturns(riderId)
            loadConfig()
            loadIncentives()
            loadRiderProfile(riderId)
        }
    }

    private fun loadRiderProfile(riderId: String) {
        viewModelScope.launch {
            riderRepository.getRiderProfile(riderId)
                .catch { e -> _riderProfile.value = Resource.Error(e.message ?: "Profile error") }
                .collectLatest { _riderProfile.value = Resource.Success(it) }
        }
    }

    fun triggerSOS(lat: Double, lng: Double, orderId: String?) {
        val rider = (riderProfile.value as? Resource.Success)?.data ?: return
        viewModelScope.launch {
            riderRepository.triggerSOS(rider.id, lat, lng, rider.name, orderId)
        }
    }

    private fun loadConfig() {
        viewModelScope.launch {
            configRepository.getConfig().collectLatest { _appConfig.value = it }
        }
    }

    private fun loadIncentives() {
        viewModelScope.launch {
            _incentiveSlabs.value = riderRepository.getIncentiveSlabs()
        }
    }

    private fun optimizeRoute(orders: List<Order>) = orders.sortedBy { it.targetLat + it.targetLng }

    fun syncData(riderId: String) = viewModelScope.launch { orderRepository.syncAssignedOrders(riderId) }

    private fun loadOrders(riderId: String) {
        viewModelScope.launch {
            orderRepository.getAssignedOrders()
                .catch { _orders.value = Resource.Error(it.message ?: "Error") }
                .collectLatest { _orders.value = Resource.Success(it) }
        }
    }

    private fun loadReturns(riderId: String) {
        viewModelScope.launch {
            orderRepository.getAssignedReturns(riderId)
                .catch { _returns.value = Resource.Error(it.message ?: "Error") }
                .collectLatest { _returns.value = Resource.Success(it) }
        }
    }

    fun updateStatus(orderId: String, nextStatus: String) {
        viewModelScope.launch {
            orderRepository.updateOrderStatus(orderId, nextStatus)
            when (nextStatus) {
                OrderStatus.PICKED_UP.name -> _locationAction.emit(LocationAction.Start(orderId))
                OrderStatus.OUT_FOR_DELIVERY.name -> _locationAction.emit(LocationAction.InTransit(orderId))
                OrderStatus.DELIVERED.name -> _locationAction.emit(LocationAction.Stop)
                else -> {}
            }
        }
    }

    fun updateReturnStatus(returnId: String, nextStatus: String) {
        viewModelScope.launch {
            orderRepository.updateReturnStatus(returnId, nextStatus)
        }
    }

    suspend fun verifyDelivery(orderId: String, otp: String): Resource<Unit> {
        val result = orderRepository.verifyOrderDelivery(orderId, otp)
        if (result is Resource.Success) {
            loadOrders(currentRiderId)
        }
        return result
    }

    suspend fun uploadProofOfDelivery(orderId: String, photo: ByteArray?, signature: ByteArray?) =
        orderRepository.uploadProofOfDelivery(orderId, photo, signature)
}

sealed class LocationAction {
    data class Start(val orderId: String) : LocationAction()
    data class InTransit(val orderId: String) : LocationAction()
    data class AtDelivery(val orderId: String) : LocationAction()
    object Stop : LocationAction()
}
