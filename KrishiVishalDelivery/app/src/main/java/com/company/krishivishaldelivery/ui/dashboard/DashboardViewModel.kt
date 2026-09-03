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
import com.company.krishivishaldelivery.data.model.OptimizedStop
import com.company.krishivishaldelivery.data.model.OptimizedTrip
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
import kotlin.math.*

@HiltViewModel
class DashboardViewModel @Inject constructor(
    private val auth: FirebaseAuth,
    private val orderRepository: OrderRepository,
    private val riderRepository: RiderRepository,
    private val configRepository: ConfigRepository,
    connectivityObserver: ConnectivityObserver
) : ViewModel() {

    companion object {
        const val COD_VAULT_LIMIT = 15000.0
    }

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

    // COD Vault Limit State
    val codCashInHand: StateFlow<Double> = orders.map { res ->
        if (res is Resource.Success) {
            res.data?.filter { it.isCOD && it.status == OrderStatus.DELIVERED.name && !it.isCashDeposited }
                ?.sumOf { it.codAmount } ?: 0.0
        } else 0.0
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), 0.0)

    val isCodVaultLimitExceeded: StateFlow<Boolean> = codCashInHand.map { it >= COD_VAULT_LIMIT }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), false)

    // Shortest Route Optimization (Travelling Salesperson Nearest-Neighbor Heuristic)
    val optimizedTrip: StateFlow<OptimizedTrip?> = combine(orders, _riderProfile) { res, profileRes ->
        if (res is Resource.Success) {
            val undelivered = res.data?.filter { it.status != OrderStatus.DELIVERED.name } ?: emptyList()
            if (undelivered.isNotEmpty()) {
                val riderLat = (profileRes as? Resource.Success)?.data?.currentLat ?: 0.0
                val riderLng = (profileRes as? Resource.Success)?.data?.currentLng ?: 0.0
                computeShortestRoute(undelivered, riderLat, riderLng)
            } else null
        } else null
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    val currentTrip: StateFlow<List<Order>?> = optimizedTrip.map { trip ->
        trip?.stops?.map { it.order }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    // Live Rider Incentive & Earnings Equation: [Delivered Count] orders = ₹[Earnings] + ₹[Bonus]
    val incentiveProgress = combine(orders, _incentiveSlabs, _appConfig) { res, slabs, configRes ->
        if (res is Resource.Success) {
            val ordersList = res.data ?: emptyList()
            val count = ordersList.count { it.status == OrderStatus.DELIVERED.name }
            val next = slabs.firstOrNull { it.ordersRequired > count }
            val prev = slabs.lastOrNull { it.ordersRequired <= count }
            val commissionPerOrder = (configRes as? Resource.Success)?.data?.commissionPerOrder ?: 50.0
            val earnedCommission = count * commissionPerOrder
            val earnedBonus = prev?.bonusAmount ?: 0.0
            IncentiveProgress(
                currentCount = count,
                nextSlab = next,
                ordersRemaining = (next?.ordersRequired ?: 0) - count,
                progress = if (next != null) count.toFloat() / next.ordersRequired else 1f,
                slabAchieved = prev != null,
                earnedBonus = earnedBonus,
                earnedCommission = earnedCommission,
                totalEarningsToday = earnedCommission + earnedBonus
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

    fun markCashAsDeposited(onComplete: (Boolean) -> Unit = {}) {
        val riderId = currentRiderId
        if (riderId.isNotEmpty()) {
            viewModelScope.launch {
                val success = orderRepository.markCashAsDeposited(riderId)
                if (success) {
                    syncData(riderId)
                }
                onComplete(success)
            }
        } else {
            onComplete(false)
        }
    }

    /**
     * Solves Shortest Route (Travelling Salesperson Problem) using Greedy Nearest-Neighbor
     * Calculates the 1-2-3-4 delivery sequence minimizing travel distance, petrol and time.
     */
    private fun computeShortestRoute(orders: List<Order>, startLat: Double, startLng: Double): OptimizedTrip {
        if (orders.isEmpty()) return OptimizedTrip()

        // If rider location is unknown, start from first order with valid coordinates
        val hasValidStart = startLat != 0.0 && startLng != 0.0
        var currLat = if (hasValidStart) startLat else (orders.firstOrNull { it.targetLat != 0.0 }?.targetLat ?: 0.0)
        var currLng = if (hasValidStart) startLng else (orders.firstOrNull { it.targetLng != 0.0 }?.targetLng ?: 0.0)

        val unvisited = orders.toMutableList()
        val stops = mutableListOf<OptimizedStop>()
        var totalDistKm = 0.0

        var stopIndex = 1
        while (unvisited.isNotEmpty()) {
            // Find the closest unvisited stop to current position
            var nearestOrder: Order? = null
            var shortestDist = Double.MAX_VALUE

            for (order in unvisited) {
                val dist = if (currLat != 0.0 && currLng != 0.0 && order.targetLat != 0.0 && order.targetLng != 0.0) {
                    haversineDistanceKm(currLat, currLng, order.targetLat, order.targetLng)
                } else {
                    // Fallback to order creation order when coordinates missing
                    1.0
                }

                if (dist < shortestDist) {
                    shortestDist = dist
                    nearestOrder = order
                }
            }

            val selectedOrder = nearestOrder ?: unvisited.first()
            val legDist = if (shortestDist == Double.MAX_VALUE) 0.0 else shortestDist
            totalDistKm += legDist

            stops.add(
                OptimizedStop(
                    stopNumber = stopIndex++,
                    order = selectedOrder,
                    distanceKmFromPrev = legDist
                )
            )

            if (selectedOrder.targetLat != 0.0 && selectedOrder.targetLng != 0.0) {
                currLat = selectedOrder.targetLat
                currLng = selectedOrder.targetLng
            }
            unvisited.remove(selectedOrder)
        }

        // Typical urban/rural bike: ~35 km/liter petrol. Route optimization saves ~20% detours.
        val petrolSavedLiters = (totalDistKm * 0.20) / 35.0
        val estimatedTimeMin = (totalDistKm * 2.5).toInt() + (stops.size * 8)

        return OptimizedTrip(
            stops = stops,
            totalDistanceKm = (totalDistKm * 10).roundToInt() / 10.0,
            estimatedPetrolSavedLiters = (petrolSavedLiters * 100).roundToInt() / 100.0,
            estimatedTimeMinutes = estimatedTimeMin
        )
    }

    private fun haversineDistanceKm(lat1: Double, lon1: Double, lat2: Double, lon2: Double): Double {
        val r = 6371.0 // Earth's radius in kilometers
        val dLat = Math.toRadians(lat2 - lat1)
        val dLon = Math.toRadians(lon2 - lon1)
        val a = sin(dLat / 2).pow(2) +
                cos(Math.toRadians(lat1)) * cos(Math.toRadians(lat2)) *
                sin(dLon / 2).pow(2)
        val c = 2 * atan2(sqrt(a), sqrt(1 - a))
        return r * c
    }

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
