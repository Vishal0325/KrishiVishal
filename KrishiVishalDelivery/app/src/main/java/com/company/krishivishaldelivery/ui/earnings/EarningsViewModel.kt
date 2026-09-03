package com.company.krishivishaldelivery.ui.earnings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.company.krishivishal.core.model.AppConfig
import com.company.krishivishal.core.model.Order
import com.company.krishivishal.core.util.Resource
import com.company.krishivishaldelivery.data.model.IncentiveSlab
import com.company.krishivishaldelivery.data.repository.ConfigRepository
import com.company.krishivishaldelivery.data.repository.OrderRepository
import com.company.krishivishaldelivery.data.repository.RiderRepository
import com.google.firebase.auth.FirebaseAuth
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class EarningsViewModel @Inject constructor(
    private val auth: FirebaseAuth,
    private val orderRepository: OrderRepository,
    private val riderRepository: RiderRepository,
    private val configRepository: ConfigRepository
) : ViewModel() {

    private val _orders = MutableStateFlow<Resource<List<Order>>>(Resource.Loading())
    val orders: StateFlow<Resource<List<Order>>> = _orders.asStateFlow()

    private val _payouts = MutableStateFlow<Resource<List<Map<String, Any>>>>(Resource.Loading())
    val payouts: StateFlow<Resource<List<Map<String, Any>>>> = _payouts.asStateFlow()

    private val _appConfig = MutableStateFlow<Resource<AppConfig>>(Resource.Loading())
    val appConfig: StateFlow<Resource<AppConfig>> = _appConfig.asStateFlow()

    private val _incentiveSlabs = MutableStateFlow<List<IncentiveSlab>>(emptyList())
    val incentiveSlabs: StateFlow<List<IncentiveSlab>> = _incentiveSlabs.asStateFlow()

    private val currentRiderId: String get() = auth.currentUser?.uid ?: ""

    init {
        loadData()
    }

    private fun loadData() {
        val riderId = currentRiderId
        if (riderId.isNotEmpty()) {
            loadOrders(riderId)
            loadPayouts(riderId)
            loadConfig()
            loadIncentives()
        }
    }

    private fun loadIncentives() {
        viewModelScope.launch {
            _incentiveSlabs.value = riderRepository.getIncentiveSlabs()
        }
    }

    private fun loadOrders(riderId: String) {
        viewModelScope.launch {
            orderRepository.getAssignedOrders()
                .catch { _orders.value = Resource.Error(it.message ?: "Error") }
                .collectLatest { _orders.value = Resource.Success(it) }
        }
    }

    private fun loadPayouts(riderId: String) {
        viewModelScope.launch {
            riderRepository.getRiderPayouts(riderId)
                .catch { _payouts.value = Resource.Error(it.message ?: "Payout error") }
                .collectLatest { _payouts.value = it }
        }
    }

    private fun loadConfig() {
        viewModelScope.launch {
            configRepository.getConfig()
                .catch { _appConfig.value = Resource.Error(it.message ?: "Config error") }
                .collectLatest { _appConfig.value = it }
        }
    }
}
