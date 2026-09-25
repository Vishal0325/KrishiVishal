package com.company.krishivishaldelivery.ui.earnings

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.company.krishivishal.core.model.AppConfig
import com.company.krishivishal.core.model.Order
import com.company.krishivishal.core.util.Resource
import com.company.krishivishaldelivery.data.model.IncentiveSlab
import com.company.krishivishaldelivery.data.model.PayoutRequest
import com.company.krishivishaldelivery.data.model.Rider
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

    private val _payoutRequests = MutableStateFlow<Resource<List<PayoutRequest>>>(Resource.Loading())
    val payoutRequests: StateFlow<Resource<List<PayoutRequest>>> = _payoutRequests.asStateFlow()

    private val _riderProfile = MutableStateFlow<Rider?>(null)
    val riderProfile: StateFlow<Rider?> = _riderProfile.asStateFlow()

    private val _isSubmittingPayout = MutableStateFlow(false)
    val isSubmittingPayout: StateFlow<Boolean> = _isSubmittingPayout.asStateFlow()

    private val _appConfig = MutableStateFlow<Resource<AppConfig>>(Resource.Loading())
    val appConfig: StateFlow<Resource<AppConfig>> = _appConfig.asStateFlow()

    private val _incentiveSlabs = MutableStateFlow<List<IncentiveSlab>>(emptyList())
    val incentiveSlabs: StateFlow<List<IncentiveSlab>> = _incentiveSlabs.asStateFlow()

    private val _returns = MutableStateFlow<Resource<List<com.company.krishivishal.core.model.ReturnRequest>>>(Resource.Loading())
    val returns: StateFlow<Resource<List<com.company.krishivishal.core.model.ReturnRequest>>> = _returns.asStateFlow()

    private val currentRiderId: String get() = auth.currentUser?.uid ?: ""

    init {
        loadData()
    }

    private fun loadData() {
        val riderId = currentRiderId
        if (riderId.isNotEmpty()) {
            loadOrders(riderId)
            loadReturns(riderId)
            loadPayouts(riderId)
            loadPayoutRequests(riderId)
            loadRiderProfile(riderId)
            loadConfig()
            loadIncentives()
        }
    }

    private fun loadRiderProfile(riderId: String) {
        viewModelScope.launch {
            riderRepository.getRiderProfile(riderId)
                .catch { /* ignore */ }
                .collectLatest { _riderProfile.value = it }
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

    private fun loadPayoutRequests(riderId: String) {
        viewModelScope.launch {
            riderRepository.getPayoutRequests(riderId)
                .catch { _payoutRequests.value = Resource.Error(it.message ?: "Payout requests error") }
                .collectLatest { _payoutRequests.value = it }
        }
    }

    private fun loadConfig() {
        viewModelScope.launch {
            configRepository.getConfig()
                .catch { _appConfig.value = Resource.Error(it.message ?: "Config error") }
                .collectLatest { _appConfig.value = it }
        }
    }

    private fun loadReturns(riderId: String) {
        viewModelScope.launch {
            orderRepository.getAssignedReturns(riderId)
                .catch { _returns.value = Resource.Error(it.message ?: "Returns error") }
                .collectLatest { _returns.value = Resource.Success(it) }
        }
    }

    fun requestPayout(
        amount: Double,
        paymentMethod: String = "UPI",
        upiId: String = "",
        bankDetails: Map<String, String>? = null,
        notes: String = "",
        onSuccess: (String) -> Unit,
        onError: (String) -> Unit
    ) {
        viewModelScope.launch {
            _isSubmittingPayout.value = true
            when (val result = riderRepository.requestPayout(amount, paymentMethod, upiId, bankDetails, notes)) {
                is Resource.Success -> {
                    _isSubmittingPayout.value = false
                    onSuccess(result.data ?: "Withdrawal request submitted successfully")
                }
                is Resource.Error -> {
                    _isSubmittingPayout.value = false
                    onError(result.message ?: "Failed to submit withdrawal request")
                }
                is Resource.Loading -> {}
                else -> {
                    _isSubmittingPayout.value = false
                }
            }
        }
    }
}
