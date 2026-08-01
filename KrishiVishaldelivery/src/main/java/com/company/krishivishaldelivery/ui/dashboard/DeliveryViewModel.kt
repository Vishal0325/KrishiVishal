package com.company.krishivishaldelivery.ui.dashboard

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.company.krishivishal.core.model.*
import com.company.krishivishal.core.model.AppConfig
import com.company.krishivishaldelivery.data.model.*
import com.company.krishivishaldelivery.data.repository.DeliveryRepository
import com.company.krishivishaldelivery.data.repository.ConfigRepository
import com.company.krishivishal.core.util.Resource
import com.company.krishivishaldelivery.utils.ConnectivityObserver
import com.google.firebase.auth.FirebaseAuth
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.coroutines.tasks.await
import javax.inject.Inject

@HiltViewModel
class DeliveryViewModel @Inject constructor(
    private val auth: FirebaseAuth,
    private val repository: DeliveryRepository,
    private val configRepository: ConfigRepository,
    private val connectivityObserver: ConnectivityObserver
) : ViewModel() {

    private val _orders = MutableStateFlow<Resource<List<Order>>>(Resource.Loading())
    val orders: StateFlow<Resource<List<Order>>> = _orders.asStateFlow()

    private val _appConfig = MutableStateFlow<Resource<AppConfig>>(Resource.Loading())
    val appConfig: StateFlow<Resource<AppConfig>> = _appConfig.asStateFlow()

    private val _payouts = MutableStateFlow<Resource<List<Map<String, Any>>>>(Resource.Loading())
    val payouts: StateFlow<Resource<List<Map<String, Any>>>> = _payouts.asStateFlow()

    val isConnected = connectivityObserver.isConnected.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), true)

    private val _incentiveSlabs = MutableStateFlow<List<IncentiveSlab>>(emptyList())
    
    val currentTrip = orders.map { res ->
        if (res is Resource.Success) {
            val tripOrders = res.data?.filter { it.status != "DELIVERED" } ?: emptyList()
            if (tripOrders.isNotEmpty()) optimizeRoute(tripOrders) else null
        } else null
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    val incentiveProgress = combine(orders, _incentiveSlabs) { res, slabs ->
        if (res is Resource.Success) {
            val ordersList = res.data ?: emptyList()
            val count = ordersList.count { it.status == "DELIVERED" }
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

    private val _riderProfile = MutableStateFlow<Resource<Rider?>>(Resource.Loading())
    val riderProfile: StateFlow<Resource<Rider?>> = _riderProfile.asStateFlow()

    private val _locationAction = MutableSharedFlow<LocationAction>()
    val locationAction = _locationAction.asSharedFlow()

    private val _deleteAccountResult = MutableSharedFlow<Resource<Unit>>()
    val deleteAccountResult = _deleteAccountResult.asSharedFlow()

    private val currentRiderId: String get() = auth.currentUser?.uid ?: "test_rider_001"

    init {
        val riderId = currentRiderId
        loadIncentives()
        syncData(riderId)
        loadOrders(riderId)
        loadRiderProfile(riderId)
        loadConfig()
        loadPayouts(riderId)
    }

    private fun loadPayouts(riderId: String) {
        viewModelScope.launch {
            repository.getRiderPayouts(riderId).collectLatest {
                _payouts.value = it
            }
        }
    }

    private fun loadConfig() {
        viewModelScope.launch {
            configRepository.getConfig().collectLatest {
                _appConfig.value = it
            }
        }
    }

    private fun loadIncentives() {
        viewModelScope.launch {
            _incentiveSlabs.value = repository.getIncentiveSlabs()
        }
    }

    private fun loadRiderProfile(riderId: String) {
        viewModelScope.launch {
            repository.getRiderProfile(riderId)
                .catch { e -> _riderProfile.value = Resource.Error(e.message ?: "Profile error") }
                .collectLatest { _riderProfile.value = Resource.Success(it) }
        }
    }

    fun triggerSOS(lat: Double, lng: Double, orderId: String?) {
        val rider = (riderProfile.value as? Resource.Success)?.data ?: return
        viewModelScope.launch {
            repository.triggerSOS(rider.id, lat, lng, rider.name, orderId)
        }
    }

    fun updateProfile(name: String, bankAccount: String, bankName: String, ifsc: String, vehicleNumber: String, vehicleType: String) {
        if (!validateVehicleNumber(vehicleNumber)) return
        viewModelScope.launch {
            repository.updateRiderProfile(currentRiderId, mapOf(
                "name" to name, "bankAccount" to bankAccount, "bankName" to bankName, 
                "ifscCode" to ifsc, "vehicleNumber" to vehicleNumber, "vehicleType" to vehicleType
            ))
        }
    }

    fun deleteAccount() {
        viewModelScope.launch {
            try {
                _deleteAccountResult.emit(Resource.Loading())
                val riderId = currentRiderId
                val firebaseUser = auth.currentUser ?: throw Exception("User not logged in")
                
                // 1. Delete rider from Firestore
                repository.deleteRiderAccount(riderId)
                
                // 2. Delete from Auth
                firebaseUser.delete().await()
                
                // 3. Success
                _deleteAccountResult.emit(Resource.Success(Unit))
            } catch (e: Exception) {
                _deleteAccountResult.emit(Resource.Error(e.message ?: "Deletion failed"))
            }
        }
    }

    private fun validateVehicleNumber(number: String): Boolean {
        val regex = "^[A-Z]{2}[0-9]{1,2}[A-Z]{1,3}[0-9]{4}$".toRegex()
        return regex.matches(number)
    }

    private fun optimizeRoute(orders: List<Order>) = orders.sortedBy { it.targetLat + it.targetLng }

    private fun syncData(riderId: String) = viewModelScope.launch { repository.syncAssignedOrders(riderId) }

    private fun loadOrders(riderId: String) {
        viewModelScope.launch {
            repository.getAssignedOrders(riderId)
                .catch { _orders.value = Resource.Error(it.message ?: "Error") }
                .collectLatest { _orders.value = Resource.Success(it) }
        }
    }

    fun updateStatus(orderId: String, nextStatus: String) {
        viewModelScope.launch {
            repository.updateOrderStatus(orderId, nextStatus)
            if (nextStatus == "OUT_FOR_DELIVERY") _locationAction.emit(LocationAction.Start(orderId))
            else if (nextStatus == "DELIVERED") _locationAction.emit(LocationAction.Stop)
        }
    }

    fun pickupScannedOrder(orderId: String, onSuccess: (Order) -> Unit, onError: (String) -> Unit) {
        viewModelScope.launch {
            try {
                repository.pickupOrderByScan(orderId, currentRiderId)?.let(onSuccess) ?: onError("Not found")
            } catch (e: Exception) { onError(e.message ?: "Failed") }
        }
    }

    suspend fun uploadProofOfDelivery(orderId: String, photo: ByteArray?, signature: ByteArray?) =
        repository.uploadProofOfDelivery(orderId, photo, signature)
}

sealed class LocationAction {
    data class Start(val orderId: String) : LocationAction()
    object Stop : LocationAction()
}
